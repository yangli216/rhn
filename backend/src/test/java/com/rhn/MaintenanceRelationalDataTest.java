package com.rhn;

import com.rhn.platform.maintenance.api.MaintenanceModels.Issue;
import com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;
import com.rhn.platform.maintenance.application.JdbcMaintenanceRelationalData;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

/** Fast isolated H2 checks for the shared relational mechanics; domain acceptance uses real workflow tests. */
class MaintenanceRelationalDataTest {
    JdbcTemplate jdbc;
    JdbcMaintenanceRelationalData data;
    TransactionTemplate transaction;
    final TableDefinition parent = new TableDefinition("RHN_TEST_PARENT", "ID_PARENT", "OUTPATIENT", "测试就诊", false);
    final TableDefinition child = new TableDefinition("RHN_TEST_CHILD", "ID_CHILD", "BILLING", "测试费用", false);
    @BeforeEach void database() {
        var datasource = new DriverManagerDataSource("jdbc:h2:mem:maint_rel_" + UUID.randomUUID()
                + ";DB_CLOSE_DELAY=-1", "sa", "");
        jdbc = new JdbcTemplate(datasource);
        data = new JdbcMaintenanceRelationalData(jdbc);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(datasource));
        jdbc.execute("create table RHN_TEST_PARENT (ID_PARENT bigint primary key,ID_TNT bigint not null,ID_ENC bigint not null,"
                + "ID_ORG bigint not null,AMT_VALUE decimal(24,6),DT_CREATED timestamp with time zone,"
                + "constraint UK_TEST_PARENT unique (ID_PARENT,ID_TNT))");
        jdbc.execute("create table RHN_TEST_CHILD (ID_CHILD bigint primary key,ID_TNT bigint not null,ID_PARENT bigint not null,"
                + "ID_ENC bigint,NA_VALUE varchar(200),foreign key (ID_PARENT,ID_TNT) references RHN_TEST_PARENT(ID_PARENT,ID_TNT))");
        jdbc.update("insert into RHN_TEST_PARENT values (1,10,100,50,12.345678,?)",
                java.time.OffsetDateTime.parse("2026-10-13T11:00:00.123456+08:00"));
        jdbc.update("insert into RHN_TEST_CHILD values (2,10,1,100,'test child')");
    }
    @Test void captures_owned_descendants_and_preserves_exact_decimal_and_time_values() {
        Capture snapshot = capture();
        assertThat(snapshot.tables().getFirst().rows()).hasSize(1);
        assertThat(snapshot.tables().get(1).rows()).hasSize(1);
        var row = snapshot.tables().getFirst().rows().getFirst();
        assertThat(new BigDecimal(row.cells().get("AMT_VALUE").value())).isEqualByComparingTo("12.345678");
        assertThat(row.cells().get("DT_CREATED").value()).isEqualTo("2026-10-13T03:00:00.123456Z");
        assertThat(data.dependencies(10L, snapshot, Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L))).isEmpty();
    }
    @Test void does_not_capture_or_delete_another_tenants_matching_business_id() {
        jdbc.update("insert into RHN_TEST_PARENT values (3,20,100,60,9,null)");
        jdbc.update("insert into RHN_TEST_CHILD values (4,20,3,100,'other tenant')");
        Capture snapshot = capture();
        transaction.executeWithoutResult(status -> data.delete(10L, snapshot, Set.of("OUTPATIENT", "BILLING")));
        data.verifyDeleted(10L, snapshot, Set.of("OUTPATIENT", "BILLING"));
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_PARENT where ID_TNT=20", Long.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_CHILD where ID_TNT=20", Long.class)).isEqualTo(1);
    }
    @Test void unselected_dependent_module_blocks_parent_cleanup() {
        var issues = data.dependencies(10L, capture(), Set.of("OUTPATIENT"), Set.of(100L), Set.of(50L));
        assertThat(issues).extracting(Issue::code).contains("MAINTENANCE_DEPENDENT_MODULE_REQUIRED");
        assertThat(issues).extracting(Issue::module).contains("BILLING");
    }
    @Test void unknown_physical_or_logical_business_reference_is_not_silently_deleted() {
        jdbc.execute("create table RHN_TEST_EXTERNAL (ID_EXTERNAL bigint primary key,ID_TNT bigint not null,"
                + "ID_PARENT bigint not null,foreign key (ID_PARENT,ID_TNT) references RHN_TEST_PARENT(ID_PARENT,ID_TNT))");
        jdbc.update("insert into RHN_TEST_EXTERNAL values (9,10,1)");
        var issues = data.dependencies(10L, capture(), Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L));
        assertThat(issues).extracting(Issue::code).contains("MAINTENANCE_DEPENDENT_MODULE_REQUIRED",
                "MAINTENANCE_UNREGISTERED_BUSINESS_REFERENCE");
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_EXTERNAL", Long.class)).isEqualTo(1);
    }
    @Test void other_encounter_or_organization_references_are_reported_before_deletion() {
        jdbc.update("update RHN_TEST_CHILD set ID_ENC=101 where ID_CHILD=2");
        assertThat(data.dependencies(10L, capture(), Set.of("BILLING"), Set.of(100L), Set.of(50L)))
                .extracting(Issue::code).contains("MAINTENANCE_CROSS_SCOPE_REFERENCE");
        jdbc.update("update RHN_TEST_PARENT set ID_ORG=51 where ID_PARENT=1");
        assertThat(data.dependencies(10L, capture(), Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L)))
                .extracting(Issue::code).contains("MAINTENANCE_CROSS_SCOPE_REFERENCE");
    }
    @Test void retained_records_remain_and_their_required_references_block_deletion() {
        TableDefinition kept = new TableDefinition(child.name(), child.key(), child.module(), child.label(), true);
        Capture snapshot = data.capture(10L, List.of(parent, kept), Map.of("ID_ENC", Set.of(100L)));
        assertThat(data.dependencies(10L, snapshot, Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L)))
                .extracting(Issue::code).contains("MAINTENANCE_DEPENDENT_MODULE_REQUIRED");
    }
    @Test void nullable_internal_reference_cycles_are_broken_without_disabling_constraints() {
        jdbc.execute("alter table RHN_TEST_PARENT add ID_CHILD bigint");
        jdbc.update("update RHN_TEST_PARENT set ID_CHILD=2 where ID_PARENT=1");
        jdbc.execute("alter table RHN_TEST_PARENT add foreign key (ID_CHILD) references RHN_TEST_CHILD(ID_CHILD)");
        Capture snapshot = capture();
        transaction.executeWithoutResult(status -> data.delete(10L, snapshot, Set.of("OUTPATIENT", "BILLING")));
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_PARENT", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from RHN_TEST_CHILD", Long.class)).isZero();
        assertThat(snapshot.tables().getFirst().rows().getFirst().cells().get("ID_CHILD").value()).isEqualTo("2");
    }
    @Test void unknown_identifiers_and_non_tenant_tables_cannot_be_used_as_dataset_definitions() {
        assertThatThrownBy(() -> data.capture(10L,
                List.of(new TableDefinition("RHN_TEST_PARENT;DELETE", "ID_PARENT", "OUTPATIENT", "", false)),
                Map.of("ID_ENC", Set.of(100L)))).hasMessageContaining("受控标识");
        jdbc.execute("create table RHN_TEST_GLOBAL (ID_GLOBAL bigint primary key)");
        assertThatThrownBy(() -> data.capture(10L,
                List.of(new TableDefinition("RHN_TEST_GLOBAL", "ID_GLOBAL", "OUTPATIENT", "", false)),
                Map.of("ID_ENC", Set.of(100L)))).hasMessageContaining("结构");
    }
    @Test void a_protected_composite_reference_can_detach_only_the_reviewed_nullable_component() {
        jdbc.execute("alter table RHN_TEST_PARENT add constraint UK_TEST_ENC unique (ID_ENC,ID_ORG,ID_TNT)");
        jdbc.execute("create table RHN_TEST_PROTECTED (ID_PROTECTED bigint primary key,ID_TNT bigint not null,ID_ORG bigint not null,"
                + "ID_ENC bigint, foreign key (ID_ENC,ID_ORG,ID_TNT) references RHN_TEST_PARENT(ID_ENC,ID_ORG,ID_TNT))");
        jdbc.update("insert into RHN_TEST_PROTECTED values (7,10,50,100)");
        var kept = new TableDefinition("RHN_TEST_PROTECTED", "ID_PROTECTED", "OUTPATIENT", "受保护资料", true, Set.of("ID_ENC"));
        var snapshot = data.capture(10L, List.of(parent,child,kept), Map.of("ID_ENC", Set.of(100L)));
        assertThat(data.dependencies(10L, snapshot, Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L))).isEmpty();
        transaction.executeWithoutResult(status -> data.delete(10L, snapshot, Set.of("OUTPATIENT", "BILLING")));
        assertThat(jdbc.queryForObject("select ID_ENC from RHN_TEST_PROTECTED where ID_PROTECTED=7", Long.class)).isNull();
        assertThat(jdbc.queryForObject("select ID_ORG from RHN_TEST_PROTECTED where ID_PROTECTED=7", Long.class)).isEqualTo(50L);
    }
    @Test void an_unknown_bridge_blocks_only_when_it_actually_references_the_selected_parent() {
        jdbc.execute("create table RHN_TEST_BRIDGE (ID_PARENT bigint,CD_VALUE varchar(20),primary key(ID_PARENT,CD_VALUE),"
                + "foreign key(ID_PARENT) references RHN_TEST_PARENT(ID_PARENT))");
        assertThat(data.dependencies(10L, capture(), Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L))).isEmpty();
        jdbc.update("insert into RHN_TEST_BRIDGE values (1,'linked')");
        assertThat(data.dependencies(10L, capture(), Set.of("OUTPATIENT", "BILLING"), Set.of(100L), Set.of(50L)))
                .extracting(Issue::code).contains("MAINTENANCE_DEPENDENCY_UNSUPPORTED");
    }
    private Capture capture() {
        return data.capture(10L, List.of(parent, child), Map.of("ID_ENC", Set.of(100L)));
    }
}
