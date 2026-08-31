package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class InpatientWardBoardTest extends RhnIntegrationTestSupport {
    private static final String WARD_DEPARTMENT = "362387869898501";

    @Test
    void ward_board_prioritizes_verification_overdue_and_high_care_within_current_ward() throws Exception {
        Instant shiftFrom = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant shiftTo = Instant.now().plus(8, ChronoUnit.HOURS);
        JsonNode admission = postJson("/api/inpatient/admissions", """
                {"residentId":"362387869790213","bedId":"362387869898512",
                 "admissionTypeCode":"GENERAL","admissionSourceCode":"DIRECT",
                 "admissionReason":"病区交接摘要测试","nursingLevelCode":"LEVEL_I",
                 "commandCode":"IP-WARD-BOARD-ADMIT"}
                """, wardContext(), 201);
        String episodeId = admission.get("id").asText();
        JsonNode order = postJson("/api/inpatient/orders", """
                {"episodeId":"%s","orderCategory":"NURSING","durationType":"LONG_TERM",
                 "itemCode":"NUR-VITAL","itemName":"生命体征监测",
                 "instructions":"按计划巡视并记录","commandCode":"IP-WARD-BOARD-ORDER"}
                """.formatted(episodeId), wardContext(), 201);
        String orderId = order.get("id").asText();
        postJson("/api/inpatient/orders/" + orderId + "/sign",
                medicationSign(0, "IP-WARD-BOARD-SIGN"), wardContext(), 200);

        mockMvc.perform(wardBoard(wardContext(), shiftFrom, shiftTo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.from").value(shiftFrom.toString()))
                .andExpect(jsonPath("$.to").value(shiftTo.toString()))
                .andExpect(jsonPath("$.metrics.patientCount").value(1))
                .andExpect(jsonPath("$.metrics.specialCareCount").value(1))
                .andExpect(jsonPath("$.metrics.pendingVerificationCount").value(1))
                .andExpect(jsonPath("$.patients[0].attentionLevel").value("HIGH_CARE"))
                .andExpect(jsonPath("$.patients[0].handoverSummary").value("待核对医嘱 1 条"));

        postJson("/api/inpatient/orders/" + orderId + "/verify",
                revision(1, "IP-WARD-BOARD-VERIFY"), wardContext(), 200);
        postJson("/api/inpatient/orders/" + orderId + "/plans", """
                {"expectedRevision":2,"plannedTimes":["%s","%s"],
                 "commandCode":"IP-WARD-BOARD-PLAN"}
                """.formatted(Instant.now().minusSeconds(300), Instant.now().plusSeconds(30 * 60 * 60)),
                wardContext(), 200);

        mockMvc.perform(wardBoard(wardContext(), shiftFrom, shiftTo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.pendingVerificationCount").value(0))
                .andExpect(jsonPath("$.metrics.pendingTaskCount").value(1))
                .andExpect(jsonPath("$.metrics.overdueTaskCount").value(1))
                .andExpect(jsonPath("$.patients[0].attentionLevel").value("OVERDUE"))
                .andExpect(jsonPath("$.patients[0].nursingTaskCount").value(1))
                .andExpect(jsonPath("$.patients[0].handoverSummary").value(
                        "本班待执行 1 项（逾期 1 项）"));

        mockMvc.perform(wardBoard(rhnWorkContext(), shiftFrom, shiftTo))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.metrics.patientCount").value(0));
    }

    @Test
    void ward_board_requires_an_explicit_shift_no_longer_than_twenty_four_hours() throws Exception {
        Instant from = Instant.now();

        mockMvc.perform(get("/api/inpatient/ward-board").with(wardContext()))
                .andExpect(status().isBadRequest());
        mockMvc.perform(wardBoard(wardContext(), from, from))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_WARD_SHIFT_RANGE_INVALID"));
        mockMvc.perform(wardBoard(wardContext(), from, from.plus(25, ChronoUnit.HOURS)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INPATIENT_WARD_SHIFT_TOO_LONG"));
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder wardBoard(
            RequestPostProcessor context, Instant from, Instant to) {
        return get("/api/inpatient/ward-board").with(context)
                .queryParam("from", from.toString()).queryParam("to", to.toString());
    }

    private RequestPostProcessor wardContext() {
        return request -> {
            rhn().postProcessRequest(request);
            ((MockHttpServletRequest) request).addHeader("X-Organization-Id", ORGANIZATION);
            ((MockHttpServletRequest) request).addHeader("X-Department-Id", WARD_DEPARTMENT);
            return request;
        };
    }

    private JsonNode postJson(String path, String body, RequestPostProcessor context, int expectedStatus)
            throws Exception {
        return json(mockMvc.perform(post(path).with(context).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expectedStatus)).andReturn().getResponse().getContentAsString());
    }

    private static String revision(long value, String commandCode) {
        return "{\"expectedRevision\":" + value + ",\"commandCode\":\"" + commandCode + "\"}";
    }

    private static String medicationSign(long value, String commandCode) {
        return "{\"expectedRevision\":" + value + ",\"allergyReviewConfirmed\":true,\"commandCode\":\""
                + commandCode + "\"}";
    }
}
