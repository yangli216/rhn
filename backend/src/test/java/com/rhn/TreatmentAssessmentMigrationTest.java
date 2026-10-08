package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class TreatmentAssessmentMigrationTest {
    @Test void migration_clears_only_unfinished_defaults_and_removes_future_default() {
        var dataSource = new DriverManagerDataSource("jdbc:h2:mem:treatment-assessment-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(dataSource);
        try {
            jdbc.execute("create table RHN_EX_TREAT_EXEC_TASK (ID bigint primary key, DT_CMPLD timestamp with time zone, FG_ADVERSE_REACT boolean default false not null)");
            jdbc.update("insert into RHN_EX_TREAT_EXEC_TASK values (1, null, false), (2, current_timestamp, false), (3, current_timestamp, true), (4, null, true)");
            new ResourceDatabasePopulator(new ClassPathResource("db/migration/V1_98_0__treatment_unknown_assessment.sql")).execute(dataSource);
            assertNull(jdbc.queryForObject("select FG_ADVERSE_REACT from RHN_EX_TREAT_EXEC_TASK where ID=1", Boolean.class));
            assertEquals(Boolean.FALSE, jdbc.queryForObject("select FG_ADVERSE_REACT from RHN_EX_TREAT_EXEC_TASK where ID=2", Boolean.class));
            assertEquals(Boolean.TRUE, jdbc.queryForObject("select FG_ADVERSE_REACT from RHN_EX_TREAT_EXEC_TASK where ID=3", Boolean.class));
            assertEquals(Boolean.TRUE, jdbc.queryForObject("select FG_ADVERSE_REACT from RHN_EX_TREAT_EXEC_TASK where ID=4", Boolean.class));
            jdbc.update("insert into RHN_EX_TREAT_EXEC_TASK (ID) values (5)");
            assertNull(jdbc.queryForObject("select FG_ADVERSE_REACT from RHN_EX_TREAT_EXEC_TASK where ID=5", Boolean.class));
        } finally {
            jdbc.execute("shutdown");
        }
    }
}
