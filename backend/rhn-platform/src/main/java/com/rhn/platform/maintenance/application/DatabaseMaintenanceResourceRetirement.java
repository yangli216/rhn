package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceResourceRetirement;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class DatabaseMaintenanceResourceRetirement implements MaintenanceResourceRetirement {
    private final JdbcTemplate jdbc;
    DatabaseMaintenanceResourceRetirement(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override public boolean retired(Long tenant, Long resource) {
        return jdbc.queryForObject("select count(*) from RHN_SYS_MAINT_RETIRE where ID_TNT=? and ID_RSRC=?",
                Long.class, tenant, resource) != 0;
    }
}
