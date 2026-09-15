package com.rhn.platform.realtime.application;

import com.rhn.platform.realtime.api.PresenceTrend;
import com.rhn.platform.realtime.api.PresenceTrendPoint;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class PresenceTrendService {
    private static final Duration MAX_RANGE = Duration.ofDays(31);
    private final PresenceMetricSampleRepository samples;
    private final ExecutionContextProvider contextProvider;

    public PresenceTrendService(PresenceMetricSampleRepository samples, ExecutionContextProvider contextProvider) {
        this.samples = samples; this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public PresenceTrend trend(String requestedScopeType, Long organizationId, Long departmentId,
                               Instant requestedFrom, Instant requestedTo) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择工作上下文");
        Instant to = requestedTo == null ? Instant.now() : requestedTo;
        Instant from = requestedFrom == null ? to.minus(Duration.ofHours(6)) : requestedFrom;
        if (!from.isBefore(to)) throw badRequest("PRESENCE_TREND_RANGE_INVALID", "开始时间必须早于结束时间");
        if (Duration.between(from, to).compareTo(MAX_RANGE) > 0) {
            throw badRequest("PRESENCE_TREND_RANGE_TOO_LARGE", "在线趋势查询范围不能超过 31 天");
        }

        String scopeType = requestedScopeType == null || requestedScopeType.isBlank()
                ? "DEPARTMENT" : requestedScopeType.trim().toUpperCase(Locale.ROOT);
        String scopeKey;
        if ("TENANT".equals(scopeType)) {
            if (!tenantWide(context)) throw forbidden("PRESENCE_TREND_SCOPE_FORBIDDEN", "无权查看租户在线趋势");
            organizationId = null; departmentId = null; scopeKey = PresenceMetricCollector.tenantKey();
        } else if ("ORGANIZATION".equals(scopeType)) {
            organizationId = organizationId == null ? context.organizationId() : organizationId;
            if (!(tenantWide(context) || "ORGANIZATION".equals(context.dataScopeType()))
                    || !context.canAccessOrganization(organizationId)) {
                throw forbidden("PRESENCE_TREND_SCOPE_FORBIDDEN", "无权查看该机构在线趋势");
            }
            departmentId = null; scopeKey = PresenceMetricCollector.organizationKey(organizationId);
        } else if ("DEPARTMENT".equals(scopeType)) {
            organizationId = organizationId == null ? context.organizationId() : organizationId;
            departmentId = departmentId == null ? context.departmentId() : departmentId;
            if (!context.canAccessOrganization(organizationId) || !context.canAccessDepartment(departmentId)) {
                throw forbidden("PRESENCE_TREND_SCOPE_FORBIDDEN", "无权查看该科室在线趋势");
            }
            scopeKey = PresenceMetricCollector.departmentKey(organizationId, departmentId);
        } else {
            throw badRequest("PRESENCE_TREND_SCOPE_INVALID", "在线趋势范围必须为 TENANT、ORGANIZATION 或 DEPARTMENT");
        }
        List<PresenceTrendPoint> points = samples.findRange(context.tenantId(), scopeKey, from, to).stream()
                .map(value -> new PresenceTrendPoint(value.bucketAt(), value.onlineUsers(), value.activeUsers(),
                        value.onlineContexts(), value.connections(), value.instances()))
                .toList();
        return new PresenceTrend(scopeType, organizationId, departmentId, from, to, points);
    }

    private boolean tenantWide(ExecutionContext context) {
        return context.hasAuthority("ROLE_ADMIN") || "TENANT".equals(context.dataScopeType());
    }
}
