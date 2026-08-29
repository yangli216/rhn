package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryOperationViews.DocumentEventView;
import com.rhn.pharmacy.api.InventoryOperationViews.GoodsReceiptLineView;
import com.rhn.pharmacy.api.InventoryOperationViews.GoodsReceiptView;
import com.rhn.pharmacy.api.InventoryOperationViews.PurchaseOrderLineView;
import com.rhn.pharmacy.api.InventoryOperationViews.PurchaseOrderView;
import com.rhn.pharmacy.api.InventoryOperationViews.SupplierSupplyItemView;
import com.rhn.pharmacy.api.InventoryOperationViews.SupplierView;
import com.rhn.pharmacy.application.InventoryApplicationService.CreateLotCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveDocumentCommand;
import com.rhn.pharmacy.application.InventoryApplicationService.ReceiveDocumentLineCommand;
import com.rhn.pharmacy.domain.GoodsReceipt;
import com.rhn.pharmacy.domain.GoodsReceiptLine;
import com.rhn.pharmacy.domain.InventoryDocumentEvent;
import com.rhn.pharmacy.domain.PurchaseOrder;
import com.rhn.pharmacy.domain.PurchaseOrderLine;
import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.domain.Supplier;
import com.rhn.pharmacy.domain.SupplierSupplyItem;
import com.rhn.pharmacy.infrastructure.GoodsReceiptLineRepository;
import com.rhn.pharmacy.infrastructure.GoodsReceiptRepository;
import com.rhn.pharmacy.infrastructure.InventoryDocumentEventRepository;
import com.rhn.pharmacy.infrastructure.PurchaseOrderLineRepository;
import com.rhn.pharmacy.infrastructure.PurchaseOrderRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.pharmacy.infrastructure.SupplierRepository;
import com.rhn.pharmacy.infrastructure.SupplierSupplyItemRepository;
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
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryOperationApplicationService {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);
    private static final Set<String> OPEN_RECEIPT_STATUSES = Set.of(
            "RECEIVED", "INSPECTING", "ACCEPTED", "PARTIALLY_ACCEPTED");

    private final SupplierRepository supplierRepository;
    private final SupplierSupplyItemRepository supplyItemRepository;
    private final PurchaseOrderRepository orderRepository;
    private final PurchaseOrderLineRepository orderLineRepository;
    private final GoodsReceiptRepository receiptRepository;
    private final GoodsReceiptLineRepository receiptLineRepository;
    private final InventoryDocumentEventRepository eventRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository stockItemRepository;
    private final StockBinRepository binRepository;
    private final InventoryApplicationService inventoryService;
    private final InventoryTraceApplicationService traceService;
    private final ExecutionContextProvider contextProvider;

    public InventoryOperationApplicationService(
            SupplierRepository supplierRepository, SupplierSupplyItemRepository supplyItemRepository,
            PurchaseOrderRepository orderRepository, PurchaseOrderLineRepository orderLineRepository,
            GoodsReceiptRepository receiptRepository, GoodsReceiptLineRepository receiptLineRepository,
            InventoryDocumentEventRepository eventRepository, StockSiteRepository siteRepository,
            StockItemRepository stockItemRepository, StockBinRepository binRepository,
            InventoryApplicationService inventoryService, InventoryTraceApplicationService traceService,
            ExecutionContextProvider contextProvider) {
        this.supplierRepository = supplierRepository; this.supplyItemRepository = supplyItemRepository;
        this.orderRepository = orderRepository; this.orderLineRepository = orderLineRepository;
        this.receiptRepository = receiptRepository; this.receiptLineRepository = receiptLineRepository;
        this.eventRepository = eventRepository; this.siteRepository = siteRepository;
        this.stockItemRepository = stockItemRepository; this.binRepository = binRepository;
        this.inventoryService = inventoryService; this.traceService = traceService; this.contextProvider = contextProvider;
    }

    @Transactional
    public SupplierView createSupplier(CreateSupplierCommand input) {
        ExecutionContext context = requireWorkContext();
        Long organizationId = input.organizationId() == null ? context.organizationId() : input.organizationId();
        requireOrganizationAccess(context, organizationId);
        String code = required(input.code(), "SUPPLIER_CODE_REQUIRED", "供应商编码不能为空");
        String name = required(input.name(), "SUPPLIER_NAME_REQUIRED", "供应商名称不能为空");
        LocalDate validFrom = input.validFrom() == null ? LocalDate.now() : input.validFrom();
        if (input.validTo() != null && input.validTo().isBefore(validFrom)) {
            throw badRequest("SUPPLIER_VALIDITY_INVALID", "供应商有效期结束日期不能早于开始日期");
        }
        if (supplierRepository.findByTenantIdAndOrganizationIdAndCode(context.tenantId(), organizationId, code).isPresent()) {
            throw conflict("SUPPLIER_CODE_DUPLICATE", "当前机构已存在相同供应商编码");
        }
        Supplier value = supplierRepository.saveAndFlush(new Supplier(context.tenantId(), organizationId,
                code, name, clean(input.unifiedCreditCode()), clean(input.licenseNo()), input.licenseValidTo(),
                clean(input.contactName()), clean(input.contactPhone()), validFrom, input.validTo(), context.subjectId()));
        return supplierView(value);
    }

    @Transactional(readOnly = true)
    public List<SupplierView> suppliers(Long organizationId) {
        ExecutionContext context = requireWorkContext();
        Long scopedOrganization = organizationId == null ? context.organizationId() : organizationId;
        requireOrganizationAccess(context, scopedOrganization);
        return supplierRepository.findByTenantIdAndOrganizationIdOrderByName(context.tenantId(), scopedOrganization)
                .stream().map(this::supplierView).toList();
    }

    @Transactional
    public SupplierSupplyItemView createSupplyItem(Long supplierId, CreateSupplyItemCommand input) {
        ExecutionContext context = requireWorkContext(); Supplier supplier = requireSupplier(context, supplierId);
        LocalDate validFrom = input.validFrom() == null ? LocalDate.now() : input.validFrom();
        validateMoney(input.agreementPrice(), "SUPPLIER_ITEM_PRICE_INVALID", "供应协议价不能小于零");
        validateTax(input.taxRate());
        if (input.validTo() != null && input.validTo().isBefore(validFrom)) {
            throw badRequest("SUPPLIER_ITEM_VALIDITY_INVALID", "供货项目有效期结束日期不能早于开始日期");
        }
        if (supplyItemRepository.findByTenantIdAndSupplierIdAndCatalogItemIdAndPackageId(context.tenantId(),
                supplier.id(), input.catalogItemId(), input.packageId()).isPresent()) {
            throw conflict("SUPPLIER_ITEM_DUPLICATE", "当前供应商已维护相同产品包装");
        }
        SupplierSupplyItem value = supplyItemRepository.saveAndFlush(new SupplierSupplyItem(context.tenantId(),
                supplier.id(), input.catalogItemId(), input.packageId(), input.agreementPrice(), input.taxRate(),
                validFrom, input.validTo(), context.subjectId()));
        return supplyItemView(value);
    }

    @Transactional(readOnly = true)
    public List<SupplierSupplyItemView> supplyItems(Long supplierId) {
        ExecutionContext context = requireWorkContext(); Supplier supplier = requireSupplier(context, supplierId);
        return supplyItemRepository.findByTenantIdAndSupplierIdOrderById(context.tenantId(), supplier.id())
                .stream().map(this::supplyItemView).toList();
    }

    @Transactional
    public PurchaseOrderView createPurchaseOrder(CreatePurchaseOrderCommand input) {
        ExecutionContext context = requireWorkContext();
        String requestCode = required(input.requestCode(), "PURCHASE_REQUEST_CODE_REQUIRED", "采购请求编码不能为空");
        PurchaseOrder existing = orderRepository.findByTenantIdAndRequestCode(context.tenantId(), requestCode).orElse(null);
        if (existing != null) {
            if (!existing.stockSiteId().equals(input.stockSiteId()) || !existing.supplierId().equals(input.supplierId())) {
                throw conflict("PURCHASE_REQUEST_CODE_REUSED", "采购请求编码已被其他采购内容使用");
            }
            return orderView(context, existing);
        }
        StockSite site = requireSite(context, input.stockSiteId()); Supplier supplier = requireSupplier(context, input.supplierId());
        if (!site.organizationId().equals(supplier.organizationId())) {
            throw badRequest("PURCHASE_SUPPLIER_ORG_MISMATCH", "供应商与采购库房不属于同一机构");
        }
        LocalDate orderDate = input.orderDate() == null ? LocalDate.now() : input.orderDate();
        if (!supplier.effective(orderDate)) throw conflict("SUPPLIER_NOT_EFFECTIVE", "供应商资质无效、已过期或已停用");
        if (input.expectedDate() != null && input.expectedDate().isBefore(orderDate)) {
            throw badRequest("PURCHASE_EXPECTED_DATE_INVALID", "预计到货日期不能早于采购日期");
        }
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest("PURCHASE_LINES_REQUIRED", "采购单至少需要一条明细");
        if (input.lines().size() > 500) throw badRequest("PURCHASE_LINES_TOO_MANY", "单张采购单不能超过500条明细");
        String orderNo = clean(input.orderNo()); if (orderNo == null) orderNo = nextNo("PO");
        PurchaseOrder value = new PurchaseOrder(context.tenantId(), site.organizationId(), site.id(), supplier.id(),
                orderNo, requestCode, orderDate, input.expectedDate(), clean(input.description()), context.subjectId());
        Set<Long> itemIds = new HashSet<>(); int sortOrder = 0;
        try {
            orderRepository.save(value);
            for (PurchaseLineCommand line : input.lines()) {
                if (!itemIds.add(line.stockItemId())) throw badRequest("PURCHASE_ITEM_DUPLICATE", "采购单不能包含重复经营项目");
                StockItem item = requireStockItem(context, line.stockItemId(), site.id());
                if (!item.basePackageId().equals(line.packageId())) {
                    throw badRequest("PURCHASE_PACKAGE_MISMATCH", "采购包装与库房经营项目包装不一致");
                }
                positive(line.orderedQuantity(), "PURCHASE_QUANTITY_INVALID", "采购数量必须大于零");
                validateMoney(line.unitPrice(), "PURCHASE_PRICE_INVALID", "采购单价不能小于零"); validateTax(line.taxRate());
                SupplierSupplyItem supply = supplyItemRepository
                        .findByTenantIdAndSupplierIdAndCatalogItemIdAndPackageId(context.tenantId(), supplier.id(),
                                item.catalogItemId(), line.packageId())
                        .orElseThrow(() -> conflict("SUPPLIER_ITEM_NOT_CONFIGURED", "供应商未维护当前产品包装的供货资质"));
                if (!supply.effective(orderDate)) throw conflict("SUPPLIER_ITEM_NOT_EFFECTIVE", "供应商供货项目当前无效");
                orderLineRepository.save(new PurchaseOrderLine(context.tenantId(), value.id(), ++sortOrder,
                        item.id(), line.packageId(), line.orderedQuantity(), line.unitPrice(), line.taxRate(),
                        clean(line.description())));
            }
            appendEvent(context, "PURCHASE_ORDER", value.id(), value.orderNo(), "CREATED", null,
                    value.status(), null, value.requestCode());
            orderLineRepository.flush(); orderRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("PURCHASE_ORDER_CONCURRENT_CONFLICT", "采购单编号或请求编码发生并发冲突，请重试");
        }
        return orderView(context, value);
    }

    @Transactional(readOnly = true)
    public List<PurchaseOrderView> purchaseOrders(Long siteId) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        return orderRepository.findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(context.tenantId(), site.id())
                .stream().map(value -> orderView(context, value)).toList();
    }

    @Transactional
    public PurchaseOrderView submitPurchaseOrder(Long orderId) {
        ExecutionContext context = requireWorkContext(); PurchaseOrder value = lockOrder(context, orderId);
        if (orderLineRepository.findByTenantIdAndPurchaseOrderIdOrderBySortOrder(context.tenantId(), orderId).isEmpty()) {
            throw conflict("PURCHASE_LINES_REQUIRED", "无采购明细的采购单不能提交");
        }
        String from = value.status(); transition(() -> value.submit(context.subjectId()));
        appendEvent(context, "PURCHASE_ORDER", value.id(), value.orderNo(), "SUBMITTED", from,
                value.status(), null, value.requestCode());
        return orderView(context, value);
    }

    @Transactional
    public PurchaseOrderView approvePurchaseOrder(Long orderId, DecisionCommand input) {
        ExecutionContext context = requireWorkContext(); PurchaseOrder value = lockOrder(context, orderId);
        Supplier supplier = requireSupplier(context, value.supplierId());
        if (!supplier.effective(LocalDate.now())) throw conflict("SUPPLIER_NOT_EFFECTIVE", "审批时供应商资质已无效");
        String from = value.status(); transition(() -> value.approve(context.subjectId(), clean(input.reason())));
        appendEvent(context, "PURCHASE_ORDER", value.id(), value.orderNo(), "APPROVED", from,
                value.status(), clean(input.reason()), value.requestCode());
        return orderView(context, value);
    }

    @Transactional
    public PurchaseOrderView rejectPurchaseOrder(Long orderId, DecisionCommand input) {
        ExecutionContext context = requireWorkContext(); PurchaseOrder value = lockOrder(context, orderId);
        String reason = required(input.reason(), "PURCHASE_REJECTION_REASON_REQUIRED", "驳回采购单必须填写原因");
        String from = value.status(); transition(() -> value.reject(context.subjectId(), reason));
        appendEvent(context, "PURCHASE_ORDER", value.id(), value.orderNo(), "REJECTED", from,
                value.status(), reason, value.requestCode());
        return orderView(context, value);
    }

    @Transactional
    public GoodsReceiptView createGoodsReceipt(CreateGoodsReceiptCommand input) {
        ExecutionContext context = requireWorkContext();
        String requestCode = required(input.requestCode(), "GOODS_RECEIPT_REQUEST_REQUIRED", "到货请求编码不能为空");
        GoodsReceipt existing = receiptRepository.findByTenantIdAndRequestCode(context.tenantId(), requestCode).orElse(null);
        if (existing != null) {
            if (!existing.purchaseOrderId().equals(input.purchaseOrderId())) {
                throw conflict("GOODS_RECEIPT_REQUEST_REUSED", "到货请求编码已被其他采购单使用");
            }
            return receiptView(context, existing);
        }
        PurchaseOrder order = lockOrder(context, input.purchaseOrderId());
        if (!Set.of("APPROVED", "PARTIALLY_RECEIVED").contains(order.status())) {
            throw conflict("PURCHASE_ORDER_NOT_RECEIVABLE", "只有审批通过且未完成的采购单可以登记到货");
        }
        Supplier supplier = requireSupplier(context, order.supplierId()); LocalDate today = LocalDate.now();
        if (!supplier.effective(today)) throw conflict("SUPPLIER_NOT_EFFECTIVE", "到货时供应商资质已无效");
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest("GOODS_RECEIPT_LINES_REQUIRED", "到货单至少需要一条明细");
        if (input.lines().size() > 500) throw badRequest("GOODS_RECEIPT_LINES_TOO_MANY", "单张到货单不能超过500条明细");
        Map<Long, PurchaseOrderLine> orderLines = new HashMap<>();
        orderLineRepository.lockByPurchaseOrder(context.tenantId(), order.id()).forEach(line -> orderLines.put(line.id(), line));
        Map<Long, BigDecimal> outstanding = outstandingReceiptQuantities(context, order.id());
        String receiptNo = clean(input.receiptNo()); if (receiptNo == null) receiptNo = nextNo("GR");
        Instant receivedAt = input.receivedAt() == null ? Instant.now() : input.receivedAt();
        GoodsReceipt receipt = new GoodsReceipt(context.tenantId(), order.organizationId(), order.stockSiteId(),
                order.id(), order.supplierId(), receiptNo, requestCode, clean(input.deliveryNoteNo()), receivedAt,
                clean(input.description()), context.subjectId());
        Set<Long> seenOrderLines = new HashSet<>(); int sortOrder = 0;
        try {
            receiptRepository.save(receipt);
            for (GoodsReceiptLineCommand inputLine : input.lines()) {
                if (!seenOrderLines.add(inputLine.purchaseOrderLineId())) {
                    throw badRequest("GOODS_RECEIPT_LINE_DUPLICATE", "同一采购明细不能在到货单中重复登记");
                }
                PurchaseOrderLine orderLine = orderLines.get(inputLine.purchaseOrderLineId());
                if (orderLine == null) throw badRequest("PURCHASE_LINE_NOT_FOUND", "到货明细不属于当前采购单");
                positive(inputLine.deliveredQuantity(), "GOODS_RECEIPT_QUANTITY_INVALID", "到货数量必须大于零");
                BigDecimal available = orderLine.remainingQuantity().subtract(
                        outstanding.getOrDefault(orderLine.id(), BigDecimal.ZERO));
                if (inputLine.deliveredQuantity().compareTo(available) > 0) {
                    throw conflict("GOODS_RECEIPT_OVER_DELIVERY", "到货数量超过采购明细剩余可到货数量");
                }
                StockBin bin = requireBin(context, inputLine.destinationBinId(), order.stockSiteId());
                if (!bin.active() || !bin.receiveAllowed()) throw conflict("STOCK_BIN_NOT_RECEIVABLE", "目标货位未开放收货");
                String lotNo = required(inputLine.lotNo(), "GOODS_RECEIPT_LOT_REQUIRED", "到货批号不能为空");
                if (inputLine.expiryDate() != null && inputLine.productionDate() != null
                        && inputLine.expiryDate().isBefore(inputLine.productionDate())) {
                    throw badRequest("GOODS_RECEIPT_DATE_INVALID", "有效期不能早于生产日期");
                }
                BigDecimal unitCost = inputLine.unitCost() == null ? orderLine.unitPrice() : inputLine.unitCost();
                validateMoney(unitCost, "GOODS_RECEIPT_COST_INVALID", "到货单位成本不能小于零");
                receiptLineRepository.save(new GoodsReceiptLine(context.tenantId(), receipt.id(), orderLine.id(),
                        ++sortOrder, orderLine.stockItemId(), orderLine.packageId(), bin.id(), lotNo,
                        inputLine.productionDate(), inputLine.expiryDate(), inputLine.deliveredQuantity(), unitCost));
            }
            appendEvent(context, "GOODS_RECEIPT", receipt.id(), receipt.receiptNo(), "RECEIVED", null,
                    receipt.status(), null, receipt.requestCode());
            receiptLineRepository.flush(); receiptRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("GOODS_RECEIPT_CONCURRENT_CONFLICT", "到货单编号或请求编码发生并发冲突，请重试");
        }
        return receiptView(context, receipt);
    }

    @Transactional(readOnly = true)
    public List<GoodsReceiptView> goodsReceipts(Long siteId) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        return receiptRepository.findByTenantIdAndStockSiteIdOrderByCreatedAtDesc(context.tenantId(), site.id())
                .stream().map(value -> receiptView(context, value)).toList();
    }

    @Transactional
    public GoodsReceiptView inspectGoodsReceipt(Long receiptId, InspectGoodsReceiptCommand input) {
        ExecutionContext context = requireWorkContext(); GoodsReceipt receipt = lockReceipt(context, receiptId);
        if (!"RECEIVED".equals(receipt.status())) throw conflict("GOODS_RECEIPT_STATE_INVALID", "只有待验收的到货单可以验收");
        List<GoodsReceiptLine> lines = receiptLineRepository.lockByReceipt(context.tenantId(), receipt.id());
        if (input.lines() == null || input.lines().size() != lines.size()) {
            throw badRequest("GOODS_RECEIPT_INSPECTION_INCOMPLETE", "必须逐条完成全部到货明细的验收判定");
        }
        Map<Long, InspectLineCommand> decisions = new HashMap<>();
        for (InspectLineCommand decision : input.lines()) {
            if (decisions.put(decision.goodsReceiptLineId(), decision) != null) {
                throw badRequest("GOODS_RECEIPT_INSPECTION_DUPLICATE", "验收明细不能重复");
            }
        }
        String from = receipt.status(); transition(() -> receipt.beginInspection(context.subjectId()));
        boolean anyAccepted = false; boolean anyRejected = false;
        for (GoodsReceiptLine line : lines) {
            InspectLineCommand decision = decisions.get(line.id());
            if (decision == null) throw badRequest("GOODS_RECEIPT_INSPECTION_INCOMPLETE", "存在未验收的到货明细");
            try { line.inspect(decision.acceptedQuantity(), decision.rejectedQuantity(), clean(decision.rejectionReason())); }
            catch (IllegalStateException exception) { throw badRequest("GOODS_RECEIPT_INSPECTION_INVALID", exception.getMessage()); }
            anyAccepted |= decision.acceptedQuantity().signum() > 0;
            anyRejected |= decision.rejectedQuantity().signum() > 0;
        }
        boolean accepted = anyAccepted; boolean rejected = anyRejected;
        transition(() -> receipt.completeInspection(accepted, rejected, context.subjectId()));
        appendEvent(context, "GOODS_RECEIPT", receipt.id(), receipt.receiptNo(), "INSPECTED", from,
                receipt.status(), clean(input.description()), receipt.requestCode());
        receiptLineRepository.flush(); receiptRepository.flush();
        return receiptView(context, receipt);
    }

    @Transactional
    public GoodsReceiptView postGoodsReceipt(Long receiptId) {
        ExecutionContext context = requireWorkContext(); GoodsReceipt receipt = lockReceipt(context, receiptId);
        if ("POSTED".equals(receipt.status())) return receiptView(context, receipt);
        if (!Set.of("ACCEPTED", "PARTIALLY_ACCEPTED").contains(receipt.status())) {
            throw conflict("GOODS_RECEIPT_NOT_POSTABLE", "只有验收合格或部分合格的到货单可以批量入库");
        }
        PurchaseOrder order = lockOrder(context, receipt.purchaseOrderId());
        Map<Long, PurchaseOrderLine> orderLines = new HashMap<>();
        orderLineRepository.lockByPurchaseOrder(context.tenantId(), order.id()).forEach(line -> orderLines.put(line.id(), line));
        List<GoodsReceiptLine> lines = receiptLineRepository.lockByReceipt(context.tenantId(), receipt.id());
        traceService.validateReceiptPosting(context, receipt, lines);
        Map<Long, Long> lotIds = new HashMap<>();
        List<ReceiveDocumentLineCommand> postingLines = new java.util.ArrayList<>();
        for (GoodsReceiptLine line : lines) {
            if (line.acceptedQuantity() == null || line.rejectedQuantity() == null
                    || line.acceptedQuantity().add(line.rejectedQuantity()).compareTo(line.deliveredQuantity()) != 0) {
                throw conflict("GOODS_RECEIPT_INSPECTION_INCOMPLETE", "到货单存在未完成验收的明细");
            }
            if (line.acceptedQuantity().signum() == 0) continue;
            var lot = inventoryService.createLot(line.stockItemId(), new CreateLotCommand(line.lotNo(),
                    line.productionDate(), line.expiryDate(), null, null, "QUALIFIED"));
            lotIds.put(line.id(), lot.id());
            postingLines.add(new ReceiveDocumentLineCommand(line.stockItemId(), line.destinationBinId(), lot.id(),
                    line.acceptedQuantity(), line.unitCost()));
        }
        if (postingLines.isEmpty()) throw conflict("GOODS_RECEIPT_NOT_POSTABLE", "到货单没有可入库的合格数量");
        var transaction = inventoryService.receiveDocument("GOODS_RECEIPT", new ReceiveDocumentCommand(
                receipt.requestCode() + ":POST", receipt.receiptNo(), receipt.stockSiteId(), receipt.receivedAt(),
                "采购到货验收批量入库", postingLines));
        traceService.activateReceiptCodes(context, receipt, lines, lotIds);
        for (GoodsReceiptLine line : lines) {
            if (line.acceptedQuantity().signum() == 0) continue;
            line.markPosted(lotIds.get(line.id()), transaction.id());
            PurchaseOrderLine orderLine = orderLines.get(line.purchaseOrderLineId());
            if (orderLine == null) throw conflict("PURCHASE_LINE_NOT_FOUND", "采购明细已不存在，无法入库");
            try { orderLine.recordReceipt(line.acceptedQuantity()); }
            catch (IllegalStateException exception) { throw conflict("GOODS_RECEIPT_OVER_DELIVERY", exception.getMessage()); }
        }
        boolean complete = orderLines.values().stream().allMatch(line -> "COMPLETED".equals(line.lineStatus()));
        String receiptFrom = receipt.status(); String orderFrom = order.status();
        transition(() -> receipt.markPosted(context.subjectId()));
        transition(() -> order.updateReceiptProgress(complete, context.subjectId()));
        appendEvent(context, "GOODS_RECEIPT", receipt.id(), receipt.receiptNo(), "POSTED", receiptFrom,
                receipt.status(), null, receipt.requestCode());
        appendEvent(context, "PURCHASE_ORDER", order.id(), order.orderNo(), "RECEIPT_POSTED", orderFrom,
                order.status(), null, receipt.requestCode());
        receiptLineRepository.flush(); orderLineRepository.flush(); receiptRepository.flush(); orderRepository.flush();
        return receiptView(context, receipt);
    }

    @Transactional(readOnly = true)
    public List<DocumentEventView> documentEvents(String documentType, Long documentId) {
        ExecutionContext context = requireWorkContext(); String type = required(documentType,
                "DOCUMENT_TYPE_REQUIRED", "单据类型不能为空").toUpperCase();
        return eventRepository.findByTenantIdAndDocumentTypeAndDocumentIdOrderByOccurredAt(
                context.tenantId(), type, documentId).stream().map(this::eventView).toList();
    }

    private Map<Long, BigDecimal> outstandingReceiptQuantities(ExecutionContext context, Long orderId) {
        Map<Long, BigDecimal> result = new HashMap<>();
        for (GoodsReceipt receipt : receiptRepository.findByTenantIdAndPurchaseOrderIdOrderByCreatedAt(
                context.tenantId(), orderId)) {
            if (!OPEN_RECEIPT_STATUSES.contains(receipt.status())) continue;
            for (GoodsReceiptLine line : receiptLineRepository.findByTenantIdAndGoodsReceiptIdOrderBySortOrder(
                    context.tenantId(), receipt.id())) {
                result.merge(line.purchaseOrderLineId(), line.deliveredQuantity(), BigDecimal::add);
            }
        }
        return result;
    }

    private void appendEvent(ExecutionContext context, String documentType, Long documentId, String documentNo,
                             String eventType, String fromStatus, String toStatus, String reason, String correlationId) {
        eventRepository.save(new InventoryDocumentEvent(context.tenantId(), context.organizationId(), documentType,
                documentId, documentNo, eventType, fromStatus, toStatus, context.subjectId(), reason, correlationId));
    }

    private PurchaseOrder lockOrder(ExecutionContext context, Long id) {
        PurchaseOrder value = orderRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PURCHASE_ORDER_NOT_FOUND", "未找到采购单"));
        requireSite(context, value.stockSiteId()); return value;
    }

    private GoodsReceipt lockReceipt(ExecutionContext context, Long id) {
        GoodsReceipt value = receiptRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("GOODS_RECEIPT_NOT_FOUND", "未找到到货验收单"));
        requireSite(context, value.stockSiteId()); return value;
    }

    private Supplier requireSupplier(ExecutionContext context, Long id) {
        Supplier value = supplierRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("SUPPLIER_NOT_FOUND", "未找到供应商"));
        requireOrganizationAccess(context, value.organizationId()); return value;
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite value = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        requireOrganizationAccess(context, value.organizationId());
        if (value.departmentId() != null && !value.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点所属科室不一致");
        }
        if (!value.effective(LocalDate.now())) throw conflict("STOCK_SITE_NOT_EFFECTIVE", "库存站点当前未启用");
        return value;
    }

    private StockItem requireStockItem(ExecutionContext context, Long id, Long siteId) {
        StockItem value = stockItemRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库房经营项目"));
        if (!siteId.equals(value.stockSiteId())) throw badRequest("STOCK_ITEM_SITE_MISMATCH", "经营项目不属于当前库房");
        if (!"ACTIVE".equals(value.status())) throw conflict("STOCK_ITEM_NOT_ACTIVE", "库房经营项目未启用");
        return value;
    }

    private StockBin requireBin(ExecutionContext context, Long id, Long siteId) {
        StockBin value = binRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位"));
        if (!siteId.equals(value.stockSiteId())) throw badRequest("STOCK_BIN_SITE_MISMATCH", "库存货位不属于当前库房");
        return value;
    }

    private PurchaseOrderView orderView(ExecutionContext context, PurchaseOrder value) {
        List<PurchaseOrderLineView> lines = orderLineRepository
                .findByTenantIdAndPurchaseOrderIdOrderBySortOrder(context.tenantId(), value.id())
                .stream().map(this::orderLineView).toList();
        return new PurchaseOrderView(value.id(), value.revision(), value.organizationId(), value.stockSiteId(),
                value.supplierId(), value.orderNo(), value.requestCode(), value.status(), value.orderDate(),
                value.expectedDate(), value.submittedAt(), value.submittedBy(), value.approvedAt(), value.approvedBy(),
                value.approvalReason(), value.description(), value.createdAt(), value.createdBy(), value.updatedAt(),
                value.updatedBy(), lines);
    }

    private PurchaseOrderLineView orderLineView(PurchaseOrderLine value) {
        return new PurchaseOrderLineView(value.id(), value.revision(), value.sortOrder(), value.stockItemId(),
                value.packageId(), value.orderedQuantity(), value.receivedQuantity(), value.remainingQuantity(),
                value.unitPrice(), value.taxRate(), value.lineStatus(), value.description());
    }

    private GoodsReceiptView receiptView(ExecutionContext context, GoodsReceipt value) {
        List<GoodsReceiptLineView> lines = receiptLineRepository
                .findByTenantIdAndGoodsReceiptIdOrderBySortOrder(context.tenantId(), value.id())
                .stream().map(this::receiptLineView).toList();
        return new GoodsReceiptView(value.id(), value.revision(), value.organizationId(), value.stockSiteId(),
                value.purchaseOrderId(), value.supplierId(), value.receiptNo(), value.requestCode(),
                value.deliveryNoteNo(), value.status(), value.receivedAt(), value.receivedBy(), value.inspectedAt(),
                value.inspectedBy(), value.postedAt(), value.postedBy(), value.description(), value.createdAt(),
                value.createdBy(), value.updatedAt(), value.updatedBy(), lines);
    }

    private GoodsReceiptLineView receiptLineView(GoodsReceiptLine value) {
        return new GoodsReceiptLineView(value.id(), value.revision(), value.purchaseOrderLineId(), value.sortOrder(),
                value.stockItemId(), value.packageId(), value.destinationBinId(), value.lotNo(), value.productionDate(),
                value.expiryDate(), value.deliveredQuantity(), value.acceptedQuantity(), value.rejectedQuantity(),
                value.unitCost(), value.qualityStatus(), value.rejectionReason(), value.stockLotId(),
                value.inventoryTransactionId());
    }

    private SupplierView supplierView(Supplier value) {
        return new SupplierView(value.id(), value.revision(), value.organizationId(), value.code(), value.name(),
                value.unifiedCreditCode(), value.licenseNo(), value.licenseValidTo(), value.contactName(),
                value.contactPhone(), value.status(), value.validFrom(), value.validTo());
    }

    private SupplierSupplyItemView supplyItemView(SupplierSupplyItem value) {
        return new SupplierSupplyItemView(value.id(), value.revision(), value.supplierId(), value.catalogItemId(),
                value.packageId(), value.agreementPrice(), value.taxRate(), value.purchaseEnabled(),
                value.validFrom(), value.validTo());
    }

    private DocumentEventView eventView(InventoryDocumentEvent value) {
        return new DocumentEventView(value.id(), value.documentType(), value.documentId(), value.documentNo(),
                value.eventType(), value.fromStatus(), value.toStatus(), value.reason(), value.correlationId(),
                value.occurredAt(), value.occurredBy());
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存操作必须选择工作机构和科室");
        return context;
    }
    private void requireOrganizationAccess(ExecutionContext context, Long organizationId) {
        if (!context.canAccessOrganization(organizationId)) {
            throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "当前工作上下文不能访问该机构库存");
        }
    }
    private void transition(Runnable action) {
        try { action.run(); } catch (IllegalStateException exception) {
            throw conflict("INVENTORY_DOCUMENT_STATE_INVALID", exception.getMessage());
        }
    }
    private void positive(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message);
    }
    private void validateMoney(BigDecimal value, String code, String message) {
        if (value == null || value.signum() < 0) throw badRequest(code, message);
    }
    private void validateTax(BigDecimal value) {
        if (value != null && (value.signum() < 0 || value.compareTo(BigDecimal.ONE) > 0)) {
            throw badRequest("PURCHASE_TAX_INVALID", "税率必须在0到1之间");
        }
    }
    private String nextNo(String prefix) {
        return prefix + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record CreateSupplierCommand(Long organizationId, String code, String name, String unifiedCreditCode,
                                        String licenseNo, LocalDate licenseValidTo, String contactName,
                                        String contactPhone, LocalDate validFrom, LocalDate validTo) {}
    public record CreateSupplyItemCommand(Long catalogItemId, Long packageId, BigDecimal agreementPrice,
                                          BigDecimal taxRate, LocalDate validFrom, LocalDate validTo) {}
    public record PurchaseLineCommand(Long stockItemId, Long packageId, BigDecimal orderedQuantity,
                                      BigDecimal unitPrice, BigDecimal taxRate, String description) {}
    public record CreatePurchaseOrderCommand(Long stockSiteId, Long supplierId, String orderNo, String requestCode,
                                             LocalDate orderDate, LocalDate expectedDate, String description,
                                             List<PurchaseLineCommand> lines) {}
    public record DecisionCommand(String reason) {}
    public record GoodsReceiptLineCommand(Long purchaseOrderLineId, Long destinationBinId, String lotNo,
                                          LocalDate productionDate, LocalDate expiryDate,
                                          BigDecimal deliveredQuantity, BigDecimal unitCost) {}
    public record CreateGoodsReceiptCommand(Long purchaseOrderId, String receiptNo, String requestCode,
                                            String deliveryNoteNo, Instant receivedAt, String description,
                                            List<GoodsReceiptLineCommand> lines) {}
    public record InspectLineCommand(Long goodsReceiptLineId, BigDecimal acceptedQuantity,
                                     BigDecimal rejectedQuantity, String rejectionReason) {}
    public record InspectGoodsReceiptCommand(String description, List<InspectLineCommand> lines) {}
}
