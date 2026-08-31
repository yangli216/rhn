package com.rhn.workmanagement.announcement;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class AnnouncementService {
    private static final Set<String> SCOPES = Set.of("TENANT", "ORGANIZATION", "DEPARTMENT");
    private static final Set<String> CATEGORIES = Set.of("GENERAL", "POLICY", "MAINTENANCE", "EMERGENCY");
    private static final Set<String> PRIORITIES = Set.of("NORMAL", "IMPORTANT", "URGENT");
    private final SystemAnnouncementRepository announcements;
    private final AnnouncementReadReceiptRepository receipts;
    private final ExecutionContextProvider contextProvider;
    private final ApplicationEventPublisher events;

    public AnnouncementService(SystemAnnouncementRepository announcements,
                               AnnouncementReadReceiptRepository receipts,
                               ExecutionContextProvider contextProvider,
                               ApplicationEventPublisher events) {
        this.announcements = announcements; this.receipts = receipts;
        this.contextProvider = contextProvider; this.events = events;
    }

    @Transactional(readOnly = true)
    public List<AnnouncementView> active() {
        ExecutionContext context = requireReader();
        List<SystemAnnouncement> values = announcements.findActive(context.tenantId(), context.organizationId(),
                context.departmentId(), Instant.now());
        Set<Long> readIds = readIds(context, values);
        return values.stream().map(value -> view(value, readIds.contains(value.id()))).toList();
    }

    @Transactional(readOnly = true)
    public AnnouncementSummary summary() {
        ExecutionContext context = requireReader();
        List<SystemAnnouncement> values = announcements.findActive(context.tenantId(), context.organizationId(),
                context.departmentId(), Instant.now());
        Set<Long> readIds = readIds(context, values);
        long unread = values.stream().filter(value -> !readIds.contains(value.id())).count();
        long important = values.stream().filter(value -> !readIds.contains(value.id())
                && !"NORMAL".equals(value.priority())).count();
        return new AnnouncementSummary(unread, important, values.size());
    }

    @Transactional
    public AnnouncementView markRead(Long id) {
        ExecutionContext context = requireReader();
        SystemAnnouncement value = announcements.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("ANNOUNCEMENT_NOT_FOUND", "未找到系统公告"));
        if (!visibleTo(value, context, Instant.now())) {
            throw forbidden("ANNOUNCEMENT_FORBIDDEN", "当前工作上下文不能访问该公告");
        }
        if (receipts.findByTenantIdAndAnnouncementIdAndUserId(context.tenantId(), id, context.subjectId()).isEmpty()) {
            receipts.save(new AnnouncementReadReceipt(context.tenantId(), id, context.subjectId(), Instant.now()));
        }
        return view(value, true);
    }

    @Transactional(readOnly = true)
    public List<AnnouncementView> managementList(String status) {
        ExecutionContext context = requireManager();
        String normalized = clean(status) == null ? null : upper(status);
        return announcements.findByTenantIdOrderByCreatedAtDesc(context.tenantId()).stream()
                .filter(value -> manageableBy(value, context))
                .filter(value -> normalized == null || normalized.equals(value.status()))
                .map(value -> view(value, false)).toList();
    }

    @Transactional
    public AnnouncementView create(AnnouncementCommands.Draft input) {
        ExecutionContext context = requireManager(); Instant now = Instant.now();
        Scope scope = scope(context, input.scopeType(), input.organizationId(), input.departmentId());
        SystemAnnouncement value = announcements.save(new SystemAnnouncement(context.tenantId(), scope.type(),
                scope.organizationId(), scope.departmentId(), category(input.category()), priority(input.priority()),
                required(input.title(), "ANNOUNCEMENT_TITLE_REQUIRED", "公告标题不能为空"),
                required(input.summary(), "ANNOUNCEMENT_SUMMARY_REQUIRED", "公告摘要不能为空"),
                required(input.content(), "ANNOUNCEMENT_CONTENT_REQUIRED", "公告正文不能为空"),
                input.pinned(), context.subjectId(), now));
        return view(value, false);
    }

    @Transactional
    public AnnouncementView update(Long id, long expectedRevision, AnnouncementCommands.Draft input) {
        ExecutionContext context = requireManager(); SystemAnnouncement value = requireLocked(context, id);
        requireRevision(value, expectedRevision);
        Scope scope = scope(context, input.scopeType(), input.organizationId(), input.departmentId());
        try {
            value.revise(scope.type(), scope.organizationId(), scope.departmentId(), category(input.category()),
                    priority(input.priority()), required(input.title(), "ANNOUNCEMENT_TITLE_REQUIRED", "公告标题不能为空"),
                    required(input.summary(), "ANNOUNCEMENT_SUMMARY_REQUIRED", "公告摘要不能为空"),
                    required(input.content(), "ANNOUNCEMENT_CONTENT_REQUIRED", "公告正文不能为空"), input.pinned(), Instant.now());
        } catch (IllegalStateException error) {
            throw conflict("ANNOUNCEMENT_UPDATE_INVALID", error.getMessage());
        }
        announcements.flush();
        return view(value, false);
    }

    @Transactional
    public AnnouncementView publish(Long id, AnnouncementCommands.Publish input) {
        ExecutionContext context = requireManager(); SystemAnnouncement value = requireLocked(context, id);
        requireRevision(value, input.expectedRevision()); Instant now = Instant.now();
        if (input.expireAt() != null && !input.expireAt().isAfter(input.publishAt() == null ? now : input.publishAt())) {
            throw badRequest("ANNOUNCEMENT_VALIDITY_INVALID", "公告失效时间必须晚于发布时间");
        }
        try {
            boolean immediate = value.schedule(input.publishAt(), input.expireAt(), context.subjectId(), now);
            if (immediate) changed(value, "SYSTEM_ANNOUNCEMENT_PUBLISHED", now);
        } catch (IllegalStateException error) {
            throw conflict("ANNOUNCEMENT_PUBLISH_INVALID", error.getMessage());
        }
        announcements.flush();
        return view(value, false);
    }

    @Transactional
    public AnnouncementView withdraw(Long id, long expectedRevision) {
        ExecutionContext context = requireManager(); SystemAnnouncement value = requireLocked(context, id);
        requireRevision(value, expectedRevision); Instant now = Instant.now();
        try { value.withdraw(context.subjectId(), now); }
        catch (IllegalStateException error) { throw conflict("ANNOUNCEMENT_WITHDRAW_INVALID", error.getMessage()); }
        changed(value, "SYSTEM_ANNOUNCEMENT_WITHDRAWN", now);
        announcements.flush();
        return view(value, false);
    }

    @Scheduled(fixedDelayString = "${rhn.announcement.lifecycle-interval-ms:30000}")
    @Transactional
    public void progressLifecycle() {
        Instant now = Instant.now();
        for (SystemAnnouncement value : announcements
                .findTop100ByStatusAndPublishAtLessThanEqualOrderByPublishAtAsc("SCHEDULED", now)) {
            if (value.activate(now)) changed(value, "SYSTEM_ANNOUNCEMENT_PUBLISHED", now);
        }
        for (SystemAnnouncement value : announcements
                .findTop100ByStatusAndExpireAtLessThanEqualOrderByExpireAtAsc("PUBLISHED", now)) {
            if (value.expire(now)) changed(value, "SYSTEM_ANNOUNCEMENT_EXPIRED", now);
        }
    }

    private Set<Long> readIds(ExecutionContext context, List<SystemAnnouncement> values) {
        if (values.isEmpty()) return Set.of();
        List<Long> ids = values.stream().map(SystemAnnouncement::id).toList();
        Set<Long> result = new HashSet<>();
        receipts.findByTenantIdAndUserIdAndAnnouncementIdIn(context.tenantId(), context.subjectId(), ids)
                .forEach(value -> result.add(value.announcementId()));
        return result;
    }

    private boolean visibleTo(SystemAnnouncement value, ExecutionContext context, Instant now) {
        if (!value.visibleAt(now)) return false;
        return switch (value.scopeType()) {
            case "TENANT" -> true;
            case "ORGANIZATION" -> context.canAccessOrganization(value.organizationId());
            case "DEPARTMENT" -> context.canAccessOrganization(value.organizationId())
                    && context.canAccessDepartment(value.departmentId());
            default -> false;
        };
    }

    private Scope scope(ExecutionContext context, String rawType, Long organizationId, Long departmentId) {
        String type = upper(rawType);
        if (!SCOPES.contains(type)) throw badRequest("ANNOUNCEMENT_SCOPE_INVALID", "公告范围不受支持");
        if ("TENANT".equals(type)) {
            if (!tenantWide(context)) {
                throw forbidden("ANNOUNCEMENT_SCOPE_FORBIDDEN", "当前数据范围无权发布全租户公告");
            }
            return new Scope(type, null, null);
        }
        if (organizationId == null || !context.canAccessOrganization(organizationId)) {
            throw forbidden("ANNOUNCEMENT_SCOPE_FORBIDDEN", "无权向所选机构发布公告");
        }
        if ("ORGANIZATION".equals(type)) return new Scope(type, organizationId, null);
        if (departmentId == null || !context.canAccessDepartment(departmentId)) {
            throw forbidden("ANNOUNCEMENT_SCOPE_FORBIDDEN", "无权向所选科室发布公告");
        }
        return new Scope(type, organizationId, departmentId);
    }

    private boolean manageableBy(SystemAnnouncement value, ExecutionContext context) {
        if (tenantWide(context)) return true;
        return switch (value.scopeType()) {
            case "ORGANIZATION" -> context.canAccessOrganization(value.organizationId());
            case "DEPARTMENT" -> context.canAccessOrganization(value.organizationId())
                    && context.canAccessDepartment(value.departmentId());
            default -> false;
        };
    }

    private boolean tenantWide(ExecutionContext context) {
        return context.hasAuthority("ROLE_ADMIN") || "TENANT".equals(context.dataScopeType());
    }

    private SystemAnnouncement requireLocked(ExecutionContext context, Long id) {
        return announcements.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("ANNOUNCEMENT_NOT_FOUND", "未找到系统公告"));
    }

    private void requireRevision(SystemAnnouncement value, long expected) {
        if (value.revision() != expected) throw conflict("ANNOUNCEMENT_REVISION_CONFLICT", "公告已被其他用户更新，请刷新后重试");
    }

    private ExecutionContext requireReader() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext()) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择工作上下文");
        }
        return context;
    }

    private ExecutionContext requireManager() {
        ExecutionContext context = requireReader();
        if (!context.hasAuthority("ANNOUNCEMENT.MANAGE") && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("ANNOUNCEMENT_MANAGE_FORBIDDEN", "无权管理系统公告");
        }
        return context;
    }

    private AnnouncementView view(SystemAnnouncement value, boolean read) {
        return new AnnouncementView(value.id(), value.revision(), value.scopeType(), value.organizationId(),
                value.departmentId(), value.category(), value.priority(), value.title(), value.summary(),
                value.content(), value.pinned(), value.status(), value.publishAt(), value.expireAt(),
                value.createdBy(), value.publishedBy(), value.publishedAt(), value.withdrawnBy(),
                value.withdrawnAt(), value.createdAt(), value.updatedAt(), read);
    }

    private void changed(SystemAnnouncement value, String type, Instant now) {
        events.publishEvent(new AnnouncementChanged(value.id(), value.tenantId(), value.organizationId(),
                value.departmentId(), type, value.priority(), now));
    }

    private String category(String value) {
        String result = upper(value);
        if (!CATEGORIES.contains(result)) throw badRequest("ANNOUNCEMENT_CATEGORY_INVALID", "公告分类不受支持");
        return result;
    }

    private String priority(String value) {
        String result = upper(value);
        if (!PRIORITIES.contains(result)) throw badRequest("ANNOUNCEMENT_PRIORITY_INVALID", "公告优先级不受支持");
        return result;
    }

    private String upper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private record Scope(String type, Long organizationId, Long departmentId) {}
}
