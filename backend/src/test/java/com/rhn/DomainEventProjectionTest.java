package com.rhn;

import com.rhn.platform.eventing.api.DomainEventEnvelope;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DomainEventProjectionTest extends RhnIntegrationTestSupport {
    @Autowired
    ApplicationEventPublisher applicationEventPublisher;

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
        Long residentId = Long.valueOf(objectMapper.readTree(body).get("id").asText());
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
