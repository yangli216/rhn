package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.DispenseRouteView;
import com.rhn.pharmacy.domain.DispenseRoute;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseRouteRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DispenseRouteApplicationService {
    private static final Set<String> CARE_SETTINGS = Set.of("OUTPATIENT", "EMERGENCY", "INPATIENT", "HOME_CARE");
    private final DispenseRouteRepository routes;
    private final StockSiteRepository sites;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contextProvider;

    public DispenseRouteApplicationService(DispenseRouteRepository routes, StockSiteRepository sites,
                                           OrganizationDirectory organizations,
                                           ExecutionContextProvider contextProvider) {
        this.routes = routes; this.sites = sites; this.organizations = organizations;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<DispenseRouteView> list(Long organizationId) {
        ExecutionContext context = requireContext(); requireOrganization(context, organizationId);
        return routes.findByTenantIdAndOrganizationIdOrderByCode(context.tenantId(), organizationId)
                .stream().map(this::view).toList();
    }

    @Transactional
    public DispenseRouteView create(RouteCommand input) {
        ExecutionContext context = requireContext(); requireOrganization(context, input.organizationId());
        String code = required(input.code(), "DISPENSE_ROUTE_CODE_REQUIRED", "路由编码不能为空").toUpperCase();
        if (routes.findByTenantIdAndOrganizationIdAndCode(context.tenantId(), input.organizationId(), code).isPresent()) {
            throw conflict("DISPENSE_ROUTE_CODE_DUPLICATE", "当前机构已存在相同路由编码");
        }
        Prepared prepared = prepare(context, input, null);
        DispenseRoute value = routes.saveAndFlush(new DispenseRoute(context.tenantId(), input.organizationId(),
                code, prepared.name(), prepared.careSetting(), input.sourceDepartmentId(), prepared.medicationType(),
                input.targetStockSiteId(), input.active(), input.validFrom(), input.validTo(),
                prepared.description(), context.subjectId()));
        return view(value);
    }

    @Transactional
    public DispenseRouteView update(Long id, long expectedRevision, RouteCommand input) {
        ExecutionContext context = requireContext();
        DispenseRoute value = routes.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_ROUTE_NOT_FOUND", "未找到发药药房路由"));
        requireOrganization(context, value.organizationId());
        if (value.revision() != expectedRevision) {
            throw conflict("DISPENSE_ROUTE_REVISION_CONFLICT", "路由已被其他用户修改，请刷新后重试");
        }
        if (!value.organizationId().equals(input.organizationId())) {
            throw badRequest("DISPENSE_ROUTE_ORGANIZATION_IMMUTABLE", "不能修改路由所属机构");
        }
        String requestedCode = required(input.code(), "DISPENSE_ROUTE_CODE_REQUIRED", "路由编码不能为空")
                .toUpperCase();
        if (!value.code().equals(requestedCode)) {
            throw badRequest("DISPENSE_ROUTE_CODE_IMMUTABLE", "路由创建后不能修改编码");
        }
        Prepared prepared = prepare(context, input, value.id());
        value.update(prepared.name(), prepared.careSetting(), input.sourceDepartmentId(), prepared.medicationType(),
                input.targetStockSiteId(), input.active(), input.validFrom(), input.validTo(),
                prepared.description(), context.subjectId());
        return view(routes.saveAndFlush(value));
    }

    @Transactional(readOnly = true)
    public Optional<ResolvedRoute> resolve(Long tenantId, Long organizationId, Long sourceDepartmentId,
                                           String medicationType, String careSetting, LocalDate businessDate) {
        RouteResolution resolution = resolveDetailed(tenantId, organizationId, sourceDepartmentId,
                medicationType, careSetting, businessDate);
        return resolution.matched() ? Optional.of(resolution.route()) : Optional.empty();
    }

    /**
     * Resolves the authoritative route without silently falling back when a more specific rule points
     * at an unavailable target. Automatic supply generation persists the non-matched outcome so an
     * administrator can repair configuration and resume the same business fact.
     */
    @Transactional(readOnly = true)
    public RouteResolution resolveDetailed(Long tenantId, Long organizationId, Long sourceDepartmentId,
                                           String medicationType, String careSetting, LocalDate businessDate) {
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        String normalizedCareSetting = normalizeCareSetting(careSetting);
        DispenseRoute selected = routes.findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId).stream()
                .filter(value -> value.effective(date)
                        && value.matches(normalizedCareSetting, sourceDepartmentId, medicationType))
                .sorted(Comparator.comparingInt(DispenseRoute::specificity).reversed()
                        .thenComparing(DispenseRoute::code))
                .findFirst().orElse(null);
        if (selected == null) {
            return RouteResolution.notConfigured("未配置当前病区和药品类型的住院发药路由");
        }
        return resolved(tenantId, organizationId, date, selected)
                .map(RouteResolution::matched)
                .orElseGet(() -> RouteResolution.targetUnavailable(
                        "已命中的发药路由目标药房不可用：" + selected.code()));
    }

    private Optional<ResolvedRoute> resolved(Long tenantId, Long organizationId, LocalDate date,
                                             DispenseRoute route) {
        StockSite site = sites.findByIdAndTenantId(route.targetStockSiteId(), tenantId).orElse(null);
        if (site == null || !organizationId.equals(site.organizationId()) || !site.effective(date)
                || !"PHARMACY".equals(site.siteType())
                || !supportsDispenseRouting(site)) {
            return Optional.empty();
        }
        return Optional.of(new ResolvedRoute(route.id(), route.revision(), route.code(), site.id(), site.departmentId()));
    }

    private Prepared prepare(ExecutionContext context, RouteCommand input, Long currentId) {
        String name = required(input.name(), "DISPENSE_ROUTE_NAME_REQUIRED", "路由名称不能为空");
        String careSetting = normalizeCareSetting(input.careSetting());
        String medicationType = clean(input.medicationType());
        String description = clean(input.description());
        if (input.validFrom() == null) throw badRequest("DISPENSE_ROUTE_VALID_FROM_REQUIRED", "生效日期不能为空");
        if (input.validTo() != null && input.validTo().isBefore(input.validFrom())) {
            throw badRequest("DISPENSE_ROUTE_VALIDITY_INVALID", "结束日期不能早于生效日期");
        }
        if (input.sourceDepartmentId() != null) {
            organizations.requireDepartment(context.tenantId(), input.organizationId(), input.sourceDepartmentId());
        }
        StockSite target = sites.findByIdAndTenantId(input.targetStockSiteId(), context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_ROUTE_TARGET_NOT_FOUND", "未找到目标发药药房"));
        if (!input.organizationId().equals(target.organizationId()) || !"PHARMACY".equals(target.siteType())
                || !supportsDispenseRouting(target)) {
            throw badRequest("DISPENSE_ROUTE_TARGET_INVALID", "目标站点必须是当前机构的门诊、住院或综合药房");
        }
        if (!supportsCareSetting(target, careSetting)) {
            throw badRequest("DISPENSE_ROUTE_CARE_SETTING_MISMATCH", "目标药房不支持当前诊疗场景");
        }
        if (!target.active()) throw conflict("DISPENSE_ROUTE_TARGET_INACTIVE", "目标发药药房当前已停用");
        if (input.active()) validateNoOverlap(context.tenantId(), input, careSetting, medicationType, currentId);
        return new Prepared(name, careSetting, medicationType, description);
    }

    private void validateNoOverlap(Long tenantId, RouteCommand input, String careSetting,
                                   String medicationType, Long currentId) {
        boolean overlap = routes.findByTenantIdAndOrganizationIdOrderByCode(tenantId, input.organizationId()).stream()
                .filter(value -> value.active() && !Objects.equals(value.id(), currentId))
                .filter(value -> careSetting.equals(value.careSetting())
                        && Objects.equals(value.sourceDepartmentId(), input.sourceDepartmentId())
                        && Objects.equals(value.medicationType(), medicationType))
                .anyMatch(value -> datesOverlap(value.validFrom(), value.validTo(), input.validFrom(), input.validTo()));
        if (overlap) throw conflict("DISPENSE_ROUTE_RULE_OVERLAP", "相同诊疗场景、开方科室和药品类型已存在生效期重叠的路由");
    }

    private boolean datesOverlap(LocalDate leftFrom, LocalDate leftTo, LocalDate rightFrom, LocalDate rightTo) {
        return (leftTo == null || !leftTo.isBefore(rightFrom))
                && (rightTo == null || !rightTo.isBefore(leftFrom));
    }

    private boolean supportsDispenseRouting(StockSite site) {
        return Set.of("OUTPATIENT", "INPATIENT", "EMERGENCY", "COMMUNITY", "MIXED")
                .contains(site.serviceScope());
    }

    private boolean supportsCareSetting(StockSite site, String careSetting) {
        return "MIXED".equals(site.serviceScope()) || careSetting.equals(site.serviceScope())
                || ("HOME_CARE".equals(careSetting) && "COMMUNITY".equals(site.serviceScope()));
    }

    private String normalizeCareSetting(String value) {
        String result = required(value, "DISPENSE_ROUTE_CARE_SETTING_REQUIRED", "请选择诊疗场景").toUpperCase();
        if (!CARE_SETTINGS.contains(result)) {
            throw badRequest("DISPENSE_ROUTE_CARE_SETTING_INVALID", "诊疗场景不受支持");
        }
        return result;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("DISPENSE_ROUTE_WORK_CONTEXT_REQUIRED", "请先选择工作机构");
        return context;
    }

    private void requireOrganization(ExecutionContext context, Long organizationId) {
        if (!context.canAccessOrganization(organizationId)) {
            throw badRequest("DISPENSE_ROUTE_ORGANIZATION_SCOPE_INVALID", "当前工作上下文不能访问该机构");
        }
        organizations.requireOrganization(context.tenantId(), organizationId);
    }

    private DispenseRouteView view(DispenseRoute value) {
        return new DispenseRouteView(value.id(), value.revision(), value.organizationId(), value.code(), value.name(),
                value.careSetting(), value.sourceDepartmentId(), value.medicationType(),
                value.targetStockSiteId(), value.active(),
                value.validFrom(), value.validTo(), value.description(), value.updatedAt());
    }

    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record RouteCommand(Long organizationId, String code, String name, Long sourceDepartmentId,
                               String medicationType, String careSetting, Long targetStockSiteId, boolean active,
                               LocalDate validFrom, LocalDate validTo, String description) {}
    public record ResolvedRoute(Long routeId, long routeRevision, String routeCode,
                                Long stockSiteId, Long departmentId) {}
    public record RouteResolution(String status, ResolvedRoute route, String errorCode, String errorMessage) {
        static RouteResolution matched(ResolvedRoute route) {
            return new RouteResolution("MATCHED", route, null, null);
        }

        static RouteResolution notConfigured(String message) {
            return new RouteResolution("NOT_CONFIGURED", null, "ROUTE_NOT_CONFIGURED", message);
        }

        static RouteResolution targetUnavailable(String message) {
            return new RouteResolution("TARGET_UNAVAILABLE", null, "ROUTE_TARGET_UNAVAILABLE", message);
        }

        public boolean matched() {
            return "MATCHED".equals(status);
        }
    }
    private record Prepared(String name, String careSetting, String medicationType, String description) {}
}
