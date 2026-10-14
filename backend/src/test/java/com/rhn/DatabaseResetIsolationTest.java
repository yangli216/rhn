package com.rhn;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

@ResetDatabaseBeforeEachTestMethod
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class DatabaseResetIsolationTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationContext application;
    @Autowired RhnDatabaseBaseline baseline;
    private ApplicationContext firstContext;
    private int originalRows;

    @Test
    @Order(1)
    void deliberately_contaminates_schema_and_seed_data() {
        firstContext = application;
        originalRows = jdbc.queryForObject("select count(*) from RHN_BD_DICT_ITEM", Integer.class);
        assertTrue(originalRows > 0);
        jdbc.execute("create table RHN_RESET_SENTINEL (ID bigint primary key)");
        jdbc.update("update RHN_BD_DICT_ITEM set NA_DICT_ITEM = 'RESET_SENTINEL'");
        assertEquals(originalRows, jdbc.queryForObject(
                "select count(*) from RHN_BD_DICT_ITEM where NA_DICT_ITEM = 'RESET_SENTINEL'", Integer.class));
    }

    @Test
    @Order(2)
    void next_method_has_original_seed_data_and_schema_in_the_same_context() {
        assertSame(firstContext, application);
        assertEquals(originalRows, jdbc.queryForObject("select count(*) from RHN_BD_DICT_ITEM", Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "select count(*) from RHN_BD_DICT_ITEM where NA_DICT_ITEM = 'RESET_SENTINEL'", Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "select count(*) from information_schema.tables where lower(table_name) = 'rhn_reset_sentinel'",
                Integer.class));
        assertTrue(jdbc.queryForObject("select count(*) from information_schema.table_constraints "
                + "where constraint_type = 'FOREIGN KEY'", Integer.class) > 0);
        assertFalse(application.containsBean("org.springframework.context.annotation.internalScheduledAnnotationProcessor"));
        assertTrue(baseline.lastRestoreFull(), "A schema change must fall back to the full script restore");
    }

    @Test
    @Order(3)
    void data_only_contamination_without_schema_changes() {
        assertFalse(baseline.lastRestoreFull());
        assertEquals(0, baseline.lastRestoredTables(), "Read-only methods must not restore any table");
        jdbc.update("update RHN_BD_DICT_ITEM set NA_DICT_ITEM = 'RESET_SENTINEL'");
        Long removed = jdbc.queryForObject("select min(ID_DICT_ITEM) from RHN_BD_DICT_ITEM", Long.class);
        jdbc.update("delete from RHN_BD_DICT_ITEM where ID_DICT_ITEM = ?", removed);
        assertEquals(originalRows - 1, jdbc.queryForObject("select count(*) from RHN_BD_DICT_ITEM", Integer.class));
    }

    @Test
    @Order(4)
    void only_changed_tables_are_restored_to_the_seed_baseline() {
        assertFalse(baseline.lastRestoreFull(), "Data-only changes must use the per-table restore");
        assertEquals(1, baseline.lastRestoredTables());
        assertEquals(originalRows, jdbc.queryForObject("select count(*) from RHN_BD_DICT_ITEM", Integer.class));
        assertEquals(0, jdbc.queryForObject(
                "select count(*) from RHN_BD_DICT_ITEM where NA_DICT_ITEM = 'RESET_SENTINEL'", Integer.class));
        assertTrue(jdbc.queryForObject("select count(*) from information_schema.table_constraints "
                + "where constraint_type = 'FOREIGN KEY'", Integer.class) > 0);
    }
}
