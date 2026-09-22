package com.rhn;

import com.rhn.platform.masterdata.api.OrderFrequencyCommands.*;
import com.rhn.platform.masterdata.application.OrderFrequencyService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class OrderFrequencyPreviewTest extends RhnIntegrationTestSupport {
    @Autowired OrderFrequencyService frequencies;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec json;
    @MockitoBean ExecutionContextProvider contexts;
    static final LocalDateTime START=LocalDateTime.parse("2026-09-21T10:00:00");
    @BeforeEach void setup() {context(Long.valueOf(TENANT),true);}
    void context(Long tenant,boolean manage) {when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"frequency-author","test",manage?Set.of("MASTER_DATA.MANAGE"):Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));}
    FrequencyCommand definition(String code,String rule,int count,String period,String unit,String anchor,String times) {
        return new FrequencyCommand(code,"合成频次",null,null,rule,count,new BigDecimal(period),unit,anchor,times,true,true,true,true,false,false,true,500,"ACTIVE",LocalDate.of(2026,1,1),null);
    }
    ConfigurationCommand config(String times,String policy,boolean enabled) {return new ConfigurationCommand(Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),null,"草稿名称",times,policy,enabled,"ACTIVE",LocalDate.of(2026,1,1),null);}
    int count(String table) {return jdbc.queryForObject("select count(*) from "+table,Integer.class);}
    @Test void draft_definition_and_configuration_preview_use_current_inputs_and_do_not_persist() throws Exception {
        var input=definition("LOCALDAY","TIMES_PER_PERIOD",2,"1","D","STANDARD_TIME","08:00,20:00");
        int definitions=count("RHN_BD_ORDER_FREQ");
        var draft=frequencies.previewDefinition(input,START,3);
        assertThat(draft.source()).isEqualTo("UNSAVED_DEFINITION"); assertThat(draft.plannedTimes().getFirst()).isEqualTo(START.withHour(20));
        assertThat(count("RHN_BD_ORDER_FREQ")).isEqualTo(definitions);
        var saved=frequencies.create(input); int before=count("RHN_BD_CLIN_SEM_VER");
        var current=frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","REMAINING_SLOTS",true),START,3);
        assertThat(current.source()).isEqualTo("UNSAVED_CONFIGURATION");assertThat(current.plannedTimes().getFirst()).isEqualTo(START.withHour(17));
        assertThat(frequencies.list("LOCALDAY",null).getFirst().defaultExecutionTimes()).containsExactly("08:00","20:00");
        assertThat(frequencies.list("LOCALDAY",null).getFirst().configurations()).isEmpty();assertThat(count("RHN_BD_CLIN_SEM_VER")).isEqualTo(before);
        mockMvc.perform(post("/api/platform/master-data/order-frequencies/"+saved.id()+"/preview-configuration").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(json.write(Map.of("expectedRevision",saved.revision(),"configuration",config("09:00,17:00","REMAINING_SLOTS",true),"start",START,"occurrences",3))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.source").value("UNSAVED_CONFIGURATION")).andExpect(jsonPath("$.plannedTimes[0]").value("2026-09-21T17:00:00"));
    }
    @Test void saved_weekly_frequency_returns_a_gap_instead_of_daily_tasks_and_exposes_separate_capabilities() throws Exception {
        var input=definition("LOCALWEEK","TIMES_PER_PERIOD",1,"1","WK","STANDARD_TIME","08:00");
        var saved=frequencies.create(input);
        assertThat(saved.standard().interpretation().dailyRateComputable()).isTrue(); assertThat(saved.scheduleCapability().reason()).isEqualTo("PERIOD_DISTRIBUTION_REQUIRED");
        var plan=frequencies.preview(saved.code(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),START,8);
        assertThat(plan.plannedTimes()).isEmpty();assertThat(plan.capability().status()).isEqualTo("UNSUPPORTED");
        mockMvc.perform(post("/api/platform/master-data/order-frequencies/preview-definition").with(rhnWorkContext()).contentType(MediaType.APPLICATION_JSON)
                .content(json.write(Map.of("definition",input,"start",START,"occurrences",8))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.standard.interpretation.perDays").value(7)).andExpect(jsonPath("$.plannedTimes.length()").value(0));
    }
    @Test void inconsistent_fixed_interval_is_rejected_at_write_and_legacy_inconsistency_is_unavailable() {
        assertThatThrownBy(()->frequencies.create(definition("BADINTERVAL","FIXED_INTERVAL",2,"6","H","ORDER_START",null))).hasMessageContaining("次数必须为 1");
        var saved=frequencies.create(definition("LOCALINTERVAL","FIXED_INTERVAL",1,"6","H","ORDER_START",null));
        jdbc.update("update RHN_BD_ORDER_FREQ set QTY_FREQ=2 where ID_ORDER_FREQ=?",saved.id());
        var plan=frequencies.preview(saved.code(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),START,3);
        assertThat(plan.plannedTimes()).isEmpty();assertThat(plan.standard().status()).isEqualTo("UNAVAILABLE");
        assertThat(plan.capability().reason()).isEqualTo("INTERVAL_COUNT_CONFLICT");
    }
    @Test void preview_checks_revision_tenant_permissions_date_state_and_configuration_shape() {
        assertThatThrownBy(()->frequencies.previewDefinition(definition("PRECISION","TIMES_PER_PERIOD",1,"0.0001","D","STANDARD_TIME","08:00"),START,8)).hasMessageContaining("隐式舍入");
        assertThatThrownBy(()->frequencies.create(definition("PRECISION","TIMES_PER_PERIOD",1,"1000000000","D","STANDARD_TIME","08:00"))).hasMessageContaining("隐式舍入");
        var input=definition("LOCALSAFE","TIMES_PER_PERIOD",2,"1","D","STANDARD_TIME","08:00,20:00"); var saved=frequencies.create(input);
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),99,config("09:00,17:00","REMAINING_SLOTS",true),START,8)).hasMessageContaining("已变化");
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00","REMAINING_SLOTS",true),START,8)).hasMessageContaining("数量");
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","INVALID",true),START,8)).hasMessageContaining("首日策略");
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","REMAINING_SLOTS",false),START,8)).hasMessageContaining("未启用");
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","REMAINING_SLOTS",true),START.minusYears(1),8)).hasMessageContaining("未启用");
        context(9999L,true);assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","REMAINING_SLOTS",true),START,8)).hasMessageContaining("未找到");
        context(Long.valueOf(TENANT),false);assertThatThrownBy(()->frequencies.previewDefinition(input,START,8)).hasMessageContaining("权限");
        assertThatThrownBy(()->frequencies.previewConfiguration(saved.id(),saved.revision(),config("09:00,17:00","REMAINING_SLOTS",true),START,8)).hasMessageContaining("权限");
    }
}
