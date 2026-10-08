package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory;
import com.rhn.platform.masterdata.api.ItemAttributeSnapshotDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
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
    private final OrderFrequencyDirectory frequencyDirectory;
    private final MedicationRouteDirectory routeDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final AllergyDirectory allergyDirectory;
    private final MedicationTerminologyDirectory terminologyDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final MedicationSemanticDirectory semantics;
    private final OutpatientAllergyVerificationPolicy allergyVerificationPolicy;

    MedicationRequestService(MedicationRequestRepository repository,
                             PrescriptionRepository prescriptionRepository,
                             EncounterDirectory encounterDirectory,
                             CatalogLifecycleDirectory catalogDirectory,
                             ItemAttributeSnapshotDirectory attributeDirectory,
                             ItemStandardMappingDirectory mappingDirectory,
                             OrderFrequencyDirectory frequencyDirectory,
                             MedicationRouteDirectory routeDirectory,
                             OrganizationDirectory organizationDirectory,
                             AllergyDirectory allergyDirectory,
                             MedicationTerminologyDirectory terminologyDirectory,
                             DomainEventPublisher eventPublisher,
                             ExecutionContextProvider contextProvider, JsonCodec jsonCodec,
                             MedicationSemanticDirectory semantics,
                             OutpatientAllergyVerificationPolicy allergyVerificationPolicy) {
        this.semantics = semantics;
        this.allergyVerificationPolicy = allergyVerificationPolicy;
        this.repository = repository; this.prescriptionRepository = prescriptionRepository;
        this.encounterDirectory = encounterDirectory; this.catalogDirectory = catalogDirectory;
        this.attributeDirectory = attributeDirectory; this.mappingDirectory = mappingDirectory;
        this.frequencyDirectory = frequencyDirectory;
        this.routeDirectory = routeDirectory;
        this.organizationDirectory = organizationDirectory; this.allergyDirectory = allergyDirectory;
        this.terminologyDirectory = terminologyDirectory;
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
        Prescription prescription = requireDraftPrescription(input, encounterId, tenantId);
        CreateContext ctx = new CreateContext(encounter, context, tenantId, businessDate, prescription,
                resolveExecutionScope(input, encounter, prescription, context, tenantId));

        CatalogSelection selection = resolveCatalogSelection(ctx, input);
        CatalogLifecycleDirectory.CatalogItemSnapshot item = selection.item();
        CatalogLifecycleDirectory.PackageSnapshot itemPackage = selection.itemPackage();
        CatalogLifecycleDirectory.MedicationSnapshot medication = selection.medication();
        MasterDataViews.OrganizationAdoptionView adoption = selection.adoption();
        MasterDataViews.PriceView resolvedPrice = selection.resolvedPrice();
        UnitSelection units = resolveUnits(input, selection);
        DirectionSelection directions = resolveDirections(ctx, input, selection);
        AllergyAssessment allergies = assessAllergies(ctx, input, medication);

        Long performerOrganizationId = ctx.scope().performerOrganizationId();
        Long performerDepartmentId = ctx.scope().performerDepartmentId();
        String baseUnit = units.baseUnit();
        String quantityUnit = units.quantityUnit();
        BigDecimal packageFactor = units.packageFactor();
        BigDecimal baseQuantity = units.baseQuantity();
        BigDecimal doseValue = directions.doseValue();
        String doseUnit = directions.doseUnit();
        MedicationRouteDirectory.RouteSnapshot routeSnapshot = directions.routeSnapshot();
        String route = directions.route();
        String frequency = directions.frequency();
        OrderFrequencyDirectory.FrequencySnapshot frequencySnapshot = directions.frequencySnapshot();
        MedicationRequest parentRequest = directions.parentRequest();

        BigDecimal priceQuantity = resolvedPrice == null ? null
                : resolvedPrice.packageId() == null ? baseQuantity : input.quantity();
        BigDecimal totalAmount = resolvedPrice == null ? null : resolvedPrice.price().multiply(priceQuantity);

        var contexts = new ItemAttributeSnapshotDirectory.AttributeContexts(
                new ItemAttributeSnapshotDirectory.AttributeScope(encounter.organizationId(), encounter.departmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(ctx.scope().performerOrganizationId(),
                        ctx.scope().performerDepartmentId()),
                new ItemAttributeSnapshotDirectory.AttributeScope(ctx.scope().performerOrganizationId(),
                        ctx.scope().performerDepartmentId()), null);
        var attributes = attributeDirectory.resolveSnapshot("MEDICATION", medication.id(), businessDate, contexts);
        var mappings = mappingDirectory.resolve(tenantId, "MEDICATION", medication.id(), null, businessDate);
        String itemCode = item == null ? medication.code() : item.code();
        String itemName = item == null ? medication.name() : item.name();

        MedicationRequest value = repository.saveAndFlush(new MedicationRequest(tenantId, encounter.residentId(),
                encounter.id(), nextRequestNo(), prescription == null ? null : prescription.id(),
                parentRequest == null ? null : parentRequest.id(),
                prescription == null ? MedicationRequestStatus.ACTIVE : MedicationRequestStatus.DRAFT, item == null ? null : item.id(), input.packageId(),
                performerOrganizationId, performerDepartmentId, businessDate, context.subjectId(), Strings.trimToNull(input.reason()),
                itemCode, itemName, quantityUnit, adoption == null ? null : adoption.localCode(),
                adoption == null ? null : adoption.localName(), adoption == null ? null : adoption.id(),
                adoption == null ? null : adoption.revision(), resolvedPrice == null ? null : resolvedPrice.id(),
                resolvedPrice == null ? null : resolvedPrice.revision(),
                resolvedPrice == null ? null : resolvedPrice.sdPriceType(),
                resolvedPrice == null ? null : resolvedPrice.price(), totalAmount,
                resolvedPrice == null ? null : resolvedPrice.currencyCode(),
                jsonCodec.write(attributes.jsonItemAttrSnapshot()), attributes.hashItemAttrSnapshot(),
                attributes.resolvedAt(), jsonCodec.write(mappings), medication.id(), doseValue, doseUnit,
                routeSnapshot == null ? null : routeSnapshot.id(), route,
                routeSnapshot == null ? null : routeSnapshot.name(),
                routeSnapshot == null ? null : routeSnapshot.executionType(), frequency,
                frequencySnapshot == null ? null : frequencySnapshot.id(),
                frequencySnapshot == null ? null : frequencySnapshot.name(),
                frequencySnapshot == null ? null : jsonCodec.write(frequencySnapshot),
                input.durationValue(), Strings.trimToNull(input.durationUnit()), input.quantity(), baseQuantity, baseUnit, packageFactor,
                itemPackage == null ? null : itemPackage.unitName(), itemPackage == null ? null : itemPackage.packageSpec(),
                item == null ? null : item.manufacturerName(),
                priceQuantity, input.substitutionAllowed(), input.selfProvided(), Strings.trimToNull(input.medicationInstruction()),
                medication.code(), medication.name(), medication.medicationType(), medication.doseForm(),
                medication.preparationSpec(), medication.preparationUnit(), medication.skinTestRequired(),
                Boolean.TRUE.equals(input.skinTestExempt()), Strings.trimToNull(input.skinTestExemptReason()), input.exemptEvidenceEventId(),
                medication.antimicrobial(), medication.antimicrobialLevel(), jsonCodec.write(semantics.freeze(tenantId,
                        medication, item == null ? null : item.id(), routeSnapshot, frequencySnapshot,
                        doseValue, doseUnit, input.durationValue(), Strings.trimToNull(input.durationUnit()), businessDate))));
        publish(value, prescription == null ? "MEDICATION_REQUEST_AUTHORED" : "MEDICATION_REQUEST_DRAFTED",
                prescription == null ? "开立药品" : "处方草稿添加药品",
                authoredEventDetails(value, encounter, allergies, input));
        return response(value);
    }

    private Prescription requireDraftPrescription(CreateMedicationRequest input, Long encounterId, Long tenantId) {
        Prescription prescription = input.prescriptionId() == null ? null
                : prescriptionRepository.findByIdAndTenantId(input.prescriptionId(), tenantId)
                .filter(value -> value.encounterId().equals(encounterId))
                .orElseThrow(() -> notFound("PRESCRIPTION_NOT_FOUND", "未找到当前就诊的处方"));
        if (prescription != null && prescription.status() != PrescriptionStatus.DRAFT) {
            throw conflict("PRESCRIPTION_NOT_EDITABLE", "只有草稿处方可以继续添加药品");
        }
        return prescription;
    }

    /** 推导执行机构/科室：处方内药品强制跟随处方头，无处方时回退登录工作上下文与就诊科室。 */
    private ExecutionScope resolveExecutionScope(CreateMedicationRequest input,
                                                 EncounterDirectory.EncounterSnapshot encounter,
                                                 Prescription prescription,
                                                 ExecutionContext context, Long tenantId) {
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
        return new ExecutionScope(performerOrganizationId, performerDepartmentId);
    }

    /** 按"通用药品开立 / 具体产品开立"两条路径解析目录、机构采用与价格快照。 */
    private CatalogSelection resolveCatalogSelection(CreateContext ctx, CreateMedicationRequest input) {
        Long tenantId = ctx.tenantId();
        LocalDate businessDate = ctx.businessDate();
        Long performerOrganizationId = ctx.scope().performerOrganizationId();
        String priceType = Strings.trimToNull(input.priceType()) == null ? "SALE" : Strings.trimToNull(input.priceType()).toUpperCase();
        boolean productSelected = input.catalogItemId() != null;
        boolean pricingRequired = input.pricingRequired() == null
                ? productSelected && !input.selfProvided() : input.pricingRequired();
        if (!productSelected && pricingRequired) {
            throw conflict("GENERIC_MEDICATION_NOT_PRICEABLE", "仅按通用名开立时尚未确定产品，不能生成价格预览");
        }
        CatalogLifecycleDirectory.CatalogItemSnapshot item = null;
        CatalogLifecycleDirectory.PackageSnapshot itemPackage = null;
        CatalogLifecycleDirectory.MedicationSnapshot medication;
        MasterDataViews.OrganizationAdoptionView adoption = null;
        MasterDataViews.PriceView resolvedPrice = null;

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
        return new CatalogSelection(item, itemPackage, medication, adoption, resolvedPrice, productSelected);
    }

    /** 解析申请数量单位与基本单位，并校验单位口径一致。 */
    private UnitSelection resolveUnits(CreateMedicationRequest input, CatalogSelection selection) {
        CatalogLifecycleDirectory.CatalogItemSnapshot item = selection.item();
        CatalogLifecycleDirectory.PackageSnapshot itemPackage = selection.itemPackage();
        CatalogLifecycleDirectory.MedicationSnapshot medication = selection.medication();
        String baseUnit = selection.productSelected() ? Strings.trimToNull(item.unitCode()) : Strings.trimToNull(medication.preparationUnit());
        if (baseUnit == null) throw conflict("MEDICATION_BASE_UNIT_MISSING", "药品尚未配置可用于申请数量的基本单位");
        String expectedUnit = itemPackage == null ? baseUnit : itemPackage.unitCode();
        String quantityUnit = Strings.trimToNull(input.quantityUnit()) == null ? expectedUnit : Strings.trimToNull(input.quantityUnit());
        boolean unitMatches;
        if (itemPackage != null) {
            unitMatches = expectedUnit.equalsIgnoreCase(quantityUnit)
                    || (itemPackage.unitName() != null && itemPackage.unitName().equalsIgnoreCase(quantityUnit));
        } else {
            unitMatches = expectedUnit.equalsIgnoreCase(quantityUnit)
                    || (Strings.trimToNull(medication.preparationUnit()) != null && Strings.trimToNull(medication.preparationUnit()).equalsIgnoreCase(quantityUnit))
                    || (item != null && Strings.trimToNull(item.unitCode()) != null && Strings.trimToNull(item.unitCode()).equalsIgnoreCase(quantityUnit));
        }
        if (!unitMatches) {
            throw badRequest("MEDICATION_REQUEST_QUANTITY_UNIT_INVALID", "申请数量单位必须与当前通用药品或产品包装一致");
        }
        BigDecimal packageFactor = itemPackage == null ? BigDecimal.ONE : itemPackage.quantityFactor();
        BigDecimal baseQuantity = input.quantity().multiply(packageFactor);
        return new UnitSelection(baseUnit, quantityUnit, packageFactor, baseQuantity);
    }

    /** 解析用法用量（剂量/疗程/途径/频次）并执行处方方向、抗菌药与父医嘱约束校验。 */
    private DirectionSelection resolveDirections(CreateContext ctx, CreateMedicationRequest input,
                                                 CatalogSelection selection) {
        Long tenantId = ctx.tenantId();
        LocalDate businessDate = ctx.businessDate();
        Prescription prescription = ctx.prescription();
        CatalogLifecycleDirectory.MedicationSnapshot medication = selection.medication();
        BigDecimal doseValue = input.doseValue() == null ? medication.defaultDose() : input.doseValue();
        String doseUnit = Strings.trimToNull(input.doseUnit()) == null ? medication.defaultDoseUnit() : Strings.trimToNull(input.doseUnit());
        requirePair(doseValue, doseUnit, "MEDICATION_REQUEST_DOSE_INVALID", "单次剂量与剂量单位必须同时填写");
        requirePair(input.durationValue(), Strings.trimToNull(input.durationUnit()), "MEDICATION_REQUEST_DURATION_INVALID",
                "疗程时长与时长单位必须同时填写");
        String route = Strings.trimToNull(input.routeCode()) == null ? medication.defaultRoute() : Strings.trimToNull(input.routeCode());
        var routeSnapshot = route == null ? null
                : routeDirectory.requireActive(tenantId, route, "OUTPATIENT", businessDate);
        if (routeSnapshot != null) route = routeSnapshot.code();
        String frequency = Strings.trimToNull(input.frequencyCode()) == null ? medication.defaultFrequency() : Strings.trimToNull(input.frequencyCode());
        var frequencySnapshot = frequency == null ? null : frequencyDirectory.requireActive(tenantId, frequency,
                ctx.scope().performerOrganizationId(), ctx.scope().performerDepartmentId(),
                "OUTPATIENT", "MEDICATION", businessDate);
        if (frequencySnapshot != null) frequency = frequencySnapshot.code();
        if (prescription != null) {
            requirePrescriptionDirections(doseValue, doseUnit, route, frequency);
            requirePrescriptionCategory(prescription.categoryCode(), medication.medicationType());
        }
        validateOutpatientAntimicrobial(medication, input.durationValue(), input.durationUnit());
        MedicationRequest parentRequest = requireAdministrationParent(input.parentRequestId(), tenantId,
                ctx.encounter().id(), prescription, routeSnapshot, frequency, input.durationValue());
        return new DirectionSelection(doseValue, doseUnit, routeSnapshot, route, frequency, frequencySnapshot, parentRequest);
    }

    /** 执行门诊过敏状态核对与过敏原命中校验。 */
    private AllergyAssessment assessAllergies(CreateContext ctx, CreateMedicationRequest input,
                                              CatalogLifecycleDirectory.MedicationSnapshot medication) {
        var activeAllergies = allergyDirectory.activeForResident(ctx.encounter().residentId());
        var drugAllergies = activeAllergies.stream()
                .filter(AllergyDirectory.AllergySnapshot::isDrugAllergy).toList();
        boolean drugAllergyStatusRecorded = !drugAllergies.isEmpty() || activeAllergies.stream().anyMatch(allergy ->
                "NO_KNOWN_ALLERGY".equals(allergy.assertionType())
                        || "NO_KNOWN_DRUG_ALLERGY".equals(allergy.assertionType()));
        boolean allergyReviewConfirmed = Boolean.TRUE.equals(input.allergyReviewConfirmed());
        var allergyVerificationMode = allergyVerificationPolicy.resolve(
                ctx.execution(), ctx.scope().performerOrganizationId(), ctx.scope().performerDepartmentId());
        if (!drugAllergyStatusRecorded && !allergyReviewConfirmed
                && allergyVerificationMode.blocksUnverifiedAllergies()) {
            throw conflict("MEDICATION_ALLERGY_STATUS_UNKNOWN", "患者药物过敏状态尚未确认，请核对后再加入处方");
        }
        if (!drugAllergies.isEmpty() && !allergyReviewConfirmed
                && allergyVerificationMode.blocksUnverifiedAllergies()) {
            throw conflict("MEDICATION_ALLERGY_REVIEW_REQUIRED", "患者存在有效药物过敏记录，请核对后再加入处方");
        }
        var matchedAllergies = drugAllergies.stream().filter(allergy ->
                allergy.allergenId() != null
                        ? terminologyDirectory.medicationMatchesAllergen(ctx.tenantId(), medication.id(), allergy.allergenId())
                        : allergy.substanceCode() != null
                        && allergy.substanceCode().equalsIgnoreCase(medication.code())).toList();
        if (!matchedAllergies.isEmpty() && Strings.trimToNull(input.allergyOverrideReason()) == null) {
            throw conflict("MEDICATION_ALLERGY_MATCH", "所选药品命中患者过敏原，继续开立必须填写临床理由");
        }
        return new AllergyAssessment(allergyReviewConfirmed, allergyVerificationMode, drugAllergyStatusRecorded,
                drugAllergies, matchedAllergies);
    }

    private Map<String, Object> authoredEventDetails(MedicationRequest value,
                                                     EncounterDirectory.EncounterSnapshot encounter,
                                                     AllergyAssessment allergies,
                                                     CreateMedicationRequest input) {
        Map<String, Object> eventDetails = new LinkedHashMap<>();
        eventDetails.put("medicationId", value.medicationId());
        if (value.catalogItemId() != null) eventDetails.put("catalogItemId", value.catalogItemId());
        if (value.requestGroupId() != null) eventDetails.put("prescriptionId", value.requestGroupId());
        if (value.parentRequestId() != null) eventDetails.put("parentRequestId", value.parentRequestId());
        eventDetails.put("medicationCode", value.medicationCodeSnapshot());
        eventDetails.put("medicationName", value.medicationNameSnapshot());
        eventDetails.put("quantity", value.quantity()); eventDetails.put("quantityUnit", value.quantityUnit());
        eventDetails.put("baseQuantity", value.baseQuantity()); eventDetails.put("baseUnit", value.baseUnit());
        eventDetails.put("allergyReviewConfirmed", allergies.reviewConfirmed());
        eventDetails.put("allergyVerificationMode", allergies.mode().name());
        eventDetails.put("allergyVerificationWarning", !allergies.reviewConfirmed()
                && (!allergies.drugAllergyStatusRecorded() || !allergies.drugAllergies().isEmpty()));
        eventDetails.put("activeDrugAllergyCount", allergies.drugAllergies().size());
        eventDetails.put("matchedAllergyCount", allergies.matchedAllergies().size());
        if (Strings.trimToNull(input.allergyOverrideReason()) != null) {
            eventDetails.put("allergyOverrideReason", Strings.trimToNull(input.allergyOverrideReason()));
        }
        eventDetails.put("skinTestExempt", value.skinTestExempt());
        if (value.skinTestExemptReason() != null) eventDetails.put("skinTestExemptReason", value.skinTestExemptReason());
        if (value.exemptEvidenceEventId() != null) eventDetails.put("exemptEvidenceEventId", value.exemptEvidenceEventId());
        eventDetails.putAll(financialEventDetails(value, encounter));
        return eventDetails;
    }

    private record CreateContext(EncounterDirectory.EncounterSnapshot encounter, ExecutionContext execution,
                                 Long tenantId, LocalDate businessDate, Prescription prescription,
                                 ExecutionScope scope) {
    }

    private record ExecutionScope(Long performerOrganizationId, Long performerDepartmentId) {
    }

    private record CatalogSelection(CatalogLifecycleDirectory.CatalogItemSnapshot item,
                                    CatalogLifecycleDirectory.PackageSnapshot itemPackage,
                                    CatalogLifecycleDirectory.MedicationSnapshot medication,
                                    MasterDataViews.OrganizationAdoptionView adoption,
                                    MasterDataViews.PriceView resolvedPrice,
                                    boolean productSelected) {
    }

    private record UnitSelection(String baseUnit, String quantityUnit, BigDecimal packageFactor,
                                 BigDecimal baseQuantity) {
    }

    private record DirectionSelection(BigDecimal doseValue, String doseUnit,
                                      MedicationRouteDirectory.RouteSnapshot routeSnapshot, String route,
                                      String frequency, OrderFrequencyDirectory.FrequencySnapshot frequencySnapshot,
                                      MedicationRequest parentRequest) {
    }

    private record AllergyAssessment(boolean reviewConfirmed, OutpatientAllergyVerificationPolicy.Mode mode,
                                     boolean drugAllergyStatusRecorded,
                                     List<AllergyDirectory.AllergySnapshot> drugAllergies,
                                     List<AllergyDirectory.AllergySnapshot> matchedAllergies) {
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
        boolean draft = value.status() == MedicationRequestStatus.DRAFT;
        value.cancel(input.expectedRevision(), input.reason().trim(), context.subjectId());
        repository.flush();
        publishCancellation(value, input.reason().trim(), context.subjectId(), draft, encounter);
        return response(value);
    }

    List<MedicationRequest> prescriptionRequests(Long tenantId, Long prescriptionId) {
        return repository.findByTenantIdAndRequestGroupIdOrderByAuthoredAt(tenantId, prescriptionId);
    }

    void activateFromPrescription(MedicationRequest value, EncounterDirectory.EncounterSnapshot encounter) {
        value.activateFromPrescription();
        publish(value, "MEDICATION_REQUEST_ACTIVATED", "提交处方并激活药品",
                financialEventDetails(value, encounter));
    }

    void cancelFromPrescription(MedicationRequest value, String reason, Long actorId) {
        if (value.status() == MedicationRequestStatus.CANCELLED) return;
        boolean draft = value.status() == MedicationRequestStatus.DRAFT;
        var encounter = encounterDirectory.requireAccessible(value.encounterId());
        value.cancelFromPrescription(reason, actorId);
        publishCancellation(value, reason, actorId, draft, encounter);
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
    @Transactional
    public MedicationRequestSnapshot lockForPharmacyIntake(Long requestId) {
        ExecutionContext context = contextProvider.requireCurrent();
        MedicationRequest value = repository.findLockedByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_REQUEST_NOT_FOUND", "未找到药品请求"));
        requirePharmacyOrganizationAccess(context, value.performerOrganizationId());
        return pharmacySnapshot(value);
    }

    @Override
    @Transactional(readOnly = true)
    public MedicationRequestSnapshot requireForRouting(Long tenantId, Long requestId) {
        return repository.findByIdAndTenantId(requestId, tenantId).map(this::pharmacySnapshot)
                .orElseThrow(() -> notFound("MEDICATION_REQUEST_NOT_FOUND", "未找到药品请求"));
    }

    @Override
    @Transactional(readOnly = true)
    public List<MedicationRequestSnapshot> activeForPharmacy(Long organizationId) {
        ExecutionContext context = contextProvider.requireCurrent();
        requirePharmacyOrganizationAccess(context, organizationId);
        return repository.findByTenantIdAndPerformerOrganizationIdAndStatusOrderByAuthoredAt(
                context.tenantId(), organizationId, MedicationRequestStatus.ACTIVE).stream()
                .filter(value -> !value.selfProvided())
                .map(this::pharmacySnapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<MedicationRequestSnapshot> activeForExecution(Long organizationId, Long departmentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.canAccessOrganization(organizationId) || !context.canAccessDepartment(departmentId)) {
            throw com.rhn.shared.api.BusinessErrors.forbidden(
                    "MEDICATION_REQUEST_EXECUTION_SCOPE_INVALID", "无权读取当前工作上下文之外的药品请求");
        }
        return repository.findActiveForExecution(context.tenantId(), organizationId, departmentId)
                .stream().map(this::pharmacySnapshot).toList();
    }

    private MedicationRequestSnapshot pharmacySnapshot(MedicationRequest value) {
        return new MedicationRequestSnapshot(value.id(), value.revision(), value.tenantId(), value.residentId(),
                value.encounterId(), value.requestGroupId(), value.requestNo(), value.status().name(), value.catalogItemId(),
                value.medicationId(), value.packageId(), value.performerOrganizationId(),
                value.performerDepartmentId(), value.businessDate(), value.authoredAt(), value.authoredBy(),
                value.itemCodeSnapshot(), value.itemNameSnapshot(), value.localCodeSnapshot(),
                value.localNameSnapshot(), value.medicationCodeSnapshot(), value.medicationNameSnapshot(),
                value.medicationTypeSnapshot(), value.quantity(), value.quantityUnit(), value.baseQuantity(),
                value.baseUnit(), value.packageFactorSnapshot(), value.substitutionAllowed(), value.selfProvided(),
                value.parentRequestId(), value.doseValue(), value.doseUnit(), value.routeId(), value.routeCode(),
                value.routeNameSnapshot(), value.routeExecutionTypeSnapshot(),
                value.frequencyCode(), value.frequencyId(), value.frequencyNameSnapshot(),
                value.frequencyRuleSnapshot() == null ? null : jsonCodec.readTree(value.frequencyRuleSnapshot()),
                value.durationValue(), value.durationUnit(), value.skinTestRequiredSnapshot(),
                value.skinTestExempt(), value.skinTestExemptReason(), value.exemptEvidenceEventId(),
                value.priceId(), value.priceRevision(), value.priceType(), value.unitPrice(),
                value.priceQuantitySnapshot(), value.totalAmount(), value.currencyCode(),
                jsonCodec.readTree(value.medicationSnapshot()), jsonCodec.readTree(value.itemAttributeSnapshot()),
                value.itemAttributeHash(), value.itemAttributeResolvedAt(),
                jsonCodec.readTree(value.standardMappingSnapshot()),
                value.packageSpecSnapshot(), value.manufacturerNameSnapshot(), value.packageUnitNameSnapshot());
    }

    private void requirePharmacyOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (context.hasWorkContext() && !context.canAccessOrganization(organizationId)) {
            throw badRequest("MEDICATION_REQUEST_PHARMACY_SCOPE_INVALID", "药品请求不在当前机构可访问范围内");
        }
    }

    MedicationRequestResponse response(MedicationRequest value) {
        return new MedicationRequestResponse(value.id(), value.revision(), value.residentId(), value.encounterId(),
                value.requestNo(), value.status().name(), value.requestGroupId(), value.parentRequestId(),
                value.catalogItemId(), value.medicationId(),
                value.packageId(), value.performerOrganizationId(), value.performerDepartmentId(), value.businessDate(),
                value.authoredAt(), value.authoredBy(), value.reasonText(), value.itemCodeSnapshot(), value.itemNameSnapshot(),
                value.localCodeSnapshot(), value.localNameSnapshot(), value.adoptionId(), value.adoptionRevision(),
                value.priceId(), value.priceRevision(), value.priceType(), value.unitPrice(), value.priceQuantitySnapshot(),
                value.totalAmount(), value.currencyCode(), value.medicationCodeSnapshot(), value.medicationNameSnapshot(),
                value.medicationTypeSnapshot(), value.manufacturerNameSnapshot(), value.doseFormSnapshot(), value.preparationSpecSnapshot(),
                value.preparationUnitSnapshot(), value.skinTestRequiredSnapshot(),
                value.skinTestExempt(), value.skinTestExemptReason(), value.exemptEvidenceEventId(),
                value.antimicrobialSnapshot(),
                value.antimicrobialLevelSnapshot(), value.doseValue(), value.doseUnit(), value.routeId(),
                value.routeCode(), value.routeNameSnapshot(), value.routeExecutionTypeSnapshot(),
                value.frequencyCode(), value.frequencyId(), value.frequencyNameSnapshot(),
                value.frequencyRuleSnapshot() == null ? null : jsonCodec.readTree(value.frequencyRuleSnapshot()),
                value.durationValue(), value.durationUnit(),
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
                                               String frequency) {
        if (doseValue == null || doseUnit == null) {
            throw badRequest("PRESCRIPTION_DOSE_REQUIRED", "处方药品必须填写单次剂量和剂量单位");
        }
        if (route == null) throw badRequest("PRESCRIPTION_ROUTE_REQUIRED", "处方药品必须填写给药途径");
        if (frequency == null) throw badRequest("PRESCRIPTION_FREQUENCY_REQUIRED", "处方药品必须填写用药频次");
    }

    private void requirePrescriptionCategory(String categoryCode, String medicationType) {
        if (categoryCode == null || "OUTPATIENT".equals(categoryCode)) return;
        if (!categoryCode.equals(medicationType)) {
            throw badRequest("PRESCRIPTION_MEDICATION_TYPE_MISMATCH",
                    "药品类型与当前自动分方的处方类型不一致");
        }
    }

    private void validateOutpatientAntimicrobial(CatalogLifecycleDirectory.MedicationSnapshot medication,
                                                  BigDecimal durationValue, String durationUnit) {
        if (!medication.antimicrobial()) return;
        if (!medication.antimicrobialOutpatientAllowed()) {
            throw badRequest("ANTIMICROBIAL_OUTPATIENT_NOT_ALLOWED",
                    "该药品不允许门诊常规开立，请按住院或紧急用药审批流程处理");
        }
        if (medication.antimicrobialMaxDays() == null || durationValue == null) return;
        BigDecimal days = switch (Strings.trimToNull(durationUnit) == null ? "" : Strings.trimToNull(durationUnit).toUpperCase()) {
            case "DAY", "D", "天" -> durationValue;
            case "WEEK", "W", "周" -> durationValue.multiply(BigDecimal.valueOf(7));
            case "MONTH", "月" -> durationValue.multiply(BigDecimal.valueOf(30));
            default -> null;
        };
        if (days != null && days.compareTo(BigDecimal.valueOf(medication.antimicrobialMaxDays())) > 0) {
            throw badRequest("ANTIMICROBIAL_OUTPATIENT_DURATION_EXCEEDED",
                    "该抗菌药门诊疗程不得超过 " + medication.antimicrobialMaxDays() + " 天");
        }
    }

    private MedicationRequest requireAdministrationParent(Long parentRequestId, Long tenantId, Long encounterId,
                                                          Prescription prescription,
                                                          MedicationRouteDirectory.RouteSnapshot route,
                                                          String frequency,
                                                          BigDecimal durationValue) {
        if (parentRequestId == null) return null;
        if (prescription == null || route == null || !route.infusion()) {
            throw badRequest("MEDICATION_PARENT_REQUEST_INVALID", "只有处方内输液医嘱可以引用组内父医嘱");
        }
        MedicationRequest parent = repository.findByIdAndTenantId(parentRequestId, tenantId)
                .filter(value -> value.encounterId().equals(encounterId)
                        && prescription.id().equals(value.requestGroupId())
                        && !MedicationRequestStatus.CANCELLED.equals(value.status()))
                .orElseThrow(() -> badRequest("MEDICATION_PARENT_REQUEST_INVALID", "输液父医嘱不属于当前处方"));
        if (!"INFUSION".equals(parent.routeExecutionTypeSnapshot())
                || !Strings.trimToNull(parent.routeCode()).equalsIgnoreCase(route.code())
                || !java.util.Objects.equals(Strings.trimToNull(parent.frequencyCode()), Strings.trimToNull(frequency))
                || !sameNumber(parent.durationValue(), durationValue)) {
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
        Instant occurredAt = switch (type) {
            case "MEDICATION_REQUEST_AUTHORED", "MEDICATION_REQUEST_DRAFTED" -> value.authoredAt();
            case "MEDICATION_REQUEST_CANCELLED" -> value.cancelledAt();
            default -> Instant.now(); // Activation occurs here; this timestamp is persisted in the outbox.
        };
        eventPublisher.publish(value.tenantId(), value.performerOrganizationId(), type,
                details.containsKey("billingDisposition") ? 2 : 1,
                "MedicationRequest", value.id(), value.revision(), value.residentId(), occurredAt.truncatedTo(java.time.temporal.ChronoUnit.MICROS), payload);
    }

    private void publishCancellation(MedicationRequest value, String reason, Long actorId, boolean draft,
                                     EncounterDirectory.EncounterSnapshot encounter) {
        Map<String, Object> details = financialEventDetails(value, encounter);
        details.put("billingDisposition", com.rhn.outpatient.api.ClinicalOrderBillingDisposition.fromSnapshot(
                draft, value.selfProvided(), value.unitPrice(), value.totalAmount(), value.currencyCode()).name());
        details.put("medicationId", value.medicationId());
        details.put("reason", reason);
        details.put("cancelledBy", actorId);
        publish(value, "MEDICATION_REQUEST_CANCELLED", "撤销药品", details);
    }

    private Map<String, Object> financialEventDetails(MedicationRequest value,
                                                       EncounterDirectory.EncounterSnapshot encounter) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("billingDisposition", com.rhn.outpatient.api.ClinicalOrderBillingDisposition.fromSnapshot(
                value.status() == MedicationRequestStatus.DRAFT, value.selfProvided(),
                value.unitPrice(), value.totalAmount(), value.currencyCode()).name());
        details.put("encounterId", encounter.id());
        details.put("residentId", encounter.residentId());
        details.put("encounterOrganizationId", encounter.organizationId());
        details.put("encounterDepartmentId", encounter.departmentId());
        details.put("performerDepartmentId", value.performerDepartmentId());
        if (value.catalogItemId() != null) details.put("catalogItemId", value.catalogItemId());
        details.put("authoredBy", value.authoredBy());
        details.put("chargeQuantity", value.priceQuantitySnapshot() == null
                ? value.quantity() : value.priceQuantitySnapshot());
        details.put("chargeUnit", value.packageId() == null ? value.baseUnit() : value.quantityUnit());
        details.put("itemCode", value.itemCodeSnapshot());
        details.put("itemName", value.itemNameSnapshot());
        String prescriptionCategory = null;
        if (value.requestGroupId() != null) {
            details.put("prescriptionId", value.requestGroupId());
            var prescriptionOpt = prescriptionRepository.findByIdAndTenantId(value.requestGroupId(), value.tenantId());
            if (prescriptionOpt.isPresent()) {
                var prescription = prescriptionOpt.get();
                prescriptionCategory = prescription.categoryCode();
                details.put("prescriptionNo", prescription.groupNo());
                details.put("prescriptionCategory", prescriptionCategory);
            }
        }
        String accountingCategory = com.rhn.platform.masterdata.api.MedicationAccountingCategories.fromMedicationType(value.medicationTypeSnapshot());
        if (accountingCategory != null) details.put("accountingCategory", accountingCategory);
        if (value.parentRequestId() != null) details.put("parentRequestId", value.parentRequestId());
        if (value.doseValue() != null) details.put("doseValue", value.doseValue());
        if (value.doseUnit() != null) details.put("doseUnit", value.doseUnit());
        if (value.routeCode() != null) details.put("routeCode", value.routeCode());
        if (value.routeId() != null) details.put("routeId", value.routeId());
        if (value.routeNameSnapshot() != null) details.put("routeName", value.routeNameSnapshot());
        if (value.routeExecutionTypeSnapshot() != null) {
            details.put("routeExecutionType", value.routeExecutionTypeSnapshot());
        }
        if (value.frequencyCode() != null) details.put("frequencyCode", value.frequencyCode());
        if (value.frequencyId() != null) details.put("frequencyId", value.frequencyId());
        if (value.frequencyNameSnapshot() != null) details.put("frequencyName", value.frequencyNameSnapshot());
        if (value.frequencyRuleSnapshot() != null) details.put("frequencyRule", jsonCodec.readTree(value.frequencyRuleSnapshot()));
        if (value.durationValue() != null) details.put("durationValue", value.durationValue());
        if (value.durationUnit() != null) details.put("durationUnit", value.durationUnit());
        details.put("selfProvided", value.selfProvided());
        details.put("skinTestRequired", value.skinTestRequiredSnapshot());
        details.put("skinTestExempt", value.skinTestExempt());
        if (value.skinTestExemptReason() != null) details.put("skinTestExemptReason", value.skinTestExemptReason());
        if (value.exemptEvidenceEventId() != null) details.put("exemptEvidenceEventId", value.exemptEvidenceEventId());
        if (value.priceId() != null) details.put("priceId", value.priceId());
        if (value.priceRevision() != null) details.put("priceRevision", value.priceRevision());
        if (value.priceType() != null) details.put("priceType", value.priceType());
        if (value.unitPrice() != null) details.put("unitPrice", value.unitPrice());
        if (value.totalAmount() != null) details.put("totalAmount", value.totalAmount());
        if (value.currencyCode() != null) details.put("currencyCode", value.currencyCode());
        return details;
    }

    private String nextRequestNo() {
        return "MR" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private boolean sameNumber(BigDecimal left, BigDecimal right) {
        return left == null ? right == null : right != null && left.compareTo(right) == 0;
    }

}
