package com.rhn;

import com.rhn.ai.api.StructuredAiDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.TestPropertySource;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties="rhn.analytics.pilot-enabled=true")
class AnalyticsInterpretationTest extends RhnIntegrationTestSupport {
    @MockitoBean StructuredAiDirectory ai;
    private static final String QUERY="{\"metric\":\"COMPLETED\",\"dimension\":\"DEPARTMENT\",\"scope\":\"AUTHORIZED\",\"startDate\":\"2026-09-01\",\"endDate\":\"2026-09-14\"}";
    private static final String READY="{\"status\":\"READY\",\"message\":\"本月各科室诊毕人次\",\"query\":"+QUERY+",\"chart\":\"BAR\"}";
    private org.springframework.test.web.servlet.ResultActions interpret(String text) throws Exception {
        return mockMvc.perform(post("/api/analytics/pilot/interpret").with(rhnWorkContext()).contentType("application/json")
            .content("{\"text\":\""+text+"\",\"base\":"+QUERY+",\"chart\":\"BAR\"}"));
    }
    @Test void accepts_valid_model_conditions_without_executing_a_query() throws Exception {
        when(ai.complete(anyString(),anyString())).thenReturn(READY);
        interpret("本月各科室诊毕人次").andExpect(status().isOk()).andExpect(jsonPath("$.query.metric").value("COMPLETED"));
        verify(ai).complete(contains("不执行查询"),contains("本月各科室诊毕人次"));
    }
    @Test void rejects_diagnosis_substitution_even_if_model_claims_success() throws Exception {
        when(ai.complete(anyString(),anyString())).thenReturn(READY);
        interpret("查看本月诊断数量排行").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UNSUPPORTED"))
            .andExpect(jsonPath("$.query").isEmpty());
    }
    @Test void rejects_malformed_and_out_of_range_output() throws Exception {
        when(ai.complete(anyString(),anyString())).thenReturn("not json",READY.replace("2026-09-01","2020-01-01"));
        interpret("本月诊毕人次").andExpect(status().isBadRequest());
        interpret("本月诊毕人次").andExpect(status().isBadRequest());
    }
    @Test void clarification_never_applies_model_query() throws Exception {
        when(ai.complete(anyString(),anyString())).thenReturn(READY.replace("READY","CLARIFY"));
        interpret("帮我看看数量").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLARIFY"))
            .andExpect(jsonPath("$.query").isEmpty());
    }
}
