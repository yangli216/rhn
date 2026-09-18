package com.rhn;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.analytics.api.AnalysisPage.*;
import com.rhn.analytics.api.AnalysisPage.Period;
import com.rhn.analytics.application.AnalysisPageService;
import com.rhn.outpatient.api.OutpatientAnalyticsDirectory;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.time.*;
import java.sql.Timestamp;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties="rhn.analytics.pilot-enabled=true")
class AnalysisPageTest extends RhnIntegrationTestSupport {
    @MockitoBean StructuredAiDirectory ai;
    @Autowired JdbcTemplate jdbc;
    @Autowired OutpatientAnalyticsDirectory outpatient;
    private static final String SPEC="""
      {"title":"诊断记录排行","template":"RANKING","metrics":["DIAGNOSIS_RECORDS"],"dimension":"DIAGNOSIS","scope":"CURRENT","period":{"kind":"FIXED","startDate":"2030-01-01","endDate":"2030-01-31"},"limit":1}
      """;
    private long encounter(long dept,String kind) {
        long id=GlobalIds.next();
        jdbc.update("insert into RHN_VIS_ENC (ID_ENC,ID_TNT,ID_PAT,CD_ENC_NO,ID_ORG,ID_DEPT,SD_STATUS,DT_REGISTERED,SD_ENC_CLASS) values (?,?,?,?,?,?,?,?,?)",id,Long.valueOf(TENANT),362387869790213L,"DP"+id,Long.valueOf(ORGANIZATION),dept,"IN_PROGRESS",Timestamp.from(Instant.parse("2030-01-01T00:00:00Z")),kind);
        return id;
    }
    private void diagnosis(long encounter,String code,String recorded,String status,String verification) {
        Long patId = jdbc.queryForObject("select ID_PAT from RHN_VIS_ENC where ID_ENC=?", Long.class, encounter);
        Long orgId = jdbc.queryForObject("select ID_ORG from RHN_VIS_ENC where ID_ENC=?", Long.class, encounter);
        Long deptId = jdbc.queryForObject("select ID_DEPT from RHN_VIS_ENC where ID_ENC=?", Long.class, encounter);
        jdbc.update("insert into RHN_VIS_ENC_DIAG (ID_ENC_DIAG,ID_TNT,ID_PAT,ID_ORG,ID_DEPT,ID_ENC,CD_ENC_DIAG,NA_DISPLAY,SD_DIAG_TYPE,DT_RECORDED,SD_DIAG_STATUS,SD_VERIFICATION_STATUS,SN_SORT) values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                GlobalIds.next(),Long.valueOf(TENANT),patId,orgId,deptId,encounter,code,"测试诊断"+code,"PRIMARY",Timestamp.from(OffsetDateTime.parse(recorded).toInstant()),status,verification,1);
    }
    @Test void diagnosis_ranking_counts_only_authorized_active_confirmed_outpatient_records_and_sorts() throws Exception {
        long dept=Long.parseLong(DEPARTMENT),enc=encounter(dept,"OUTPATIENT");
        diagnosis(enc,"A","2030-01-01T00:00:00+08:00","ACTIVE","CONFIRMED");
        diagnosis(enc,"A","2030-01-31T23:59:59+08:00","ACTIVE","CONFIRMED");
        diagnosis(enc,"B","2030-01-15T00:00:00+08:00","ACTIVE","CONFIRMED");
        diagnosis(enc,"C","2030-01-15T00:00:00+08:00","EXCLUDED","CONFIRMED");
        diagnosis(enc,"D","2030-01-15T00:00:00+08:00","ACTIVE","PROVISIONAL");
        diagnosis(enc,"E","2030-02-01T00:00:00+08:00","ACTIVE","CONFIRMED");
        diagnosis(encounter(dept,"INPATIENT"),"F","2030-01-15T00:00:00+08:00","ACTIVE","CONFIRMED");
        long other=jdbc.queryForObject("select min(ID_DEPT) from RHN_SYS_DEPT where ID_ORG=? and ID_DEPT<>?",Long.class,Long.valueOf(ORGANIZATION),dept);
        diagnosis(encounter(other,"OUTPATIENT"),"G","2030-01-15T00:00:00+08:00","ACTIVE","CONFIRMED");
        mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(SPEC))
          .andExpect(status().isOk()).andExpect(jsonPath("$.series.length()").value(1))
          .andExpect(jsonPath("$.series[0].code").value("DIAGNOSIS_RECORDS"))
          .andExpect(jsonPath("$.series[0].total").value(3)).andExpect(jsonPath("$.series[0].groupCount").value(2))
          .andExpect(jsonPath("$.series[0].points.length()").value(1)).andExpect(jsonPath("$.series[0].points[0].value").value(2));
        assertTrue(outpatient.diagnosisCounts(998L,Long.valueOf(ORGANIZATION),Set.of(dept),LocalDate.of(2030,1,1),LocalDate.of(2030,1,31),ZoneId.of("Asia/Shanghai")).isEmpty());
    }
    @Test void saves_template_metrics_and_relative_period_and_restores_legacy() throws Exception {
        String spec=SPEC.replace("\"FIXED\"","\"MONTH_TO_DATE\"");
        mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(spec)).andExpect(status().isOk());
        mockMvc.perform(get("/api/analytics/pages/saved").with(rhnWorkContext())).andExpect(status().isOk())
          .andExpect(jsonPath("$[0].spec.template").value("RANKING")).andExpect(jsonPath("$[0].spec.metrics[0]").value("DIAGNOSIS_RECORDS"))
          .andExpect(jsonPath("$[0].spec.period.kind").value("MONTH_TO_DATE"));
        assertEquals(LocalDate.of(2031,2,1),AnalysisPageService.dates(new Period(PeriodKind.MONTH_TO_DATE,null,null),LocalDate.of(2031,2,8))[0]);
    }
    @Test void rejects_unknown_metrics_invalid_combinations_and_model_template_changes() throws Exception {
        for(String spec: new String[]{SPEC.replace("DIAGNOSIS_RECORDS","REVENUE"),SPEC.replace("DIAGNOSIS_RECORDS","REGISTERED"),SPEC.replace("RANKING","TREND")})
          mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(spec)).andExpect(status().isBadRequest());
        when(ai.complete(anyString(),anyString())).thenReturn("{\"status\":\"READY\",\"message\":\"诊断记录\",\"spec\":"+SPEC+"}");
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json")
          .content("{\"requirement\":\"诊断记录数量\",\"template\":\"LIST\"}")).andExpect(status().isBadRequest());
    }
    @Test void supports_model_selected_multi_metric_definitions_and_preserves_clarification() throws Exception {
        String multi=SPEC.replace("RANKING","DASHBOARD").replace("\"DIAGNOSIS_RECORDS\"","\"REGISTERED\",\"COMPLETED\"").replace("\"DIAGNOSIS\"","\"DEPARTMENT\"");
        when(ai.complete(anyString(),anyString())).thenReturn("{\"status\":\"READY\",\"message\":\"按科室展示挂号和诊毕\",\"spec\":"+multi+"}","{\"status\":\"CLARIFY\",\"message\":\"是否按诊断记录条数统计？\",\"spec\":null}");
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"本月各科室挂号和诊毕情况\",\"template\":\"DASHBOARD\"}"))
          .andExpect(status().isOk()).andExpect(jsonPath("$.spec.metrics.length()").value(2));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"诊断数量排行\",\"template\":\"RANKING\"}"))
          .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLARIFY")).andExpect(jsonPath("$.spec").isEmpty());
        mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(multi))
          .andExpect(status().isOk()).andExpect(jsonPath("$.series.length()").value(2));
    }
}
