package com.rhn;

import com.rhn.analytics.api.PilotAnalysis.*;
import com.rhn.analytics.application.PilotAnalysisService;
import com.rhn.outpatient.api.OutpatientAnalyticsDirectory.DailyCount;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import java.time.*;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties="rhn.analytics.pilot-enabled=true")
class AnalyticsPilotTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired com.rhn.outpatient.api.OutpatientAnalyticsDirectory outpatient;
    private static final String QUERY="""
            {"metric":"CANCELLATION_RATE","dimension":"DAY","scope":"CURRENT","startDate":"2030-01-01","endDate":"2030-01-31"}
            """;
    private Timestamp time(String value){return Timestamp.from(OffsetDateTime.parse(value).toInstant());}
    private void registration(long tenant,long dept,String when,String status) {
        long id=GlobalIds.next();
        jdbc.update("insert into RHN_SC_PAT_REG (ID_PAT_REG,ID_TNT,ID_PAT,ID_ORG,ID_DEPT,ID_ENC,CD_REG_NO,CD_IDEMP,SD_REG_SRC,SD_VISIT_TYPE,SD_STATUS,DT_REGISTERED,ID_USER_REGISTERED) values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                id,tenant,362387869790213L,Long.valueOf(ORGANIZATION),dept,id,"P"+id,"P"+id,"DIRECT","INITIAL",status,time(when),jdbc.queryForObject("select min(ID_USER) from RHN_SYS_USER_ACCT where ID_TNT = ?", Long.class, tenant));
    }
    private void encounter(String when,String status,String kind) {
        long id=GlobalIds.next();
        jdbc.update("insert into RHN_VIS_ENC (ID_ENC,ID_TNT,ID_PAT,CD_ENC_NO,ID_ORG,ID_DEPT,SD_STATUS,DT_REGISTERED,DT_COMPLETED,SD_ENC_CLASS) values (?,?,?,?,?,?,?,?,?,?)",
                id,Long.valueOf(TENANT),362387869790213L,"P"+id,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),status,time(when),time(when),kind);
    }
    @Test
    void actual_sql_respects_date_status_and_scope_then_saves_and_reloads_a_definition() throws Exception {
        long tenant=Long.parseLong(TENANT),dept=Long.parseLong(DEPARTMENT);
        registration(tenant,dept,"2030-01-01T00:00:00+08:00","CANCELLED");
        registration(tenant,dept,"2030-01-31T23:59:59+08:00","REGISTERED");
        registration(tenant,dept,"2029-12-31T23:59:59+08:00","REGISTERED");
        registration(tenant,dept,"2030-02-01T00:00:00+08:00","REGISTERED");
        registration(tenant,jdbc.queryForObject("select min(ID_DEPT) from RHN_SYS_DEPT where ID_TNT = ? and ID_ORG = ? and ID_DEPT <> ?", Long.class, tenant, Long.valueOf(ORGANIZATION), dept),"2030-01-03T12:00:00+08:00","REGISTERED");
        encounter("2030-01-10T12:00:00+08:00","COMPLETED","OUTPATIENT");
        encounter("2030-01-10T12:00:00+08:00","TRANSFERRED","OUTPATIENT");
        encounter("2030-01-10T12:00:00+08:00","TERMINATED","OUTPATIENT");
        encounter("2030-01-10T12:00:00+08:00","COMPLETED","INPATIENT");
        mockMvc.perform(post("/api/analytics/pilot/query").with(rhnWorkContext()).contentType("application/json").content(QUERY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.registered").value(2))
                .andExpect(jsonPath("$.cancelled").value(1)).andExpect(jsonPath("$.completed").value(1))
                .andExpect(jsonPath("$.total").value(50.0)).andExpect(jsonPath("$.rows.length()").value(31))
                .andExpect(jsonPath("$.comparisonStart").value("2029-12-01"))
                .andExpect(jsonPath("$.comparisonEnd").value("2029-12-31"));
        assertTrue(outpatient.dailyCounts(998L,Long.valueOf(ORGANIZATION),java.util.Set.of(dept),LocalDate.of(2030,1,1),LocalDate.of(2030,1,31),ZoneId.of("Asia/Shanghai")).isEmpty());
        String saved=mockMvc.perform(post("/api/analytics/pilot/saved").with(rhnWorkContext()).contentType("application/json")
                .content("{\"title\":\"合成对账\",\"chart\":\"TABLE\",\"query\":"+QUERY+"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").isString()).andReturn().getResponse().getContentAsString();
        mockMvc.perform(get("/api/analytics/pilot/saved").with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(json(saved).get("id").asString()))
                .andExpect(jsonPath("$[0].query.metric").value("CANCELLATION_RATE"))
                .andExpect(jsonPath("$[0].chart").value("TABLE"));
    }
    @Test
    void invalid_range_or_unknown_metric_cannot_execute() throws Exception {
        mockMvc.perform(post("/api/analytics/pilot/query").with(rhnWorkContext()).contentType("application/json")
                .content(QUERY.replace("2030-01-31","2032-01-31"))).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/analytics/pilot/query").with(rhnWorkContext()).contentType("application/json")
                .content(QUERY.replace("CANCELLATION_RATE","FREE_SQL"))).andExpect(status().isBadRequest());
    }
    @Test
    void aggregation_combines_denominators_and_keeps_same_named_departments_distinct() {
        var date=LocalDate.of(2030,1,1);
        var facts=List.of(new DailyCount(date,1L,2,1,0),new DailyCount(date,2L,8,1,0));
        assertEquals(20,PilotAnalysisService.value(Metric.CANCELLATION_RATE,PilotAnalysisService.sum(facts)));
        var rows=PilotAnalysisService.rows(new Query(Metric.CANCELLATION_RATE,Dimension.DEPARTMENT,Scope.AUTHORIZED,date,date),facts,Map.of(1L,"同名科室",2L,"同名科室"));
        assertEquals(2,rows.size()); assertEquals(50,rows.get(0).value());assertEquals(12.5,rows.get(1).value());
    }
}
