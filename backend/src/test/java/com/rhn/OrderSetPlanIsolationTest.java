package com.rhn;

import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 方案专用下游（AI 推荐、历史挖掘、预检、检索画像）都经由方案目录读取，目录不得混入医嘱组套。 */
class OrderSetPlanIsolationTest extends StubbedExecutionContextTestSupport {
    @Autowired OutpatientPlanTemplateDirectory directory;
    @Autowired IdentityAccessDirectory identities;

    @Test
    void plan_directory_returns_protocols_but_never_order_sets() throws Exception {
        Long tenant = Long.valueOf(TENANT);
        var doctor = identities.findActiveAccount(tenant, "doctor").orElseThrow();
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant, doctor.id(), "doctor", "order-set-isolation",
                Set.of("OUTPATIENT_RECEPTION.ACCESS"), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "DEPARTMENT",
                Set.of(), Set.of(), doctor.practitionerId()));
        String suffix = UUID.randomUUID().toString().substring(0, 6);
        JsonNode orderSet = json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"templateKind":"ORDER_SET","scopeType":"PERSONAL","name":"隔离组套-%s",
                                 "services":[%s]}""".formatted(suffix, OrderSetTemplateTest.SERVICE.formatted(""))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        JsonNode protocol = json(mockMvc.perform(post("/api/outpatient/plan-templates").with(rhnWorkContext())
                        .contentType(MediaType.APPLICATION_JSON).content("""
                                {"scopeType":"PERSONAL","name":"隔离方案-%s",
                                 "diagnoses":[{"code":"I10","display":"原发性高血压","type":"PRIMARY"}],
                                 "services":[%s]}""".formatted(suffix, OrderSetTemplateTest.SERVICE.formatted(""))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        Long orderSetId = orderSet.get("id").asLong();
        Long protocolId = protocol.get("id").asLong();

        assertTrue(ids(directory.visibleForCurrentContext()).contains(protocolId));
        assertFalse(ids(directory.visibleForCurrentContext()).contains(orderSetId));
        assertTrue(ids(directory.searchIndexForCurrentContext()).contains(protocolId));
        assertFalse(ids(directory.searchIndexForCurrentContext()).contains(orderSetId));
        assertTrue(ids(directory.visibleByIds(List.of(orderSetId, protocolId))).contains(protocolId));
        assertFalse(ids(directory.visibleByIds(List.of(orderSetId, protocolId))).contains(orderSetId));
        assertTrue(directory.visibleByIds(List.of(orderSetId)).isEmpty());
    }

    private static List<Long> ids(List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plans) {
        return plans.stream().map(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot::id).toList();
    }
}
