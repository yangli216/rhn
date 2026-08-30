package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.healthcore.api.AllergyDirectory;
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
class MedicationRequestService implements MedicationRequestDirectory {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final MedicationRequestRepository repository;
    private final PrescriptionRepository prescriptionRepository;
    private final EncounterDirectory encounterDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final ItemAttributeSnapshotDirectory attributeDirectory;
    private final ItemStandardMappingDirectory mappingDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final AllergyDirectory allergyDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    MedicationRequestService(MedicationRequestRepository repository,
                             PrescriptionRepository prescriptionRepository,
                             EncounterDirectory encounterDirectory,
                             CatalogLifecycleDirectory catalogDirectory,
                             ItemAttributeSnapshotDirectory attributeDirectory,
                             ItemStandardMappingDirectory mappingDirectory,
                             OrganizationDirectory organizationDirectory,
                             AllergyDirectory allergyDirectory,
                             DomainEventPublisher eventPublisher,
                             ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.repository = repository; this.prescriptionRepository = prescriptionRepository;
        this.encounterDirectory = encounterDirectory; this.catalogDirectory = catalogDirectory;
        this.attributeDirectory = attributeDirectory; this.mappingDirectory = mappingDirectory;
        this.organizationDirectory = organizationDirectory; this.allergyDirectory = allergyDirectory;
        this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
    }

