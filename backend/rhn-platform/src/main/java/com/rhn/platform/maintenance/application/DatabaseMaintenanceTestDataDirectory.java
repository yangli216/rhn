package com.rhn.platform.maintenance.application;

import com.rhn.platform.maintenance.api.MaintenanceTestDataDirectory;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.*;

@Component
class DatabaseMaintenanceTestDataDirectory implements MaintenanceTestDataDirectory {
    private final NamedParameterJdbcTemplate jdbc;
    DatabaseMaintenanceTestDataDirectory(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }
    @Override public Optional<TestOrigin> origin(Long tenant, String type, Long id) {
        return Optional.ofNullable(origins(tenant, type, List.of(id)).get(id));
    }
    @Override public Map<Long, TestOrigin> origins(Long tenant, String type, List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        Map<Long, TestOrigin> result = new HashMap<>();
        for (int start = 0; start < ids.size(); start += 800) {
            var chunk = ids.subList(start, Math.min(start + 800, ids.size()));
            jdbc.query("select ID_RSRC,ID_MAINT_BATCH,ID_ORG,DT_TAGGED from RHN_SYS_MAINT_ORIGIN "
                    + "where ID_TNT=:tenant and SD_RSRC_TYPE=:type and ID_RSRC in (:ids)",
                    Map.of("tenant", tenant, "type", type, "ids", chunk), rs -> {
                        result.put(rs.getLong(1), new TestOrigin(rs.getLong(2), rs.getLong(3),
                                rs.getObject(4, java.time.OffsetDateTime.class).toInstant()));
                    });
        }
        return Map.copyOf(result);
    }
}
