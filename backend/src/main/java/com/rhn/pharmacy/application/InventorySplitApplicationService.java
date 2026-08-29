package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryAccuracyViews.OpenPackageView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.SplitEventView;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryOpenPackage;
import com.rhn.pharmacy.domain.InventorySplitEvent;
import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockLot;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.InventoryBalanceRepository;
import com.rhn.pharmacy.infrastructure.InventoryOpenPackageRepository;
import com.rhn.pharmacy.infrastructure.InventorySplitEventRepository;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockLotRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventorySplitApplicationService {
    private final InventoryOpenPackageRepository openRepository;
    private final InventorySplitEventRepository eventRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final StockBinRepository binRepository;
    private final StockLotRepository lotRepository;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final InventoryQuantityPolicy quantityPolicy;
    private final InventoryTraceApplicationService traceService;
    private final ExecutionContextProvider contextProvider;

    public InventorySplitApplicationService(InventoryOpenPackageRepository openRepository,
                                            InventorySplitEventRepository eventRepository,
                                            InventoryBalanceRepository balanceRepository,
                                            StockSiteRepository siteRepository, StockItemRepository itemRepository,
                                            StockBinRepository binRepository, StockLotRepository lotRepository,
                                            CatalogLifecycleDirectory catalogDirectory,
                                            InventoryQuantityPolicy quantityPolicy,
                                            InventoryTraceApplicationService traceService,
                                            ExecutionContextProvider contextProvider) {
        this.openRepository = openRepository; this.eventRepository = eventRepository;
        this.balanceRepository = balanceRepository; this.siteRepository = siteRepository;
        this.itemRepository = itemRepository; this.binRepository = binRepository; this.lotRepository = lotRepository;
        this.catalogDirectory = catalogDirectory; this.quantityPolicy = quantityPolicy;
        this.traceService = traceService;
        this.contextProvider = contextProvider;
    }

    @Transactional
    public OpenPackageView open(OpenPackageCommand input) {
        ExecutionContext context = requireContext(); String requestCode = required(input.requestCode(),
                "SPLIT_REQUEST_CODE_REQUIRED", "拆零请求编码不能为空");
        InventoryOpenPackage replay = openRepository.findByTenantIdAndRequestCode(context.tenantId(), requestCode).orElse(null);
        if (replay != null) return view(replay);
        StockSite site = requireSite(context, input.stockSiteId()); StockItem item = requireItem(context, input.stockItemId());
        StockBin bin = requireBin(context, input.stockBinId()); StockLot lot = requireLot(context, input.stockLotId());
        validateDimension(site, item, bin, lot);
        InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), bin.id(), item.id(), lot.id(), "AVAILABLE")
                .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "拆零对应的可用库存不存在"));
        InventoryOpenPackage value = createOpen(context, site, item, bin.id(), lot.id(), balance,
                requestCode, "MANUAL_SPLIT", null, requestCode, input.description(), input.occurredAt());
        return view(value);
    }

    @Transactional(readOnly = true)
    public List<OpenPackageView> list(Long siteId) {
        ExecutionContext context = requireContext(); requireSite(context, siteId);
        return openRepository.findByTenantIdAndStockSiteIdOrderByOpenedAtDesc(context.tenantId(), siteId)
                .stream().map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public List<SplitEventView> events(Long openPackageId) {
        ExecutionContext context = requireContext();
        return eventRepository.findByTenantIdAndOpenPackageIdOrderByOccurredAtAscIdAsc(context.tenantId(), openPackageId)
                .stream().map(this::view).toList();
    }

    @Transactional
    public void consumeForDispense(ExecutionContext context, StockSite site, StockItem item, Long binId,
                                   Long lotId, BigDecimal baseQuantity, Long documentId, String documentNo,
                                   Instant occurredAt) {
        if (!item.splitAllowed()) throw conflict("SPLIT_NOT_ALLOWED", "当前经营项目不允许拆零发药");
        BigDecimal requiredQuantity = quantityPolicy.require(context.tenantId(), item.baseUnitCode(), baseQuantity,
                "SPLIT_QUANTITY_PRECISION_INVALID", "拆零发药数量");
        InventoryBalance balance = balanceRepository.lockDimension(context.tenantId(), binId, item.id(), lotId, "AVAILABLE")
                .orElseThrow(() -> conflict("INVENTORY_BALANCE_NOT_FOUND", "拆零发药对应库存不存在"));
        List<InventoryOpenPackage> packages = new ArrayList<>(
                openRepository.lockOpenByDimension(context.tenantId(), binId, item.id(), lotId));
        BigDecimal openRemaining = packages.stream().map(InventoryOpenPackage::remainingBaseQuantity)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (openRemaining.compareTo(requiredQuantity) < 0) {
            BigDecimal factor = packageFactor(context, site, item, occurredAt);
            BigDecimal shortage = requiredQuantity.subtract(openRemaining);
            int count = shortage.divide(factor, 0, RoundingMode.CEILING).intValueExact();
            for (int index = 1; index <= count; index++) {
                packages.add(createOpen(context, site, item, binId, lotId, balance,
                        "AUTO-SPLIT-" + documentNo + "-" + binId + "-" + lotId + "-" + index,
                        "MEDICATION_DISPENSE", documentId,
                        documentNo, "拆零发药自动开包", occurredAt));
            }
        }
        BigDecimal remaining = requiredQuantity;
        for (InventoryOpenPackage value : packages) {
            if (remaining.signum() == 0) break;
            BigDecimal consumed = value.remainingBaseQuantity().min(remaining);
            if (value.traceCodeId() != null) traceService.consumePartial(context, value.traceCodeId(), consumed,
                    documentId, documentNo, occurredAt);
            value.consume(consumed, context.subjectId(), occurredAt); openRepository.save(value);
            eventRepository.save(new InventorySplitEvent(context.tenantId(), value.id(), "CONSUME",
                    "MEDICATION_DISPENSE", documentId, documentNo, consumed.negate(),
                    value.remainingBaseQuantity(), occurredAt, context.subjectId(), "拆零发药消耗"));
            remaining = remaining.subtract(consumed);
        }
        if (remaining.signum() != 0) throw conflict("OPEN_PACKAGE_BALANCE_INSUFFICIENT", "拆零包装余量不足");
    }

    @Transactional(readOnly = true)
    public void ensureSealedAvailable(Long tenantId, Long binId, Long itemId, Long lotId,
                                      BigDecimal onHand, BigDecimal requested) {
        BigDecimal openRemaining = openRepository.sumOpenRemaining(tenantId, binId, itemId, lotId);
        if (onHand.subtract(openRemaining).compareTo(requested) < 0) {
            throw conflict("SEALED_PACKAGE_BALANCE_INSUFFICIENT", "整包装库存不足，部分库存已拆零，请改用拆零出库或核对开包余量");
        }
    }

    @Transactional
    public void returnFromDispense(ExecutionContext context, StockItem item, Long binId, Long lotId,
                                   BigDecimal baseQuantity, Long originalDispenseId, Long documentId, String documentNo,
                                   Instant occurredAt) {
        if (!item.splitAllowed()) return;
        BigDecimal remaining = quantityPolicy.require(context.tenantId(), item.baseUnitCode(), baseQuantity,
                "SPLIT_RETURN_QUANTITY_PRECISION_INVALID", "拆零退药数量");
        List<Long> packageIds = eventRepository.findConsumedPackageIds(context.tenantId(), originalDispenseId);
        if (packageIds.isEmpty()) throw conflict("OPEN_PACKAGE_RETURN_MISMATCH", "未找到原发药对应的拆零包装消耗记录");
        List<InventoryOpenPackage> packages = openRepository.lockRestorableByIds(
                context.tenantId(), packageIds, binId, item.id(), lotId);
        for (InventoryOpenPackage value : packages) {
            if (remaining.signum() == 0) break;
            BigDecimal sourceRestorable = eventRepository.sumConsumed(context.tenantId(), value.id(), originalDispenseId)
                    .subtract(eventRepository.sumReturned(context.tenantId(), value.id(), originalDispenseId));
            BigDecimal restored = value.restorableQuantity().min(sourceRestorable).min(remaining);
            if (restored.signum() <= 0) continue;
            if (value.traceCodeId() != null) traceService.restorePartial(context, value.traceCodeId(), binId,
                    restored, documentId, documentNo, occurredAt);
            value.restore(restored, context.subjectId(), occurredAt); openRepository.save(value);
            eventRepository.save(new InventorySplitEvent(context.tenantId(), value.id(), "RETURN",
                    "MEDICATION_DISPENSE_RETURN", originalDispenseId, documentNo, restored, value.remainingBaseQuantity(),
                    occurredAt, context.subjectId(), "退药单 " + documentId + " 可再销售拆零退药恢复余量"));
            remaining = remaining.subtract(restored);
        }
        if (remaining.signum() != 0) throw conflict("OPEN_PACKAGE_RETURN_MISMATCH", "拆零退药数量超过原开包消耗量");
    }

    private InventoryOpenPackage createOpen(ExecutionContext context, StockSite site, StockItem item,
                                             Long binId, Long lotId, InventoryBalance balance,
                                             String requestCode, String sourceType, Long sourceId, String sourceNo,
                                             String description, Instant occurredAt) {
        if (!item.splitAllowed()) throw conflict("SPLIT_NOT_ALLOWED", "当前经营项目未启用拆零管理");
        Instant time = occurredAt == null ? Instant.now() : occurredAt;
        BigDecimal factor = packageFactor(context, site, item, time);
        BigDecimal openRemaining = openRepository.sumOpenRemaining(context.tenantId(), binId, item.id(), lotId);
        BigDecimal sealed = balance.quantityOnHand().subtract(openRemaining);
        if (sealed.compareTo(factor) < 0) throw conflict("SEALED_PACKAGE_BALANCE_INSUFFICIENT", "没有足够的未拆整包装可供开包");
        Long traceCodeId = item.traceRequired() ? traceService.openForSplit(context, site.id(), binId, item.id(),
                lotId, factor, sourceType, sourceId, sourceNo, time) : null;
        InventoryOpenPackage value = openRepository.save(new InventoryOpenPackage(context.tenantId(),
                site.organizationId(), site.id(), binId, item.id(), lotId, item.basePackageId(), traceCodeId,
                requestCode, packageUnit(context, site, item, time), item.baseUnitCode(), factor,
                context.subjectId(), time));
        eventRepository.save(new InventorySplitEvent(context.tenantId(), value.id(), "OPEN", sourceType,
                sourceId, sourceNo, factor, factor, time, context.subjectId(), clean(description)));
        return value;
    }

    private BigDecimal packageFactor(ExecutionContext context, StockSite site, StockItem item, Instant time) {
        LocalDate date = time.atZone(ZoneOffset.UTC).toLocalDate();
        var catalog = catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), site.organizationId(),
                item.basePackageId(), "SALE", date);
        BigDecimal factor = quantityPolicy.require(context.tenantId(), item.baseUnitCode(),
                catalog.itemPackage().quantityFactor(), "PACKAGE_FACTOR_PRECISION_INVALID", "包装换算数量");
        if (factor.compareTo(BigDecimal.ONE) <= 0) throw conflict("PACKAGE_NOT_SPLITTABLE", "基础包装不能继续拆零");
        return factor;
    }

    private String packageUnit(ExecutionContext context, StockSite site, StockItem item, Instant time) {
        return catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), site.organizationId(),
                item.basePackageId(), "SALE", time.atZone(ZoneOffset.UTC).toLocalDate()).itemPackage().unitCode();
    }

    private void validateDimension(StockSite site, StockItem item, StockBin bin, StockLot lot) {
        if (!site.id().equals(item.stockSiteId()) || !site.id().equals(bin.stockSiteId()))
            throw badRequest("SPLIT_DIMENSION_MISMATCH", "拆零药品或库位不属于当前库存站点");
        if (!item.catalogItemId().equals(lot.catalogItemId()) || !item.basePackageId().equals(lot.packageId()))
            throw badRequest("SPLIT_LOT_MISMATCH", "拆零批次与经营项目不一致");
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite value = siteRepository.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        if (!context.canAccessOrganization(value.organizationId())) throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "无权访问当前库存站点");
        if (value.departmentId() != null && !value.departmentId().equals(context.departmentId()))
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点不一致");
        return value;
    }
    private StockItem requireItem(ExecutionContext c, Long id) { return itemRepository.findByIdAndTenantId(id, c.tenantId()).orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库房经营项目")); }
    private StockBin requireBin(ExecutionContext c, Long id) { return binRepository.findByIdAndTenantId(id, c.tenantId()).orElseThrow(() -> notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位")); }
    private StockLot requireLot(ExecutionContext c, Long id) { return lotRepository.findByIdAndTenantId(id, c.tenantId()).orElseThrow(() -> notFound("STOCK_LOT_NOT_FOUND", "未找到库存批次")); }
    private ExecutionContext requireContext() { ExecutionContext c = contextProvider.requireCurrent(); if (!c.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "拆零操作必须选择工作机构和科室"); return c; }
    private String required(String v, String code, String message) { String r = clean(v); if (r == null) throw badRequest(code, message); return r; }
    private String clean(String v) { return v == null || v.isBlank() ? null : v.trim(); }
    private OpenPackageView view(InventoryOpenPackage v) { return new OpenPackageView(v.id(), v.revision(), v.stockSiteId(), v.stockBinId(), v.stockItemId(), v.stockLotId(), v.packageId(), v.traceCodeId(), v.requestCode(), v.sourceUnitCode(), v.baseUnitCode(), v.packageFactor(), v.openedBaseQuantity(), v.remainingBaseQuantity(), v.status(), v.openedAt(), v.openedBy(), v.updatedAt(), v.closedAt()); }
    private SplitEventView view(InventorySplitEvent v) { return new SplitEventView(v.id(), v.openPackageId(), v.eventType(), v.sourceType(), v.sourceId(), v.sourceNo(), v.quantityDelta(), v.balanceAfter(), v.occurredAt(), v.occurredBy(), v.description()); }

    public record OpenPackageCommand(String requestCode, Long stockSiteId, Long stockBinId, Long stockItemId,
                                     Long stockLotId, Instant occurredAt, String description) {}
}
