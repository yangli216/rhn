package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ServiceRequestService implements ServiceRequestDirectory {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final ServiceRequestRepository repository;
    private final EncounterDirectory encounterDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final ItemAttributeSnapshotDirectory attributeDirectory;
    private final ItemStandardMappingDirectory mappingDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    ServiceRequestService(ServiceRequestRepository repository, EncounterDirectory encounterDirectory,
                          CatalogLifecycleDirectory catalogDirectory,
                          ItemAttributeSnapshotDirectory attributeDirectory,
                          ItemStandardMappingDirectory mappingDirectory,
                          OrganizationDirectory organizationDirectory,
                          DomainEventPublisher eventPublisher,
                          ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.repository = repository;
        this.encounterDirectory = encounterDirectory;
        this.catalogDirectory = catalogDirectory;
        this.attributeDirectory = attributeDirectory;
        this.mappingDirectory = mappingDirectory;
        this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    ServiceRequestResponse create(Long encounterId, CreateServiceRequest input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        LocalDate businessDate = input.businessDate() == null ? LocalDate.now() : input.businessDate();
        Long performerOrganizationId = input.performerOrganizationId() == null
                ? encounter.organizationId() : input.performerOrganizationId();
        Long performerDepartmentId = input.performerDepartmentId() == null
                ? encounter.departmentId() : input.performerDepartmentId();
        if (context.hasWorkContext() && (!context.canAccessOrganization(performerOrganizationId)
                || !context.canAccessDepartment(performerDepartmentId))) {
            throw badRequest("SERVICE_REQUEST_PERFORMER_CONTEXT_INVALID", "执行机构或科室不在当前可访问范围内");
        }
        organizationDirectory.requireDepartment(tenantId, performerOrganizationId, performerDepartmentId);
        String priceType = clean(input.priceType()) == null ? "SALE" : clean(input.priceType()).toUpperCase();
        boolean pricingRequired = input.pricingRequired() == null || input.pricingRequired();

        if (input.packageId() != null) {
            throw badRequest("SERVICE_REQUEST_PACKAGE_INVALID", "诊疗项目开立不使用药品包装");
        }

        var catalog = catalogDirectory.resolve(tenantId, input.catalogItemId(), performerOrganizationId,
                input.packageId(), priceType, businessDate);
        var item = catalog.item();
        if (!"SERVICE".equals(item.itemType())) {
            throw badRequest("SERVICE_REQUEST_ITEM_TYPE_INVALID", "门诊诊疗请求只能选择诊疗项目");
        }
        if (!"ACTIVE".equals(item.status()) || item.validFrom().isAfter(businessDate)
                || (item.validTo() != null && item.validTo().isBefore(businessDate))) {
            throw conflict("CATALOG_ITEM_NOT_EFFECTIVE", "目录项目在业务日期不可用");
        }
        if (!item.orderable()) {
            throw conflict("CATALOG_ITEM_NOT_ORDERABLE", "目录项目未开放开立能力");
        }
        var adoption = catalog.adoption();
        if (adoption == null) {
            throw conflict("ORGANIZATION_CATALOG_NOT_ADOPTED", "当前机构在业务日期尚未采用该项目");
        }
        if (!adoption.orderable()) {
            throw conflict("ORGANIZATION_CATALOG_NOT_ORDERABLE", "当前机构未开放该项目的开立能力");
        }
        String unitCode = clean(input.unitCode()) == null ? item.unitCode() : clean(input.unitCode());
        if (unitCode == null || !unitCode.equals(item.unitCode())) {
            throw badRequest("SERVICE_REQUEST_UNIT_INVALID", "申请单位必须与目录项目单位一致");
        }

        var price = catalog.price();
        if (pricingRequired) {
            if (!item.chargeable() || !adoption.chargeable()) {
                throw conflict("CATALOG_ITEM_NOT_CHARGEABLE", "目录项目或机构目录未开放收费能力");
            }
            if (price == null) {
                throw conflict("CATALOG_PRICE_NOT_CONFIGURED", "业务日期内未配置可用的机构价格");
            }
        }
        BigDecimal totalAmount = price == null ? null : price.price().multiply(input.quantity());

        var contexts = new ItemAttributeSnapshotDirectory.AttributeContexts(
                new ItemAttributeSnapshotDirectory.AttributeScope(encounter.organizationId(), encounter.departmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(performerOrganizationId, performerDepartmentId),
                null, null);
        var attributes = attributeDirectory.resolveSnapshot("CATALOG_ITEM", input.catalogItemId(),
                businessDate, contexts);
        var mappings = mappingDirectory.resolve(tenantId, "CATALOG_ITEM", input.catalogItemId(),
                "INSURANCE", businessDate);

        ServiceRequest value = repository.saveAndFlush(new ServiceRequest(tenantId, encounter.residentId(),
                encounter.id(), nextRequestNo(), input.catalogItemId(), input.packageId(), performerOrganizationId,
                performerDepartmentId, businessDate, context.subjectId(), clean(input.reason()), item.code(),
                item.name(), unitCode, adoption.localCode(), adoption.localName(), adoption.id(), adoption.revision(),
                price == null ? null : price.id(), price == null ? null : price.revision(),
                price == null ? null : price.sdPriceType(), price == null ? null : price.price(), totalAmount,
                price == null ? null : price.currencyCode(), jsonCodec.write(attributes.jsonItemAttrSnapshot()),
                attributes.hashItemAttrSnapshot(), attributes.resolvedAt(), jsonCodec.write(mappings),
                item.serviceType(), item.specimenType(), item.examinationType(),
                input.quantity(), clean(input.clinicalDescription())));
        publish(value, "SERVICE_REQUEST_AUTHORED", "开立诊疗项目", Map.of(
                "catalogItemId", value.catalogItemId(), "itemCode", value.itemCodeSnapshot(),
                "itemName", value.itemNameSnapshot(), "quantity", value.quantity(),
                "unitCode", value.unitCodeSnapshot()));
        return response(value);
    }

    @Transactional(readOnly = true)
    List<ServiceRequestResponse> list(Long encounterId) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        return repository.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(encounter.tenantId(), encounterId)
                .stream().map(this::response).toList();
    }

    @Transactional
    ServiceRequestResponse cancel(Long encounterId, Long requestId, CancelServiceRequest input) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByIdAndTenantId(requestId, encounter.tenantId())
                .filter(request -> request.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        value.cancel(input.expectedRevision(), input.reason().trim(), context.subjectId());
        repository.flush();
        publish(value, "SERVICE_REQUEST_CANCELLED", "撤销诊疗项目", Map.of(
                "catalogItemId", value.catalogItemId(), "reason", input.reason().trim()));
        return response(value);
    }

    private ServiceRequestResponse response(ServiceRequest value) {
        return new ServiceRequestResponse(value.id(), value.revision(), value.residentId(), value.encounterId(),
                value.requestNo(), value.status(), value.catalogItemId(), value.packageId(),
                value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.itemCodeSnapshot(),
                value.itemNameSnapshot(), value.unitCodeSnapshot(), value.localCodeSnapshot(),
                value.localNameSnapshot(), value.adoptionId(), value.adoptionRevision(), value.priceId(),
                value.priceRevision(), value.priceType(), value.quantity(), value.unitPrice(), value.totalAmount(),
                value.currencyCode(), jsonCodec.readTree(value.itemAttributeSnapshot()), value.itemAttributeHash(),
                value.itemAttributeResolvedAt(), jsonCodec.readTree(value.standardMappingSnapshot()),
                value.serviceTypeSnapshot(), value.specimenTypeSnapshot(), value.examinationTypeSnapshot(),
                value.clinicalDescription(), value.cancelledAt(), value.cancelledBy(), value.cancelReason());
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceRequestSnapshot requireForDiagnosticExchange(Long requestId) {
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        if (!context.canAccessOrganization(value.performerOrganizationId())
                || !context.canAccessDepartment(value.performerDepartmentId())) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "SERVICE_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的诊疗请求");
        }
        return snapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public ServiceRequestSnapshot requireForDiagnosticExchange(String requestNo) {
        ExecutionContext context = contextProvider.requireCurrent();
        ServiceRequest value = repository.findByTenantIdAndRequestNo(context.tenantId(), requestNo)
                .orElseThrow(() -> notFound("SERVICE_REQUEST_NOT_FOUND", "未找到诊疗请求"));
        if (!context.canAccessOrganization(value.performerOrganizationId())
                || !context.canAccessDepartment(value.performerDepartmentId())) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "SERVICE_REQUEST_FORBIDDEN", "无权访问当前工作上下文之外的诊疗请求");
        }
        return snapshot(value);
    }

    private ServiceRequestSnapshot snapshot(ServiceRequest value) {
        return new ServiceRequestSnapshot(value.id(), value.revision(), value.tenantId(), value.residentId(),
                value.encounterId(), value.requestNo(), value.status(), value.serviceTypeSnapshot(),
                value.catalogItemId(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                value.localCodeSnapshot(), value.localNameSnapshot(), value.specimenTypeSnapshot(),
                value.examinationTypeSnapshot(), value.quantity(), value.unitCodeSnapshot(),
                value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.clinicalDescription(),
                value.itemAttributeHash(), value.itemAttributeSnapshot(), value.standardMappingSnapshot());
    }

    private void publish(ServiceRequest value, String type, String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details);
        payload.put("requestNo", value.requestNo());
        payload.put("summary", summary);
        eventPublisher.publish(value.tenantId(), value.performerOrganizationId(), type, 1,
                "ServiceRequest", value.id(), value.revision(), value.residentId(), Instant.now(), payload);
    }

    private String nextRequestNo() {
        return "SR" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
