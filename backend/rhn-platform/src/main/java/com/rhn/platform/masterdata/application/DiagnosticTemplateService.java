package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory;
import com.rhn.platform.masterdata.domain.DiagnosticTemplateVersion;
import com.rhn.platform.masterdata.infrastructure.DiagnosticTemplateVersionRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class DiagnosticTemplateService implements DiagnosticTemplateDirectory {
    private final DiagnosticTemplateVersionRepository versions;
    private final ServiceCatalogItemRepository catalogs;
    private final com.rhn.platform.masterdata.infrastructure.UnitDefinitionRepository units;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public DiagnosticTemplateService(DiagnosticTemplateVersionRepository versions, ServiceCatalogItemRepository catalogs,
                                     ExecutionContextProvider contexts, JsonCodec json, com.rhn.platform.masterdata.infrastructure.UnitDefinitionRepository units) {
        this.versions = versions; this.catalogs = catalogs; this.contexts = contexts; this.json = json; this.units = units;
    }
    @Transactional
    public TemplateView publish(Long catalogItemId, PublishCommand input) {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("MASTER_DATA_PERMISSION_REQUIRED", "无权维护机构报告模板");
        if (context.organizationId() == null) throw badRequest("WORK_ORGANIZATION_REQUIRED", "请选择工作机构");
        // A stable existing catalog row serializes first publication as well as subsequent versions.
        var catalog = catalogs.lockDiagnosticCatalog(context.tenantId(), catalogItemId)
                .orElseThrow(() -> notFound("SERVICE_CATALOG_NOT_FOUND", "诊疗项目不存在"));
        if (!Set.of("LABORATORY", "EXAMINATION").contains(catalog.serviceType()))
            throw badRequest("DIAGNOSTIC_TEMPLATE_SERVICE_INVALID", "仅检验和检查项目支持报告模板");
        var previous = versions.findTopByTenantIdAndOrganizationIdAndCatalogItemIdOrderByVersionDesc(
                context.tenantId(), context.organizationId(), catalogItemId).orElse(null);
        int current = previous == null ? 0 : previous.version();
        if (input == null || input.expectedVersion() != current)
            throw conflict("DIAGNOSTIC_TEMPLATE_VERSION_CONFLICT", "模板已更新，请重新读取后发布");
        String basis = Strings.trimToNull(input.publicationBasis());
        if (basis == null || basis.length() > 1000 || input.effectiveFrom() == null)
            throw badRequest("DIAGNOSTIC_TEMPLATE_BASIS_REQUIRED", "请填写机构确认依据和生效日期");
        if (previous != null && input.effectiveFrom().isBefore(previous.effectiveFrom()))
            throw badRequest("DIAGNOSTIC_TEMPLATE_DATE_INVALID", "新版本生效日期不能早于前一版本");
        DiagnosticTemplateValidation.validate(input.content(), catalog.serviceType());
        for (var indicator : input.content().indicators()) {
            if (indicator.unitCode() == null) continue;
            var unit = units.findByTenantIdAndCode(context.tenantId(), indicator.unitCode())
                    .orElseThrow(() -> badRequest("DIAGNOSTIC_TEMPLATE_UNIT_INVALID", "模板单位必须来自当前租户维护的计量单位"));
            if (!"ACTIVE".equals(unit.status())) throw badRequest("DIAGNOSTIC_TEMPLATE_UNIT_INVALID", "模板单位已停用");
        }
        return view(versions.saveAndFlush(new DiagnosticTemplateVersion(context.tenantId(), context.organizationId(),
                catalogItemId, current + 1, catalog.serviceType(), input.effectiveFrom(), basis,
                context.subjectId(), json.write(input.content()))));
    }
    @Transactional(readOnly = true)
    public List<TemplateView> history(Long catalogItemId) {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("MASTER_DATA_PERMISSION_REQUIRED", "无权维护机构报告模板");
        if (context.organizationId() == null) throw badRequest("WORK_ORGANIZATION_REQUIRED", "请选择工作机构");
        return versions.findByTenantIdAndOrganizationIdAndCatalogItemIdOrderByVersionDesc(
                context.tenantId(), context.organizationId(), catalogItemId).stream().map(this::view).toList();
    }
    @Override @Transactional(readOnly = true)
    public Optional<TemplateView> current(Long tenantId, Long organizationId, Long catalogItemId, LocalDate date) {
        return versions.findTopByTenantIdAndOrganizationIdAndCatalogItemIdAndEffectiveFromLessThanEqualOrderByEffectiveFromDescVersionDesc(
                tenantId, organizationId, catalogItemId, date).map(this::view);
    }
    @Override @Transactional(readOnly = true)
    public TemplateView requireVersion(Long tenantId, Long organizationId, Long catalogItemId, Long versionId, LocalDate date) {
        var value = versions.findByIdAndTenantIdAndOrganizationIdAndCatalogItemId(versionId, tenantId, organizationId, catalogItemId)
                .orElseThrow(() -> notFound("DIAGNOSTIC_TEMPLATE_NOT_FOUND", "报告模板版本不存在或不属于当前机构及项目"));
        if (value.effectiveFrom().isAfter(date)) throw conflict("DIAGNOSTIC_TEMPLATE_NOT_EFFECTIVE", "模板在本次业务日期尚未生效");
        return view(value);
    }
    private TemplateView view(DiagnosticTemplateVersion value) {
        return new TemplateView(value.id(), value.organizationId(), value.catalogItemId(), value.version(), value.serviceType(),
                value.effectiveFrom(), value.publicationBasis(), value.publishedBy(), value.publishedAt(),
                json.read(value.content(), TemplateContent.class));
    }
}
