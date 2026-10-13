package com.rhn;

import com.rhn.platform.configuration.application.ConfigurationApplicationService;
import com.rhn.platform.configuration.application.ParameterInitializationParticipant;
import com.rhn.platform.configuration.domain.*;
import com.rhn.platform.configuration.infrastructure.ConfigurationDefinitionRepository;
import com.rhn.platform.configuration.infrastructure.ParameterValueRepository;
import com.rhn.platform.identityaccess.api.*;
import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.application.*;
import com.rhn.platform.maintenance.infrastructure.MaintenanceStore;
import com.rhn.platform.masterdata.application.OrganizationCatalogInitializationParticipant;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

class MaintenanceInitializationTest extends RhnIntegrationTestSupport {
    static final Long TENANT_ID = Long.valueOf(TENANT), ORG_ID = Long.valueOf(ORGANIZATION), ACTOR_ID = 362387869790222L;
    static final Set<String> GRANTS = Set.of("MAINTENANCE.VIEW", "MAINTENANCE.MANAGE", "MAINTENANCE.EXECUTE",
            "MASTER_DATA.MANAGE", "CONFIGURATION.ACCESS");
    @MockitoBean ExecutionContextProvider contexts;
    @MockitoBean IdentityAccessDirectory accounts;
    @MockitoBean WorkContextDirectory workContexts;
    @Autowired MaintenancePlanningService planning;
    @Autowired MaintenanceTaskService tasks;
    @Autowired MaintenanceTaskRunner runner;
    @Autowired MaintenanceStore store;
    @Autowired ParameterInitializationParticipant parameters;
    @Autowired OrganizationCatalogInitializationParticipant catalogs;
    @Autowired ConfigurationDefinitionRepository definitions;
    @Autowired ParameterValueRepository values;
    @Autowired ConfigurationApplicationService configuration;
    @Autowired JdbcTemplate jdbc;
    @Autowired JsonCodec json;

