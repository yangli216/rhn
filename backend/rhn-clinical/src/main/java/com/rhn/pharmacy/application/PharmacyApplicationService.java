package com.rhn.pharmacy.application;

import com.rhn.healthcore.api.EncounterCareSettingDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskLineView;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskView;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyClinicalContextView;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyDiagnosisView;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyInboxItem;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyReviewView;
import com.rhn.pharmacy.api.PharmacyViews.PrescriptionReviewModeView;
import com.rhn.pharmacy.api.PharmacyViews.StockItemView;
import com.rhn.pharmacy.api.PharmacyViews.StockSiteView;
import com.rhn.pharmacy.api.InpatientMedicationStopDirectory;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.PharmacyReview;
import com.rhn.pharmacy.domain.PharmacyFulfillmentAuthorization;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.PharmacyReviewRepository;
import com.rhn.pharmacy.infrastructure.PharmacyFulfillmentAuthorizationRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PharmacyApplicationService implements com.rhn.pharmacy.api.PharmacyReviewDirectory {
    private static final Set<String> SITE_TYPES = Set.of("WAREHOUSE", "PHARMACY", "DEPARTMENT_STORE", "VIRTUAL");
    private static final Set<String> SERVICE_SCOPES = Set.of("OUTPATIENT", "INPATIENT", "EMERGENCY", "COMMUNITY", "MIXED");
    private static final Set<String> ISSUE_POLICIES = Set.of("FEFO", "FIFO", "MANUAL");
    private static final Set<String> REVIEW_RESULTS = Set.of("PASS", "REJECT", "INTERVENE", "OVERRIDE");
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final DispenseTaskRepository taskRepository;
    private final DispenseTaskLineRepository lineRepository;
    private final PharmacyReviewRepository reviewRepository;
    private final PharmacyFulfillmentAuthorizationRepository fulfillmentAuthorizations;
    private final EncounterCareSettingDirectory encounterCareSettings;
    private final ResidentDirectory residentDirectory;
    private final EncounterDirectory encounterDirectory;
    private final MedicationRequestDirectory requestDirectory;
    private final MedicationDispenseRepository dispenseRepository;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final DispenseRouteApplicationService routing;
    private final InpatientMedicationStopDirectory medicationStops;
    private final PrescriptionReviewPolicy reviewPolicy;
    private final com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory prescriptionSafety;
    private final boolean requireSettlementAuthorization;

    public PharmacyApplicationService(StockSiteRepository siteRepository, StockItemRepository itemRepository,
                                      DispenseTaskRepository taskRepository,
                                      DispenseTaskLineRepository lineRepository,
                                      PharmacyReviewRepository reviewRepository,
                                      PharmacyFulfillmentAuthorizationRepository fulfillmentAuthorizations,
                                      EncounterCareSettingDirectory encounterCareSettings,
                                      ResidentDirectory residentDirectory,
                                      EncounterDirectory encounterDirectory,
                                      MedicationRequestDirectory requestDirectory,
                                      MedicationDispenseRepository dispenseRepository,
                                      CatalogLifecycleDirectory catalogDirectory,
                                      OrganizationDirectory organizationDirectory,
                                      DomainEventPublisher eventPublisher,
                                      ExecutionContextProvider contextProvider, JsonCodec jsonCodec,
                                      DispenseRouteApplicationService routing,
                                      InpatientMedicationStopDirectory medicationStops,
                                      PrescriptionReviewPolicy reviewPolicy,
                                      com.rhn.outpatient.api.PrescriptionSafetyReviewDirectory prescriptionSafety,
                                      @Value("${rhn.pharmacy.require-settlement-authorization:true}")
                                      boolean requireSettlementAuthorization) {
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.taskRepository = taskRepository; this.lineRepository = lineRepository;
        this.reviewRepository = reviewRepository; this.fulfillmentAuthorizations = fulfillmentAuthorizations;
        this.encounterCareSettings = encounterCareSettings;
        this.residentDirectory = residentDirectory;
        this.encounterDirectory = encounterDirectory;
        this.requestDirectory = requestDirectory;
        this.dispenseRepository = dispenseRepository;
        this.catalogDirectory = catalogDirectory; this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher; this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
        this.routing = routing;
        this.medicationStops = medicationStops;
        this.reviewPolicy = reviewPolicy;
        this.prescriptionSafety = prescriptionSafety;
        this.requireSettlementAuthorization = requireSettlementAuthorization;
    }

    @Transactional
    public StockSiteView createSite(CreateSiteCommand input) {
        ExecutionContext context = requireWorkContext();
        requireOrganizationAccess(context, input.organizationId());
        String type = upper(input.siteType()); String scope = upper(input.serviceScope());
        if (!SITE_TYPES.contains(type)) throw badRequest("STOCK_SITE_TYPE_INVALID", "库存站点类型不受支持");
        if (!SERVICE_SCOPES.contains(scope)) throw badRequest("STOCK_SITE_SCOPE_INVALID", "库存站点服务范围不受支持");
        if (!"VIRTUAL".equals(type) && input.departmentId() == null) {
            throw badRequest("STOCK_SITE_DEPARTMENT_REQUIRED", "药库、药房和科室库存点必须绑定所属科室");
        }
        organizationDirectory.requireOrganization(context.tenantId(), input.organizationId());
        String code;
        String name;
        LocalDate validFrom;
        LocalDate validTo;
        if (input.departmentId() != null) {
            var department = organizationDirectory.requireDepartment(
                    context.tenantId(), input.organizationId(), input.departmentId());
            if (siteRepository.existsByTenantIdAndOrganizationIdAndDepartmentId(
                    context.tenantId(), input.organizationId(), input.departmentId())) {
                throw conflict("STOCK_SITE_DEPARTMENT_DUPLICATE", "当前科室已存在库存配置，无需重复建立库房");
            }
            code = department.code();
            name = department.name();
            validFrom = department.validFrom();
            validTo = department.validTo();
        } else {
            code = required(input.code(), "STOCK_SITE_CODE_REQUIRED", "虚拟库存点编码不能为空");
            name = required(input.name(), "STOCK_SITE_NAME_REQUIRED", "虚拟库存点名称不能为空");
            validFrom = input.validFrom();
            validTo = input.validTo();
        }
        if (validFrom == null) throw badRequest("STOCK_SITE_VALID_FROM_REQUIRED", "库存配置生效日期不能为空");
        if (validTo != null && validTo.isBefore(validFrom)) {
            throw badRequest("STOCK_SITE_VALIDITY_INVALID", "库存配置结束日期不能早于生效日期");
        }
        if (siteRepository.existsByTenantIdAndOrganizationIdAndCode(
                context.tenantId(), input.organizationId(), code)) {
            throw conflict("STOCK_SITE_CODE_DUPLICATE", "当前机构已存在相同科室编码的库存配置");
        }
        StockSite value = siteRepository.saveAndFlush(new StockSite(context.tenantId(), input.organizationId(),
                input.departmentId(), code, name, type, scope, validFrom, validTo, context.subjectId()));
        return siteView(value);
    }

    @Transactional(readOnly = true)
    public List<StockSiteView> sites(Long organizationId) {
        ExecutionContext context = requireWorkContext(); requireOrganizationAccess(context, organizationId);
        return siteRepository.findByTenantIdAndOrganizationIdOrderByCode(context.tenantId(), organizationId)
                .stream().map(this::siteView).toList();
    }

    @Transactional
    public StockItemView createStockItem(Long siteId, CreateStockItemCommand input) {
        return createStockItems(siteId, List.of(input)).getFirst();
    }

    @Transactional
    public List<StockItemView> createStockItems(Long siteId, List<CreateStockItemCommand> inputs) {
        ExecutionContext context = requireWorkContext();
        StockSite site = requireSite(context, siteId); requireOrganizationAccess(context, site.organizationId());
        if (!site.effective(LocalDate.now())) throw conflict("STOCK_SITE_NOT_EFFECTIVE", "库存站点当前不可用");
        if (inputs == null || inputs.isEmpty()) {
            throw badRequest("STOCK_ITEM_BATCH_EMPTY", "请至少选择一个药品产品");
        }
        if (inputs.size() > 200) {
            throw badRequest("STOCK_ITEM_BATCH_LIMIT", "单次最多调入 200 个药品产品");
        }
        Set<Long> catalogItemIds = new HashSet<>();
        List<PreparedStockItem> prepared = new ArrayList<>(inputs.size());
        for (CreateStockItemCommand input : inputs) {
            if (!catalogItemIds.add(input.catalogItemId())) {
                throw conflict("STOCK_ITEM_BATCH_DUPLICATE", "同一批次不能重复选择药品产品");
            }
            String policy = upper(input.issuePolicy());
            if (!ISSUE_POLICIES.contains(policy)) {
                throw badRequest("STOCK_ITEM_ISSUE_POLICY_INVALID", "出库策略不受支持");
            }
            String controlLevel = clean(input.controlLevel());
            if (!input.controlled() && controlLevel != null) {
                throw badRequest("STOCK_ITEM_CONTROL_LEVEL_INVALID", "非受控药品不能配置管制级别");
            }
            var catalog = catalogDirectory.resolve(context.tenantId(), input.catalogItemId(), site.organizationId(),
                    input.packageId(), "SALE", LocalDate.now());
            requireStockableCatalog(catalog, site);
            if (itemRepository.findByTenantIdAndStockSiteIdAndCatalogItemId(
                    context.tenantId(), siteId, input.catalogItemId()).isPresent()) {
                throw conflict("STOCK_ITEM_DUPLICATE", "当前科室已配置药品“%s”".formatted(catalog.item().name()));
            }
            prepared.add(new PreparedStockItem(input, policy, controlLevel, catalog.item().unitCode()));
        }
        List<StockItem> values = prepared.stream().map(value -> new StockItem(context.tenantId(), siteId,
                value.input().catalogItemId(), value.input().packageId(), value.baseUnitCode(), value.issuePolicy(),
                value.input().negativeAllowed(), value.input().lotRequired(), value.input().traceRequired(),
                value.input().splitAllowed(), value.input().coldChain(), value.input().controlled(),
                value.controlLevel(), value.input().highAlert(), context.subjectId())).toList();
        return itemRepository.saveAllAndFlush(values).stream().map(value -> stockItemView(value, site)).toList();
    }

    @Transactional(readOnly = true)
    public List<StockItemView> stockItems(Long siteId) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        requireOrganizationAccess(context, site.organizationId());
        return itemRepository.findByTenantIdAndStockSiteIdOrderById(context.tenantId(), siteId)
                .stream().map(value -> stockItemView(value, site)).toList();
    }

    @Transactional(readOnly = true)
    public List<PharmacyInboxItem> inbox(Long organizationId) {
        ExecutionContext context = requireWorkContext(); requireOrganizationAccess(context, organizationId);
        StockSite currentSite = siteRepository.findByTenantIdAndOrganizationIdAndDepartmentId(
                context.tenantId(), organizationId, context.departmentId()).orElse(null);
        if (currentSite == null || !"PHARMACY".equals(currentSite.siteType())) return List.of();
        Map<Long, PharmacyInboxItem> result = new LinkedHashMap<>();
        List<MedicationRequestSnapshot> activeRequests = requestDirectory.activeForPharmacy(organizationId);
        for (MedicationRequestSnapshot request : activeRequests) {
            var resident = residentDirectory.requireSnapshot(context.tenantId(), request.residentId());
            DispenseTaskLine line = lineRepository
                    .findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
                            context.tenantId(), "MEDICATION_REQUEST", request.id())
                    .orElse(null);
            if (line == null) {
                if (visibleInInbox(context, request, currentSite.id())) {
                    result.put(request.id(), new PharmacyInboxItem(
                            request, null, null, null, null, null, null, null,
                            resident.fullName(), resident.healthRecordNo(), resident.phone(),
                            null, null, null, null, null, null,
                            clinicalContext(context.tenantId(), request), prescriptionRequests(activeRequests, request)));
                }
                continue;
            }
            DispenseTask task = taskRepository.findByIdAndTenantId(line.taskId(), context.tenantId())
                    .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "接方任务不存在"));
            if (!currentSite.id().equals(task.stockSiteId())) continue;
            List<PharmacyReview> reviews = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(
                    context.tenantId(), task.id());
            MedicationDispense latestDispense = latestDispense(context.tenantId(), task.id());
            result.put(request.id(), new PharmacyInboxItem(request, task.id(), task.taskNo(), task.status(), null,
                    line.stockItemId(), line.productNameSnapshot(),
                    reviews.isEmpty() ? null : reviews.get(reviews.size() - 1).result(),
                    resident.fullName(), resident.healthRecordNo(), resident.phone(),
                    latestDispense == null ? null : latestDispense.occurredAt(),
                    latestDispense == null ? null : latestDispense.dispenserPractitionerId(),
                    line.plannedQuantity(), line.dispensedQuantity(), line.returnedQuantity(), line.dispenseUnitCode(),
                    clinicalContext(context.tenantId(), request), prescriptionRequests(activeRequests, request)));
        }
        for (DispenseTask task : taskRepository.findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(
                context.tenantId(), currentSite.id())) {
            DispenseTaskLine line = lineRepository.findByTenantIdAndTaskId(context.tenantId(), task.id()).orElse(null);
            if (line == null || result.containsKey(line.requestId())) continue;
            var closure = medicationStops.closure(context.tenantId(), line.requestId());
            if (!closure.returnRequired()) continue;
            MedicationRequestSnapshot request = requestDirectory.requireForPharmacy(line.requestId());
            var resident = residentDirectory.requireSnapshot(context.tenantId(), request.residentId());
            List<PharmacyReview> reviews = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(
                    context.tenantId(), task.id());
            MedicationDispense latestDispense = latestDispense(context.tenantId(), task.id());
            result.put(request.id(), new PharmacyInboxItem(request, task.id(), task.taskNo(), task.status(),
                    closure.status(), line.stockItemId(), line.productNameSnapshot(),
                    reviews.isEmpty() ? null : reviews.get(reviews.size() - 1).result(),
                    resident.fullName(), resident.healthRecordNo(), resident.phone(),
                    latestDispense == null ? null : latestDispense.occurredAt(),
                    latestDispense == null ? null : latestDispense.dispenserPractitionerId(),
                    line.plannedQuantity(), line.dispensedQuantity(), line.returnedQuantity(), line.dispenseUnitCode(),
                    clinicalContext(context.tenantId(), request), List.of(request)));
        }
        return new ArrayList<>(result.values());
    }

    private MedicationDispense latestDispense(Long tenantId, Long taskId) {
        return dispenseRepository.findByTenantIdAndTaskIdOrderByOccurredAtAscIdAsc(tenantId, taskId).stream()
                .filter(value -> "DISPENSE".equals(value.dispenseType()) || "REDISPENSE".equals(value.dispenseType()))
                .reduce((left, right) -> right)
                .orElse(null);
    }

    private PharmacyClinicalContextView clinicalContext(Long tenantId, MedicationRequestSnapshot request) {
        var value = encounterDirectory.requireForPharmacy(tenantId, request.encounterId());
        if (!request.residentId().equals(value.residentId())) {
            throw conflict("PHARMACY_ENCOUNTER_RESIDENT_MISMATCH", "处方患者与就诊患者不一致");
        }
        return new PharmacyClinicalContextView(value.encounterId(), value.encounterNo(), value.clinicianId(),
                value.chiefComplaint(), value.diagnoses().stream().map(diagnosis -> new PharmacyDiagnosisView(
                        diagnosis.code(), diagnosis.display(), diagnosis.type())).toList());
    }

    private List<MedicationRequestSnapshot> prescriptionRequests(List<MedicationRequestSnapshot> activeRequests,
                                                                 MedicationRequestSnapshot request) {
        if (request.prescriptionId() == null) return List.of(request);
        List<MedicationRequestSnapshot> result = activeRequests.stream()
                .filter(value -> request.prescriptionId().equals(value.prescriptionId()))
                .toList();
        return result.isEmpty() ? List.of(request) : result;
    }

    @Transactional
    public DispenseTaskView intake(Long requestId, IntakeCommand input) {
        MedicationRequestSnapshot request = requestDirectory.lockForPharmacyIntake(requestId);
        return intake(request, "MEDICATION_REQUEST", requestId,
                request.quantity(), request.quantityUnit(), request.baseQuantity(), request.baseUnit(), input);
    }

    /** Creates one independently fulfillable pharmacy task for a submitted inpatient supply line. */
    @Transactional
    public DispenseTaskView intakeSupplyLine(Long supplyLineId, Long requestId,
                                             BigDecimal requestedQuantity, String quantityUnit,
                                             BigDecimal requestedBaseQuantity, String baseUnit,
                                             IntakeCommand input) {
        MedicationRequestSnapshot request = requestDirectory.lockForPharmacyIntake(requestId);
        return intake(request, "INPATIENT_SUPPLY_LINE", supplyLineId,
                requestedQuantity, quantityUnit, requestedBaseQuantity, baseUnit, input);
    }

    private DispenseTaskView intake(MedicationRequestSnapshot request,
                                    String fulfillmentSourceType, Long fulfillmentSourceId,
                                    BigDecimal requestedQuantity, String quantityUnit,
                                    BigDecimal requestedBaseQuantity, String baseUnit,
                                    IntakeCommand input) {
        ExecutionContext context = requireWorkContext();
        DispenseTaskLine existing = lineRepository
                .findByTenantIdAndFulfillmentSourceTypeAndFulfillmentSourceId(
                        context.tenantId(), fulfillmentSourceType, fulfillmentSourceId)
                .orElse(null);
        if (existing != null) return taskView(requireTask(context, existing.taskId()));
        var encounter = encounterCareSettings.require(context.tenantId(), request.encounterId());
        String careSetting = encounter.encounterClass();
        if (!request.residentId().equals(encounter.residentId())
                || !request.performerOrganizationId().equals(encounter.organizationId())) {
            throw conflict("MEDICATION_REQUEST_ENCOUNTER_MISMATCH", "药品请求与就诊范围不一致");
        }
        PharmacyFulfillmentAuthorization authorization = fulfillmentAuthorizations
                .findTopByTenantIdAndMedicationRequestIdOrderByReadyAtDesc(context.tenantId(), request.id())
                .orElse(null);
        boolean settlementRequired = requireSettlementAuthorization && !"INPATIENT".equals(careSetting);
        if (settlementRequired && (authorization == null || !authorization.allowsIntake())) {
            throw conflict("MEDICATION_REQUEST_SETTLEMENT_REQUIRED", "处方尚未完成结算，不能进入药房接方流程");
        }
        if (!"ACTIVE".equals(request.status())) throw conflict("MEDICATION_REQUEST_NOT_ACTIVE", "只有生效处方可以接方");
        if (request.selfProvided()) throw conflict("SELF_PROVIDED_MEDICATION_NOT_DISPENSABLE", "自备药不进入药房发药流程");
        StockItem stockItem = itemRepository.findByIdAndTenantId(input.stockItemId(), context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到药房经营项目"));
        StockSite site = requireSite(context, stockItem.stockSiteId());
        requireOrganizationAccess(context, site.organizationId());
        if (!site.organizationId().equals(request.performerOrganizationId())) {
            throw badRequest("DISPENSE_ROUTE_ORGANIZATION_MISMATCH", "药房经营项目不属于处方执行机构");
        }
        if (settlementRequired) {
            var route = authorization.routedStockSiteId() == null
                    ? routing.resolve(context.tenantId(), request.performerOrganizationId(),
                            request.performerDepartmentId(), request.medicationType(), careSetting,
                            request.businessDate())
                    : java.util.Optional.of(new DispenseRouteApplicationService.ResolvedRoute(
                            authorization.dispenseRouteId(), authorization.dispenseRouteRevision(), "SNAPSHOT",
                            authorization.routedStockSiteId(), site.departmentId()));
            var resolved = route.orElseThrow(() -> conflict("DISPENSE_ROUTE_NOT_CONFIGURED",
                    "当前药品医嘱尚未配置发药药房，请联系管理员维护发药路由"));
            if (!site.id().equals(resolved.stockSiteId())) {
                throw conflict("DISPENSE_ROUTE_SITE_MISMATCH", "该药品医嘱已分配到其他发药药房");
            }
            if (authorization.routedStockSiteId() == null) {
                authorization.assignRoute(resolved.routeId(), resolved.routeRevision(), resolved.stockSiteId(), Instant.now());
            }
        }
        if (!site.effective(request.businessDate()) || !supports(site, careSetting)
                || !"PHARMACY".equals(site.siteType())) {
            throw conflict("PHARMACY_CARE_SETTING_MISMATCH", "所选站点不支持当前就诊类型的药品发放");
        }
        if (!"ACTIVE".equals(stockItem.status())) throw conflict("STOCK_ITEM_NOT_ACTIVE", "药房经营项目当前不可用");
        var catalog = catalogDirectory.resolve(context.tenantId(), stockItem.catalogItemId(), site.organizationId(),
                stockItem.basePackageId(), "SALE", request.businessDate());
        requireDispensableCatalog(catalog);
        if (!catalog.medication().id().equals(request.medicationId())) {
            throw badRequest("DISPENSE_MEDICATION_MISMATCH", "所选药品产品不属于处方通用药品");
        }
        if (request.catalogItemId() != null && !request.catalogItemId().equals(stockItem.catalogItemId())
                && !request.substitutionAllowed()) {
            throw conflict("MEDICATION_SUBSTITUTION_NOT_ALLOWED", "处方不允许替换已指定的药品产品");
        }
        DispensePlan plan = plan(requestedQuantity, quantityUnit, requestedBaseQuantity, baseUnit,
                catalog.itemPackage(), stockItem.splitAllowed());
        PrescriptionReviewPolicy.Mode reviewMode = reviewPolicy.resolve(
                context, site.organizationId(), site.departmentId());
        DispenseTask task = new DispenseTask(context.tenantId(), request.residentId(),
                request.encounterId(), site.id(), nextNo("DT"), careSetting, "ROUTINE", clean(input.description()));
        DispenseTaskLine line = new DispenseTaskLine(context.tenantId(), task.id(), request.id(),
                fulfillmentSourceType, fulfillmentSourceId, stockItem.id(),
                stockItem.basePackageId(), requestedQuantity, plan.quantity(), plan.unitCode(), plan.factor(),
                plan.split(), stockItem.traceRequired(), catalog.item().code(), catalog.item().name(),
                catalog.itemPackage().packageSpec(), jsonCodec.write(request.itemAttributeSnapshot()),
                request.itemAttributeHash(), context.subjectId());
        if (!reviewMode.beforeDispense()) {
            task.bypassPreDispenseReview();
            line.bypassPreDispenseReview();
        }
        taskRepository.save(task);
        try {
            lineRepository.saveAndFlush(line); taskRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("MEDICATION_FULFILLMENT_ALREADY_INTAKE", "该供药来源已完成接方，请刷新任务列表");
        }
        if (authorization != null) authorization.startIntake(Instant.now());
        publish(context, site.organizationId(), request.residentId(), task, "DISPENSE_TASK_CREATED",
                "药房已接收处方并形成发药任务", Map.of("requestId", request.id(),
                        "stockItemId", stockItem.id(), "fulfillmentSourceType", fulfillmentSourceType,
                        "fulfillmentSourceId", fulfillmentSourceId));
        return taskView(task);
    }

    private boolean visibleInInbox(ExecutionContext context, MedicationRequestSnapshot request, Long currentSiteId) {
        String careSetting = encounterCareSettings.require(context.tenantId(), request.encounterId()).encounterClass();
        if ("INPATIENT".equals(careSetting)) {
            return siteRepository.findByIdAndTenantId(currentSiteId, context.tenantId())
                    .filter(site -> "PHARMACY".equals(site.siteType()) && supports(site, careSetting))
                    .isPresent();
        }
        if (!requireSettlementAuthorization) return true;
        PharmacyFulfillmentAuthorization authorization = fulfillmentAuthorizations
                .findTopByTenantIdAndMedicationRequestIdOrderByReadyAtDesc(context.tenantId(), request.id())
                .filter(PharmacyFulfillmentAuthorization::allowsIntake)
                .filter(value -> value.organizationId().equals(request.performerOrganizationId()))
                .orElse(null);
        if (authorization == null) return false;
        Long targetSiteId = authorization.routedStockSiteId();
        if (targetSiteId == null) targetSiteId = routing.resolve(context.tenantId(), request.performerOrganizationId(),
                request.performerDepartmentId(), request.medicationType(), careSetting, request.businessDate())
                .map(DispenseRouteApplicationService.ResolvedRoute::stockSiteId).orElse(null);
        return currentSiteId.equals(targetSiteId);
    }

    private boolean supports(StockSite site, String careSetting) {
        return "MIXED".equals(site.serviceScope()) || careSetting.equals(site.serviceScope())
                || ("HOME_CARE".equals(careSetting) && "COMMUNITY".equals(site.serviceScope()));
    }

    @Transactional(readOnly = true)
    public List<DispenseTaskView> tasks(Long siteId, String status) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        requireOrganizationAccess(context, site.organizationId());
        List<DispenseTask> values = clean(status) == null
                ? taskRepository.findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(context.tenantId(), siteId)
                : taskRepository.findByTenantIdAndStockSiteIdAndStatusOrderByCreatedAtDesc(
                        context.tenantId(), siteId, upper(status));
        return values.stream().map(this::taskView).toList();
    }

    @Transactional(readOnly = true)
    public DispenseTaskView task(Long taskId) { return taskView(requireTask(requireWorkContext(), taskId)); }

    @Transactional(readOnly = true)
    public PrescriptionReviewModeView prescriptionReviewMode(Long organizationId) {
        ExecutionContext context = requireWorkContext();
        requireOrganizationAccess(context, organizationId);
        PrescriptionReviewPolicy.Mode mode = reviewPolicy.resolve(
                context, organizationId, context.departmentId());
        return new PrescriptionReviewModeView(mode.name(), mode.enabled(),
                mode.beforeDispense() ? "PRE" : mode.afterDispense() ? "POST" : "NONE",
                PrescriptionReviewPolicy.PARAMETER_KEY);
    }

    @Transactional
    public DispenseTaskView review(Long taskId, ReviewCommand input) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireLockedTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        PrescriptionReviewPolicy.Mode mode = reviewPolicy.resolve(context, site.organizationId(), site.departmentId());
        if (!mode.enabled()) {
            throw conflict("PHARMACY_REVIEW_DISABLED", "系统当前未启用处方审方");
        }
        String result = upper(input.result());
        if (!REVIEW_RESULTS.contains(result)) throw badRequest("PHARMACY_REVIEW_RESULT_INVALID", "审方结论不受支持");
        String reason = clean(input.reasonCode()); String description = clean(input.description());
        if (!"PASS".equals(result) && (reason == null || description == null)) {
            throw badRequest("PHARMACY_REVIEW_REASON_REQUIRED", "非通过审方必须填写原因编码和说明");
        }
        if ("OVERRIDE".equals(result) && !context.hasAuthority("PHARMACY.OVERRIDE")
                && !context.hasAuthority("ROLE_ADMIN")) {
            throw conflict("PHARMACY_OVERRIDE_NOT_AUTHORIZED", "当前账号没有强制通过审方的权限");
        }
        validateReviewer(context, site, input.pharmacistPractitionerId(), input.reviewerAssignmentId());
        DispenseTaskLine line = lineRepository.findByTenantIdAndTaskId(context.tenantId(), taskId)
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
        MedicationRequestSnapshot request = requestDirectory.requireForPharmacy(line.requestId());
        if (mode.beforeDispense() && !"ACTIVE".equals(request.status())) {
            throw conflict("MEDICATION_REQUEST_NOT_ACTIVE", "已撤销处方不能继续审方");
        }
        if (mode.afterDispense() && "OVERRIDE".equals(result)) {
            throw badRequest("PHARMACY_POST_REVIEW_OVERRIDE_INVALID", "事后审方不支持强制通过结论");
        }
        PharmacyReview review = reviewRepository.save(new PharmacyReview(context.tenantId(), line.requestId(),
                task.id(), nextNo("PR"), result, reason, description, input.pharmacistPractitionerId(),
                context.subjectId(), input.reviewerAssignmentId()));
        if (mode.beforeDispense()) {
            task.applyReview(review.id(), result); line.applyReview(result);
        } else {
            if (line.dispensedQuantity().signum() <= 0) {
                throw conflict("PHARMACY_POST_REVIEW_NOT_DISPENSED", "当前任务尚未实际发药，不能进行事后审方");
            }
            task.recordPostDispenseReview(review.id());
        }
        reviewRepository.flush(); lineRepository.flush(); taskRepository.flush();
        publish(context, site.organizationId(), task.residentId(), task, "PHARMACY_REVIEW_RECORDED",
                mode.beforeDispense() ? "事前审方结论已记录" : "事后审方结论已记录",
                Map.of("requestId", line.requestId(), "reviewId", review.id(), "result", result,
                        "reviewMode", mode.name()));
        return taskView(task);
    }

    private void validateReviewer(ExecutionContext context, StockSite site, Long practitionerId, Long assignmentId) {
        var staff = organizationDirectory.requireStaff(context.tenantId(), practitionerId);
        LocalDate today = LocalDate.now();
        boolean employed = staff.employments().stream().anyMatch(value ->
                value.organizationId().equals(site.organizationId()) && "ACTIVE".equals(value.sdPersonnelStatus())
                        && !value.hireDate().isAfter(today)
                        && (value.leaveDate() == null || !value.leaveDate().isBefore(today)));
        var assignment = staff.assignments().stream().filter(value -> value.id().equals(assignmentId)).findFirst()
                .orElseThrow(() -> badRequest("PHARMACY_REVIEW_ASSIGNMENT_INVALID", "审方任职不属于当前药师"));
        if (!"PHARMACY".equals(assignment.sdPositionType())) {
            throw conflict("PHARMACY_POSITION_TYPE_REQUIRED", "审方任职必须使用药学岗位");
        }
        boolean assignmentActive = assignment.organizationId().equals(site.organizationId())
                && "ACTIVE".equals(assignment.sdPersonnelStatus())
                && !assignment.validFrom().isAfter(today)
                && (assignment.validTo() == null || !assignment.validTo().isBefore(today));
        if (!employed || !assignmentActive) {
            throw conflict("PHARMACY_REVIEWER_NOT_ACTIVE", "药师在当前机构没有有效任职");
        }
        if (context.departmentId() != null && !context.departmentId().equals(assignment.departmentId())) {
            throw badRequest("PHARMACY_REVIEW_CONTEXT_MISMATCH", "审方任职必须与当前工作科室一致");
        }
    }

    private DispensePlan plan(BigDecimal requestedQuantity, String quantityUnit,
                              BigDecimal requestedBaseQuantity, String baseUnit,
                              CatalogLifecycleDirectory.PackageSnapshot itemPackage, boolean splitAllowed) {
        BigDecimal factor = itemPackage.quantityFactor();
        if (requestedQuantity == null || requestedBaseQuantity == null
                || requestedQuantity.signum() <= 0 || requestedBaseQuantity.signum() <= 0
                || quantityUnit == null || baseUnit == null) {
            throw badRequest("DISPENSE_REQUEST_QUANTITY_INVALID", "接方数量及单位不完整");
        }
        if (quantityUnit.equals(itemPackage.unitCode())) {
            return new DispensePlan(requestedQuantity, itemPackage.unitCode(), factor, false);
        }
        BigDecimal[] division = requestedBaseQuantity.divideAndRemainder(factor);
        if (division[1].compareTo(BigDecimal.ZERO) == 0) {
            return new DispensePlan(division[0], itemPackage.unitCode(), factor, false);
        }
        if (!splitAllowed) throw conflict("DISPENSE_PACKAGE_QUANTITY_INCOMPATIBLE", "申请数量不能整包装换算且药房未允许拆零");
        return new DispensePlan(requestedBaseQuantity, baseUnit, BigDecimal.ONE, true);
    }

    private void requireDispensableCatalog(CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog) {
        requireStockableCatalog(catalog, null);
        var adoption = catalog.adoption();
        if (!adoption.dispensable()) {
            throw conflict("STOCK_ITEM_ORGANIZATION_NOT_DISPENSABLE", "机构目录未开放该药品的发药能力");
        }
    }

    private void requireStockableCatalog(CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog,
                                         StockSite site) {
        var item = catalog.item(); var adoption = catalog.adoption(); var itemPackage = catalog.itemPackage();
        if (!"MED_PRODUCT".equals(item.itemType()) || catalog.medication() == null) {
            throw badRequest("STOCK_ITEM_CATALOG_TYPE_INVALID", "药房经营项目只能选择药品产品");
        }
        LocalDate at = catalog.businessDate();
        if (!"ACTIVE".equals(catalog.medication().status()))
            throw conflict("STOCK_ITEM_MEDICATION_NOT_ACTIVE", "药品基本信息已停用，不能调入或发药");
        if (!"ACTIVE".equals(item.status()) || !item.stocked()
                || item.validFrom().isAfter(at) || item.validTo() != null && item.validTo().isBefore(at)) {
            throw conflict("STOCK_ITEM_CATALOG_NOT_STOCKABLE", "药品产品当前不可库存");
        }
        if (itemPackage == null || !"ACTIVE".equals(itemPackage.status())
                || itemPackage.validFrom().isAfter(at) || itemPackage.validTo() != null && itemPackage.validTo().isBefore(at)) {
            throw conflict("STOCK_ITEM_PACKAGE_NOT_ACTIVE", "药房经营项目必须选择有效包装");
        }
        if (adoption == null || !"ACTIVE".equals(adoption.sdStatus()) || !adoption.stocked()) {
            throw conflict("STOCK_ITEM_ORGANIZATION_NOT_STOCKABLE", "机构目录未开放该药品的库存能力");
        }
        if (site != null && "PHARMACY".equals(site.siteType()) && !adoption.dispensable()) {
            throw conflict("STOCK_ITEM_ORGANIZATION_NOT_DISPENSABLE", "药房经营项目必须开放发药能力");
        }
    }

    private StockItemView stockItemView(StockItem value, StockSite site) {
        var catalog = catalogDirectory.resolve(value.tenantId(), value.catalogItemId(), site.organizationId(),
                value.basePackageId(), "SALE", LocalDate.now());
        return new StockItemView(value.id(), value.revision(), value.stockSiteId(), value.catalogItemId(),
                value.basePackageId(), catalog.medication().id(), catalog.item().code(), catalog.item().name(),
                catalog.itemPackage().unitCode(), catalog.itemPackage().unitName(), catalog.itemPackage().packageSpec(),
                catalog.itemPackage().quantityFactor(), value.baseUnitCode(), value.issuePolicy(),
                value.negativeAllowed(), value.lotRequired(), value.traceRequired(), value.splitAllowed(),
                value.coldChain(), value.controlled(), value.controlLevel(), value.highAlert(), value.status(),
                catalog.item().manufacturerName());
    }

    private DispenseTaskView taskView(DispenseTask task) {
        List<DispenseTaskLineView> lines = lineRepository.findByTenantIdAndTaskIdOrderById(task.tenantId(), task.id())
                .stream().map(this::lineView).toList();
        String closureStatus = lines.isEmpty() ? null
                : medicationStops.closure(task.tenantId(), lines.getFirst().requestId()).status();
        List<PharmacyReviewView> reviews = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(
                task.tenantId(), task.id()).stream().map(this::reviewView).toList();
        return new DispenseTaskView(task.id(), task.revision(), task.residentId(), task.encounterId(),
                task.stockSiteId(), task.taskNo(), task.taskType(), task.priority(), task.status(), closureStatus,
                task.createdAt(), task.dueAt(), task.pickedAt(), task.assignedPractitionerId(),
                task.pickedByUserId(), task.pickedAssignmentId(), task.pickDescription(),
                task.description(), lines, reviews, lines.stream().map(line -> prescriptionSafety.forMedicationRequest(line.requestId()))
                    .filter(java.util.Objects::nonNull).distinct().toList());
    }

    private DispenseTaskLineView lineView(DispenseTaskLine value) {
        return new DispenseTaskLineView(value.id(), value.requestId(), value.stockItemId(), value.packageId(),
                value.requestedQuantity(), value.plannedQuantity(), value.dispensedQuantity(),
                value.returnedQuantity(), value.dispenseUnitCode(), value.baseQuantityFactor(), value.split(),
                value.traceRequired(), value.status(), value.productCodeSnapshot(), value.productNameSnapshot(),
                value.packageSpecSnapshot(), jsonCodec.readTree(value.itemAttributeSnapshot()), value.itemAttributeHash());
    }

    @Override
    @Transactional(readOnly = true)
    public com.rhn.pharmacy.api.PharmacyReviewDirectory.Source improvementSource(Long taskId, Long reviewId) {
        var context = requireWorkContext();
        if (!context.hasAuthority("PHARMACY.DISPENSE") && !context.hasAuthority("ROLE_ADMIN"))
            throw com.rhn.shared.api.BusinessErrors.forbidden("PHARMACY_REVIEW_FORBIDDEN", "需要药房业务权限");
        var task = requireTask(context, taskId);
        var review = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(context.tenantId(), taskId).stream()
                .filter(value -> value.id().equals(reviewId)).findFirst()
                .orElseThrow(() -> notFound("PHARMACY_REVIEW_NOT_FOUND", "未找到本任务的已保存审方结论"));
        var saved = prescriptionSafety.forMedicationRequest(review.requestId());
        var findings = saved == null ? java.util.List.<com.rhn.outpatient.api.MedicationSafetyDecision.Finding>of()
                : saved.evaluation().findings().stream()
                .filter(f -> f.medicationRequestIds().isEmpty() || f.medicationRequestIds().contains(review.requestId())).toList();
        return new com.rhn.pharmacy.api.PharmacyReviewDirectory.Source(task.id(), reviewView(review), findings);
    }

    private PharmacyReviewView reviewView(PharmacyReview value) {
        return new PharmacyReviewView(value.id(), value.reviewNo(), value.result(), value.reasonCode(),
                value.description(), value.pharmacistPractitionerId(), value.reviewerUserId(),
                value.reviewerAssignmentId(), value.reviewedAt());
    }

    private StockSiteView siteView(StockSite value) {
        return new StockSiteView(value.id(), value.revision(), value.organizationId(), value.departmentId(),
                value.code(), value.name(), value.siteType(), value.serviceScope(), value.active(),
                value.validFrom(), value.validTo());
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite site = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        requireOrganizationAccess(context, site.organizationId());
        requireSiteDepartment(context, site);
        return site;
    }

    private DispenseTask requireTask(ExecutionContext context, Long id) {
        DispenseTask task = taskRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return task;
    }

    private DispenseTask requireLockedTask(ExecutionContext context, Long id) {
        DispenseTask task = taskRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return task;
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "药房操作必须选择工作机构和科室");
        return context;
    }

    private void requireOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (!context.canAccessOrganization(organizationId)) {
            throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "当前工作上下文不能访问该机构药房");
        }
    }

    private void requireSiteDepartment(ExecutionContext context, StockSite site) {
        if (site.departmentId() != null && !site.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点所属科室不一致");
        }
    }

    private void publish(ExecutionContext context, Long organizationId, Long residentId, DispenseTask task,
                         String type, String summary, Map<String, Object> details) {
        Map<String, Object> payload = new LinkedHashMap<>(details); payload.put("summary", summary);
        payload.put("taskNo", task.taskNo()); payload.put("encounterId", task.encounterId());
        eventPublisher.publish(context.tenantId(), organizationId, type, 1, "DispenseTask", task.id(),
                task.revision(), residentId, Instant.now(), payload);
    }

    private String nextNo(String prefix) { return prefix + NUMBER_TIME.format(Instant.now())
            + com.rhn.shared.id.GlobalIds.randomSuffix(6); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record CreateSiteCommand(Long organizationId, Long departmentId, String code, String name,
                                    String siteType, String serviceScope, LocalDate validFrom, LocalDate validTo) {}
    private record PreparedStockItem(CreateStockItemCommand input, String issuePolicy,
                                     String controlLevel, String baseUnitCode) {}
    public record CreateStockItemCommand(Long catalogItemId, Long packageId, String issuePolicy,
                                         boolean negativeAllowed, boolean lotRequired, boolean traceRequired,
                                         boolean splitAllowed, boolean coldChain, boolean controlled,
                                         String controlLevel, boolean highAlert) {}
    public record IntakeCommand(Long stockItemId, String description) {}
    public record ReviewCommand(String result, String reasonCode, String description,
                                Long pharmacistPractitionerId, Long reviewerAssignmentId) {}
    private record DispensePlan(BigDecimal quantity, String unitCode, BigDecimal factor, boolean split) {}
}
