package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryOperationViews.RequisitionAllocationView;
import com.rhn.pharmacy.api.InventoryOperationViews.RequisitionLineView;
import com.rhn.pharmacy.api.InventoryOperationViews.RequisitionView;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.DocumentPostingLineCommand;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceMovementLine;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryDocumentEvent;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockRequisition;
import com.rhn.pharmacy.domain.StockRequisitionAllocation;
import com.rhn.pharmacy.domain.StockRequisitionLine;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.InventoryDocumentEventRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockRequisitionAllocationRepository;
import com.rhn.pharmacy.infrastructure.StockRequisitionLineRepository;
import com.rhn.pharmacy.infrastructure.StockRequisitionRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class StockRequisitionApplicationService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);
    private final StockRequisitionRepository repository;
    private final StockRequisitionLineRepository lineRepository;
    private final StockRequisitionAllocationRepository allocationRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final InventoryAvailabilityService availabilityService;
    private final InventoryDocumentEventRepository eventRepository;
    private final InventoryLedgerPostingService inventoryService;
    private final InventoryTraceApplicationService traceService;
    private final OrganizationDirectory organizationDirectory;
    private final ExecutionContextProvider contextProvider;

    public StockRequisitionApplicationService(
            StockRequisitionRepository repository, StockRequisitionLineRepository lineRepository,
            StockRequisitionAllocationRepository allocationRepository, StockSiteRepository siteRepository,
            StockItemRepository itemRepository, InventoryAvailabilityService availabilityService,
            InventoryDocumentEventRepository eventRepository, InventoryLedgerPostingService inventoryService,
            InventoryTraceApplicationService traceService,
            OrganizationDirectory organizationDirectory, ExecutionContextProvider contextProvider) {
        this.repository = repository; this.lineRepository = lineRepository; this.allocationRepository = allocationRepository;
        this.siteRepository = siteRepository; this.itemRepository = itemRepository; this.availabilityService = availabilityService;
        this.eventRepository = eventRepository; this.inventoryService = inventoryService; this.traceService = traceService;
        this.organizationDirectory = organizationDirectory; this.contextProvider = contextProvider;
    }

    @Transactional
    public RequisitionView create(CreateRequisitionCommand input) {
        ExecutionContext context = requireWorkContext();
        String requestCode = required(input.requestCode(), "REQUISITION_REQUEST_CODE_REQUIRED", "请领请求编码不能为空");
        StockRequisition existing = repository.findByTenantIdAndRequestCode(context.tenantId(), requestCode).orElse(null);
        if (existing != null) return view(context, existing);
        Long requestingDepartmentId = input.requestingDepartmentId() == null
                ? context.departmentId() : input.requestingDepartmentId();
        if (!requestingDepartmentId.equals(context.departmentId())) {
            throw badRequest("REQUISITION_REQUESTER_SCOPE_INVALID", "只能以当前工作科室发起请领");
        }
        StockSite source = requireSite(context, input.sourceSiteId(), false);
        organizationDirectory.requireDepartment(context.tenantId(), source.organizationId(), requestingDepartmentId);
        if (input.destinationSiteId() != null) {
            throw badRequest("REQUISITION_DESTINATION_USE_TRANSFER", "库存站点之间的物资移动请使用库间调拨");
        }
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest("REQUISITION_LINES_REQUIRED", "请领单至少需要一条明细");
        if (input.lines().size() > 500) throw badRequest("REQUISITION_LINES_TOO_MANY", "单张请领单不能超过500条明细");
        String no = clean(input.requisitionNo()); if (no == null) no = nextNo("REQ");
        Instant requestedAt = input.requestedAt() == null ? Instant.now() : input.requestedAt();
        StockRequisition value = new StockRequisition(context.tenantId(), source.organizationId(), source.id(),
                requestingDepartmentId, null, no, requestCode, requestedAt, clean(input.reason()),
                clean(input.description()), context.subjectId());
        Set<Long> itemIds = new HashSet<>(); int sort = 0;
        try {
            repository.save(value);
            for (RequisitionLineCommand inputLine : input.lines()) {
                if (!itemIds.add(inputLine.stockItemId())) throw badRequest("REQUISITION_ITEM_DUPLICATE", "请领明细不能包含重复经营项目");
                StockItem item = requireItem(context, inputLine.stockItemId(), source.id());
                positive(inputLine.requestedQuantity(), "REQUISITION_QUANTITY_INVALID", "请领数量必须大于零");
                lineRepository.save(new StockRequisitionLine(context.tenantId(), value.id(), ++sort, item.id(),
                        inputLine.requestedQuantity(), item.baseUnitCode(), clean(inputLine.description())));
            }
            appendEvent(context, value, "CREATED", null, value.status(), null);
            lineRepository.flush(); repository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("REQUISITION_CONCURRENT_CONFLICT", "请领单编号或请求编码发生并发冲突，请重试");
        }
        return view(context, value);
    }

    @Transactional
    public RequisitionView submit(Long id) {
        ExecutionContext context = requireWorkContext(); StockRequisition value = lock(context, id, false);
        if (!value.requestingDepartmentId().equals(context.departmentId())) {
            throw badRequest("REQUISITION_REQUESTER_SCOPE_INVALID", "只有请领科室可以提交请领单");
        }
        String from = value.status(); transition(() -> value.submit(context.subjectId()));
        appendEvent(context, value, "SUBMITTED", from, value.status(), null); return view(context, value);
    }

    @Transactional
    public RequisitionView approve(Long id, ApproveRequisitionCommand input) {
        ExecutionContext context = requireWorkContext(); StockRequisition value = lock(context, id, true);
        List<StockRequisitionLine> lines = lineRepository.lockByRequisition(context.tenantId(), id).stream()
                .sorted(Comparator.comparing(StockRequisitionLine::stockItemId)
                        .thenComparing(StockRequisitionLine::id)).toList();
        if (input.lines() == null || input.lines().size() != lines.size()) {
            throw badRequest("REQUISITION_APPROVAL_INCOMPLETE", "必须逐条审批全部请领明细");
        }
        Map<Long, BigDecimal> decisions = new HashMap<>();
        for (ApproveLineCommand decision : input.lines()) {
            if (decisions.put(decision.requisitionLineId(), decision.approvedQuantity()) != null) {
                throw badRequest("REQUISITION_APPROVAL_DUPLICATE", "请领审批明细不能重复");
            }
        }
        boolean anyApproved = false;
        for (StockRequisitionLine line : lines) {
            BigDecimal quantity = decisions.get(line.id());
            if (quantity == null) throw badRequest("REQUISITION_APPROVAL_INCOMPLETE", "存在未审批的请领明细");
            try { line.approve(quantity); } catch (IllegalStateException exception) {
                throw badRequest("REQUISITION_APPROVAL_INVALID", exception.getMessage());
            }
            anyApproved |= quantity.signum() > 0;
        }
        if (!anyApproved) throw badRequest("REQUISITION_APPROVAL_EMPTY", "至少需要批准一条请领明细；全部不批请使用驳回");
        String from = value.status(); transition(() -> value.approve(context.subjectId(), clean(input.reason())));
        appendEvent(context, value, "APPROVED", from, value.status(), clean(input.reason()));
        lineRepository.flush(); return view(context, value);
    }

    @Transactional
    public RequisitionView reject(Long id, DecisionCommand input) {
        ExecutionContext context = requireWorkContext(); StockRequisition value = lock(context, id, true);
        String reason = required(input.reason(), "REQUISITION_REJECTION_REASON_REQUIRED", "驳回请领单必须填写原因");
        String from = value.status(); transition(() -> value.reject(context.subjectId(), reason));
        appendEvent(context, value, "REJECTED", from, value.status(), reason); return view(context, value);
    }

    @Transactional
    public RequisitionView pick(Long id) {
        ExecutionContext context = requireWorkContext(); StockRequisition value = lock(context, id, true);
        if (!"APPROVED".equals(value.status())) throw conflict("REQUISITION_STATE_INVALID", "只有已审核请领单可以拣货");
        List<StockRequisitionLine> lines = lineRepository.lockByRequisition(context.tenantId(), id).stream()
                .sorted(Comparator.comparing(StockRequisitionLine::stockItemId)
                        .thenComparing(StockRequisitionLine::id)).toList();
        LocalDate businessDate = LocalDate.now();
        for (StockRequisitionLine line : lines) {
            if (!"APPROVED".equals(line.lineStatus())) continue;
            StockItem item = requireItem(context, line.stockItemId(), value.sourceSiteId());
            List<InventoryBalance> candidates = "FIFO".equals(item.issuePolicy())
                    ? availabilityService.lockIssuable(context.tenantId(), value.sourceSiteId(), item.id(), businessDate, "FIFO")
                    : availabilityService.lockIssuable(context.tenantId(), value.sourceSiteId(), item.id(), businessDate, "FEFO");
            BigDecimal remaining = line.approvedQuantity();
            for (InventoryBalance balance : candidates) {
                if (remaining.signum() == 0) break;
                BigDecimal quantity = remaining.min(balance.quantityAvailable());
                if (quantity.signum() <= 0) continue;
                balance.reserve(quantity); availabilityService.save(balance);
                allocationRepository.save(new StockRequisitionAllocation(context.tenantId(), line.id(),
                        balance.stockBinId(), balance.stockLotId(), balance.stockStatus(), quantity, context.subjectId()));
                remaining = remaining.subtract(quantity);
            }
            if (remaining.signum() > 0) throw conflict("REQUISITION_STOCK_INSUFFICIENT", "可用库存不足，无法完成全部请领明细拣货");
            line.markPicking();
        }
        String from = value.status(); transition(() -> value.markPicking(context.subjectId()));
        appendEvent(context, value, "PICKED", from, value.status(), null);
        availabilityService.flush(); allocationRepository.flush(); lineRepository.flush(); return view(context, value);
    }

    @Transactional
    public RequisitionView issue(Long id) {
        ExecutionContext context = requireWorkContext(); StockRequisition value = lock(context, id, true);
        if ("ISSUED".equals(value.status())) return view(context, value);
        if (!"PICKING".equals(value.status())) throw conflict("REQUISITION_STATE_INVALID", "只有已完成拣货的请领单可以出库");
        List<StockRequisitionLine> lines = lineRepository.lockByRequisition(context.tenantId(), id);
        List<DocumentPostingLineCommand> postingLines = new ArrayList<>();
        for (StockRequisitionLine line : lines) {
            if (!"PICKING".equals(line.lineStatus())) continue;
            List<StockRequisitionAllocation> allocations = allocationRepository
                    .findByTenantIdAndStockRequisitionLineIdOrderByCreatedAt(context.tenantId(), line.id());
            BigDecimal allocated = allocations.stream().map(StockRequisitionAllocation::allocatedQuantity)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            if (allocated.compareTo(line.approvedQuantity()) != 0) throw conflict("REQUISITION_ALLOCATION_INCOMPLETE", "请领分配数量与批准数量不一致");
            for (StockRequisitionAllocation allocation : allocations) {
                if (!"ALLOCATED".equals(allocation.status())) throw conflict("REQUISITION_ALLOCATION_STATE_INVALID", "请领分配明细已处理");
                postingLines.add(new DocumentPostingLineCommand(allocation.stockBinId(), line.stockItemId(),
                        allocation.stockLotId(), allocation.stockStatus(), allocation.allocatedQuantity().negate(),
                        null, true));
            }
        }
        var transaction = inventoryService.postDocument(new DocumentPostingCommand(value.requestCode() + ":ISSUE",
                "ISSUE", "STOCK_REQUISITION", value.requisitionNo(), value.sourceSiteId(), Instant.now(),
                "科室请领出库", postingLines));
        List<TraceMovementLine> traceLines = new ArrayList<>();
        for (StockRequisitionLine line : lines) {
            if (!"PICKING".equals(line.lineStatus())) continue;
            allocationRepository.findByTenantIdAndStockRequisitionLineIdOrderByCreatedAt(context.tenantId(), line.id())
                    .forEach(allocation -> traceLines.add(new TraceMovementLine(line.stockItemId(),
                            allocation.stockLotId(), allocation.allocatedQuantity())));
        }
        traceService.issue(context, value.sourceSiteId(), "STOCK_REQUISITION", value.id(),
                value.requisitionNo(), traceLines);
        for (StockRequisitionLine line : lines) {
            if (!"PICKING".equals(line.lineStatus())) continue;
            allocationRepository.findByTenantIdAndStockRequisitionLineIdOrderByCreatedAt(context.tenantId(), line.id())
                    .forEach(StockRequisitionAllocation::markIssued);
            line.markIssued();
        }
        String from = value.status(); transition(() -> value.markIssued(context.subjectId(), transaction.id()));
        appendEvent(context, value, "ISSUED", from, value.status(), null);
        allocationRepository.flush(); lineRepository.flush(); repository.flush(); return view(context, value);
    }

    @Transactional(readOnly = true)
    public List<RequisitionView> list(Long sourceSiteId) {
        ExecutionContext context = requireWorkContext(); requireSite(context, sourceSiteId, true);
        return repository.findByTenantIdAndSourceSiteIdOrderByRequestedAtDesc(context.tenantId(), sourceSiteId)
                .stream().map(value -> view(context, value)).toList();
    }

    private StockRequisition lock(ExecutionContext context, Long id, boolean sourceOperator) {
        StockRequisition value = repository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("REQUISITION_NOT_FOUND", "未找到请领单"));
        requireSite(context, value.sourceSiteId(), sourceOperator); return value;
    }
    private StockSite requireSite(ExecutionContext context, Long id, boolean currentDepartmentRequired) {
        StockSite value = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        if (!context.canAccessOrganization(value.organizationId())) throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "当前上下文不能访问该机构库存");
        if (currentDepartmentRequired && value.departmentId() != null && !value.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室不是请领单的出库科室");
        }
        return value;
    }
    private StockItem requireItem(ExecutionContext context, Long id, Long siteId) {
        StockItem value = itemRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库房经营项目"));
        if (!siteId.equals(value.stockSiteId())) throw badRequest("STOCK_ITEM_SITE_MISMATCH", "经营项目不属于请领来源库房");
        return value;
    }
    private void appendEvent(ExecutionContext context, StockRequisition value, String type,
                             String from, String to, String reason) {
        eventRepository.save(new InventoryDocumentEvent(context.tenantId(), value.organizationId(), "REQUISITION",
                value.id(), value.requisitionNo(), type, from, to, context.subjectId(), reason, value.requestCode()));
    }
    private RequisitionView view(ExecutionContext context, StockRequisition value) {
        List<RequisitionLineView> lines = lineRepository.findByTenantIdAndStockRequisitionIdOrderBySortOrder(
                context.tenantId(), value.id()).stream().map(line -> new RequisitionLineView(line.id(), line.revision(),
                line.sortOrder(), line.stockItemId(), line.requestedQuantity(), line.approvedQuantity(),
                line.issuedQuantity(), line.baseUnitCode(), line.lineStatus(), line.description(),
                allocationRepository.findByTenantIdAndStockRequisitionLineIdOrderByCreatedAt(context.tenantId(), line.id())
                        .stream().map(allocation -> new RequisitionAllocationView(allocation.id(),
                                allocation.stockRequisitionLineId(), allocation.stockBinId(), allocation.stockLotId(),
                                allocation.stockStatus(), allocation.allocatedQuantity(), allocation.issuedQuantity(),
                                allocation.status())).toList())).toList();
        return new RequisitionView(value.id(), value.revision(), value.organizationId(), value.sourceSiteId(),
                value.requestingDepartmentId(), value.destinationSiteId(), value.requisitionNo(), value.requestCode(),
                value.status(), value.requestedAt(), value.requestedBy(), value.approvedAt(), value.approvedBy(),
                value.pickedAt(), value.pickedBy(), value.issuedAt(), value.issuedBy(), value.reason(),
                value.description(), value.inventoryTransactionId(), lines);
    }
    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存操作必须选择工作机构和科室");
        return context;
    }
    private void transition(Runnable action) {
        try { action.run(); } catch (IllegalStateException exception) { throw conflict("REQUISITION_STATE_INVALID", exception.getMessage()); }
    }
    private void positive(BigDecimal value, String code, String message) { if (value == null || value.signum() <= 0) throw badRequest(code, message); }
    private String required(String value, String code, String message) { String result = clean(value); if (result == null) throw badRequest(code, message); return result; }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String nextNo(String prefix) { return prefix + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6); }

    public record RequisitionLineCommand(Long stockItemId, BigDecimal requestedQuantity, String description) {}
    public record CreateRequisitionCommand(Long sourceSiteId, Long requestingDepartmentId, Long destinationSiteId,
                                           String requisitionNo, String requestCode, Instant requestedAt,
                                           String reason, String description, List<RequisitionLineCommand> lines) {}
    public record ApproveLineCommand(Long requisitionLineId, BigDecimal approvedQuantity) {}
    public record ApproveRequisitionCommand(String reason, List<ApproveLineCommand> lines) {}
    public record DecisionCommand(String reason) {}
}
