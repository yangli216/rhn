package com.rhn.platform.realtime.application;

import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.realtime.api.PresenceScopeSummary;
import com.rhn.platform.realtime.api.PresenceSummary;
import com.rhn.platform.realtime.api.PresenceUserPage;
import com.rhn.platform.realtime.api.PresenceUserView;
import com.rhn.platform.realtime.api.PresenceTerminationResult;
import com.rhn.platform.security.SessionRevocationStore;
import com.rhn.platform.security.RefreshLoginSessionService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PresenceService {
    private final RealtimeConnectionRegistry connections;
    private final PresenceLeaseStore presence;
    private final ExecutionContextProvider contextProvider;
    private final OrganizationDirectory organizations;
    private final Duration activeWindow;
    private final Duration revocationTtl;
    private final SessionRevocationStore revocations;
    private final PresenceControlPublisher controls;
    private final RefreshLoginSessionService refreshLogin;

    public PresenceService(RealtimeConnectionRegistry connections, PresenceLeaseStore presence,
                           ExecutionContextProvider contextProvider,
                           OrganizationDirectory organizations,
                           SessionRevocationStore revocations, PresenceControlPublisher controls,
                           RefreshLoginSessionService refreshLogin,
                           @Value("${rhn.presence.active-window:PT5M}") Duration activeWindow,
                           @Value("${rhn.security.revocation-ttl:PT12H}") Duration revocationTtl) {
        this.connections = connections; this.presence = presence; this.contextProvider = contextProvider;
        this.organizations = organizations; this.activeWindow = activeWindow; this.revocations = revocations;
        this.controls = controls; this.revocationTtl = revocationTtl;
        this.refreshLogin = refreshLogin;
    }

    public PresenceSummary summary() {
        ExecutionContext context = current(); Instant now = Instant.now();
        List<PresenceConnectionSnapshot> visible = visible(context);
        return new PresenceSummary(distinctUsers(visible), activeUsers(visible, now), distinctContexts(visible),
                visible.size(), visible.stream().map(PresenceConnectionSnapshot::instanceId).distinct().count(),
                now, scopeSummaries(context, visible, now, false),
                scopeSummaries(context, visible, now, true));
    }

    public PresenceUserPage users(String query, boolean activeOnly, int page, int size) {
        ExecutionContext context = current(); Instant now = Instant.now();
        if (page < 0) throw badRequest("PRESENCE_PAGE_INVALID", "页码不能小于 0");
        if (size < 1 || size > 200) throw badRequest("PRESENCE_SIZE_INVALID", "每页数量必须在 1 到 200 之间");
        String normalized = query == null || query.isBlank() ? null : query.trim().toLowerCase(Locale.ROOT);
        Map<ContextKey, List<PresenceConnectionSnapshot>> grouped = visible(context).stream()
                .collect(Collectors.groupingBy(value -> new ContextKey(value.userId(), value.organizationId(),
                        value.departmentId()), LinkedHashMap::new, Collectors.toList()));
        Map<Long, String> organizationNames = new HashMap<>(); Map<DepartmentKey, String> departmentNames = new HashMap<>();
        List<PresenceUserView> values = new ArrayList<>();
        grouped.values().forEach(group -> {
            PresenceConnectionSnapshot first = group.getFirst();
            Instant connectedAt = group.stream().map(PresenceConnectionSnapshot::connectedAt).min(Instant::compareTo).orElse(now);
            Instant lastSeen = group.stream().map(PresenceConnectionSnapshot::lastSeenAt).max(Instant::compareTo).orElse(now);
            Instant lastActivity = group.stream().map(PresenceConnectionSnapshot::lastActivityAt).max(Instant::compareTo).orElse(now);
            boolean active = active(lastActivity, now);
            String organizationName = organizationName(context.tenantId(), first.organizationId(), organizationNames);
            String departmentName = departmentName(context.tenantId(), first.organizationId(), first.departmentId(), departmentNames);
            PresenceUserView view = new PresenceUserView(first.userId(), first.username(), first.practitionerId(),
                    first.organizationId(), organizationName, first.departmentId(), departmentName, active,
                    connectedAt, lastSeen, lastActivity, group.size());
            String searchable = (view.username() + " " + organizationName + " " + departmentName).toLowerCase(Locale.ROOT);
            if ((!activeOnly || active) && (normalized == null || searchable.contains(normalized))) values.add(view);
        });
        values.sort(Comparator.comparing(PresenceUserView::active).reversed()
                .thenComparing(PresenceUserView::lastSeenAt, Comparator.reverseOrder())
                .thenComparing(PresenceUserView::username));
        long total = values.size(); int from = Math.min(page * size, values.size());
        int to = Math.min(from + size, values.size());
        return new PresenceUserPage(total, page, size, now, List.copyOf(values.subList(from, to)));
    }

    public void activity() {
        ExecutionContext context = current(); connections.touch(context);
    }

    public PresenceTerminationResult terminate(Long userId, String reason) {
        ExecutionContext context = current();
        if (!tenantWide(context)) {
            throw forbidden("PRESENCE_TERMINATE_SCOPE_FORBIDDEN", "只有租户级管理员可以强制用户下线");
        }
        List<PresenceConnectionSnapshot> matches = visible(context).stream()
                .filter(value -> userId.equals(value.userId())).toList();
        if (matches.isEmpty()) throw notFound("PRESENCE_USER_NOT_ONLINE", "目标用户当前不在线");
        Set<String> sessions = matches.stream().map(PresenceConnectionSnapshot::clientSessionId)
                .filter(value -> value != null && !value.isBlank()).collect(Collectors.toUnmodifiableSet());
        if (sessions.isEmpty()) throw notFound("PRESENCE_SESSION_NOT_FOUND", "目标用户没有可治理的在线会话");
        sessions.forEach(sessionId -> revocations.revoke(context.tenantId(), sessionId, revocationTtl));
        refreshLogin.invalidateUser(context.tenantId(), userId);
        Instant now = Instant.now();
        controls.publish(new PresenceControlCommand(context.tenantId(), userId, sessions,
                reason.trim(), context.subjectId(), now));
        return new PresenceTerminationResult(userId, sessions.size(), matches.size(), now);
    }

    private List<PresenceConnectionSnapshot> visible(ExecutionContext context) {
        return presence.findByTenant(context.tenantId()).stream().filter(value -> canView(context, value)).toList();
    }

    private boolean canView(ExecutionContext context, PresenceConnectionSnapshot value) {
        if (tenantWide(context)) return true;
        if (value.organizationId() == null || !context.canAccessOrganization(value.organizationId())) return false;
        if ("ORGANIZATION".equals(context.dataScopeType())) return true;
        return value.departmentId() != null && context.canAccessDepartment(value.departmentId());
    }

    private boolean tenantWide(ExecutionContext context) {
        return context.hasAuthority("ROLE_ADMIN") || context.hasAuthority("ROLE_PRESENCE_ADMIN")
                || "TENANT".equals(context.dataScopeType());
    }

    private ExecutionContext current() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext()) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择工作上下文");
        }
        return context;
    }

    private List<PresenceScopeSummary> scopeSummaries(ExecutionContext context,
                                                       List<PresenceConnectionSnapshot> values,
                                                       Instant now, boolean department) {
        Function<PresenceConnectionSnapshot, ScopeKey> classifier = value -> department
                ? new ScopeKey(value.organizationId(), value.departmentId()) : new ScopeKey(value.organizationId(), null);
        Map<ScopeKey, List<PresenceConnectionSnapshot>> grouped = values.stream()
                .filter(value -> value.organizationId() != null && (!department || value.departmentId() != null))
                .collect(Collectors.groupingBy(classifier));
        Map<Long, String> organizationNames = new HashMap<>(); Map<DepartmentKey, String> departmentNames = new HashMap<>();
        return grouped.entrySet().stream().map(entry -> {
            ScopeKey key = entry.getKey(); List<PresenceConnectionSnapshot> scope = entry.getValue();
            String name = department ? departmentName(context.tenantId(), key.organizationId(), key.departmentId(), departmentNames)
                    : organizationName(context.tenantId(), key.organizationId(), organizationNames);
            return new PresenceScopeSummary(department ? "DEPARTMENT" : "ORGANIZATION", key.organizationId(),
                    key.departmentId(), name, distinctUsers(scope), activeUsers(scope, now),
                    distinctContexts(scope), scope.size());
        }).sorted(Comparator.comparing(PresenceScopeSummary::onlineUsers).reversed()
                .thenComparing(PresenceScopeSummary::name)).toList();
    }

    private String organizationName(Long tenantId, Long id, Map<Long, String> cache) {
        if (id == null) return "未选择机构";
        return cache.computeIfAbsent(id, value -> organizations.requireOrganization(tenantId, value).name());
    }

    private String departmentName(Long tenantId, Long organizationId, Long id, Map<DepartmentKey, String> cache) {
        if (id == null) return "未选择科室";
        DepartmentKey key = new DepartmentKey(organizationId, id);
        return cache.computeIfAbsent(key, value -> organizations.requireDepartment(tenantId,
                value.organizationId(), value.departmentId()).name());
    }

    private long distinctUsers(List<PresenceConnectionSnapshot> values) {
        return values.stream().map(PresenceConnectionSnapshot::userId).distinct().count();
    }

    private long distinctContexts(List<PresenceConnectionSnapshot> values) {
        return values.stream().map(value -> new ContextKey(value.userId(), value.organizationId(), value.departmentId()))
                .distinct().count();
    }

    private long activeUsers(List<PresenceConnectionSnapshot> values, Instant now) {
        return values.stream().filter(value -> active(value.lastActivityAt(), now))
                .map(PresenceConnectionSnapshot::userId).distinct().count();
    }

    private boolean active(Instant value, Instant now) { return !value.isBefore(now.minus(activeWindow)); }

    private record ContextKey(Long userId, Long organizationId, Long departmentId) {}
    private record ScopeKey(Long organizationId, Long departmentId) {}
    private record DepartmentKey(Long organizationId, Long departmentId) {}
}
