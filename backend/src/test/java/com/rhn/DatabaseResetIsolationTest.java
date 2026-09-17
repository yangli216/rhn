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
    }
}
