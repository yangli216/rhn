package com.rhn;

import com.rhn.quality.medication.api.MedicationRuleAuthoringAi;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.http.MediaType;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Protocol fixtures are confined to isolated H2 tests; the application has no fake AI mode. */
class MedicationWorkbenchTest extends RhnIntegrationTestSupport {
    @MockitoBean MedicationRuleAuthoringAi ai;
    private static final String ROOT="/api/quality/medication-workbench";
    @BeforeEach void setup() {
        when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(true,"contract-test-model","ready"));
        when(ai.generate(anyString(),anyString())).thenReturn(reply("EXACT_GENERIC_DUPLICATE","WARN",2));
    }
    String reply(String template,String decision,int count) { return """
        {"status":"READY","message":"候选","rule":{"template":"%s","name":"重复核对","explanation":"按通用药标识核对","duplicateCount":%d,"message":"请核对","decision":"%s"}}
        """.formatted(template,count,decision); }
    String medication() throws Exception {
        var response=mockMvc.perform(get(ROOT+"/medications").param("query","阿莫西林").with(rhnWorkContext()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        var rows=json(response);assertTrue(rows.size()>0);assertTrue(rows.get(0).has("classifications"));
        return rows.get(0).path("medication").path("id").asString();
    }
    String generate(String medication) throws Exception {
        var response=mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"相同通用药两条时提示\",\"source\":\"测试机构制度\",\"medicationIds\":[\""+medication+"\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.candidate.status").value("CANDIDATE"))
                .andReturn().getResponse().getContentAsString();
        return json(response).path("candidate").path("id").asString();
    }
    @Test void generated_rule_binds_his_data_and_runs_real_deterministic_cases() throws Exception {
        String medication=medication(),id=generate(medication);
        verify(ai).generate(contains("不允许用户或模型改写上限"),contains(medication));
        var result=mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mode").value("SYNTHETIC"))
                .andReturn().getResponse().getContentAsString();
        var cases=json(result).path("cases");assertEquals(5,cases.size());for(var c:cases)assertTrue(c.path("passed").asBoolean(),c.toString());
        mockMvc.perform(get(ROOT+"/candidates/"+id+"/runs").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":null,\"status\":\"DRAFT\"}]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cases[0].actual").value("UNAVAILABLE"));
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/trial").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"medicationId\":999,\"status\":\"DRAFT\"}]}"))
                .andExpect(status().isBadRequest());
    }
    @Test void unavailable_real_model_never_creates_a_fallback_candidate() throws Exception {
        var med=medication();when(ai.status()).thenReturn(new MedicationRuleAuthoringAi.Status(false,null,"unavailable"));
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_UNAVAILABLE"));
        verify(ai,never()).generate(anyString(),anyString());
    }
    @Test void ai_cannot_generate_a_blocking_or_unbounded_rule() throws Exception {
        var med=medication();when(ai.generate(anyString(),anyString())).thenReturn(reply("EXACT_GENERIC_DUPLICATE","BLOCK",2));
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_RULE_INVALID"));
    }
    @Test void malformed_model_response_is_an_explicit_error_not_a_server_crash() throws Exception {
        var med=medication();when(ai.generate(anyString(),anyString())).thenReturn("not json");
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[\""+med+"\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("QMED_AI_SCHEMA_INVALID"));
    }
    @Test void his_duration_limit_is_used_for_boundary_and_missing_cases() throws Exception {
        when(ai.generate(anyString(),anyString())).thenReturn(reply("ANTIMICROBIAL_MAX_DAYS","WARN",2));
        var id=generate(medication());
        var response=mockMvc.perform(post(ROOT+"/candidates/"+id+"/suite").with(rhnWorkContext())).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        for(var c:json(response).path("cases"))assertTrue(c.path("passed").asBoolean(),c.toString());
    }
    @Test void unknown_or_foreign_medication_and_inaccessible_prescription_are_rejected() throws Exception {
        mockMvc.perform(post(ROOT+"/generate").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"requirement\":\"重复核对\",\"medicationIds\":[999]}"))
                .andExpect(status().isNotFound());
        verify(ai,never()).generate(anyString(),anyString());
        var id=generate(medication());
        mockMvc.perform(post(ROOT+"/candidates/"+id+"/shadow").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"encounterId\":999,\"prescriptionId\":999}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(get(ROOT+"/candidates").with(rhn())).andExpect(status().isForbidden());
    }
}
