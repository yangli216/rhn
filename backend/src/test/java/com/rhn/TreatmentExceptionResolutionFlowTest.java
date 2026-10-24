package com.rhn;

import com.rhn.billing.api.RefundTreatmentDirectory;
import com.rhn.treatment.domain.TreatmentExecutionItem;
import com.rhn.treatment.domain.TreatmentExecutionTask;
import com.rhn.treatment.domain.TreatmentExecutionTaskStatus;
import com.rhn.treatment.infrastructure.TreatmentExecutionItemRepository;
import com.rhn.treatment.infrastructure.TreatmentExecutionTaskRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 治疗队列取数窗口与异常处置闭环。执行任务的 FK 指向医嘱/就诊，这里直接落库种子数据，
 * 因此在测试内临时关闭 H2 的引用完整性（每个测试类独立重置的内存库，结束即恢复）。
 */
@Tag("outpatient-main-flow")
class TreatmentExceptionResolutionFlowTest extends RhnIntegrationTestSupport {
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final AtomicLong SEQ = new AtomicLong(7_100_000_000_000L);

    @Autowired JdbcTemplate jdbc;
    @Autowired TreatmentExecutionTaskRepository tasks;
    @Autowired TreatmentExecutionItemRepository items;
    @Autowired RefundTreatmentDirectory refundDirectory;

    private Long residentId;
    private Long encounterId;