    @Transactional
    MedicationRequestResponse create(Long encounterId, CreateMedicationRequest input) {
        var encounter = encounterDirectory.requireActiveForOrdering(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        Long tenantId = TenantContext.requireTenantId();
        LocalDate businessDate = input.businessDate() == null ? LocalDate.now() : input.businessDate();
        if (input.medicationId() == null && input.catalogItemId() == null) {
            throw badRequest("MEDICATION_REQUEST_TARGET_REQUIRED", "必须选择通用药品，或选择可推导通用药品的具体产品");
        }

        Prescription prescription = input.prescriptionId() == null ? null
                : prescriptionRepository.findByIdAndTenantId(input.prescriptionId(), tenantId)
                .filter(value -> value.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
        if (prescription != null && !"DRAFT".equals(prescription.status())) {
            throw conflict("PRESCRIPTION_NOT_EDITABLE", "只有草稿处方可以继续添加药品");
        }
        Long performerOrganizationId = prescription == null
                ? input.performerOrganizationId() == null ? encounter.organizationId() : input.performerOrganizationId()
                : prescription.performerOrganizationId();
        Long performerDepartmentId = prescription == null
                ? input.performerDepartmentId() == null ? encounter.departmentId() : input.performerDepartmentId()
                : prescription.performerDepartmentId();
        if (prescription != null && ((input.performerOrganizationId() != null
                && !input.performerOrganizationId().equals(performerOrganizationId))
                || (input.performerDepartmentId() != null
                && !input.performerDepartmentId().equals(performerDepartmentId)))) {
            throw badRequest("MEDICATION_REQUEST_PRESCRIPTION_SCOPE_INVALID", "处方内药品必须使用处方头的执行机构和科室");
        }
        if (context.hasWorkContext() && (!context.canAccessOrganization(performerOrganizationId)
                || !context.canAccessDepartment(performerDepartmentId))) {
            throw badRequest("MEDICATION_REQUEST_PERFORMER_CONTEXT_INVALID", "执行机构或科室不在当前可访问范围内");
        }
        organizationDirectory.requireDepartment(tenantId, performerOrganizationId, performerDepartmentId);

        String priceType = clean(input.priceType()) == null ? "SALE" : clean(input.priceType()).toUpperCase();
        boolean productSelected = input.catalogItemId() != null;
        boolean pricingRequired = input.pricingRequired() == null
                ? productSelected && !input.selfProvided() : input.pricingRequired();
        if (!productSelected && pricingRequired) {
            throw conflict("GENERIC_MEDICATION_NOT_PRICEABLE", "仅按通用名开立时尚未确定产品，不能生成价格预览");
        }

        CatalogLifecycleDirectory.CatalogItemSnapshot item = null;
        CatalogLifecycleDirectory.PackageSnapshot itemPackage = null;
        CatalogLifecycleDirectory.MedicationSnapshot medication;
        com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView adoption = null;
        com.rhn.platform.masterdata.api.MasterDataViews.PriceView resolvedPrice = null;

        if (productSelected) {
            var catalog = catalogDirectory.resolve(tenantId, input.catalogItemId(), performerOrganizationId,
                    input.packageId(), priceType, businessDate);
            item = catalog.item(); itemPackage = catalog.itemPackage(); medication = catalog.medication();
            if (!"MED_PRODUCT".equals(item.itemType()) || medication == null) {
                throw badRequest("MEDICATION_REQUEST_ITEM_TYPE_INVALID", "药品请求只能选择药品产品");
            }
            if (input.medicationId() != null && !input.medicationId().equals(medication.id())) {
                throw badRequest("MEDICATION_REQUEST_PRODUCT_MISMATCH", "所选药品产品不属于当前通用药品");
            }
            requireEffective(item.status(), item.validFrom(), item.validTo(), businessDate,
                    "CATALOG_ITEM_NOT_EFFECTIVE", "药品产品在业务日期不可用");
            if (!item.orderable()) throw conflict("CATALOG_ITEM_NOT_ORDERABLE", "药品产品未开放开立能力");
            adoption = catalog.adoption();
            if (adoption == null) throw conflict("ORGANIZATION_CATALOG_NOT_ADOPTED", "当前机构尚未采用该药品产品");
            if (!adoption.orderable()) throw conflict("ORGANIZATION_CATALOG_NOT_ORDERABLE", "当前机构未开放该药品的开立能力");
            if (!input.selfProvided() && !adoption.dispensable()) {
                throw conflict("ORGANIZATION_CATALOG_NOT_DISPENSABLE", "当前机构未开放该药品的发药能力");
            }
            if (itemPackage != null) requireEffective(itemPackage.status(), itemPackage.validFrom(),
                    itemPackage.validTo(), businessDate, "ITEM_PACKAGE_NOT_EFFECTIVE", "所选药品包装在业务日期不可用");
            resolvedPrice = pricingRequired ? catalog.price() : null;
            if (pricingRequired) {
                if (!item.chargeable() || !adoption.chargeable()) {
                    throw conflict("CATALOG_ITEM_NOT_CHARGEABLE", "药品产品或机构目录未开放收费能力");
                }
                if (resolvedPrice == null) throw conflict("CATALOG_PRICE_NOT_CONFIGURED", "业务日期内未配置可用的药品价格");
            }
        } else {
            if (input.packageId() != null) {
                throw badRequest("GENERIC_MEDICATION_PACKAGE_INVALID", "仅按通用名开立时不能提前选择产品包装");
            }
            medication = catalogDirectory.requireMedication(tenantId, input.medicationId());
        }
        if (!"ACTIVE".equals(medication.status())) throw conflict("MEDICATION_NOT_ACTIVE", "通用药品知识当前不可用");

        String baseUnit = productSelected ? clean(item.unitCode()) : clean(medication.preparationUnit());
        if (baseUnit == null) throw conflict("MEDICATION_BASE_UNIT_MISSING", "药品尚未配置可用于申请数量的基本单位");
        String expectedUnit = itemPackage == null ? baseUnit : itemPackage.unitCode();
        String quantityUnit = clean(input.quantityUnit()) == null ? expectedUnit : clean(input.quantityUnit());
        if (!expectedUnit.equals(quantityUnit)) {
            throw badRequest("MEDICATION_REQUEST_QUANTITY_UNIT_INVALID", "申请数量单位必须与当前通用药品或产品包装一致");
        }
        BigDecimal packageFactor = itemPackage == null ? BigDecimal.ONE : itemPackage.quantityFactor();
        BigDecimal baseQuantity = input.quantity().multiply(packageFactor);
        BigDecimal doseValue = input.doseValue() == null ? medication.defaultDose() : input.doseValue();
        String doseUnit = clean(input.doseUnit()) == null ? medication.defaultDoseUnit() : clean(input.doseUnit());
        requirePair(doseValue, doseUnit, "MEDICATION_REQUEST_DOSE_INVALID", "单次剂量与剂量单位必须同时填写");
        requirePair(input.durationValue(), clean(input.durationUnit()), "MEDICATION_REQUEST_DURATION_INVALID",
                "疗程时长与时长单位必须同时填写");
        String route = clean(input.routeCode()) == null ? medication.defaultRoute() : clean(input.routeCode());
        String frequency = clean(input.frequencyCode()) == null ? medication.defaultFrequency() : clean(input.frequencyCode());
        if (prescription != null) {
            requirePrescriptionDirections(doseValue, doseUnit, route, frequency, input.medicationInstruction());
            requirePrescriptionCategory(prescription.categoryCode(), medication.medicationType());
        }
        MedicationRequest parentRequest = requireAdministrationParent(input.parentRequestId(), tenantId,
                encounterId, prescription, route, frequency, input.durationValue());
        var drugAllergies = allergyDirectory.activeForResident(encounter.residentId()).stream()
                .filter(com.rhn.healthcore.api.AllergyDirectory.AllergySnapshot::isDrugAllergy).toList();
        if (!drugAllergies.isEmpty() && !Boolean.TRUE.equals(input.allergyReviewConfirmed())) {
            throw conflict("MEDICATION_ALLERGY_REVIEW_REQUIRED", "患者存在有效药物过敏记录，请核对后再加入处方");
        }
        var matchedAllergies = drugAllergies.stream().filter(allergy -> allergy.substanceCode() != null
                && allergy.substanceCode().equalsIgnoreCase(medication.code())).toList();
        if (!matchedAllergies.isEmpty() && clean(input.allergyOverrideReason()) == null) {
            throw conflict("MEDICATION_ALLERGY_MATCH", "所选药品命中患者过敏原，继续开立必须填写临床理由");
        }
        BigDecimal priceQuantity = resolvedPrice == null ? null
                : resolvedPrice.packageId() == null ? baseQuantity : input.quantity();
        BigDecimal totalAmount = resolvedPrice == null ? null : resolvedPrice.price().multiply(priceQuantity);

        var contexts = new ItemAttributeSnapshotDirectory.AttributeContexts(
                new ItemAttributeSnapshotDirectory.AttributeScope(encounter.organizationId(), encounter.departmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(performerOrganizationId, performerDepartmentId),
                new ItemAttributeSnapshotDirectory.AttributeScope(performerOrganizationId, performerDepartmentId), null);
        var attributes = attributeDirectory.resolveSnapshot("MEDICATION", medication.id(), businessDate, contexts);
        var mappings = mappingDirectory.resolve(tenantId, "MEDICATION", medication.id(), null, businessDate);
        String itemCode = item == null ? medication.code() : item.code();
        String itemName = item == null ? medication.name() : item.name();

        MedicationRequest value = repository.saveAndFlush(new MedicationRequest(tenantId, encounter.residentId(),
                encounter.id(), nextRequestNo(), prescription == null ? null : prescription.id(),
                parentRequest == null ? null : parentRequest.id(),
                prescription == null ? "ACTIVE" : "DRAFT", item == null ? null : item.id(), input.packageId(),
                performerOrganizationId, performerDepartmentId, businessDate, context.subjectId(), clean(input.reason()),
                itemCode, itemName, quantityUnit, adoption == null ? null : adoption.localCode(),
                adoption == null ? null : adoption.localName(), adoption == null ? null : adoption.id(),
                adoption == null ? null : adoption.revision(), resolvedPrice == null ? null : resolvedPrice.id(),
                resolvedPrice == null ? null : resolvedPrice.revision(),
                resolvedPrice == null ? null : resolvedPrice.sdPriceType(),
                resolvedPrice == null ? null : resolvedPrice.price(), totalAmount,
                resolvedPrice == null ? null : resolvedPrice.currencyCode(),
                jsonCodec.write(attributes.jsonItemAttrSnapshot()), attributes.hashItemAttrSnapshot(),
                attributes.resolvedAt(), jsonCodec.write(mappings), medication.id(), doseValue, doseUnit, route, frequency,
                input.durationValue(), clean(input.durationUnit()), input.quantity(), baseQuantity, baseUnit, packageFactor,
                itemPackage == null ? null : itemPackage.unitName(), itemPackage == null ? null : itemPackage.packageSpec(),
                priceQuantity, input.substitutionAllowed(), input.selfProvided(), clean(input.medicationInstruction()),
                medication.code(), medication.name(), medication.medicationType(), medication.doseForm(),
                medication.preparationSpec(), medication.preparationUnit(), medication.skinTestRequired(),
                medication.antimicrobial(), medication.antimicrobialLevel(), jsonCodec.write(medication)));
        Map<String, Object> eventDetails = new LinkedHashMap<>();
        eventDetails.put("medicationId", value.medicationId());
        if (value.catalogItemId() != null) eventDetails.put("catalogItemId", value.catalogItemId());
        if (value.requestGroupId() != null) eventDetails.put("prescriptionId", value.requestGroupId());
        if (value.parentRequestId() != null) eventDetails.put("parentRequestId", value.parentRequestId());
        eventDetails.put("medicationCode", value.medicationCodeSnapshot());
        eventDetails.put("medicationName", value.medicationNameSnapshot());
        eventDetails.put("quantity", value.quantity()); eventDetails.put("quantityUnit", value.quantityUnit());
        eventDetails.put("baseQuantity", value.baseQuantity()); eventDetails.put("baseUnit", value.baseUnit());
        eventDetails.put("allergyReviewConfirmed", Boolean.TRUE.equals(input.allergyReviewConfirmed()));
        eventDetails.put("activeDrugAllergyCount", drugAllergies.size());
        eventDetails.put("matchedAllergyCount", matchedAllergies.size());
        if (clean(input.allergyOverrideReason()) != null) {
            eventDetails.put("allergyOverrideReason", clean(input.allergyOverrideReason()));
        }
        publish(value, prescription == null ? "MEDICATION_REQUEST_AUTHORED" : "MEDICATION_REQUEST_DRAFTED",
                prescription == null ? "开立药品" : "处方草稿添加药品", eventDetails);
        return response(value);
    }

    @Transactional(readOnly = true)
    List<MedicationRequestResponse> list(Long encounterId) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        return repository.findByTenantIdAndEncounterIdOrderByAuthoredAtDesc(encounter.tenantId(), encounterId)
                .stream().map(this::response).toList();
    }

    @Transactional
    MedicationRequestResponse cancel(Long encounterId, Long requestId, CancelServiceRequest input) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        ExecutionContext context = contextProvider.requireCurrent();
        MedicationRequest value = repository.findByIdAndTenantId(requestId, encounter.tenantId())
                .filter(request -> request.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("MEDICATION_REQUEST_NOT_FOUND", "未找到药品请求"));
        value.cancel(input.expectedRevision(), input.reason().trim(), context.subjectId());
        repository.flush();
        publish(value, "MEDICATION_REQUEST_CANCELLED", "撤销药品", Map.of(
                "medicationId", value.medicationId(), "reason", input.reason().trim()));
        return response(value);
    }

    List<MedicationRequest> prescriptionRequests(Long tenantId, Long prescriptionId) {
        return repository.findByTenantIdAndRequestGroupIdOrderByAuthoredAt(tenantId, prescriptionId);
    }

    @Override
    @Transactional(readOnly = true)
    public MedicationRequestSnapshot requireForPharmacy(Long requestId) {
        ExecutionContext context = contextProvider.requireCurrent();
        MedicationRequest value = repository.findByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_REQUEST_NOT_FOUND", "未找到药品请求"));
        requirePharmacyOrganizationAccess(context, value.performerOrganizationId());
        return pharmacySnapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public List<MedicationRequestSnapshot> activeForPharmacy(Long organizationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        requirePharmacyOrganizationAccess(context, organizationId);
        return repository.findByTenantIdAndPerformerOrganizationIdAndStatusOrderByAuthoredAt(
                context.tenantId(), organizationId, "ACTIVE").stream()
                .filter(value -> !value.selfProvided())
                .map(this::pharmacySnapshot).toList();
    }

    private MedicationRequestSnapshot pharmacySnapshot(MedicationRequest value) {
        return new MedicationRequestSnapshot(value.id(), value.revision(), value.tenantId(), value.residentId(),
                value.encounterId(), value.requestGroupId(), value.requestNo(), value.status(), value.catalogItemId(),
                value.medicationId(), value.packageId(), value.performerOrganizationId(),
                value.performerDepartmentId(), value.businessDate(), value.authoredAt(), value.authoredBy(),
                value.itemCodeSnapshot(), value.itemNameSnapshot(), value.localCodeSnapshot(),
                value.localNameSnapshot(), value.medicationCodeSnapshot(), value.medicationNameSnapshot(),
                value.medicationTypeSnapshot(), value.quantity(), value.quantityUnit(), value.baseQuantity(),
                value.baseUnit(), value.packageFactorSnapshot(), value.substitutionAllowed(), value.selfProvided(),
                value.priceId(), value.priceRevision(), value.priceType(), value.unitPrice(),
                value.priceQuantitySnapshot(), value.totalAmount(), value.currencyCode(),
                jsonCodec.readTree(value.medicationSnapshot()), jsonCodec.readTree(value.itemAttributeSnapshot()),
                value.itemAttributeHash(), value.itemAttributeResolvedAt(),
                jsonCodec.readTree(value.standardMappingSnapshot()));
    }

    private void requirePharmacyOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (context.hasWorkContext() && !context.canAccessOrganization(organizationId)) {
            throw badRequest("MEDICATION_REQUEST_PHARMACY_SCOPE_INVALID", "药品请求不在当前机构可访问范围内");
        }
    }

    MedicationRequestResponse response(MedicationRequest value) {
        return new MedicationRequestResponse(value.id(), value.revision(), value.residentId(), value.encounterId(),
                value.requestNo(), value.status(), value.requestGroupId(), value.parentRequestId(),
                value.catalogItemId(), value.medicationId(),
                value.packageId(), value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                value.localCodeSnapshot(), value.localNameSnapshot(), value.adoptionId(), value.adoptionRevision(),
                value.priceId(), value.priceRevision(), value.priceType(), value.unitPrice(), value.priceQuantitySnapshot(),
                value.totalAmount(), value.currencyCode(), value.medicationCodeSnapshot(), value.medicationNameSnapshot(),
                value.medicationTypeSnapshot(), value.doseFormSnapshot(), value.preparationSpecSnapshot(),
                value.preparationUnitSnapshot(), value.skinTestRequiredSnapshot(), value.antimicrobialSnapshot(),
                value.antimicrobialLevelSnapshot(), value.doseValue(), value.doseUnit(), value.routeCode(),
                value.frequencyCode(), value.durationValue(), value.durationUnit(),
                value.quantity(), value.quantityUnit(),
                value.baseQuantity(), value.baseUnit(), value.packageFactorSnapshot(), value.packageUnitNameSnapshot(),
                value.packageSpecSnapshot(), value.substitutionAllowed(), value.selfProvided(), value.medicationInstruction(),
                jsonCodec.readTree(value.medicationSnapshot()), jsonCodec.readTree(value.itemAttributeSnapshot()),
                value.itemAttributeHash(), value.itemAttributeResolvedAt(), jsonCodec.readTree(value.standardMappingSnapshot()),
                value.cancelledAt(), value.cancelledBy(), value.cancelReason());
    }

    private void requireEffective(String status, LocalDate from, LocalDate to, LocalDate date, String code, String message) {
        if (!"ACTIVE".equals(status) || from.isAfter(date) || (to != null && to.isBefore(date))) throw conflict(code, message);
    }

    private void requirePair(BigDecimal value, String unit, String code, String message) {
        if ((value == null) != (unit == null)) throw badRequest(code, message);
    }

    private void requirePrescriptionDirections(BigDecimal doseValue, String doseUnit, String route,
                                               String frequency, String instruction) {
        if (doseValue == null || doseUnit == null) {
            throw badRequest("PRESCRIPTION_DOSE_REQUIRED", "处方药品必须填写单次剂量和剂量单位");
        }
        if (route == null) throw badRequest("PRESCRIPTION_ROUTE_REQUIRED", "处方药品必须填写给药途径");
        if (frequency == null) throw badRequest("PRESCRIPTION_FREQUENCY_REQUIRED", "处方药品必须填写用药频次");
        if (clean(instruction) == null) throw badRequest("PRESCRIPTION_INSTRUCTION_REQUIRED", "处方药品必须填写用药嘱托");
    }

    private void requirePrescriptionCategory(String categoryCode, String medicationType) {
        if (categoryCode == null || "OUTPATIENT".equals(categoryCode)) return;
        if (!categoryCode.equals(medicationType)) {
            throw badRequest("PRESCRIPTION_MEDICATION_TYPE_MISMATCH",
                    "药品类型与当前自动分方的处方类型不一致");
        }
    }

    private boolean isInfusionRoute(String route) {
        if (route == null) return false;
        String normalized = route.trim().toUpperCase();
        return normalized.equals("IV") || normalized.equals("IVGTT") || normalized.equals("IV_DRIP")
                || normalized.equals("INTRAVENOUS") || normalized.contains("输液") || normalized.contains("静滴");
    }

    private MedicationRequest requireAdministrationParent(Long parentRequestId, Long tenantId, Long encounterId,
                                                          Prescription prescription, String route, String frequency,
                                                          BigDecimal durationValue) {
        if (parentRequestId == null) return null;
        if (prescription == null || !isInfusionRoute(route)) {
            throw badRequest("MEDICATION_PARENT_REQUEST_INVALID", "只有处方内输液医嘱可以引用组内父医嘱");
        }
        MedicationRequest parent = repository.findByIdAndTenantId(parentRequestId, tenantId)
                .filter(value -> value.encounterId().equals(encounterId)
                        && prescription.id().equals(value.requestGroupId())
                        && !"CANCELLED".equals(value.status()))
                .orElseThrow(() -> badRequest("MEDICATION_PARENT_REQUEST_INVALID", "输液父医嘱不属于当前处方"));
        if (!isInfusionRoute(parent.routeCode()) || !clean(parent.routeCode()).equalsIgnoreCase(clean(route))
                || !java.util.Objects.equals(clean(parent.frequencyCode()), clean(frequency))
                || !java.util.Objects.equals(parent.durationValue(), durationValue)) {
            throw badRequest("MEDICATION_PARENT_REQUEST_USAGE_MISMATCH", "同组输液医嘱的途径、频次和疗程必须一致");
        }
        if (parent.parentRequestId() == null) return parent;
        return repository.findByIdAndTenantId(parent.parentRequestId(), tenantId)
                .filter(value -> prescription.id().equals(value.requestGroupId()))
                .orElseThrow(() -> badRequest("MEDICATION_PARENT_REQUEST_INVALID", "输液根医嘱不存在"));
    }

    private void publish(MedicationRequest value, String type, String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details);
        payload.put("requestNo", value.requestNo()); payload.put("summary", summary);
        eventPublisher.publish(value.tenantId(), value.performerOrganizationId(), type, 1,
                "MedicationRequest", value.id(), value.revision(), value.residentId(), Instant.now(), payload);
    }

    private String nextRequestNo() {
        return "MR" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
