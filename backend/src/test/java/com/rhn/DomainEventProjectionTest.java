package com.rhn;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DomainEventProjectionTest extends RhnIntegrationTestSupport {
    @Autowired
    ApplicationEventPublisher applicationEventPublisher;
    @Autowired com.rhn.workmanagement.task.TaskService taskService;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Autowired com.rhn.billing.application.ClinicalOrderChargeProjector clinicalCharges;

    @Test
    void incomplete_clinical_billing_event_rolls_back_and_explicit_zero_amount_can_be_acknowledged() {
        Long eventId = com.rhn.shared.id.GlobalIds.next();
        Long sourceId = com.rhn.shared.id.GlobalIds.next();
        var payload = new java.util.HashMap<String, Object>();
        payload.put("billingDisposition", "ZERO_AMOUNT");
        payload.put("encounterId", sourceId); payload.put("residentId", sourceId);
        payload.put("encounterOrganizationId", Long.valueOf(ORGANIZATION));
        payload.put("encounterDepartmentId", Long.valueOf(DEPARTMENT));
        payload.put("catalogItemId", sourceId); payload.put("authoredBy", sourceId);
        payload.put("chargeQuantity", java.math.BigDecimal.ONE);
        payload.put("unitPrice", java.math.BigDecimal.ZERO); payload.put("totalAmount", java.math.BigDecimal.ZERO);
        payload.put("currencyCode", "CNY"); payload.put("priceId", sourceId); payload.put("priceRevision", 0L);
        payload.put("priceType", "SALE"); payload.put("chargeUnit", "EA"); payload.put("itemCode", "ZERO-TEST");
        payload.put("requestNo", "ZERO-TEST-" + sourceId);
        var event = new DomainEventEnvelope(eventId, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                "SERVICE_REQUEST_AUTHORED", 2, "ServiceRequest", sourceId, 0, sourceId, Instant.now(), Instant.now(),
                "test", "test-suite", "clinical-billing-truth", null, payload, 1);
        assertThrows(com.rhn.shared.api.BusinessException.class, () -> clinicalCharges.project(event));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT = ? and NA_CNSMR = ?",
                Integer.class, eventId, "billing-clinical-order-charge-v1"));
        payload.put("itemName", "已确认零价测试项目");
        clinicalCharges.project(event);
        clinicalCharges.project(event);
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT = ? and NA_CNSMR = ?",
                Integer.class, eventId, "billing-clinical-order-charge-v1"));
    }

    @Test
    void invalid_care_projection_is_not_acknowledged_and_can_be_retried_with_real_fields() {
        Long eventId = com.rhn.shared.id.GlobalIds.next();
        Long sourceId = com.rhn.shared.id.GlobalIds.next();
        Instant now = Instant.now();
        var payload = new java.util.HashMap<String, Object>();
        payload.put("departmentId", Long.valueOf(DEPARTMENT));
        payload.put("title", "来源照护任务");
        var event = new DomainEventEnvelope(eventId, Long.valueOf(TENANT), Long.valueOf(ORGANIZATION),
                "CARE_TASK_READY", 1, "CareTask", sourceId, 1, null, now, now, "test", "test-suite",
                "projection-truth", null, payload, 1);

        assertThrows(IllegalArgumentException.class, () -> taskService.projectEncounterEvents(event));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT = ? and NA_CNSMR = ?",
                Integer.class, eventId, "work-task-projector"));
        assertEquals(0, jdbc.queryForObject("select count(*) from RHN_SYS_WORK_TASK where ID_TNT = ? and ID_SRC = ?",
                Integer.class, Long.valueOf(TENANT), sourceId));

        payload.put("priority", "HIGH");
        taskService.projectEncounterEvents(event);
        taskService.projectEncounterEvents(event);
        assertEquals(1, jdbc.queryForObject("select count(*) from RHN_INT_EVT_CONSUME where ID_EVT = ? and NA_CNSMR = ?",
                Integer.class, eventId, "work-task-projector"));
        assertEquals(1, jdbc.queryForObject("""
                select count(*) from RHN_SYS_WORK_TASK where ID_TNT = ? and ID_SRC = ?
                  and SD_PRI = 'HIGH' and DT_DUE is null and DES_SUM is null
                """, Integer.class, Long.valueOf(TENANT), sourceId));
    }

    @Test
    void duplicate_delivery_is_projected_only_once() throws Exception {
        String body = mockMvc.perform(post("/api/residents")
                        .with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName":"幂等测试居民",
                                  "identifiers":[{"system":"9","value":"EVENT-199901019999","useType":"SECONDARY"}],
                                  "gender":"UNKNOWN",
                                  "birthDate":"1999-01-01"
                                }
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long residentId = Long.valueOf(objectMapper.readTree(body).get("id").asString());
        Instant now = Instant.now();
        DomainEventEnvelope event = new DomainEventEnvelope(com.rhn.shared.id.GlobalIds.next(), Long.valueOf(TENANT), null,
                "PROJECTION_IDEMPOTENCY_VERIFIED", 1, "Resident", residentId, 0,
                residentId, now, now, "test", "test-suite", "idempotency-test", null,
                Map.of("summary", "重复领域事件投递测试"), 1);

        applicationEventPublisher.publishEvent(event);
        applicationEventPublisher.publishEvent(event);

        mockMvc.perform(get("/api/residents/{id}/timeline", residentId)
                        .with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].eventType").value("PROJECTION_IDEMPOTENCY_VERIFIED"));
    }
}