    @BeforeEach
    void seedPatient() throws Exception {
        jdbc.execute("SET REFERENTIAL_INTEGRITY FALSE");
        String digits = "%04d".formatted(Math.floorMod(UUID.randomUUID().hashCode(), 10000));
        residentId = Long.valueOf(json(mockMvc.perform(post("/api/residents").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"fullName":"治疗处置测试居民","identifiers":[{"system":"9","value":"33010219920808%s","useType":"SECONDARY"}],
                                 "gender":"2","birthDate":"1992-08-08"}
                                """.formatted(digits)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asString());
        encounterId = SEQ.incrementAndGet();
    }

    @AfterEach
    void restoreIntegrity() {
        jdbc.execute("SET REFERENTIAL_INTEGRITY TRUE");
    }

    private TreatmentExecutionTask seedTask(TreatmentExecutionTaskStatus status, Instant createdAt, Instant completedAt,
                                            boolean settlementRequired) {
        long group = SEQ.incrementAndGet();
        var task = new TreatmentExecutionTask(Long.valueOf(TENANT), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                residentId, encounterId, group, "SERVICE", createdAt, "TEST-TASK-" + group);
        ReflectionTestUtils.setField(task, "status", status);
        if (completedAt != null) ReflectionTestUtils.setField(task, "completedAt", completedAt);
        if (status == TreatmentExecutionTaskStatus.COMPLETED) { // 完整的执行证据，否则读取校验会把它显示为异常
            ReflectionTestUtils.setField(task, "startedAt", createdAt);
            ReflectionTestUtils.setField(task, "startedBy", 7L);
            ReflectionTestUtils.setField(task, "completedBy", 7L);
            ReflectionTestUtils.setField(task, "verificationMethod", "CARD");
            ReflectionTestUtils.setField(task, "resultCode", "COMPLETED");
            ReflectionTestUtils.setField(task, "adverseReaction", Boolean.FALSE);
        }
        tasks.save(task);
        items.save(new TreatmentExecutionItem(Long.valueOf(TENANT), task.id(), "SERVICE_REQUEST", group, null,
                "REQ-" + group, "CODE", "治疗项目" + group, null, null, null, null, null, null, null, null, null,
                false, settlementRequired, false, createdAt));
        return task;
    }

    private JsonNode worklist() throws Exception {
        return json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private List<String> ids(JsonNode values, String statusName) {
        List<String> result = new ArrayList<>();
        for (JsonNode value : values) {
            if (statusName == null || statusName.equals(value.get("status").asString())) result.add(value.get("id").asString());
        }
        return result;
    }

    @Test
    void worklist_keeps_every_open_task_and_only_todays_finished_tasks() throws Exception {
        Instant now = Instant.now();
        Instant startOfToday = LocalDate.now(ZONE).atStartOfDay(ZONE).toInstant();
        Instant yesterday = startOfToday.minusSeconds(60);
        // 一条很早创建、仍待结算的任务，随后产生多于 100 条更新的当日已完成任务
        var waiting = seedTask(TreatmentExecutionTaskStatus.WAITING_SETTLEMENT, now.minusSeconds(86_400L * 10), null, true);
        var ready = seedTask(TreatmentExecutionTaskStatus.READY, now.minusSeconds(86_400L * 9), null, false);
        var exception = seedTask(TreatmentExecutionTaskStatus.EXCEPTION, now.minusSeconds(86_400L * 8), null, false);
        var inProgress = seedTask(TreatmentExecutionTaskStatus.IN_PROGRESS, now.minusSeconds(86_400L * 7), null, false);
        for (int i = 0; i < 105; i++) {
            Instant created = now.minusSeconds(3_000 - i);
            seedTask(TreatmentExecutionTaskStatus.COMPLETED, created, created.plusSeconds(10), false);
        }
        var closedToday = seedTask(TreatmentExecutionTaskStatus.CLOSED, now.minusSeconds(86_400L * 6), now, false);
        var closedYesterday = seedTask(TreatmentExecutionTaskStatus.CLOSED, now.minusSeconds(86_400L * 6), yesterday, false);
        var completedYesterday = seedTask(TreatmentExecutionTaskStatus.COMPLETED, now.minusSeconds(86_400L * 6), yesterday, false);
        var cancelledToday = seedTask(TreatmentExecutionTaskStatus.CANCELLED, now.minusSeconds(86_400L * 5), now, false);

        JsonNode values = worklist();
        List<String> all = ids(values, null);

        assertTrue(all.contains(waiting.id().toString()), "早期待结算任务不能被已完成任务挤出");
        assertEquals("WAITING_SETTLEMENT", values.get(all.indexOf(waiting.id().toString())).get("status").asString());
        assertTrue(all.contains(ready.id().toString()));
        assertTrue(all.contains(exception.id().toString()), "异常任务保持可见");
        assertTrue(all.contains(inProgress.id().toString()));
        int finished = ids(values, "COMPLETED").size() + ids(values, "CLOSED").size();
        assertEquals(100, finished, "当日完成/处置的终态任务以 100 条为上限");
        assertTrue(ids(values, "CLOSED").contains(closedToday.id().toString()), "最新的当日已处置任务在窗口内");
        assertFalse(all.contains(closedYesterday.id().toString()));
        assertFalse(all.contains(completedYesterday.id().toString()), "隔日完成的任务不在队列内");
        assertFalse(all.contains(cancelledToday.id().toString()), "已取消任务不返回");
        // 筛选语义保持：按状态过滤仍作用于返回结果
        JsonNode onlyWaiting = json(mockMvc.perform(get("/api/treatments/worklist").with(rhnWorkContext())
                        .queryParam("status", "WAITING_SETTLEMENT"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertEquals(List.of(waiting.id().toString()), ids(onlyWaiting, null));
    }

    private String body(long revision, String resolution, String note) {
        return "{\"expectedRevision\":%d,\"resolution\":\"%s\"%s}".formatted(revision, resolution,
                note == null ? "" : ",\"note\":\"%s\"".formatted(note));
    }

    private JsonNode postJson(String path, String id, String json, int expectedStatus) throws Exception {
        return json(mockMvc.perform(post("/api/treatments/tasks/{id}/" + path, id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }

    private JsonNode start(JsonNode task) throws Exception {
        return postJson("start", task.get("id").asString(), ("{\"expectedRevision\":%d,\"identityVerified\":true,"
                + "\"verificationMethod\":\"CARD\"}").formatted(task.get("revision").asLong()), 200);
    }

    private JsonNode complete(JsonNode task, String result, boolean reaction) throws Exception {
        return postJson("complete", task.get("id").asString(), ("{\"expectedRevision\":%d,\"resultCode\":\"%s\",\"note\":\"现场记录\","
                + "\"adverseReaction\":%s%s}").formatted(task.get("revision").asLong(), result, reaction,
                reaction ? ",\"adverseReactionDetail\":\"出现皮疹\"" : ""), 200);
    }

    private JsonNode taskView(String id) throws Exception {
        for (JsonNode value : worklist()) if (id.equals(value.get("id").asString())) return value;
        throw new AssertionError("队列中没有任务 " + id);
    }

    @Test
    void exception_can_be_requeued_keeping_start_protection_then_closed_after_a_reaction() throws Exception {
        Instant now = Instant.now();
        var seeded = seedTask(TreatmentExecutionTaskStatus.READY, now, null, false);
        String id = seeded.id().toString();
        JsonNode task = taskView(id);
        assertEquals("READY", task.get("status").asString());
        assertFalse(refundDirectory.isExecutedOrInProgress(Long.valueOf(TENANT), "SERVICE_REQUEST", seeded.sourceGroupId()));

        JsonNode exception = complete(start(task), "INTERRUPTED", false);
        assertEquals("EXCEPTION", exception.get("status").asString());
        assertEquals("REQUEUE", exception.get("allowedResolutions").get(0).asString());
        assertTrue(refundDirectory.isExecutedOrInProgress(Long.valueOf(TENANT), "SERVICE_REQUEST", seeded.sourceGroupId()));
        long revision = exception.get("revision").asLong();

        // 校验：说明必填、版本冲突、非法处置方式；失败不改变任务
        mockMvc.perform(post("/api/treatments/tasks/{id}/resolve", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body(revision, "REQUEUE", null))).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/treatments/tasks/{id}/resolve", id).with(rhnWorkContext())
                .contentType(MediaType.APPLICATION_JSON).content(body(revision, "DELETE", "x"))).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/treatments/tasks/{id}/resolve", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body(revision + 5, "REQUEUE", "重做")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TREATMENT_TASK_REVISION_CONFLICT"));
        assertEquals("EXCEPTION", taskView(id).get("status").asString());

        // 重新执行：回到按门禁推导的待执行，startedAt 保留，当前轮结果清除，事件留痕
        JsonNode requeued = postJson("resolve", id, body(revision, "REQUEUE", "患者同意择时重做"), 200);
        assertEquals("READY", requeued.get("status").asString());
        assertTrue(requeued.hasNonNull("startedAt"));
        assertFalse(requeued.hasNonNull("resultCode")); assertFalse(requeued.hasNonNull("completedAt"));
        assertFalse(requeued.hasNonNull("adverseReaction")); assertFalse(requeued.hasNonNull("exceptionNote"));
        assertEquals(0, requeued.get("allowedResolutions").size());
        assertTrue(refundDirectory.isExecutedOrInProgress(Long.valueOf(TENANT), "SERVICE_REQUEST", seeded.sourceGroupId()),
                "重新开始前仍被识别为已开始过执行");
        String payload = jdbc.queryForObject("select JSON_PAYLOAD from RHN_INT_OUTBOX_EVT where ID_AGG = ? "
                + "and SD_EVT_TYPE = 'TREATMENT_EXECUTION_EXCEPTION_RESOLVED'", String.class, seeded.id());
        assertTrue(payload.contains("previousResultCode") && payload.contains("INTERRUPTED"), payload);
        assertTrue(payload.contains("患者同意择时重做"), payload);
        mockMvc.perform(post("/api/treatments/tasks/{id}/resolve", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body(requeued.get("revision").asLong(), "CLOSE", "非异常")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TREATMENT_RESOLVE_STATE_INVALID"));

        // 再次执行出现不良反应：只能关闭处置
        JsonNode reaction = complete(start(requeued), "COMPLETED", true);
        assertEquals("EXCEPTION", reaction.get("status").asString());
        assertEquals(1, reaction.get("allowedResolutions").size());
        assertEquals("CLOSE", reaction.get("allowedResolutions").get(0).asString());
        mockMvc.perform(post("/api/treatments/tasks/{id}/resolve", id).with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content(body(reaction.get("revision").asLong(), "REQUEUE", "重做")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TREATMENT_REQUEUE_NOT_ALLOWED"));
        JsonNode closed = postJson("resolve", id, body(reaction.get("revision").asLong(), "CLOSE", "已随访，患者恢复，不再执行"), 200);
        assertEquals("CLOSED", closed.get("status").asString());
        assertEquals("已随访，患者恢复，不再执行", closed.get("exceptionNote").asString());
        assertTrue(closed.hasNonNull("completedAt"));
        assertEquals(0, closed.get("allowedResolutions").size());
        assertTrue(closed.get("adverseReaction").asBoolean(), "原不良反应记录保留");
        assertEquals("CLOSED", taskView(id).get("status").asString(), "当日已处置任务出现在队列");
        assertTrue(refundDirectory.isExecutedOrInProgress(Long.valueOf(TENANT), "SERVICE_REQUEST", seeded.sourceGroupId()));
    }
}
