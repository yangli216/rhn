package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.MedicationRequestDirectory;
import com.rhn.outpatient.api.MedicationRequestDirectory.MedicationRequestSnapshot;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskLineView;
import com.rhn.pharmacy.api.PharmacyViews.DispenseTaskView;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyInboxItem;
import com.rhn.pharmacy.api.PharmacyViews.PharmacyReviewView;
import com.rhn.pharmacy.api.PharmacyViews.StockItemView;
import com.rhn.pharmacy.api.PharmacyViews.StockSiteView;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.PharmacyReview;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.PharmacyReviewRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.domain.PersonnelStatus;
import com.rhn.platform.organization.domain.PositionType;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
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
public class PharmacyApplicationService {
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
    private final MedicationRequestDirectory requestDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public PharmacyApplicationService(StockSiteRepository siteRepository, StockItemRepository itemRepository,
                                      DispenseTaskRepository taskRepository,
                                      DispenseTaskLineRepository lineRepository,
                                      PharmacyReviewRepository reviewRepository,
                                      MedicationRequestDirectory requestDirectory,
                                      CatalogLifecycleDirectory catalogDirectory,
                                      OrganizationDirectory organizationDirectory,
                                      DomainEventPublisher eventPublisher,
                                      ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.taskRepository = taskRepository; this.lineRepository = lineRepository;
        this.reviewRepository = reviewRepository; this.requestDirectory = requestDirectory;
        this.catalogDirectory = catalogDirectory; this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher; this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
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
        return requestDirectory.activeForPharmacy(organizationId).stream().map(request -> {
            DispenseTaskLine line = lineRepository.findByTenantIdAndRequestId(context.tenantId(), request.id())
                    .orElse(null);
            if (line == null) return new PharmacyInboxItem(request, null, null, null, null, null, null);
            DispenseTask task = taskRepository.findByIdAndTenantId(line.taskId(), context.tenantId())
                    .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "接方任务不存在"));
            List<PharmacyReview> reviews = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(
                    context.tenantId(), task.id());
            return new PharmacyInboxItem(request, task.id(), task.taskNo(), task.status(), line.stockItemId(),
                    line.productNameSnapshot(), reviews.isEmpty() ? null : reviews.get(reviews.size() - 1).result());
        }).toList();
    }

    @Transactional
    public DispenseTaskView intake(Long requestId, IntakeCommand input) {
        ExecutionContext context = requireWorkContext();
        DispenseTaskLine existing = lineRepository.findByTenantIdAndRequestId(context.tenantId(), requestId).orElse(null);
        if (existing != null) return taskView(requireTask(context, existing.taskId()));
        MedicationRequestSnapshot request = requestDirectory.requireForPharmacy(requestId);
        if (!"ACTIVE".equals(request.status())) throw conflict("MEDICATION_REQUEST_NOT_ACTIVE", "只有生效处方可以接方");
        if (request.selfProvided()) throw conflict("SELF_PROVIDED_MEDICATION_NOT_DISPENSABLE", "自备药不进入药房发药流程");
        StockItem stockItem = itemRepository.findByIdAndTenantId(input.stockItemId(), context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到药房经营项目"));
        StockSite site = requireSite(context, stockItem.stockSiteId());
        requireOrganizationAccess(context, site.organizationId());
        if (!site.organizationId().equals(request.performerOrganizationId())) {
            throw badRequest("DISPENSE_ROUTE_ORGANIZATION_MISMATCH", "药房经营项目不属于处方执行机构");
        }
        if (!site.effective(request.businessDate()) || !("OUTPATIENT".equals(site.serviceScope())
                || "MIXED".equals(site.serviceScope())) || !"PHARMACY".equals(site.siteType())) {
            throw conflict("OUTPATIENT_PHARMACY_NOT_EFFECTIVE", "所选站点不是业务日期内可用的门诊药房");
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
        DispensePlan plan = plan(request, catalog.itemPackage(), stockItem.splitAllowed());
        DispenseTask task = taskRepository.save(new DispenseTask(context.tenantId(), request.residentId(),
                request.encounterId(), site.id(), nextNo("DT"), "ROUTINE", clean(input.description())));
        DispenseTaskLine line = new DispenseTaskLine(context.tenantId(), task.id(), request.id(), stockItem.id(),
                stockItem.basePackageId(), request.quantity(), plan.quantity(), plan.unitCode(), plan.factor(),
                plan.split(), stockItem.traceRequired(), catalog.item().code(), catalog.item().name(),
                catalog.itemPackage().packageSpec(), jsonCodec.write(request.itemAttributeSnapshot()),
                request.itemAttributeHash(), context.subjectId());
        try {
            lineRepository.saveAndFlush(line); taskRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("MEDICATION_REQUEST_ALREADY_INTAKE", "该药品请求已完成接方，请刷新任务列表");
        }
        publish(context, site.organizationId(), request.residentId(), task, "DISPENSE_TASK_CREATED",
                "药房已接收处方并形成发药任务", Map.of("requestId", request.id(), "stockItemId", stockItem.id()));
        return taskView(task);
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

    @Transactional
    public DispenseTaskView review(Long taskId, ReviewCommand input) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        String result = upper(input.result());
        if (!REVIEW_RESULTS.contains(result)) throw badRequest("PHARMACY_REVIEW_RESULT_INVALID", "审方结论不受支持");
        String reason = clean(input.reasonCode()); String description = clean(input.description());
        if (!"PASS".equals(result) && (reason == null || description == null)) {
            throw badRequest("PHARMACY_REVIEW_REASON_REQUIRED", "非通过审方必须填写原因编码和说明");
        }
        if ("OVERRIDE".equals(result) && !context.hasAuthority("PHARMACY_OVERRIDE")
                && !context.hasAuthority("ROLE_ADMIN")) {
            throw conflict("PHARMACY_OVERRIDE_NOT_AUTHORIZED", "当前账号没有强制通过审方的权限");
        }
        validateReviewer(context, site, input.pharmacistPractitionerId(), input.reviewerAssignmentId());
        DispenseTaskLine line = lineRepository.findByTenantIdAndTaskId(context.tenantId(), taskId)
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
        MedicationRequestSnapshot request = requestDirectory.requireForPharmacy(line.requestId());
        if (!"ACTIVE".equals(request.status())) throw conflict("MEDICATION_REQUEST_NOT_ACTIVE", "已撤销处方不能继续审方");
        PharmacyReview review = reviewRepository.save(new PharmacyReview(context.tenantId(), line.requestId(),
                task.id(), nextNo("PR"), result, reason, description, input.pharmacistPractitionerId(),
                context.subjectId(), input.reviewerAssignmentId()));
        task.applyReview(review.id(), result); line.applyReview(result);
        reviewRepository.flush(); lineRepository.flush(); taskRepository.flush();
        publish(context, site.organizationId(), task.residentId(), task, "PHARMACY_REVIEW_RECORDED",
                "药师审方结论已记录", Map.of("requestId", line.requestId(), "reviewId", review.id(), "result", result));
        return taskView(task);
    }

    private void validateReviewer(ExecutionContext context, StockSite site, Long practitionerId, Long assignmentId) {
        var staff = organizationDirectory.requireStaff(context.tenantId(), practitionerId);
        LocalDate today = LocalDate.now();
        boolean employed = staff.employments().stream().anyMatch(value ->
                value.organizationId().equals(site.organizationId()) && value.sdPersonnelStatus() == PersonnelStatus.ACTIVE
                        && !value.hireDate().isAfter(today)
                        && (value.leaveDate() == null || !value.leaveDate().isBefore(today)));
        var assignment = staff.assignments().stream().filter(value -> value.id().equals(assignmentId)).findFirst()
                .orElseThrow(() -> badRequest("PHARMACY_REVIEW_ASSIGNMENT_INVALID", "审方任职不属于当前药师"));
        if (assignment.sdPositionType() != PositionType.PHARMACY) {
            throw conflict("PHARMACY_POSITION_TYPE_REQUIRED", "审方任职必须使用药学岗位");
        }
        boolean assignmentActive = assignment.organizationId().equals(site.organizationId())
                && assignment.sdPersonnelStatus() == PersonnelStatus.ACTIVE
                && !assignment.validFrom().isAfter(today)
                && (assignment.validTo() == null || !assignment.validTo().isBefore(today));
        if (!employed || !assignmentActive) {
            throw conflict("PHARMACY_REVIEWER_NOT_ACTIVE", "药师在当前机构没有有效任职");
        }
        if (context.departmentId() != null && !context.departmentId().equals(assignment.departmentId())) {
            throw badRequest("PHARMACY_REVIEW_CONTEXT_MISMATCH", "审方任职必须与当前工作科室一致");
        }
    }

    private DispensePlan plan(MedicationRequestSnapshot request,
                              CatalogLifecycleDirectory.PackageSnapshot itemPackage, boolean splitAllowed) {
        BigDecimal factor = itemPackage.quantityFactor();
        if (request.quantityUnit().equals(itemPackage.unitCode())) {
            return new DispensePlan(request.quantity(), itemPackage.unitCode(), factor, false);
        }
        BigDecimal[] division = request.baseQuantity().divideAndRemainder(factor);
        if (division[1].compareTo(BigDecimal.ZERO) == 0) {
            return new DispensePlan(division[0], itemPackage.unitCode(), factor, false);
        }
        if (!splitAllowed) throw conflict("DISPENSE_PACKAGE_QUANTITY_INCOMPATIBLE", "申请数量不能整包装换算且药房未允许拆零");
        return new DispensePlan(request.baseQuantity(), request.baseUnit(), BigDecimal.ONE, true);
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
        if (!"ACTIVE".equals(item.status()) || !item.stocked()) {
            throw conflict("STOCK_ITEM_CATALOG_NOT_STOCKABLE", "药品产品当前不可库存");
        }
        if (itemPackage == null || !"ACTIVE".equals(itemPackage.status())) {
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
                value.coldChain(), value.controlled(), value.controlLevel(), value.highAlert(), value.status());
    }

    private DispenseTaskView taskView(DispenseTask task) {
        List<DispenseTaskLineView> lines = lineRepository.findByTenantIdAndTaskIdOrderById(task.tenantId(), task.id())
                .stream().map(this::lineView).toList();
        List<PharmacyReviewView> reviews = reviewRepository.findByTenantIdAndTaskIdOrderByReviewedAt(
                task.tenantId(), task.id()).stream().map(this::reviewView).toList();
        return new DispenseTaskView(task.id(), task.revision(), task.residentId(), task.encounterId(),
                task.stockSiteId(), task.taskNo(), task.taskType(), task.priority(), task.status(),
                task.createdAt(), task.dueAt(), task.pickedAt(), task.assignedPractitionerId(),
                task.pickedByUserId(), task.pickedAssignmentId(), task.pickDescription(),
                task.description(), lines, reviews);
    }

    private DispenseTaskLineView lineView(DispenseTaskLine value) {
        return new DispenseTaskLineView(value.id(), value.requestId(), value.stockItemId(), value.packageId(),
                value.requestedQuantity(), value.plannedQuantity(), value.dispensedQuantity(),
                value.returnedQuantity(), value.dispenseUnitCode(), value.baseQuantityFactor(), value.split(),
                value.traceRequired(), value.status(), value.productCodeSnapshot(), value.productNameSnapshot(),
                value.packageSpecSnapshot(), jsonCodec.readTree(value.itemAttributeSnapshot()), value.itemAttributeHash());
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