    @BeforeEach void actor() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(TENANT_ID, ACTOR_ID, "doctor", "init-test", GRANTS,
                ORG_ID, Long.valueOf(DEPARTMENT), "ORGANIZATION", Set.of(ORG_ID), Set.of(Long.valueOf(DEPARTMENT))));
        when(accounts.findActiveAccount(TENANT_ID, "doctor")).thenReturn(Optional.of(
                new AuthenticatedAccount(ACTOR_ID, TENANT_ID, null, "doctor", "unused", GRANTS)));
        when(workContexts.authoritiesFor(TENANT_ID, ACTOR_ID, ORG_ID, Long.valueOf(DEPARTMENT))).thenReturn(GRANTS);
        jdbc.update("delete from RHN_SYS_MAINT_WRITE");
        jdbc.update("delete from RHN_SYS_MAINT_STATE");
    }

    @Test void fills_missing_parameters_through_the_existing_audit_path_and_repeat_preserves_values() {
        var definition = definition(ConfigurationSensitivity.NORMAL);
        PlanView plan = parameterPlan(definition.configKey());
        assertThat(plan.blockers()).isEmpty();
        run(plan);
        var value = values.findByDefinitionIdAndScopeCode(definition.id(), "ORGANIZATION:" + ORG_ID).orElseThrow();
        assertThat(value.valueJson()).isEqualTo("7");
        assertThat(jdbc.queryForObject("select count(*) from RHN_SYS_PARAM_CHG where ID_PARAM_VAL=?", Long.class, value.id())).isEqualTo(1);
        PlanView repeat = parameterPlan(definition.configKey());
        assertThat(repeat.impacts().getFirst().recordCount()).isZero();
        run(repeat);
        assertThat(values.findByDefinitionIdAndScopeCode(definition.id(), "ORGANIZATION:" + ORG_ID).orElseThrow().id()).isEqualTo(value.id());
        assertThat(jdbc.queryForObject("select count(*) from RHN_SYS_PARAM_CHG where ID_PARAM_VAL=?", Long.class, value.id())).isEqualTo(1);
    }
    @Test void preexisting_parameter_value_is_never_overwritten_by_default_initialization() {
        var definition = definition(ConfigurationSensitivity.NORMAL);
        configuration.saveValue(definition.id(), new ConfigurationApplicationService.ValueCommand(
                null, ConfigurationScope.ORGANIZATION, ORG_ID, ORG_ID, null, ConfigurationValueMode.OVERRIDE,
                "23", null, "测试已有机构参数", "existing-" + GlobalIds.next()));
        var before = values.findByDefinitionIdAndScopeCode(definition.id(), "ORGANIZATION:" + ORG_ID).orElseThrow();
        run(parameterPlan(definition.configKey()));
        var after = values.findByDefinitionIdAndScopeCode(definition.id(), "ORGANIZATION:" + ORG_ID).orElseThrow();
        assertThat(after.valueJson()).isEqualTo("23");
        assertThat(after.revision()).isEqualTo(before.revision());
    }
    @Test void sensitive_parameters_cannot_be_selected_or_disclosed_as_defaults() {
        var definition = definition(ConfigurationSensitivity.SENSITIVE);
        assertThat(parameters.options(contexts.requireCurrent()).parameters()).extracting(value -> value.key())
                .doesNotContain(definition.configKey());
        assertThatThrownBy(() -> parameterPlan(definition.configKey())).hasMessageContaining("不允许");
    }
    @Test void imports_adoption_and_price_without_changing_the_shared_catalog() {
        String code = service();
        Long item = jdbc.queryForObject("select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where ID_TNT=? and CD_CATALOG_ITEM=?",
                Long.class, TENANT_ID, code);
        long revision = jdbc.queryForObject("select REVISION from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM=?", Long.class, item);
        PlanView plan = catalogPlan(csv(code, "12.34"));
        assertThat(plan.blockers()).isEmpty();
        run(plan);
        assertThat(jdbc.queryForObject("select count(*) from RHN_BD_ORG_CATALOG_ITEM where ID_TNT=? and ID_ORG=? and ID_CATALOG_ITEM=?",
                Long.class, TENANT_ID, ORG_ID, item)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select PRICE_UNIT from RHN_BD_CATALOG_PRICE where ID_TNT=? and ID_ORG=? and ID_CATALOG_ITEM=?",
                java.math.BigDecimal.class, TENANT_ID, ORG_ID, item)).isEqualByComparingTo("12.34");
        assertThat(jdbc.queryForObject("select REVISION from RHN_BD_CATALOG_ITEM where ID_CATALOG_ITEM=?", Long.class, item)).isEqualTo(revision);
        run(catalogPlan(csv(code, "999.00")));
        assertThat(jdbc.queryForObject("select PRICE_UNIT from RHN_BD_CATALOG_PRICE where ID_TNT=? and ID_ORG=? and ID_CATALOG_ITEM=?",
                java.math.BigDecimal.class, TENANT_ID, ORG_ID, item)).isEqualByComparingTo("12.34");
    }
    @Test void reports_row_level_unknown_catalog_price_and_department_errors_before_any_write() {
        String code = service();
        String content = csv("UNKNOWN-CATALOG", "-1") + csv(code, "3").split("\\r?\\n")[1].replace(",,", ",UNKNOWN-DEPT,");
        PlanView plan = catalogPlan(content);
        assertThat(plan.blockers()).hasSizeGreaterThanOrEqualTo(1);
        assertThat(plan.blockers().getFirst().message()).contains("行");
        assertThatThrownBy(() -> execute(plan)).hasMessageContaining("阻断");
    }
    @Test void duplicate_file_rows_are_blocked_and_template_uses_business_columns() {
        String code = service();
        String csv = csv(code, "4");
        PlanView plan = catalogPlan(csv + csv.split("\\r?\\n")[1] + "\r\n");
        assertThat(plan.blockers()).extracting(Issue::code).contains("CATALOG_INITIALIZATION_DUPLICATE");
        assertThat(new String(catalogs.template("CSV"), StandardCharsets.UTF_8)).contains("目录编码", "包装条码", "生效日期");
    }
    @Test void modified_catalog_source_cannot_execute_an_old_preview() {
        String code = service();
        PlanView plan = catalogPlan(csv(code, "4"));
        TaskView task = execute(plan);
        runner.prepare(TENANT_ID, task.id());
        jdbc.update("update RHN_BD_CATALOG_ITEM set REVISION=REVISION+1 where ID_TNT=? and CD_CATALOG_ITEM=?", TENANT_ID, code);
        assertThatThrownBy(() -> runner.snapshot(TENANT_ID, task.id())).hasMessageContaining("已变化");
        assertThat(store.backup(TENANT_ID, task.id())).isEmpty();
    }

    private ConfigurationDefinition definition(ConfigurationSensitivity sensitivity) {
        Long category = jdbc.queryForObject("select ID_PARAM_CAT from RHN_SYS_PARAM_CAT order by ID_PARAM_CAT fetch first 1 rows only", Long.class);
        return definitions.saveAndFlush(new ConfigurationDefinition(category, "maintenance.test." + GlobalIds.next(),
                "机构初始化测试参数", null, ConfigurationValueType.NUMBER, ConfigurationControlType.NUMBER,
                "{\"type\":\"number\"}", "7", null, null, null, Set.of(ConfigurationScope.ORGANIZATION),
                ConfigurationCategory.BUSINESS, true, true, false, sensitivity, ConfigurationDisplayPolicy.PLAIN, ACTOR_ID));
    }
    private PlanView parameterPlan(String key) {
        return planning.preview(new PreviewRequest(scope(), Operation.INITIALIZE, "PARAMETER_DEFAULTS",
                Set.of("CONFIGURATION"), null, json.write(Map.of("keys", List.of(key))), "上线前补齐"));
    }
    private PlanView catalogPlan(String content) {
        return planning.preview(new PreviewRequest(scope(), Operation.IMPORT_CATALOG, "ORGANIZATION_CATALOG",
                Set.of("MASTER_DATA"), null, json.write(Map.of("fileName", "catalog.csv",
                "contentBase64", Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8)))), "上线前目录导入"));
    }
    private ScopeRequest scope() { return new ScopeRequest(false, List.of(ORG_ID), false); }
    private TaskView execute(PlanView plan) {
        return tasks.execute(plan.id(), new ExecuteRequest(plan.fingerprint(), "init-" + GlobalIds.next(),
                jdbc.queryForObject("select NA_ORG from RHN_SYS_ORG where ID_ORG=?", String.class, ORG_ID)));
    }
    private void run(PlanView plan) {
        TaskView task = execute(plan);
        runner.prepare(TENANT_ID, task.id()); runner.snapshot(TENANT_ID, task.id());
        runner.apply(TENANT_ID, task.id()); runner.finish(TENANT_ID, task.id());
        assertThat(store.task(TENANT_ID, task.id()).status()).isEqualTo(TaskStatus.SUCCEEDED);
    }
    private String csv(String code, String price) {
        String priceType = jdbc.queryForObject("select SD_PRICE_TYPE from RHN_BD_CATALOG_PRICE order by ID_CATALOG_PRICE fetch first 1 rows only", String.class);
        return "目录编码,默认科室编码,可开立,可执行,可收费,价格类型,价格,生效日期\r\n"
                + code + ",,是,是,是," + priceType + "," + price + "," + LocalDate.now() + "\r\n";
    }
    private String service() {
        Map<String, Object> original = jdbc.queryForMap("select * from RHN_BD_CATALOG_ITEM where ID_TNT=? and SD_ITEM_TYPE='SERVICE' and SD_STATUS='ACTIVE' fetch first 1 rows only", TENANT_ID);
        Long oldId = ((Number) original.get("ID_CATALOG_ITEM")).longValue(), newId = GlobalIds.next();
        String code = "MAINT-SVC-" + newId;
        original.put("ID_CATALOG_ITEM", newId); original.put("CD_CATALOG_ITEM", code);
        cloneRow("RHN_BD_CATALOG_ITEM", original);
        Map<String, Object> service = jdbc.queryForMap("select * from RHN_BD_SVC_ITEM where ID_CATALOG_ITEM=?", oldId);
        service.put("ID_CATALOG_ITEM", newId); cloneRow("RHN_BD_SVC_ITEM", service);
        return code;
    }
    private void cloneRow(String table, Map<String, Object> row) {
        jdbc.update("insert into " + table + " (" + String.join(",", row.keySet()) + ") values ("
                + String.join(",", Collections.nCopies(row.size(), "?")) + ")", row.values().toArray());
    }
}
