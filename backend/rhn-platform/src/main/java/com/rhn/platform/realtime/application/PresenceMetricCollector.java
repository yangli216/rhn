package com.rhn.platform.realtime.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class PresenceMetricCollector {
    private static final Logger log = LoggerFactory.getLogger(PresenceMetricCollector.class);
    private final PresenceLeaseStore presence;
    private final PresenceMetricWriter writer;
    private final Duration activeWindow;
    private final Duration retention;

    public PresenceMetricCollector(PresenceLeaseStore presence, PresenceMetricWriter writer,
                                   @Value("${rhn.presence.active-window:PT5M}") Duration activeWindow,
                                   @Value("${rhn.presence.metrics.retention:P30D}") Duration retention) {
        this.presence = presence; this.writer = writer; this.activeWindow = activeWindow; this.retention = retention;
    }

    @Scheduled(cron = "${rhn.presence.metrics.sample-cron:0 * * * * *}")
    public void collect() {
        Instant now = Instant.now(); Instant bucket = now.truncatedTo(ChronoUnit.MINUTES);
        presence.activeTenants().forEach(tenantId -> collectTenant(tenantId, bucket, now));
    }

    @Scheduled(cron = "${rhn.presence.metrics.cleanup-cron:0 30 3 * * *}")
    public void cleanup() { writer.deleteOlderThan(Instant.now().minus(retention)); }

    private void collectTenant(Long tenantId, Instant bucket, Instant now) {
        List<PresenceConnectionSnapshot> connections = presence.findByTenant(tenantId);
        record(tenantId, "TENANT", tenantKey(), null, null, bucket, values(connections, now), now);
        Map<Long, List<PresenceConnectionSnapshot>> organizations = connections.stream()
                .filter(value -> value.organizationId() != null)
                .collect(Collectors.groupingBy(PresenceConnectionSnapshot::organizationId));
        organizations.forEach((organizationId, values) -> record(tenantId, "ORGANIZATION",
                organizationKey(organizationId), organizationId, null, bucket, values(values, now), now));
        Map<DepartmentKey, List<PresenceConnectionSnapshot>> departments = connections.stream()
                .filter(value -> value.organizationId() != null && value.departmentId() != null)
                .collect(Collectors.groupingBy(value -> new DepartmentKey(value.organizationId(), value.departmentId())));
        departments.forEach((key, values) -> record(tenantId, "DEPARTMENT",
                departmentKey(key.organizationId(), key.departmentId()), key.organizationId(), key.departmentId(),
                bucket, values(values, now), now));
    }

    private void record(Long tenantId, String scopeType, String scopeKey, Long organizationId, Long departmentId,
                        Instant bucket, PresenceMetricValues values, Instant now) {
        try { writer.record(tenantId, scopeType, scopeKey, organizationId, departmentId, bucket, values, now); }
        catch (DataIntegrityViolationException duplicate) {
            log.debug("Presence metric bucket was already recorded by another instance: {} {}", tenantId, scopeKey);
        }
    }

    private PresenceMetricValues values(List<PresenceConnectionSnapshot> values, Instant now) {
        long users = values.stream().map(PresenceConnectionSnapshot::userId).distinct().count();
        long active = values.stream().filter(value -> !value.lastActivityAt().isBefore(now.minus(activeWindow)))
                .map(PresenceConnectionSnapshot::userId).distinct().count();
        long contexts = values.stream().map(value -> new ContextKey(value.userId(), value.organizationId(),
                value.departmentId())).distinct().count();
        long instances = values.stream().map(PresenceConnectionSnapshot::instanceId).distinct().count();
        return new PresenceMetricValues(users, active, contexts, values.size(), instances);
    }

    static String tenantKey() { return "TENANT"; }
    static String organizationKey(Long organizationId) { return "ORG:" + organizationId; }
    static String departmentKey(Long organizationId, Long departmentId) {
        return "DEPT:" + organizationId + ":" + departmentId;
    }

    private record ContextKey(Long userId, Long organizationId, Long departmentId) {}
    private record DepartmentKey(Long organizationId, Long departmentId) {}
}
