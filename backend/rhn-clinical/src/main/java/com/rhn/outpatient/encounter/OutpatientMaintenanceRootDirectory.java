package com.rhn.outpatient.encounter;

import com.rhn.platform.maintenance.api.MaintenanceModels.*;
import com.rhn.platform.maintenance.api.MaintenanceRootDirectory;
import com.rhn.platform.maintenance.api.MaintenanceTestDataDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Component
public class OutpatientMaintenanceRootDirectory implements MaintenanceRootDirectory {
    private final NamedParameterJdbcTemplate jdbc;
    private final MaintenanceTestDataDirectory origins;
    public OutpatientMaintenanceRootDirectory(NamedParameterJdbcTemplate jdbc, MaintenanceTestDataDirectory origins) {
        this.jdbc = jdbc; this.origins = origins;
    }
    @Override public List<RootCandidate> candidates(ExecutionContext actor, Scope scope, String query) {
        String needle = query == null ? "" : query.trim().replace("%", "\\%").replace("_", "\\_");
        var rows = jdbc.query("select ID_ENC,ID_ORG,CD_ENC_NO,SD_STATUS,DT_REGD from RHN_VIS_ENC "
                        + "where ID_TNT=:tenant and ID_ORG in (:organizations) and SD_ENC_CLASS='OUTPATIENT' "
                        + "and lower(CD_ENC_NO) like :query escape '\\' order by DT_REGD desc fetch first 200 rows only",
                Map.of("tenant", scope.tenantId(), "organizations", scope.organizationIds(), "query", "%" + needle.toLowerCase(Locale.ROOT) + "%"),
                (rs, row) -> new RootCandidate("OUTPATIENT", "ENCOUNTER", rs.getLong(1), rs.getLong(2),
                        rs.getString(3), rs.getString(4), rs.getObject(5, java.time.OffsetDateTime.class).toInstant(), null));
        var marked = origins.origins(scope.tenantId(), "ENCOUNTER", rows.stream().map(RootCandidate::resourceId).toList());
        return rows.stream().map(row -> new RootCandidate(row.module(), row.resourceType(), row.resourceId(), row.organizationId(),
                row.businessNo(), row.status(), row.createdAt(), marked.containsKey(row.resourceId()) ? marked.get(row.resourceId()).batchId() : null)).toList();
    }
    @Override public List<Root> allRoots(ExecutionContext actor, Scope scope) {
        var values = jdbc.query("select ID_ENC,ID_ORG from RHN_VIS_ENC where ID_TNT=:tenant and ID_ORG in (:organizations)"
                        + " and SD_ENC_CLASS='OUTPATIENT' order by ID_ENC fetch first 1001 rows only",
                Map.of("tenant", scope.tenantId(), "organizations", scope.organizationIds()),
                (rs, row) -> new Root("OUTPATIENT", "ENCOUNTER", rs.getLong(1), rs.getLong(2)));
        if (values.size() > 1000) throw badRequest("MAINTENANCE_RESET_TOO_LARGE", "单次重置最多1000个就诊，请缩小机构范围");
        return values;
    }
    @Override public void requireRoots(ExecutionContext actor, Scope scope, List<Root> roots) {
        if (roots.isEmpty()) throw badRequest("MAINTENANCE_ROOTS_REQUIRED", "请选择测试就诊");
        for (var root : roots) {
            if (!"OUTPATIENT".equals(root.module()) || !"ENCOUNTER".equals(root.resourceType()))
                throw badRequest("MAINTENANCE_ROOT_TYPE_UNSUPPORTED", "第一期临床清理以门诊就诊为业务根对象");
            var found = jdbc.query("select ID_ORG from RHN_VIS_ENC where ID_TNT=:tenant and ID_ENC=:id and SD_ENC_CLASS='OUTPATIENT'",
                    Map.of("tenant", scope.tenantId(), "id", root.resourceId()), (rs, row) -> rs.getLong(1));
            if (found.isEmpty() || !found.getFirst().equals(root.organizationId()) || !scope.organizationIds().contains(root.organizationId()))
                throw notFound("MAINTENANCE_ROOT_NOT_FOUND", "就诊不存在或不属于选定机构");
        }
    }
}
