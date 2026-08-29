package com.rhn.portal.dashboard;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.workmanagement.api.WorkSummaryDirectory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.ZoneId;

import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
class PortalSummaryService {
    private final WorkSummaryDirectory workSummaryDirectory;
    private final ExecutionContextProvider contextProvider;
    private final JdbcTemplate jdbcTemplate;

    PortalSummaryService(WorkSummaryDirectory workSummaryDirectory,
                         ExecutionContextProvider contextProvider, JdbcTemplate jdbcTemplate) {
        this.workSummaryDirectory = workSummaryDirectory;
        this.contextProvider = contextProvider;
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(readOnly = true)
    PortalSummaryResponse current() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择机构和科室工作上下文");
        }
        ZoneId zoneId = organizationZone(context);
        Timestamp today = Timestamp.from(LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant());
        long registered = count("""
                select count(*) from encounters where tenant_id = ? and organization_id = ? and department_id = ?
                 and registered_at >= ?
                """, context.tenantId(), context.organizationId(), context.departmentId(), today);
        long inProgress = count("""
                select count(*) from encounters where tenant_id = ? and organization_id = ? and department_id = ?
                 and status = 'IN_PROGRESS'
                """, context.tenantId(), context.organizationId(), context.departmentId());
        long completed = count("""
                select count(*) from encounters where tenant_id = ? and organization_id = ? and department_id = ?
                 and status = 'COMPLETED' and completed_at >= ?
                """, context.tenantId(), context.organizationId(), context.departmentId(), today);
        long residents = count("select count(*) from residents where tenant_id = ? and status = 'ACTIVE'",
                context.tenantId());
        return new PortalSummaryResponse(workSummaryDirectory.tasks(), workSummaryDirectory.notifications(), registered,
                inProgress, completed, residents);
    }

    private long count(String sql, Object... arguments) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, arguments);
        return value == null ? 0 : value;
    }

    private ZoneId organizationZone(ExecutionContext context) {
        String configured = jdbcTemplate.query("""
                        select timezone_code from organizations where tenant_id = ? and id = ?
                        """, resultSet -> resultSet.next() ? resultSet.getString(1) : null,
                context.tenantId(), context.organizationId());
        try {
            return configured == null || configured.isBlank() ? ZoneId.of("Asia/Shanghai") : ZoneId.of(configured);
        } catch (DateTimeException exception) {
            return ZoneId.of("Asia/Shanghai");
        }
    }
}
