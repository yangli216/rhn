package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.InventoryBalanceView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryReservationView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionLineView;
import com.rhn.pharmacy.api.PharmacyViews.InventoryTransactionView;
import com.rhn.pharmacy.api.PharmacyViews.ReservationResultView;
import com.rhn.pharmacy.api.PharmacyViews.StockBinView;
import com.rhn.pharmacy.api.PharmacyViews.StockLotView;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryPeriod;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.domain.InventoryTransaction;
import com.rhn.pharmacy.domain.InventoryTransactionLine;
import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockLot;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.InventoryBalanceRepository;
import com.rhn.pharmacy.infrastructure.InventoryPeriodRepository;
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionLineRepository;
import com.rhn.pharmacy.infrastructure.InventoryTransactionRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockLotRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryApplicationService {
    private static final Set<String> BIN_TYPES = Set.of("ZONE", "RACK", "BIN", "COUNTER", "TRANSIT");
    private static final Set<String> STOCK_STATUSES = Set.of("AVAILABLE", "PENDING", "QUARANTINE", "DAMAGED", "EXPIRED");
    private static final Set<String> QUALITY_STATUSES = Set.of("PENDING", "QUALIFIED", "QUARANTINE", "REJECTED", "RECALLED");
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final StockBinRepository binRepository;
    private final StockLotRepository lotRepository;
    private final InventoryPeriodRepository periodRepository;
    private final InventoryTransactionRepository transactionRepository;
    private final InventoryTransactionLineRepository transactionLineRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryReservationRepository reservationRepository;
    private final DispenseTaskRepository taskRepository;
    private final DispenseTaskLineRepository taskLineRepository;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final InventoryQuantityPolicy quantityPolicy;
    private final InventorySplitApplicationService splitService;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;

    public InventoryApplicationService(
            StockSiteRepository siteRepository, StockItemRepository itemRepository,
            StockBinRepository binRepository, StockLotRepository lotRepository,
            InventoryPeriodRepository periodRepository, InventoryTransactionRepository transactionRepository,
            InventoryTransactionLineRepository transactionLineRepository,
            InventoryBalanceRepository balanceRepository,
            InventoryReservationRepository reservationRepository,
            DispenseTaskRepository taskRepository, DispenseTaskLineRepository taskLineRepository,
            CatalogLifecycleDirectory catalogDirectory, InventoryQuantityPolicy quantityPolicy,
            InventorySplitApplicationService splitService,
            DomainEventPublisher eventPublisher,
            ExecutionContextProvider contextProvider) {
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.binRepository = binRepository; this.lotRepository = lotRepository;
        this.periodRepository = periodRepository; this.transactionRepository = transactionRepository;
        this.transactionLineRepository = transactionLineRepository; this.balanceRepository = balanceRepository;
        this.reservationRepository = reservationRepository; this.taskRepository = taskRepository;
        this.taskLineRepository = taskLineRepository; this.catalogDirectory = catalogDirectory;
        this.quantityPolicy = quantityPolicy; this.splitService = splitService;
        this.eventPublisher = eventPublisher; this.contextProvider = contextProvider;
    }

    @Transactional
    public StockBinView createBin(Long siteId, CreateBinCommand input) {
        ExecutionContext context = requireWorkContext();
        StockSite site = requireSite(context, siteId); requireOrganizationAccess(context, site.organizationId());
        String code = required(input.code(), "STOCK_BIN_CODE_REQUIRED", "货位编码不能为空");
        String name = required(input.name(), "STOCK_BIN_NAME_REQUIRED", "货位名称不能为空");
        String binType = upper(input.binType()); String stockDefault = upper(input.stockDefault());
        if (!BIN_TYPES.contains(binType)) throw badRequest("STOCK_BIN_TYPE_INVALID", "货位类型不受支持");
        if (!STOCK_STATUSES.contains(stockDefault)) throw badRequest("STOCK_BIN_DEFAULT_INVALID", "货位默认库存状态不受支持");
        if (input.sortOrder() < 0) throw badRequest("STOCK_BIN_ORDER_INVALID", "货位排序不能小于零");
        if (binRepository.findByTenantIdAndStockSiteIdAndCode(context.tenantId(), siteId, code).isPresent()) {
            throw conflict("STOCK_BIN_CODE_DUPLICATE", "当前库存站点已存在相同货位编码");
        }
        if (input.parentBinId() != null) {
            StockBin parent = requireBin(context, input.parentBinId());
            if (!siteId.equals(parent.stockSiteId())) throw badRequest("STOCK_BIN_PARENT_SITE_MISMATCH", "父货位不属于当前库存站点");
        }
        StockBin value = binRepository.saveAndFlush(new StockBin(context.tenantId(), siteId,
                input.parentBinId(), code, name, binType, stockDefault, input.receiveAllowed(),
                input.pickAllowed(), input.countAllowed(), input.sortOrder(), context.subjectId()));
        return binView(value);
    }

    @Transactional(readOnly = true)
    public List<StockBinView> bins(Long siteId) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        requireOrganizationAccess(context, site.organizationId());
        return binRepository.findByTenantIdAndStockSiteIdOrderBySortOrderAscCodeAsc(context.tenantId(), siteId)
                .stream().map(this::binView).toList();
    }

    @Transactional
    public StockLotView createLot(Long stockItemId, CreateLotCommand input) {
        ExecutionContext context = requireWorkContext(); StockItem item = requireItem(context, stockItemId);
        StockSite site = requireSite(context, item.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        String lotNo = required(input.lotNo(), "STOCK_LOT_NO_REQUIRED", "批号不能为空");
        String quality = upper(input.qualityStatus());
        if (!QUALITY_STATUSES.contains(quality)) throw badRequest("STOCK_LOT_QUALITY_INVALID", "批次质量状态不受支持");
        if (input.expiryDate() != null && input.productionDate() != null
                && input.expiryDate().isBefore(input.productionDate())) {
            throw badRequest("STOCK_LOT_DATE_INVALID", "批次效期不能早于生产日期");
        }
        var catalog = catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), site.organizationId(),
                item.basePackageId(), "SALE", LocalDate.now());
        if (!catalog.item().id().equals(item.catalogItemId()) || !catalog.itemPackage().id().equals(item.basePackageId())) {
            throw conflict("STOCK_LOT_CATALOG_MISMATCH", "批次产品或包装与库房经营项目不一致");
        }
        StockLot existing = lotRepository.findByTenantIdAndCatalogItemIdAndPackageIdAndLotNo(
                context.tenantId(), item.catalogItemId(), item.basePackageId(), lotNo).orElse(null);
        if (existing != null) return lotView(existing);
        StockLot value = lotRepository.saveAndFlush(new StockLot(context.tenantId(), item.catalogItemId(),
                item.basePackageId(), lotNo, input.productionDate(), input.expiryDate(),
                clean(input.approvalCodeSnapshot()), clean(input.manufacturerNameSnapshot()), quality,
                context.subjectId()));
        return lotView(value);
    }

    @Transactional(readOnly = true)
    public List<StockLotView> lots(Long stockItemId) {
        ExecutionContext context = requireWorkContext(); StockItem item = requireItem(context, stockItemId);
        StockSite site = requireSite(context, item.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return lotRepository.findByTenantIdAndCatalogItemIdOrderByExpiryDateAscLotNoAsc(
                context.tenantId(), item.catalogItemId()).stream().map(this::lotView).toList();
    }

    @Transactional
    public InventoryTransactionView receive(ReceiveCommand input) {
        ExecutionContext context = requireWorkContext(); StockItem item = requireItem(context, input.stockItemId());
        if (item.traceRequired()) throw conflict("TRACE_MANUAL_RECEIPT_NOT_ALLOWED",
                "启用追溯的药品不能直接入库记账，请通过采购到货验收登记追溯码后入库");
        return receiveDocument("MANUAL_RECEIPT", input);
    }

    @Transactional
    public InventoryTransactionView receiveDocument(String sourceType, ReceiveCommand input) {
        ExecutionContext context = requireWorkContext();
        String receiptSourceType = required(sourceType, "INVENTORY_SOURCE_TYPE_REQUIRED", "入库来源类型不能为空");
        String requestCode = required(input.requestCode(), "INVENTORY_REQUEST_CODE_REQUIRED", "库存入账请求编码不能为空");
        InventoryTransaction existing = transactionRepository.findByTenantIdAndRequestCode(
                context.tenantId(), requestCode).orElse(null);
        if (existing != null) return verifyIdempotentReceipt(existing, receiptSourceType, input);
        if (input.operationQuantity() == null || input.operationQuantity().signum() <= 0) {
            throw badRequest("INVENTORY_RECEIPT_QUANTITY_INVALID", "入库数量必须大于零");
        }
        if (input.unitCost() != null && input.unitCost().signum() < 0) {
            throw badRequest("INVENTORY_RECEIPT_COST_INVALID", "入库单位成本不能小于零");
        }
        StockItem item = requireItem(context, input.stockItemId()); StockSite site = requireSite(context, item.stockSiteId());
        requireOrganizationAccess(context, site.organizationId());
        StockBin bin = requireBin(context, input.stockBinId()); StockLot lot = requireLot(context, input.stockLotId());
        if (!bin.stockSiteId().equals(site.id()) || !bin.active() || !bin.receiveAllowed()) {
            throw conflict("STOCK_BIN_NOT_RECEIVABLE", "所选货位不属于经营项目站点或未开放收货");
        }
        if (!lot.catalogItemId().equals(item.catalogItemId()) || !lot.packageId().equals(item.basePackageId())) {
            throw badRequest("STOCK_LOT_ITEM_MISMATCH", "所选批次不属于当前库房经营项目");
        }
        LocalDate businessDate = input.occurredAt().atZone(ZoneOffset.UTC).toLocalDate();
        String stockStatus = bin.stockDefault();
        if ("AVAILABLE".equals(stockStatus) && !lot.issuable(businessDate)) {
            throw conflict("STOCK_LOT_NOT_ISSUABLE", "未合格、已过期或已关闭批次不能进入可用库存");
        }
        var catalog = catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), site.organizationId(),
                item.basePackageId(), "SALE", businessDate);
        BigDecimal factor = catalog.itemPackage().quantityFactor();
        BigDecimal operationQuantity = quantityPolicy.require(context.tenantId(), catalog.itemPackage().unitCode(),
                input.operationQuantity(), "INVENTORY_RECEIPT_QUANTITY_PRECISION_INVALID", "入库数量");
        BigDecimal quantityDelta = quantityPolicy.toBase(context.tenantId(), catalog.itemPackage().unitCode(),
                operationQuantity, factor, item.baseUnitCode(),
                "INVENTORY_RECEIPT_QUANTITY_PRECISION_INVALID", "入库数量");
        InventoryPeriod period = requireOpenPeriod(context, site.id(), businessDate);
        InventoryTransaction transaction = transactionRepository.save(new InventoryTransaction(context.tenantId(),
                period.id(), nextNo("IT"), requestCode, "RECEIPT", receiptSourceType,
                required(input.sourceCode(), "INVENTORY_SOURCE_CODE_REQUIRED", "入库来源编码不能为空"),
                input.occurredAt(), context.subjectId(), clean(input.description())));
        InventoryTransactionLine line = transactionLineRepository.save(new InventoryTransactionLine(
                context.tenantId(), transaction.id(), 1, site.id(), bin.id(), item.id(), lot.id(),
                item.basePackageId(), stockStatus, operationQuantity, catalog.itemPackage().unitCode(),
                factor, quantityDelta, input.unitCost()));
        InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), bin.id(), item.id(),
                lot.id(), stockStatus).orElseGet(() -> new InventoryBalance(context.tenantId(), site.id(), bin.id(),
                item.id(), lot.id(), stockStatus, item.baseUnitCode()));
        balance.receive(quantityDelta, input.unitCost()); balanceRepository.save(balance);
        try {
            transactionLineRepository.flush(); balanceRepository.flush(); transactionRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("INVENTORY_RECEIPT_CONCURRENT_CONFLICT", "库存入账发生并发冲突，请使用原请求编码重试");
        }
        eventPublisher.publish(context.tenantId(), site.organizationId(), "INVENTORY_TRANSACTION_POSTED", 1,
                "InventoryTransaction", transaction.id(), 1, null, transaction.postedAt(),
                Map.of("transactionNo", transaction.transactionNo(), "transactionType", "RECEIPT",
                        "stockItemId", item.id(), "quantityDelta", quantityDelta));
        return transactionView(transaction, List.of(line));
    }

    @Transactional
    public InventoryTransactionView receiveDocument(String sourceType, ReceiveDocumentCommand input) {
        ExecutionContext context = requireWorkContext();
        String receiptSourceType = required(sourceType, "INVENTORY_SOURCE_TYPE_REQUIRED", "入库来源类型不能为空");
        String requestCode = required(input.requestCode(), "INVENTORY_REQUEST_CODE_REQUIRED", "库存入账请求编码不能为空");
        String sourceCode = required(input.sourceCode(), "INVENTORY_SOURCE_CODE_REQUIRED", "入库来源编码不能为空");
        if (input.lines() == null || input.lines().isEmpty()) {
            throw badRequest("INVENTORY_RECEIPT_LINES_REQUIRED", "批量入库至少需要一条明细");
        }
        InventoryTransaction existing = transactionRepository.findByTenantIdAndRequestCode(
                context.tenantId(), requestCode).orElse(null);
        if (existing != null) {
            if (!receiptSourceType.equals(existing.sourceType()) || !sourceCode.equals(existing.sourceCode())) {
                throw conflict("INVENTORY_REQUEST_REUSED", "库存入账请求编码已被其他业务使用");
            }
            return transactionView(existing, transactionLineRepository
                    .findByTenantIdAndInventoryTransactionIdOrderBySortOrder(context.tenantId(), existing.id()));
        }
        Instant occurredAt = input.occurredAt() == null ? Instant.now() : input.occurredAt();
        LocalDate businessDate = occurredAt.atZone(ZoneOffset.UTC).toLocalDate();
        StockSite site = requireSite(context, input.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        InventoryPeriod period = requireOpenPeriod(context, site.id(), businessDate);
        InventoryTransaction transaction = transactionRepository.save(new InventoryTransaction(context.tenantId(),
                period.id(), nextNo("IT"), requestCode, "RECEIPT", receiptSourceType, sourceCode,
                occurredAt, context.subjectId(), clean(input.description())));
        List<InventoryTransactionLine> persisted = new ArrayList<>(); int order = 0;
        for (ReceiveDocumentLineCommand command : input.lines()) {
            if (command.operationQuantity() == null || command.operationQuantity().signum() <= 0) {
                throw badRequest("INVENTORY_RECEIPT_QUANTITY_INVALID", "入库数量必须大于零");
            }
            if (command.unitCost() != null && command.unitCost().signum() < 0) {
                throw badRequest("INVENTORY_RECEIPT_COST_INVALID", "入库单位成本不能小于零");
            }
            StockItem item = requireItem(context, command.stockItemId());
            if (!site.id().equals(item.stockSiteId())) throw badRequest("INVENTORY_ITEM_SITE_MISMATCH", "经营项目不属于记账站点");
            StockBin bin = requireBin(context, command.stockBinId()); StockLot lot = requireLot(context, command.stockLotId());
            if (!site.id().equals(bin.stockSiteId()) || !bin.active() || !bin.receiveAllowed()) {
                throw conflict("STOCK_BIN_NOT_RECEIVABLE", "所选货位不属于经营项目站点或未开放收货");
            }
            if (!lot.catalogItemId().equals(item.catalogItemId()) || !lot.packageId().equals(item.basePackageId())) {
                throw badRequest("STOCK_LOT_ITEM_MISMATCH", "所选批次不属于当前库房经营项目");
            }
            String stockStatus = bin.stockDefault();
            if ("AVAILABLE".equals(stockStatus) && !lot.issuable(businessDate)) {
                throw conflict("STOCK_LOT_NOT_ISSUABLE", "未合格、已过期或已关闭批次不能进入可用库存");
            }
            var catalog = catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), site.organizationId(),
                    item.basePackageId(), "SALE", businessDate);
            BigDecimal factor = catalog.itemPackage().quantityFactor();
            BigDecimal operationQuantity = quantityPolicy.require(context.tenantId(), catalog.itemPackage().unitCode(),
                    command.operationQuantity(), "INVENTORY_RECEIPT_QUANTITY_PRECISION_INVALID", "入库数量");
            BigDecimal quantityDelta = quantityPolicy.toBase(context.tenantId(), catalog.itemPackage().unitCode(),
                    operationQuantity, factor, item.baseUnitCode(),
                    "INVENTORY_RECEIPT_QUANTITY_PRECISION_INVALID", "入库数量");
            InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), bin.id(), item.id(),
                    lot.id(), stockStatus).orElseGet(() -> new InventoryBalance(context.tenantId(), site.id(), bin.id(),
                    item.id(), lot.id(), stockStatus, item.baseUnitCode()));
            balance.receive(quantityDelta, command.unitCost()); balanceRepository.save(balance);
            persisted.add(transactionLineRepository.save(new InventoryTransactionLine(context.tenantId(),
                    transaction.id(), ++order, site.id(), bin.id(), item.id(), lot.id(), item.basePackageId(),
                    stockStatus, operationQuantity, catalog.itemPackage().unitCode(), factor,
                    quantityDelta, command.unitCost())));
        }
        try {
            transactionLineRepository.flush(); balanceRepository.flush(); transactionRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("INVENTORY_RECEIPT_CONCURRENT_CONFLICT", "库存批量入账发生并发冲突，请使用原请求编码重试");
        }
        eventPublisher.publish(context.tenantId(), site.organizationId(), "INVENTORY_TRANSACTION_POSTED", 1,
                "InventoryTransaction", transaction.id(), 1, null, transaction.postedAt(),
                Map.of("transactionNo", transaction.transactionNo(), "transactionType", "RECEIPT",
                        "sourceType", receiptSourceType, "lineCount", persisted.size()));
        return transactionView(transaction, persisted);
    }

    @Transactional
    public InventoryTransactionView postDocument(DocumentPostingCommand input) {
        ExecutionContext context = requireWorkContext();
        String requestCode = required(input.requestCode(), "INVENTORY_REQUEST_CODE_REQUIRED", "库存记账请求编码不能为空");
        String transactionType = upper(input.transactionType());
        if (!Set.of("ISSUE", "TRANSFER", "COUNT", "QUALITY").contains(transactionType)) {
            throw badRequest("INVENTORY_TRANSACTION_TYPE_INVALID", "库存业务记账类型不受支持");
        }
        String sourceType = required(input.sourceType(), "INVENTORY_SOURCE_TYPE_REQUIRED", "库存来源类型不能为空");
        String sourceCode = required(input.sourceCode(), "INVENTORY_SOURCE_CODE_REQUIRED", "库存来源编码不能为空");
        if (input.lines() == null || input.lines().isEmpty()) {
            throw badRequest("INVENTORY_POSTING_LINES_REQUIRED", "库存业务记账至少需要一条明细");
        }
        InventoryTransaction existing = transactionRepository.findByTenantIdAndRequestCode(
                context.tenantId(), requestCode).orElse(null);
        if (existing != null) return verifyIdempotentDocument(existing, transactionType, sourceType, sourceCode, input.lines());
        Instant occurredAt = input.occurredAt() == null ? Instant.now() : input.occurredAt();
        LocalDate businessDate = occurredAt.atZone(ZoneOffset.UTC).toLocalDate();
        StockSite site = siteRepository.findByIdAndTenantId(input.stockSiteId(), context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        requireOrganizationAccess(context, site.organizationId());
        InventoryPeriod period = requireOpenPeriod(context, site.id(), businessDate);
        InventoryTransaction transaction = transactionRepository.save(new InventoryTransaction(context.tenantId(),
                period.id(), nextNo("IT"), requestCode, transactionType, sourceType, sourceCode,
                occurredAt, context.subjectId(), clean(input.description())));
        List<InventoryTransactionLine> persisted = new ArrayList<>(); int order = 0;
        for (DocumentPostingLineCommand command : input.lines()) {
            if (command.quantityDelta() == null || command.quantityDelta().signum() == 0) {
                throw badRequest("INVENTORY_POSTING_QUANTITY_INVALID", "库存记账数量变化不能为零");
            }
            StockItem item = requireItem(context, command.stockItemId());
            if (!site.id().equals(item.stockSiteId())) throw badRequest("INVENTORY_ITEM_SITE_MISMATCH", "经营项目不属于记账站点");
            StockBin bin = requireBin(context, command.stockBinId()); StockLot lot = requireLot(context, command.stockLotId());
            if (!site.id().equals(bin.stockSiteId())) throw badRequest("INVENTORY_BIN_SITE_MISMATCH", "库存货位不属于记账站点");
            if (!item.catalogItemId().equals(lot.catalogItemId()) || !item.basePackageId().equals(lot.packageId())) {
                throw badRequest("STOCK_LOT_ITEM_MISMATCH", "库存批次与经营项目不一致");
            }
            String stockStatus = upper(command.stockStatus());
            if (!STOCK_STATUSES.contains(stockStatus)) throw badRequest("INVENTORY_STOCK_STATUS_INVALID", "库存状态不受支持");
            BigDecimal quantityDelta = quantityPolicy.require(context.tenantId(), item.baseUnitCode(),
                    command.quantityDelta(), "INVENTORY_POSTING_QUANTITY_PRECISION_INVALID", "库存记账数量");
            InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), bin.id(), item.id(),
                    lot.id(), stockStatus).orElse(null);
            if (balance == null) {
                if (quantityDelta.signum() < 0) throw conflict("INVENTORY_BALANCE_NOT_FOUND", "待出库库存维度不存在");
                balance = new InventoryBalance(context.tenantId(), site.id(), bin.id(), item.id(), lot.id(),
                        stockStatus, item.baseUnitCode());
            }
            if (quantityDelta.signum() > 0) balance.receive(quantityDelta, command.unitCost());
            else {
                if (Set.of("ISSUE", "TRANSFER").contains(transactionType)) {
                    splitService.ensureSealedAvailable(context.tenantId(), bin.id(), item.id(), lot.id(),
                            balance.quantityOnHand(), quantityDelta.abs());
                }
                if (command.consumeReserved()) balance.dispenseReserved(quantityDelta.abs());
                else balance.issueAvailable(quantityDelta.abs());
            }
            balanceRepository.save(balance);
            persisted.add(transactionLineRepository.save(new InventoryTransactionLine(context.tenantId(),
                    transaction.id(), ++order, site.id(), bin.id(), item.id(), lot.id(), item.basePackageId(),
                    stockStatus, quantityDelta.abs(), item.baseUnitCode(), BigDecimal.ONE,
                    quantityDelta, command.unitCost())));
        }
        try {
            transactionLineRepository.flush(); balanceRepository.flush(); transactionRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw conflict("INVENTORY_POSTING_CONCURRENT_CONFLICT", "库存业务记账发生并发冲突，请使用原请求编码重试");
        }
        eventPublisher.publish(context.tenantId(), site.organizationId(), "INVENTORY_TRANSACTION_POSTED", 1,
                "InventoryTransaction", transaction.id(), 1, null, transaction.postedAt(),
                Map.of("transactionNo", transaction.transactionNo(), "transactionType", transactionType,
                        "sourceType", sourceType, "lineCount", persisted.size()));
        return transactionView(transaction, persisted);
    }

    @Transactional(readOnly = true)
    public List<InventoryBalanceView> balances(Long siteId, Long stockItemId) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        requireOrganizationAccess(context, site.organizationId()); StockItem item = requireItem(context, stockItemId);
        if (!item.stockSiteId().equals(siteId)) throw badRequest("INVENTORY_ITEM_SITE_MISMATCH", "经营项目不属于当前库存站点");
        return balanceRepository.findByTenantIdAndStockSiteIdAndStockItemIdOrderByProjectedAtDesc(
                context.tenantId(), siteId, stockItemId).stream().map(value -> balanceView(context, value)).toList();
    }

    @Transactional(readOnly = true)
    public List<InventoryTransactionView> transactions(Long siteId, String periodCode) {
        ExecutionContext context = requireWorkContext(); StockSite site = requireSite(context, siteId);
        requireOrganizationAccess(context, site.organizationId()); String code = clean(periodCode);
        if (code == null) code = YearMonth.now(ZoneOffset.UTC).toString().replace("-", "");
        InventoryPeriod period = periodRepository.findByTenantIdAndStockSiteIdAndPeriodCode(
                context.tenantId(), siteId, code).orElse(null);
        if (period == null) return List.of();
        return transactionRepository.findByTenantIdAndInventoryPeriodIdOrderByPostedAtDesc(context.tenantId(), period.id())
                .stream().map(value -> transactionView(value, transactionLineRepository
                        .findByTenantIdAndInventoryTransactionIdOrderBySortOrder(context.tenantId(), value.id()))).toList();
    }

    @Transactional
    public ReservationResultView reserveTask(Long taskId, ReserveCommand input) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = lockTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine line = taskLineRepository.findByTenantIdAndTaskId(context.tenantId(), task.id())
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
        expireDueForTask(context.tenantId(), task, line, Instant.now());
        List<InventoryReservation> history = reservationRepository.findByTenantIdAndRequestIdOrderByCreatedAt(
                context.tenantId(), line.requestId());
        List<InventoryReservation> active = history.stream().filter(InventoryReservation::active).toList();
        BigDecimal required = quantityPolicy.toBase(context.tenantId(), line.dispenseUnitCode(),
                line.remainingQuantity(), line.baseQuantityFactor(), itemForPrecision(context, line).baseUnitCode(),
                "INVENTORY_RESERVATION_QUANTITY_PRECISION_INVALID", "预留数量");
        if (!active.isEmpty()) {
            if (!"PICKING".equals(task.status())) {
                throw conflict("INVENTORY_RESERVATION_TASK_INCONSISTENT", "任务状态与有效预留不一致，请人工核查");
            }
            return reservationResult(context, task, required, active);
        }
        if (!"READY_TO_PICK".equals(task.status())) {
            throw conflict("DISPENSE_TASK_RESERVATION_STATE_INVALID", "只有审方通过且待拣货的任务可以预留库存");
        }
        StockItem item = requireItem(context, line.stockItemId());
        if ("MANUAL".equals(item.issuePolicy())) {
            throw conflict("INVENTORY_MANUAL_ALLOCATION_REQUIRED", "手工出库策略必须由拣货人员指定批次，本接口不自动分配");
        }
        LocalDate businessDate = LocalDate.now(ZoneOffset.UTC);
        List<InventoryBalance> candidates = "FEFO".equals(item.issuePolicy())
                ? balanceRepository.lockIssuableFefo(context.tenantId(), site.id(), item.id(), businessDate)
                : balanceRepository.lockIssuableFifo(context.tenantId(), site.id(), item.id(), businessDate);
        BigDecimal available = candidates.stream().map(InventoryBalance::quantityAvailable)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (available.compareTo(required) < 0) {
            throw conflict("INVENTORY_RESERVATION_INSUFFICIENT",
                    "可用库存不足：需要 %s %s，当前可用 %s %s".formatted(required, item.baseUnitCode(),
                            available, item.baseUnitCode()));
        }
        int expiryMinutes = input.expiryMinutes() == null ? 30 : input.expiryMinutes();
        if (expiryMinutes < 1 || expiryMinutes > 1440) {
            throw badRequest("INVENTORY_RESERVATION_EXPIRY_INVALID", "预留有效分钟数必须在 1 至 1440 之间");
        }
        String group = task.taskNo() + "-R" + (history.stream().map(InventoryReservation::reservationGroupCode)
                .distinct().count() + 1);
        Instant expiresAt = Instant.now().plusSeconds(expiryMinutes * 60L);
        BigDecimal remaining = required; List<InventoryReservation> created = new ArrayList<>();
        for (InventoryBalance balance : candidates) {
            if (remaining.signum() == 0) break;
            BigDecimal allocation = balance.quantityAvailable().min(remaining);
            balance.reserve(allocation);
            created.add(reservationRepository.save(new InventoryReservation(context.tenantId(), site.id(),
                    balance.stockBinId(), item.id(), balance.stockLotId(), line.requestId(), group,
                    allocation, item.baseUnitCode(), context.subjectId(), expiresAt)));
            remaining = remaining.subtract(allocation);
        }
        task.markReserved(); line.markReserved();
        balanceRepository.flush(); reservationRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        eventPublisher.publish(context.tenantId(), site.organizationId(), "INVENTORY_RESERVED", 1,
                "DispenseTask", task.id(), task.revision(), task.residentId(), Instant.now(),
                Map.of("taskNo", task.taskNo(), "requestId", line.requestId(), "reservationGroup", group,
                        "requiredBaseQuantity", required, "allocationCount", created.size()));
        return reservationResult(context, task, required, created);
    }

    @Transactional
    public ReservationResultView releaseTask(Long taskId, ReleaseCommand input) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = lockTask(context, taskId);
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        DispenseTaskLine line = taskLineRepository.findByTenantIdAndTaskId(context.tenantId(), task.id())
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
        String reason = required(input.reason(), "INVENTORY_RELEASE_REASON_REQUIRED", "释放库存预留必须填写原因");
        List<InventoryReservation> active = reservationRepository.lockActiveByRequest(
                context.tenantId(), line.requestId());
        BigDecimal required = line.remainingQuantity().multiply(line.baseQuantityFactor());
        if (active.isEmpty()) {
            if ("READY_TO_PICK".equals(task.status())) return reservationResult(context, task, required, List.of());
            throw conflict("INVENTORY_ACTIVE_RESERVATION_NOT_FOUND", "当前任务没有可释放的有效库存预留");
        }
        for (InventoryReservation reservation : active) {
            InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), reservation.stockBinId(),
                    reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "预留对应库存投影不存在"));
            BigDecimal releasable = reservation.releasableQuantity();
            balance.release(releasable); reservation.release(context.subjectId(), reason);
        }
        task.releaseReservation(); line.releaseReservation();
        balanceRepository.flush(); reservationRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        eventPublisher.publish(context.tenantId(), site.organizationId(), "INVENTORY_RESERVATION_RELEASED", 1,
                "DispenseTask", task.id(), task.revision(), task.residentId(), Instant.now(),
                Map.of("taskNo", task.taskNo(), "requestId", line.requestId(), "reason", reason));
        return reservationResult(context, task, required, active);
    }

    @Scheduled(fixedDelayString = "${rhn.pharmacy.reservation-expiry-interval-ms:60000}")
    @Transactional
    public void expireDueReservations() {
        Instant now = Instant.now();
        for (InventoryReservationRepository.DueReservationKey key : reservationRepository.findDueKeys(now)) {
            Long previousTenant = TenantContext.currentTenantId().orElse(null);
            TenantContext.set(key.getTenantId());
            try {
                DispenseTaskLine line = taskLineRepository.findByTenantIdAndRequestId(
                        key.getTenantId(), key.getRequestId()).orElse(null);
                if (line == null) continue;
                DispenseTask task = taskRepository.lockByIdAndTenantId(line.taskId(), key.getTenantId()).orElse(null);
                if (task == null) continue;
                expireDueForTask(key.getTenantId(), task, line, now);
            } finally {
                if (previousTenant == null) TenantContext.clear(); else TenantContext.set(previousTenant);
            }
        }
    }

    private void expireDueForTask(Long tenantId, DispenseTask task, DispenseTaskLine line, Instant now) {
        List<InventoryReservation> due = reservationRepository.lockDueByRequest(tenantId, line.requestId(), now);
        if (due.isEmpty()) return;
        for (InventoryReservation reservation : due) {
            InventoryBalance balance = balanceRepository.lockDimension(tenantId, reservation.stockBinId(),
                    reservation.stockItemId(), reservation.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "过期预留对应库存投影不存在"));
            BigDecimal releasable = reservation.releasableQuantity();
            balance.release(releasable); reservation.expire(now);
        }
        task.expireReservation(); line.releaseReservation();
        StockSite site = siteRepository.findByIdAndTenantId(task.stockSiteId(), tenantId)
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "过期预留对应库存站点不存在"));
        balanceRepository.flush(); reservationRepository.flush(); taskLineRepository.flush(); taskRepository.flush();
        eventPublisher.publish(tenantId, site.organizationId(), "INVENTORY_RESERVATION_EXPIRED", 1,
                "DispenseTask", task.id(), task.revision(), task.residentId(), now,
                Map.of("taskNo", task.taskNo(), "requestId", line.requestId(), "allocationCount", due.size()));
    }

    @Transactional(readOnly = true)
    public ReservationResultView reservations(Long taskId) {
        ExecutionContext context = requireWorkContext(); DispenseTask task = requireTask(context, taskId);
        DispenseTaskLine line = taskLineRepository.findByTenantIdAndTaskId(context.tenantId(), task.id())
                .orElseThrow(() -> notFound("DISPENSE_TASK_LINE_NOT_FOUND", "发药任务缺少药品明细"));
        BigDecimal required = line.remainingQuantity().multiply(line.baseQuantityFactor());
        return reservationResult(context, task, required, reservationRepository
                .findByTenantIdAndRequestIdOrderByCreatedAt(context.tenantId(), line.requestId()));
    }

    private InventoryTransactionView verifyIdempotentReceipt(InventoryTransaction existing, String sourceType,
                                                              ReceiveCommand input) {
        List<InventoryTransactionLine> lines = transactionLineRepository
                .findByTenantIdAndInventoryTransactionIdOrderBySortOrder(existing.tenantId(), existing.id());
        if (!"RECEIPT".equals(existing.transactionType()) || !sourceType.equals(existing.sourceType())
                || lines.size() != 1) {
            throw conflict("INVENTORY_REQUEST_CODE_REUSED", "库存请求编码已被其他类型事务使用");
        }
        InventoryTransactionLine line = lines.get(0);
        if (!line.stockBinId().equals(input.stockBinId()) || !line.stockItemId().equals(input.stockItemId())
                || !line.stockLotId().equals(input.stockLotId())
                || line.operationQuantity().compareTo(input.operationQuantity()) != 0
                || !existing.sourceCode().equals(clean(input.sourceCode()))) {
            throw conflict("INVENTORY_REQUEST_CODE_PAYLOAD_MISMATCH", "相同库存请求编码不能用于不同入账内容");
        }
        return transactionView(existing, lines);
    }

    private InventoryTransactionView verifyIdempotentDocument(InventoryTransaction existing, String transactionType,
                                                               String sourceType, String sourceCode,
                                                               List<DocumentPostingLineCommand> expected) {
        List<InventoryTransactionLine> lines = transactionLineRepository
                .findByTenantIdAndInventoryTransactionIdOrderBySortOrder(existing.tenantId(), existing.id());
        if (!transactionType.equals(existing.transactionType()) || !sourceType.equals(existing.sourceType())
                || !sourceCode.equals(existing.sourceCode()) || lines.size() != expected.size()) {
            throw conflict("INVENTORY_REQUEST_CODE_REUSED", "库存请求编码已被其他业务内容使用");
        }
        for (int index = 0; index < lines.size(); index++) {
            InventoryTransactionLine actual = lines.get(index); DocumentPostingLineCommand wanted = expected.get(index);
            if (!actual.stockBinId().equals(wanted.stockBinId()) || !actual.stockItemId().equals(wanted.stockItemId())
                    || !actual.stockLotId().equals(wanted.stockLotId())
                    || actual.quantityDelta().compareTo(wanted.quantityDelta()) != 0
                    || !actual.stockStatus().equals(upper(wanted.stockStatus()))) {
                throw conflict("INVENTORY_REQUEST_CODE_PAYLOAD_MISMATCH", "相同库存请求编码不能用于不同记账内容");
            }
        }
        return transactionView(existing, lines);
    }

    private InventoryPeriod requireOpenPeriod(ExecutionContext context, Long siteId, LocalDate date) {
        YearMonth month = YearMonth.from(date); String code = month.toString().replace("-", "");
        InventoryPeriod value = periodRepository.findByTenantIdAndStockSiteIdAndPeriodCode(
                context.tenantId(), siteId, code).orElse(null);
        if (value == null) {
            value = periodRepository.saveAndFlush(new InventoryPeriod(context.tenantId(), siteId, code,
                    month.atDay(1), month.atEndOfMonth(), context.subjectId()));
        }
        if (!value.accepts(date)) throw conflict("INVENTORY_PERIOD_NOT_OPEN", "业务日期所属库存期间未开放");
        return value;
    }

    private ReservationResultView reservationResult(ExecutionContext context, DispenseTask task,
                                                     BigDecimal required, List<InventoryReservation> values) {
        BigDecimal reserved = values.stream().filter(InventoryReservation::active)
                .map(InventoryReservation::releasableQuantity).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new ReservationResultView(task.id(), task.taskNo(), task.status(), required, reserved,
                values.stream().map(value -> reservationView(context, value)).toList());
    }

    private InventoryBalanceView balanceView(ExecutionContext context, InventoryBalance value) {
        StockBin bin = requireBin(context, value.stockBinId()); StockLot lot = requireLot(context, value.stockLotId());
        return new InventoryBalanceView(value.id(), value.revision(), value.stockSiteId(), value.stockBinId(),
                bin.code(), value.stockItemId(), value.stockLotId(), lot.lotNo(), lot.expiryDate(), value.stockStatus(),
                value.baseUnitCode(), value.quantityOnHand(), value.quantityReserved(), value.quantityFrozen(),
                value.quantityAvailable(), value.averageUnitCost(), value.projectedAt());
    }

    private InventoryReservationView reservationView(ExecutionContext context, InventoryReservation value) {
        StockBin bin = requireBin(context, value.stockBinId()); StockLot lot = requireLot(context, value.stockLotId());
        return new InventoryReservationView(value.id(), value.revision(), value.stockSiteId(), value.stockBinId(),
                bin.code(), value.stockItemId(), value.stockLotId(), lot.lotNo(), lot.expiryDate(), value.requestId(),
                value.reservationGroupCode(), value.reservationType(), value.status(), value.quantityReserved(),
                value.quantityConsumed(), value.baseUnitCode(), value.createdAt(), value.expiresAt(),
                value.consumedAt(), value.consumedBy(), value.releasedAt(), value.releasedBy(), value.releaseReason());
    }

    private InventoryTransactionView transactionView(InventoryTransaction value, List<InventoryTransactionLine> lines) {
        return new InventoryTransactionView(value.id(), value.inventoryPeriodId(), value.transactionNo(),
                value.requestCode(), value.transactionType(), value.sourceType(), value.sourceCode(),
                value.occurredAt(), value.postedAt(), value.postedBy(), value.description(),
                lines.stream().map(this::transactionLineView).toList());
    }

    private InventoryTransactionLineView transactionLineView(InventoryTransactionLine value) {
        return new InventoryTransactionLineView(value.id(), value.sortOrder(), value.stockSiteId(),
                value.stockBinId(), value.stockItemId(), value.stockLotId(), value.packageId(), value.stockStatus(),
                value.operationQuantity(), value.operationUnitCode(), value.baseQuantityFactor(),
                value.quantityDelta(), value.unitCost(), value.amountDelta());
    }

    private StockBinView binView(StockBin value) {
        return new StockBinView(value.id(), value.revision(), value.stockSiteId(), value.parentBinId(),
                value.code(), value.name(), value.binType(), value.stockDefault(), value.receiveAllowed(),
                value.pickAllowed(), value.countAllowed(), value.sortOrder(), value.active());
    }

    private StockLotView lotView(StockLot value) {
        return new StockLotView(value.id(), value.revision(), value.catalogItemId(), value.packageId(),
                value.lotNo(), value.productionDate(), value.expiryDate(), value.approvalCodeSnapshot(),
                value.manufacturerNameSnapshot(), value.qualityStatus(), value.qualityAt(),
                value.qualityUserId(), value.status());
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite site = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        requireOrganizationAccess(context, site.organizationId());
        if (site.departmentId() != null && !site.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点所属科室不一致");
        }
        return site;
    }

    private StockItem requireItem(ExecutionContext context, Long id) {
        return itemRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库房经营项目"));
    }

    private StockItem itemForPrecision(ExecutionContext context, DispenseTaskLine line) {
        return requireItem(context, line.stockItemId());
    }

    private StockBin requireBin(ExecutionContext context, Long id) {
        return binRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位"));
    }

    private StockLot requireLot(ExecutionContext context, Long id) {
        return lotRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_LOT_NOT_FOUND", "未找到库存批次"));
    }

    private DispenseTask requireTask(ExecutionContext context, Long id) {
        DispenseTask task = taskRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return task;
    }

    private DispenseTask lockTask(ExecutionContext context, Long id) {
        DispenseTask task = taskRepository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("DISPENSE_TASK_NOT_FOUND", "未找到发药任务"));
        StockSite site = requireSite(context, task.stockSiteId()); requireOrganizationAccess(context, site.organizationId());
        return task;
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

    private String nextNo(String prefix) {
        return prefix + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
    private String upper(String value) { String result = clean(value); return result == null ? null : result.toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record CreateBinCommand(Long parentBinId, String code, String name, String binType,
                                   String stockDefault, boolean receiveAllowed, boolean pickAllowed,
                                   boolean countAllowed, int sortOrder) {}
    public record CreateLotCommand(String lotNo, LocalDate productionDate, LocalDate expiryDate,
                                   String approvalCodeSnapshot, String manufacturerNameSnapshot,
                                   String qualityStatus) {}
    public record ReceiveCommand(String requestCode, String sourceCode, Long stockItemId, Long stockBinId,
                                 Long stockLotId, BigDecimal operationQuantity, BigDecimal unitCost,
                                 Instant occurredAt, String description) {}
    public record ReceiveDocumentLineCommand(Long stockItemId, Long stockBinId, Long stockLotId,
                                             BigDecimal operationQuantity, BigDecimal unitCost) {}
    public record ReceiveDocumentCommand(String requestCode, String sourceCode, Long stockSiteId,
                                         Instant occurredAt, String description,
                                         List<ReceiveDocumentLineCommand> lines) {}
    public record DocumentPostingLineCommand(Long stockBinId, Long stockItemId, Long stockLotId,
                                             String stockStatus, BigDecimal quantityDelta, BigDecimal unitCost,
                                             boolean consumeReserved) {}
    public record DocumentPostingCommand(String requestCode, String transactionType, String sourceType,
                                         String sourceCode, Long stockSiteId, Instant occurredAt,
                                         String description, List<DocumentPostingLineCommand> lines) {}
    public record ReserveCommand(Integer expiryMinutes) {}
    public record ReleaseCommand(String reason) {}
}
