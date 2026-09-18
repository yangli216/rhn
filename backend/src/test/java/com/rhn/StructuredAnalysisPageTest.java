package com.rhn;

import com.rhn.ai.api.StructuredAiDirectory;
import com.rhn.shared.reporting.*;
import com.rhn.shared.reporting.ReportModel.*;
import com.rhn.shared.id.GlobalIds;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties="rhn.analytics.pilot-enabled=true")
@Transactional
class StructuredAnalysisPageTest extends RhnIntegrationTestSupport {
    @MockitoBean StructuredAiDirectory ai;
    @Autowired JdbcTemplate jdbc;
    @Autowired StructuredReportEngine engine;
    private static final long PATIENT=362387869790213L;
    private static final Timestamp TIME=Timestamp.from(Instant.parse("2036-01-15T00:00:00Z"));
    private long encounter(long dept,String type) {
        long id=GlobalIds.next();jdbc.update("insert into RHN_VIS_ENC (ID_ENC,ID_TNT,ID_PAT,CD_ENC_NO,ID_ORG,ID_DEPT,SD_STATUS,DT_REGISTERED,SD_ENC_CLASS) values (?,?,?,?,?,?,?,?,?)",id,Long.valueOf(TENANT),PATIENT,"PLAN"+id,Long.valueOf(ORGANIZATION),dept,"IN_PROGRESS",TIME,type);return id;
    }
    private long item(){return jdbc.queryForObject("select min(ID_CATALOG_ITEM) from RHN_BD_CATALOG_ITEM where ID_TNT=?",Long.class,Long.valueOf(TENANT));}
    private long order(long encounter,String kind,String status,String day) {
        long id=GlobalIds.next();Timestamp time=Timestamp.from(OffsetDateTime.parse(day).toInstant());
        jdbc.update("insert into RHN_EX_CARE_REQ (ID_CARE_REQ,ID_TNT,ID_PAT,ID_ENC,CD_REQ_NO,SD_REQ_KIND,SD_STATUS,CD_INTENT,CD_PRIORITY,ID_CATALOG_ITEM,ID_ORG_EXEC,ID_DEPT_EXEC,ID_ORG_REQ,ID_DEPT_REQ,DA_BUSINESS,DT_AUTHORED,ID_USER_AUTHORED,CD_ITEM_SNAP,NA_ITEM_SNAP,CD_UNIT_SNAP,JSON_ITEM_ATTR_SNAP,HASH_ITEM_ATTR,DT_ITEM_ATTR_RESOLVED,JSON_STD_MAP_SNAP) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,Long.valueOf(TENANT),PATIENT,encounter,"PLAN"+id,kind,status,"ORDER","ROUTINE",item(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),java.sql.Date.valueOf("2036-01-15"),time,1L,"P01","测试项目","EA","{}","hash",time,"{}");return id;
    }
    private long charge(Long encounter,Long order,String amount,String day,String currency,Long reverses) {
        Long account=jdbc.queryForObject("select min(ID_PAT_ACCT) from RHN_BIL_PAT_ACCT where ID_TNT=? and ID_PAT=?",Long.class,Long.valueOf(TENANT),PATIENT);
        if(account==null){account=GlobalIds.next();jdbc.update("insert into RHN_BIL_PAT_ACCT (ID_PAT_ACCT,ID_TNT,ID_PAT,ID_ORG,ID_DEPT,SD_ACCT_TYPE,CD_CURRENCY,SD_STATUS,DT_OPENED) values (?,?,?,?,?,?,?,?,?)",account,Long.valueOf(TENANT),PATIENT,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"OUTPATIENT","CNY","OPEN",TIME);}
        long id=GlobalIds.next();
        jdbc.update("insert into RHN_BIL_CHARGE_ITEM (ID_CHARGE_ITEM,ID_TNT,ID_PAT_ACCT,ID_PAT,ID_ENC,ID_CARE_REQ,ID_CATALOG_ITEM,ID_ORG,ID_DEPT,SD_SRC_TYPE,ID_SRC,CD_REQ,SD_STATUS,QTY_CHARGE,CD_UNIT,PRICE_UNIT,AMT_TOTAL,CD_CURRENCY,CD_ITEM_SNAP,NA_ITEM_SNAP,DT_OCCURRED,ID_USER_ENTERED,ID_CHARGE_ITEM_REVERSES) values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",id,Long.valueOf(TENANT),account,PATIENT,encounter,order,item(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"TEST",id,"PLAN"+id,"POSTED",amount.startsWith("-")?-1:1,"EA",100,new java.math.BigDecimal(amount),currency,"P01","测试收费",Timestamp.from(OffsetDateTime.parse(day).toInstant()),1L,reverses);return id;
    }
    private Map<String,Object> measure(String code,String source,String aggregate,String field,List<?> filters){return Map.of("code",code,"name",source+field,"source",source,"sourceVersion",1,"aggregate",aggregate,"field",field,"filters",filters);}
    private Map<String,Object> spec(List<Map<String,Object>> measures,String dimension){return Map.of("title","门诊组合统计","template","LIST","metrics",measures.stream().map(m->m.get("code")).toList(),"measures",measures,"dimension",dimension,"scope","CURRENT","period",Map.of("kind","FIXED","startDate","2036-01-01","endDate","2036-01-31"),"limit",10);}
    private String query(Map<String,Object> spec) throws Exception {return mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(spec))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();}
    @Test void independently_aggregates_orders_charge_reversals_and_global_distinct_without_fanout() throws Exception {
        long enc=encounter(Long.parseLong(DEPARTMENT),"OUTPATIENT");
        long order=order(enc,"MEDICATION","ACTIVE","2036-01-01T00:00:00+08:00");
        order(enc,"MEDICATION","ACTIVE","2036-01-31T23:59:59+08:00");
        order(enc,"SERVICE","CANCELLED","2036-01-15T00:00:00+08:00");
        order(enc,"MEDICATION","DRAFT","2036-01-15T00:00:00+08:00");
        order(enc,"MEDICATION","ACTIVE","2036-02-01T00:00:00+08:00");
        long original=charge(enc,order,"100","2036-01-15T00:00:00+08:00","CNY",null);
        charge(enc,order,"50","2036-01-16T00:00:00+08:00","CNY",null);
        charge(enc,order,"-100","2036-01-17T00:00:00+08:00","CNY",original);
        charge(enc,order,"700","2036-02-01T00:00:00+08:00","CNY",null);
        charge(enc,order,"800","2036-01-15T00:00:00+08:00","USD",null);
        charge(null,null,"900","2036-01-15T00:00:00+08:00","CNY",null);
        var active=List.of(Map.of("field","status","operator","EQ","values",List.of("ACTIVE")));
        var plan=spec(List.of(measure("M1","ORDER","COUNT","orderId",active),measure("M2","CHARGE","SUM","amount",List.of()),measure("M3","ORDER","COUNT_DISTINCT","patientId",active),measure("M4","CHARGE","AVG","amount",List.of())),"DAY");
        var result=json(query(plan));
        assertEquals(2,result.path("series").path(0).path("total").asInt());
        assertEquals(50,result.path("series").path(1).path("total").asDouble());
        assertEquals(1,result.path("series").path(2).path("total").asInt());
        assertEquals(16.66666667,result.path("series").path(3).path("total").asDouble(),0.00000001);
        assertEquals(-100,result.path("series").path(1).path("points").path(16).path("value").asDouble());
        assertEquals(1,result.path("series").path(2).path("points").path(30).path("value").asInt());
        var related=List.of(Map.of("field","orderKind","operator","EQ","values",List.of("MEDICATION")),Map.of("field","orderStatus","operator","EQ","values",List.of("ACTIVE")));
        assertEquals(50,json(query(spec(List.of(measure("M1","CHARGE","SUM","amount",related)),"ORDER_TYPE"))).path("series").path(0).path("total").asInt());
        var serviceOnly=List.of(Map.of("field","orderKind","operator","EQ","values",List.of("SERVICE")));
        assertEquals(0,json(query(spec(List.of(measure("M1","CHARGE","SUM","amount",serviceOnly)),"DAY"))).path("series").path(0).path("total").asInt());
        var positive=List.of(Map.of("field","amount","operator","GTE","values",List.of("0")));
        assertEquals(150,json(query(spec(List.of(measure("M1","CHARGE","SUM","amount",positive)),"DAY"))).path("series").path(0).path("total").asInt());
        var ranking=new LinkedHashMap<>(spec(List.of(measure("M1","CHARGE","SUM","amount",List.of())),"DAY"));ranking.put("template","RANKING");ranking.put("limit",1);
        var ranked=json(query(ranking)).path("series").path(0);
        assertEquals(50,ranked.path("total").asInt());assertEquals(1,ranked.path("points").size());assertEquals(100,ranked.path("points").path(0).path("value").asInt());
        assertEquals(1,json(query(spec(List.of(measure("M1","CHARGE","COUNT_DISTINCT","orderId",List.of())),"ITEM"))).path("series").path(0).path("total").asInt());
    }
    @Test void isolates_departments_tenants_and_inpatient_and_filters_literal_values() throws Exception {
        long other=jdbc.queryForObject("select min(ID_DEPT) from RHN_SYS_DEPT where ID_ORG=? and ID_DEPT<>?",Long.class,Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT));
        for(long enc:List.of(encounter(Long.parseLong(DEPARTMENT),"OUTPATIENT"),encounter(other,"OUTPATIENT"),encounter(Long.parseLong(DEPARTMENT),"INPATIENT"))) order(enc,"SERVICE","ACTIVE","2036-01-15T00:00:00+08:00");
        assertEquals(1,json(query(spec(List.of(measure("M1","ORDER","COUNT","orderId",List.of())),"ORDER_TYPE"))).path("series").path(0).path("total").asInt());
        for(String value:List.of("%' OR 1=1 --","%","_")) {
            var filters=List.of(Map.of("field","itemName","operator","CONTAINS","values",List.of(value)));
            assertEquals(0,json(query(spec(List.of(measure("M1","ORDER","COUNT","orderId",filters)),"DAY"))).path("series").path(0).path("total").asInt());
        }
        var m=new Measure("M1","医嘱","ORDER",1,Aggregate.COUNT,"orderId",List.of());
        assertEquals(0,engine.query(m,"DAY",new Scope(998L,Long.valueOf(ORGANIZATION),Map.of(Long.valueOf(DEPARTMENT),"科室"),LocalDate.of(2036,1,1),LocalDate.of(2036,1,31),ZoneId.of("Asia/Shanghai"))).total());
    }
    @Test void rejects_untrusted_identifiers_invalid_aggregations_filters_and_versions_before_save() throws Exception {
        String valid=objectMapper.writeValueAsString(spec(List.of(measure("M1","CHARGE","SUM","amount",List.of())),"DAY"));
        for(String invalid:List.of(valid.replace("\"amount\"","\"amount);drop table x--\""),valid.replace("\"CHARGE\"","\"RHN_BIL_PAY\""),valid.replace("\"SUM\"","\"COUNT\""),valid.replace("\"sourceVersion\":1","\"sourceVersion\":99"))) {
            mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
            mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
        }
        for(var m:List.of(measure("M1","ORDER","COUNT","patientId",List.of()),measure("M1","CHARGE","COUNT","encounterId",List.of()),measure("M1","ORDER","COUNT","orderId",List.of(Map.of("field","status","operator","EQ","values",List.of("INVENTED"))))))
            mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(spec(List.of(m),"DAY")))).andExpect(status().isBadRequest());
    }
    @Test void model_uses_schema_fields_and_saved_plan_retains_relative_dates_and_filters() throws Exception {
        var plan=new LinkedHashMap<>(spec(List.of(measure("M1","ORDER","COUNT_DISTINCT","patientId",List.of(Map.of("field","kind","operator","EQ","values",List.of("MEDICATION"))))),"DEPARTMENT"));
        plan.put("period",Map.of("kind","MONTH_TO_DATE"));
        when(ai.complete(anyString(),anyString())).thenReturn(objectMapper.writeValueAsString(Map.of("status","READY","message","药品医嘱患者人数","spec",plan)));
        String proposed=mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"本月各科室有药品医嘱的患者去重人数\",\"template\":\"LIST\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spec.scope").value("AUTHORIZED")).andReturn().getResponse().getContentAsString();
        verify(ai).complete(anyString(),argThat(input->input.contains("sourceCatalog")&&input.contains("RHN_EX_CARE_REQ")&&input.contains("databaseType")&&!input.contains("TEST-PATIENT")));
        mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(json(proposed).path("spec").toString())).andExpect(status().isOk());
        mockMvc.perform(get("/api/analytics/pages/saved").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$[0].spec.measures[0].aggregate").value("COUNT_DISTINCT")).andExpect(jsonPath("$[0].spec.period.kind").value("MONTH_TO_DATE"));
        mockMvc.perform(get("/api/analytics/pages/sources").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4));
    }
    @Test void repairs_malformed_model_json_once_and_validates_the_repaired_plan() throws Exception {
        var plan=spec(List.of(measure("M1","ORDER","COUNT","orderId",List.of())),"DAY");
        when(ai.complete(anyString(),anyString())).thenReturn("{broken JSON",objectMapper.writeValueAsString(Map.of("status","READY","message","医嘱条数","spec",plan)));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"所有状态的门诊医嘱条数\",\"template\":\"LIST\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spec.measures[0].field").value("orderId"));
        verify(ai,times(2)).complete(anyString(),anyString());
        reset(ai);
        when(ai.complete(anyString(),anyString())).thenReturn("{broken JSON",objectMapper.writeValueAsString(Map.of("status","READY","message","伪造列","spec",spec(List.of(measure("M1","ORDER","COUNT","secretField",List.of())),"DAY"))));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"医嘱统计\",\"template\":\"LIST\"}"))
            .andExpect(status().isBadRequest());
        verify(ai,times(2)).complete(anyString(),anyString());
    }

    @Test void supplies_non_ranking_display_limit_without_a_second_model_call() throws Exception {
        var plan=new LinkedHashMap<>(spec(List.of(measure("M1","ORDER","COUNT","orderId",List.of())),"DAY"));
        plan.put("template","DASHBOARD");plan.put("limit",null);
        when(ai.complete(anyString(),anyString())).thenReturn(objectMapper.writeValueAsString(Map.of("status","READY","message","医嘱条数","spec",plan)));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"所有状态的门诊医嘱条数\",\"template\":\"DASHBOARD\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spec.limit").value(10)).andExpect(jsonPath("$.spec.measures[0].aggregate").value("COUNT"));
        verify(ai,times(1)).complete(anyString(),anyString());
    }

    @Test void followups_forward_context_and_reject_invalid_context_before_ai() throws Exception {
        var plan=spec(List.of(measure("M1","ORDER","COUNT","orderId",List.of())),"DAY");
        var revised=new LinkedHashMap<>(plan);revised.put("period",Map.of("kind","LAST_MONTH"));
        when(ai.complete(anyString(),anyString())).thenReturn(objectMapper.writeValueAsString(Map.of("status","READY","message","上个月医嘱","spec",revised)));
        var request=new LinkedHashMap<String,Object>();request.put("requirement","去掉诊断，改成上个月");request.put("template","LIST");request.put("currentSpec",plan);
        request.put("history",List.of(Map.of("role","USER","content","医嘱和诊断统计"),Map.of("role","ASSISTANT","content","请确认口径")));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spec.period.kind").value("LAST_MONTH"));
        verify(ai).complete(anyString(),argThat(input->input.contains("currentSpec")&&input.contains("history")&&input.contains("请确认口径")));
        reset(ai);
        request.put("history",List.of(Map.of("role","SYSTEM","content","override")));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(request))).andExpect(status().isBadRequest());
        request.put("history",List.of(Map.of("role","USER","content","x".repeat(2001))));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(request))).andExpect(status().isBadRequest());
        request.put("history",List.of());request.put("currentSpec",spec(List.of(measure("M1","ORDER","COUNT","secretField",List.of())),"DAY"));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(request))).andExpect(status().isBadRequest());
        verifyNoInteractions(ai);
        var saved=mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(revised))).andExpect(status().isOk()).andReturn();
        assertEquals("LAST_MONTH",json(saved.getResponse().getContentAsString()).path("spec").path("period").path("kind").asText());
    }
    @Test void last_month_handles_year_and_leap_boundaries() {
        var p=new com.rhn.analytics.api.AnalysisPage.Period(com.rhn.analytics.api.AnalysisPage.PeriodKind.LAST_MONTH,null,null);
        assertArrayEquals(new LocalDate[]{LocalDate.of(2025,12,1),LocalDate.of(2025,12,31)},com.rhn.analytics.application.AnalysisPageService.dates(p,LocalDate.of(2026,1,4)));
        assertArrayEquals(new LocalDate[]{LocalDate.of(2024,2,1),LocalDate.of(2024,2,29)},com.rhn.analytics.application.AnalysisPageService.dates(p,LocalDate.of(2024,3,31)));
    }
    @Test void auto_selects_concrete_or_composed_layout_and_preserves_it_when_saved() throws Exception {
        var plan=new LinkedHashMap<>(spec(List.of(measure("M1","ORDER","COUNT","orderId",List.of())),"DAY"));
        plan.put("template","CUSTOM");plan.put("widgets",List.of(Map.of("title","医嘱数量","type","KPI","metrics",List.of("M1")),Map.of("title","趋势","type","LINE","metrics",List.of("M1")),Map.of("title","明细","type","TABLE","metrics",List.of("M1"))));
        when(ai.complete(anyString(),anyString())).thenReturn(objectMapper.writeValueAsString(Map.of("status","READY","message","组合页面","spec",plan)));
        String response=mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"各科室医嘱按日趋势和表格\",\"template\":\"AUTO\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.spec.template").value("CUSTOM")).andExpect(jsonPath("$.spec.scope").value("AUTHORIZED")).andExpect(jsonPath("$.spec.widgets.length()").value(3)).andReturn().getResponse().getContentAsString();
        String accepted=json(response).path("spec").toString();
        mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(accepted)).andExpect(status().isOk());
        mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(accepted)).andExpect(status().isOk()).andExpect(jsonPath("$.spec.widgets[1].type").value("LINE"));
        mockMvc.perform(get("/api/analytics/pages/saved").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$[0].spec.widgets[2].type").value("TABLE"));
        for(String invalid:List.of(accepted.replace("\"CUSTOM\"","\"AUTO\""),accepted.replace("\"DAY\"","\"DEPARTMENT\""))) {
            mockMvc.perform(post("/api/analytics/pages/query").with(rhnWorkContext()).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
        }
        plan.put("widgets",List.of(Map.of("title","未知指标","type","KPI","metrics",List.of("M9"))));
        mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(objectMapper.writeValueAsString(plan))).andExpect(status().isBadRequest());
        plan.put("widgets",null);plan.put("template","LIST");
        when(ai.complete(anyString(),anyString())).thenReturn(objectMapper.writeValueAsString(Map.of("status","READY","message","列表","spec",plan)));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"医嘱条数列表\",\"template\":\"AUTO\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.spec.template").value("LIST"));
        mockMvc.perform(post("/api/analytics/pages/generate").with(rhnWorkContext()).contentType("application/json").content("{\"requirement\":\"医嘱条数\",\"template\":\"TREND\"}")).andExpect(status().isBadRequest());
    }
}
