package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.pharmacy.domain.DispenseRoute;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryReservation;
import com.rhn.pharmacy.domain.PrescriptionInventoryFreeze;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.DispenseRouteRepository;
import com.rhn.pharmacy.infrastructure.InventoryReservationRepository;
import com.rhn.pharmacy.infrastructure.PrescriptionInventoryFreezeRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class OutpatientPrescriptionInventoryService implements OutpatientPrescriptionInventoryDirectory {

    private final DispenseRouteRepository dispenseRouteRepository;
    private final StockSiteRepository stockSiteRepository;
    private final StockItemRepository stockItemRepository;
    private final InventoryAvailabilityService availabilityService;
    private final PrescriptionInventoryFreezeRepository freezeRepository;
    private final CatalogLifecycleDirectory catalogLifecycleDirectory;
    private final MasterDataSearchDirectory searchDirectory;

    public OutpatientPrescriptionInventoryService(DispenseRouteRepository dispenseRouteRepository,
                                                   StockSiteRepository stockSiteRepository,
                                                   StockItemRepository stockItemRepository,
                                                   InventoryAvailabilityService availabilityService,
                                                   PrescriptionInventoryFreezeRepository freezeRepository,
                                                   CatalogLifecycleDirectory catalogLifecycleDirectory,
                                                   MasterDataSearchDirectory searchDirectory) {
        this.dispenseRouteRepository = dispenseRouteRepository;
        this.stockSiteRepository = stockSiteRepository;
        this.stockItemRepository = stockItemRepository;
        this.availabilityService = availabilityService;
        this.freezeRepository = freezeRepository;
        this.catalogLifecycleDirectory = catalogLifecycleDirectory;
        this.searchDirectory = searchDirectory;
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderableMedicationView> findOrderableMedications(Long tenantId, Long organizationId,
                                                                 Long departmentId, String query) {
        LocalDate today = LocalDate.now();
        boolean searching = query != null && !query.isBlank();
        String normalizedQuery = searching ? query.trim().toLowerCase() : "";
        int resultLimit = searchDirectory.resolvePreference(tenantId, organizationId, departmentId).resultLimit();

        // 1. 获取该门诊科室适用的目标药房站点（优先精确科室路由，其次全院默认通配路由）
        List<DispenseRoute> activeRoutes = dispenseRouteRepository.findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId)
                .stream()
                .filter(r -> r.effective(today) && "OUTPATIENT".equals(r.careSetting())
                        && (r.sourceDepartmentId() == null || r.sourceDepartmentId().equals(departmentId)))
                .toList();

        List<DispenseRoute> deptSpecificRoutes = activeRoutes.stream()
                .filter(r -> r.sourceDepartmentId() != null && r.sourceDepartmentId().equals(departmentId))
                .toList();
        List<DispenseRoute> effectiveRoutes = deptSpecificRoutes.isEmpty() ? activeRoutes : deptSpecificRoutes;

        Set<Long> targetSiteIds = effectiveRoutes.stream().map(DispenseRoute::targetStockSiteId).collect(Collectors.toSet());

        // 兜底：若未显式配置门诊路由，自动选用当前机构的门诊药房或综合药房
        if (targetSiteIds.isEmpty()) {
            stockSiteRepository.findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId).stream()
                    .filter(s -> s.effective(today) && "PHARMACY".equals(s.siteType()))
                    .map(StockSite::id)
                    .forEach(targetSiteIds::add);
        }

        if (targetSiteIds.isEmpty()) {
            return List.of();
        }

        Map<Long, StockSite> siteMap = stockSiteRepository.findAllById(targetSiteIds).stream()
                .filter(s -> s.tenantId().equals(tenantId) && s.effective(today))
                .collect(Collectors.toMap(StockSite::id, s -> s));

        List<OrderableMedicationView> results = new ArrayList<>();

        for (StockSite site : siteMap.values()) {
            // 2. 查该药房所有的可用库存（stockStatus = AVAILABLE 且 quantityAvailable > 0）
            List<InventoryBalance> siteBalances = availabilityService.findBySite(tenantId, site.id()).stream()
                    .filter(b -> "AVAILABLE".equals(b.stockStatus()) && b.quantityAvailable().signum() > 0)
                    .toList();
            if (siteBalances.isEmpty()) continue;

            // 按 stockItemId 汇总可用数量
            Map<Long, BigDecimal> availableByStockItemId = siteBalances.stream()
                    .collect(Collectors.groupingBy(
                            InventoryBalance::stockItemId,
                            Collectors.reducing(BigDecimal.ZERO, InventoryBalance::quantityAvailable, BigDecimal::add)
                    ));

            // 获取这些 stockItem
            List<StockItem> stockItems = stockItemRepository.findAllById(availableByStockItemId.keySet()).stream()
                    .filter(si -> si.tenantId().equals(tenantId) && "ACTIVE".equals(si.status()))
                    .toList();
            if (stockItems.isEmpty()) continue;

            List<Long> catalogItemIds = stockItems.stream().map(StockItem::catalogItemId).distinct().toList();

            // 3. 批量查询药品主数据知识和包装
            List<MedicationView> medViews = catalogLifecycleDirectory.findMedicationsByProductCatalogItemIds(
                    tenantId, organizationId, catalogItemIds);
            Map<Long, MedicationView> medViewByCatalogItemId = new HashMap<>();
            for (MedicationView mv : medViews) {
                for (MedicationProductView pv : mv.products()) {
                    medViewByCatalogItemId.put(pv.id(), mv);
                }
            }
            Set<Long> matchingMedicationIds = searching
                    ? searchDirectory.findMatchingTargetIds("MEDICATION", tenantId, organizationId, departmentId,
                            query, medViews.stream().map(MedicationView::id).collect(Collectors.toSet()))
                    : Set.of();
            Set<Long> matchingProductIds = searching
                    ? searchDirectory.findMatchingTargetIds("CATALOG_ITEM", tenantId, organizationId, departmentId,
                            query, catalogItemIds)
                    : Set.of();

            for (StockItem si : stockItems) {
                BigDecimal availableBaseQty = availableByStockItemId.getOrDefault(si.id(), BigDecimal.ZERO);
                if (availableBaseQty.signum() <= 0) continue;

                MedicationView medView = medViewByCatalogItemId.get(si.catalogItemId());
                if (medView == null) continue;

                // 找到对应的产品和包装
                MedicationProductView matchedProduct = medView.products().stream()
                        .filter(p -> p.id().equals(si.catalogItemId()))
                        .findFirst().orElse(null);

                PackageView defaultPkg = null;
                if (matchedProduct != null && matchedProduct.packages() != null) {
                    defaultPkg = matchedProduct.packages().stream()
                            .filter(p -> p.id().equals(si.basePackageId()) || p.defaultDispense() || p.defaultSale())
                            .findFirst()
                            .orElse(matchedProduct.packages().isEmpty() ? null : matchedProduct.packages().getFirst());
                }

                BigDecimal factor = defaultPkg != null && defaultPkg.quantityFactor() != null && defaultPkg.quantityFactor().signum() > 0
                        ? defaultPkg.quantityFactor() : BigDecimal.ONE;
                String pkgUnitName = defaultPkg != null && defaultPkg.unitName() != null
                        ? defaultPkg.unitName() : si.baseUnitCode();

                BigDecimal availablePkgQty = availableBaseQty.divide(factor, 0, RoundingMode.FLOOR);
                if (availablePkgQty.signum() <= 0) continue; // 关键：可用包装量必须 > 0

                if (searching) {
                    boolean directoryMatch = matchingMedicationIds.contains(medView.id())
                            || matchingProductIds.contains(si.catalogItemId());
                    boolean businessFieldMatch = startsWith(medView.code(), normalizedQuery)
                            || contains(medView.preparationSpec(), normalizedQuery)
                            || matchedProduct != null && (startsWith(matchedProduct.code(), normalizedQuery)
                                    || startsWith(matchedProduct.approvalCode(), normalizedQuery)
                                    || startsWith(matchedProduct.registrationCode(), normalizedQuery)
                                    || startsWith(matchedProduct.purchaseCode(), normalizedQuery));
                    if (!directoryMatch && !businessFieldMatch) continue;
                }

                results.add(new OrderableMedicationView(
                        medView.id(),
                        medView.revision(),
                        medView.itemTypeId(),
                        medView.itemMasterId(),
                        medView.code(),
                        medView.name(),
                        medView.aliasName(),
                        medView.sdMedicationType(),
                        medView.sdDoseForm(),
                        medView.preparationSpec(),
                        medView.preparationUnit(),
                        medView.strengthValue(),
                        medView.strengthUnit(),
                        medView.sdStorageType(),
                        medView.prescriptionDrug(),
                        medView.essentialDrug(),
                        medView.antimicrobial(),
                        medView.sdAntimicrobialLevel(),
                        medView.skinTestRequired(),
                        medView.defaultDose(),
                        medView.defaultDoseUnit(),
                        medView.defaultRoute(),
                        medView.defaultFrequencyId(),
                        medView.defaultFrequency(),
                        medView.chronicDiseaseDrug(),
                        medView.singleOrder(),
                        medView.sdStatus(),
                        site.id(),
                        site.name(),
                        si.id(),
                        availableBaseQty,
                        availablePkgQty,
                        si.baseUnitCode(),
                        pkgUnitName,
                        factor,
                        matchedProduct == null ? List.of() : List.of(matchedProduct)
                ));
            }
        }

        results.sort(Comparator.comparing(OrderableMedicationView::name));
        return results.stream().limit(resultLimit).toList();
    }

    private boolean startsWith(String value, String query) {
        return value != null && value.toLowerCase().startsWith(query);
    }

    private boolean contains(String value, String query) {
        return value != null && value.toLowerCase().contains(query);
    }

    @Override
    @Transactional(readOnly = true)
    public MedicationAvailabilityView inspectMedicationAvailability(Long tenantId, Long organizationId,
                                                                     Long departmentId, Long catalogItemId,
                                                                     Long packageId) {
        LocalDate today = LocalDate.now();
        StockSite site = routedPharmacy(tenantId, organizationId, departmentId, today);
        if (site == null) {
            return new MedicationAvailabilityView(false, null, null, false, null, packageId, null,
                    null, BigDecimal.ZERO, BigDecimal.ZERO);
        }
        StockItem stockItem = stockItemRepository.findByTenantIdAndStockSiteIdAndCatalogItemId(
                tenantId, site.id(), catalogItemId).filter(value -> "ACTIVE".equals(value.status())).orElse(null);
        if (stockItem == null) {
            return new MedicationAvailabilityView(true, site.id(), site.name(), false, null, packageId, null,
                    null, BigDecimal.ZERO, BigDecimal.ZERO);
        }

        Long effectivePackageId = packageId == null ? stockItem.basePackageId() : packageId;
        var catalog = catalogLifecycleDirectory.resolve(tenantId, catalogItemId, organizationId,
                effectivePackageId, "SALE", today);
        BigDecimal factor = catalog.itemPackage() == null || catalog.itemPackage().quantityFactor() == null
                || catalog.itemPackage().quantityFactor().signum() <= 0
                ? BigDecimal.ONE : catalog.itemPackage().quantityFactor();
        String unit = catalog.itemPackage() == null ? catalog.item().unitCode() : catalog.itemPackage().unitCode();
        BigDecimal availableBase = availabilityService.findByItem(tenantId, site.id(), stockItem.id()).stream()
                .filter(value -> "AVAILABLE".equals(value.stockStatus()) && value.quantityAvailable().signum() > 0)
                .map(InventoryBalance::quantityAvailable).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal availablePackages = availableBase.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros();
        return new MedicationAvailabilityView(true, site.id(), site.name(), true, stockItem.id(),
                effectivePackageId, unit, factor, availableBase, availablePackages);
    }

    private StockSite routedPharmacy(Long tenantId, Long organizationId, Long departmentId, LocalDate date) {
        List<DispenseRoute> activeRoutes = dispenseRouteRepository
                .findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId).stream()
                .filter(route -> route.effective(date) && "OUTPATIENT".equals(route.careSetting())
                        && (route.sourceDepartmentId() == null || route.sourceDepartmentId().equals(departmentId)))
                .toList();
        List<DispenseRoute> departmentRoutes = activeRoutes.stream()
                .filter(route -> departmentId.equals(route.sourceDepartmentId())).toList();
        List<DispenseRoute> effectiveRoutes = departmentRoutes.isEmpty() ? activeRoutes : departmentRoutes;
        if (!effectiveRoutes.isEmpty()) {
            Long siteId = effectiveRoutes.getFirst().targetStockSiteId();
            return stockSiteRepository.findById(siteId)
                    .filter(site -> site.tenantId().equals(tenantId) && site.effective(date)).orElse(null);
        }
        return stockSiteRepository.findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId).stream()
                .filter(site -> site.effective(date) && "PHARMACY".equals(site.siteType())).findFirst().orElse(null);
    }

    @Override
    @Transactional
    public PrescriptionFreezeResult freezePrescription(PrescriptionFreezeCommand command) {
        LocalDate today = LocalDate.now();
        String reservationGroup = "RX-" + command.prescriptionId();

        // 查找目标药房（优先精确科室路由，其次全院默认通配路由）
        Long targetSiteId = null;
        List<DispenseRoute> activeRoutes = dispenseRouteRepository.findByTenantIdAndOrganizationIdOrderByCode(
                command.tenantId(), command.organizationId()).stream()
                .filter(r -> r.effective(today) && "OUTPATIENT".equals(r.careSetting())
                        && (r.sourceDepartmentId() == null || r.sourceDepartmentId().equals(command.departmentId())))
                .toList();
        List<DispenseRoute> deptSpecificRoutes = activeRoutes.stream()
                .filter(r -> r.sourceDepartmentId() != null && r.sourceDepartmentId().equals(command.departmentId()))
                .toList();
        List<DispenseRoute> effectiveRoutes = deptSpecificRoutes.isEmpty() ? activeRoutes : deptSpecificRoutes;

        if (!effectiveRoutes.isEmpty()) {
            targetSiteId = effectiveRoutes.getFirst().targetStockSiteId();
        } else {
            targetSiteId = stockSiteRepository.findByTenantIdAndOrganizationIdOrderByCode(
                    command.tenantId(), command.organizationId()).stream()
                    .filter(s -> s.effective(today) && "PHARMACY".equals(s.siteType()))
                    .map(StockSite::id)
                    .findFirst().orElse(null);
        }

        if (targetSiteId == null) {
            throw conflict("DISPENSE_PHARMACY_NOT_FOUND", "未找到当前门诊科室的发药药房配置");
        }

        int frozenCount = 0;
        for (PrescriptionItemFreezeRequest item : command.items()) {
            StockItem stockItem = stockItemRepository.findByTenantIdAndStockSiteIdAndCatalogItemId(
                    command.tenantId(), targetSiteId, item.catalogItemId())
                    .orElse(null);

            if (stockItem == null) {
                // 如果按 catalogItemId 未直接命中，查找属于该药房的全部 stockItem
                List<StockItem> siteItems = stockItemRepository.findByTenantIdAndStockSiteIdOrderById(command.tenantId(), targetSiteId);
                var medViews = catalogLifecycleDirectory.findMedicationsByProductCatalogItemIds(
                        command.tenantId(), command.organizationId(),
                        siteItems.stream().map(StockItem::catalogItemId).toList());
                for (StockItem candidate : siteItems) {
                    for (MedicationView mv : medViews) {
                        if (mv.id().equals(item.catalogItemId())) {
                            stockItem = candidate;
                            break;
                        }
                    }
                    if (stockItem != null) break;
                }
            }

            if (stockItem == null) {
                throw conflict("STOCK_ITEM_NOT_FOUND", "目标发药药房未纳入该药品经营项目，无法开立");
            }

            var snapshot = catalogLifecycleDirectory.resolve(
                    command.tenantId(), stockItem.catalogItemId(), command.organizationId(),
                    item.packageId() != null ? item.packageId() : stockItem.basePackageId(),
                    "SALE", today);

            BigDecimal factor = snapshot.itemPackage() != null && snapshot.itemPackage().quantityFactor() != null
                    ? snapshot.itemPackage().quantityFactor() : BigDecimal.ONE;

            BigDecimal requiredBaseQuantity = item.packageQuantity().multiply(factor);

            List<InventoryBalance> balances = availabilityService.lockIssuable(
                    command.tenantId(), targetSiteId, stockItem.id(), today, stockItem.issuePolicy());

            BigDecimal totalAvailable = balances.stream()
                    .map(InventoryBalance::quantityAvailable)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            if (totalAvailable.compareTo(requiredBaseQuantity) < 0) {
                BigDecimal availablePackages = totalAvailable.divide(factor, 0, RoundingMode.FLOOR);
                String medName = snapshot.medication() != null ? snapshot.medication().name()
                        : (snapshot.item() != null ? snapshot.item().name() : "药品");
                throw conflict("INVENTORY_INSUFFICIENT",
                        "药品【%s】药房可用库存不足（需要 %s %s，当前仅剩 %s %s），请调减数量或更换药品".formatted(
                                medName,
                                item.packageQuantity().stripTrailingZeros().toPlainString(),
                                item.unitName() == null ? "包装" : item.unitName(),
                                availablePackages.stripTrailingZeros().toPlainString(),
                                item.unitName() == null ? "包装" : item.unitName()
                        ));
            }

            BigDecimal remaining = requiredBaseQuantity;
            for (InventoryBalance balance : balances) {
                if (remaining.signum() == 0) break;
                BigDecimal alloc = balance.quantityAvailable().min(remaining);
                if (alloc.signum() <= 0) continue;
                balance.freeze(alloc);
                freezeRepository.save(new PrescriptionInventoryFreeze(
                        command.tenantId(),
                        command.prescriptionId(),
                        item.requestId(),
                        targetSiteId,
                        balance.stockBinId(),
                        stockItem.id(),
                        balance.stockLotId(),
                        alloc,
                        balance.baseUnitCode(),
                        command.actorId()
                ));
                remaining = remaining.subtract(alloc);
            }
            frozenCount++;
        }

        freezeRepository.flush();
        availabilityService.flush();
        return new PrescriptionFreezeResult(command.prescriptionId(), reservationGroup, frozenCount, true);
    }

    @Override
    @Transactional
    public void releasePrescription(PrescriptionReleaseCommand command) {
        List<PrescriptionInventoryFreeze> freezes = freezeRepository.lockActiveByPrescriptionId(
                command.tenantId(), command.prescriptionId());

        for (PrescriptionInventoryFreeze freeze : freezes) {
            InventoryBalance balance = availabilityService.lockDimension(
                    command.tenantId(), freeze.stockBinId(), freeze.stockItemId(), freeze.stockLotId(), "AVAILABLE")
                    .orElse(null);
            if (balance != null) {
                balance.unfreeze(freeze.quantityFrozen());
            }
            freeze.release(command.actorId(), command.reason() == null ? "处方撤销释放" : command.reason());
        }
        freezeRepository.flush();
        availabilityService.flush();
    }
}
