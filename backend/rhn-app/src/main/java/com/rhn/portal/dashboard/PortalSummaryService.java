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
                select count(*) from RHN_VIS_ENC where ID_TNT = ? and ID_ORG = ? and ID_DEPT = ?
                 and DT_REGD >= ?
                """, context.tenantId(), context.organizationId(), context.departmentId(), today);
        long inProgress = count("""
                select count(*) from RHN_VIS_ENC where ID_TNT = ? and ID_ORG = ? and ID_DEPT = ?
                 and SD_STATUS = 'IN_PROGRESS'
                """, context.tenantId(), context.organizationId(), context.departmentId());
        long completed = count("""
                select count(*) from RHN_VIS_ENC where ID_TNT = ? and ID_ORG = ? and ID_DEPT = ?
                 and SD_STATUS = 'COMPLETED' and DT_CMPLD >= ?
                """, context.tenantId(), context.organizationId(), context.departmentId(), today);
        long residents = count("select count(*) from RHN_PI_PAT where ID_TNT = ? and SD_STATUS = 'ACTIVE'",
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
                        select CD_TZ as timezone_code from RHN_SYS_ORG where ID_TNT = ? and ID_ORG = ?
                        """, resultSet -> resultSet.next() ? resultSet.getString(1) : null,
                context.tenantId(), context.organizationId());
        try {
            return configured == null || configured.isBlank() ? ZoneId.of("Asia/Shanghai") : ZoneId.of(configured);
        } catch (DateTimeException exception) {
            return ZoneId.of("Asia/Shanghai");
        }
    }
}
