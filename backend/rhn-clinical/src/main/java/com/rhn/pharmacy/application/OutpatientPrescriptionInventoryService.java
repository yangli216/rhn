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
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
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
    private final DispenseRouteApplicationService routing;
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
                                                   MasterDataSearchDirectory searchDirectory,
                                                   DispenseRouteApplicationService routing) {
        this.dispenseRouteRepository = dispenseRouteRepository;
        this.routing = routing;
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
        var candidates = collectOrderableMedications(tenantId, organizationId, departmentId, query, true);
        int resultLimit = searchDirectory.resolvePreference(tenantId, organizationId, departmentId).resultLimit();
        return candidates.stream().limit(resultLimit).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderableMedicationView> findOrderableMedicationCandidates(Long tenantId, Long organizationId,
                                                                          Long departmentId, String query) {
        return collectOrderableMedications(tenantId, organizationId, departmentId, query, false);
    }

    private List<OrderableMedicationView> collectOrderableMedications(Long tenantId, Long organizationId,
                                                                    Long departmentId, String query, boolean requireWholeStockPackage) {
        LocalDate today = LocalDate.now();
        boolean searching = query != null && !query.isBlank();
        String normalizedQuery = searching ? query.trim().toLowerCase(java.util.Locale.ROOT) : "";

        // 1. 获取已配置的门诊路由候选站点，随后按每个药品类型核实唯一有效目标。
        Set<Long> targetSiteIds = resolveOutpatientTargetSiteIds(tenantId, organizationId, departmentId, today);
        if (targetSiteIds.isEmpty()) {
            throw conflict("DISPENSE_ROUTE_NOT_CONFIGURED", "未配置当前门诊科室的发药路由，请先维护配置");
        }

        Map<Long, StockSite> siteMap = loadEffectiveSites(tenantId, organizationId, targetSiteIds, today);
        if (siteMap.size() != targetSiteIds.size()) {
            throw conflict("ROUTE_TARGET_UNAVAILABLE", "门诊发药路由包含不可用或不支持门诊的目标药房，请核实配置");
        }
        Map<String, java.util.Optional<StockSite>> selectedSites = new HashMap<>();
        List<OrderableMedicationView> results = new ArrayList<>();

        for (StockSite site : siteMap.values()) {
            // 2. 查该药房所有的可用库存（stockStatus = AVAILABLE 且 quantityAvailable > 0）
            SiteStockCandidates candidates = collectSiteStockCandidates(
                    tenantId, organizationId, departmentId, query, searching, site);
            if (candidates == null) continue;

            for (StockItem si : candidates.stockItems()) {
                MedicationView medication = candidates.medViewByCatalogItemId().get(si.catalogItemId());
                if (medication == null) continue;
                StockSite selected = selectedSites.computeIfAbsent(medication.sdMedicationType(), type -> java.util.Optional.ofNullable(
                        routedPharmacy(tenantId, organizationId, departmentId, type, today))).orElse(null);
                if (selected == null || !selected.id().equals(site.id())) continue;
                OrderableMedicationView view = buildOrderableView(si, site, candidates, searching, normalizedQuery, today, requireWholeStockPackage);
                if (view != null) {
                    results.add(view);
                }
            }
        }

        results.sort(Comparator.comparing(OrderableMedicationView::name));
        return List.copyOf(results);
    }

    private OrderableMedicationView buildOrderableView(StockItem si, StockSite site, SiteStockCandidates candidates,
                                                       boolean searching, String normalizedQuery, LocalDate today,
                                                       boolean requireWholeStockPackage) {
        BigDecimal availableBaseQty = candidates.availableByStockItemId().getOrDefault(si.id(), BigDecimal.ZERO);
        if (availableBaseQty.signum() <= 0) return null;

        MedicationView medView = candidates.medViewByCatalogItemId().get(si.catalogItemId());
        if (medView == null) return null;

        List<MedicationProductView> products = medView.products().stream()
                .filter(p -> p.id().equals(si.catalogItemId())).toList();
        if (products.size() != 1) throw conflict("INVENTORY_PRODUCT_UNCONFIRMED", "未确认唯一的库存产品目录信息");
        MedicationProductView matchedProduct = products.getFirst();
        if (searching && !matchesSearch(medView, matchedProduct, si.catalogItemId(),
                candidates.matchingMedicationIds(), candidates.matchingProductIds(), normalizedQuery)) return null;

        PackageView defaultPkg = null;
        if (si.basePackageId() != null) {
            List<PackageView> packages = matchedProduct.packages() == null ? List.of() : matchedProduct.packages().stream()
                    .filter(value -> si.basePackageId().equals(value.id())).toList();
            if (packages.size() != 1) throw conflict("INVENTORY_PACKAGE_UNCONFIRMED", "库存项目配置的包装未确认，请维护目录后重试");
            defaultPkg = packages.getFirst();
        }
        PackageSnapshot packageFacts = defaultPkg == null ? null : new PackageSnapshot(defaultPkg.id(), defaultPkg.unitCode(), defaultPkg.unitName(),
                defaultPkg.packageSpec(), defaultPkg.quantityFactor(), defaultPkg.sdUsageType(), defaultPkg.sdStatus(),
                defaultPkg.validFrom(), defaultPkg.validTo());
        BigDecimal factor = InventoryPackageFacts.factor(si.baseUnitCode(), matchedProduct.unitCode(), si.basePackageId(), packageFacts, today);
        String pkgUnitName = defaultPkg == null ? si.baseUnitCode()
                : defaultPkg.unitName() != null && !defaultPkg.unitName().isBlank() ? defaultPkg.unitName() : defaultPkg.unitCode();

        // The display query offers whole stock packages. Business matching must also retain
        // positive base-unit stock so callers can verify the actual requested package.
        BigDecimal availablePkgQty = requireWholeStockPackage
                ? availableBaseQty.divide(factor, 0, RoundingMode.FLOOR)
                : availableBaseQty.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros();
        if (requireWholeStockPackage && availablePkgQty.signum() <= 0) return null;

        return new OrderableMedicationView(
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
        );
    }

    private Set<Long> resolveOutpatientTargetSiteIds(Long tenantId, Long organizationId, Long departmentId,
                                                     LocalDate today) {
        List<DispenseRoute> activeRoutes = dispenseRouteRepository.findByTenantIdAndOrganizationIdOrderByCode(tenantId, organizationId)
                .stream()
                .filter(r -> r.effective(today) && "OUTPATIENT".equals(r.careSetting())
                        && (r.sourceDepartmentId() == null || r.sourceDepartmentId().equals(departmentId)))
                .toList();

        return activeRoutes.stream().map(DispenseRoute::targetStockSiteId).collect(Collectors.toSet());
    }

    private Map<Long, StockSite> loadEffectiveSites(Long tenantId, Long organizationId, Set<Long> targetSiteIds, LocalDate today) {
        return stockSiteRepository.findAllById(targetSiteIds).stream()
                .filter(s -> s.tenantId().equals(tenantId) && s.organizationId().equals(organizationId) && s.effective(today)
                        && "PHARMACY".equals(s.siteType()) && Set.of("OUTPATIENT", "MIXED").contains(s.serviceScope()))
                .collect(Collectors.toMap(StockSite::id, s -> s));
    }

    private SiteStockCandidates collectSiteStockCandidates(Long tenantId, Long organizationId, Long departmentId,
                                                           String query, boolean searching, StockSite site) {
        List<InventoryBalance> siteBalances = availabilityService.findBySite(tenantId, site.id()).stream()
                .filter(b -> "AVAILABLE".equals(b.stockStatus()) && b.quantityAvailable().signum() > 0)
                .toList();
        if (siteBalances.isEmpty()) return null;

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
        if (stockItems.isEmpty()) return null;

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

        return new SiteStockCandidates(availableByStockItemId, stockItems, medViewByCatalogItemId,
                matchingMedicationIds, matchingProductIds);
    }

    private boolean matchesSearch(MedicationView medView, MedicationProductView matchedProduct, Long catalogItemId,
                                  Set<Long> matchingMedicationIds, Set<Long> matchingProductIds, String normalizedQuery) {
        boolean directoryMatch = matchingMedicationIds.contains(medView.id())
                || matchingProductIds.contains(catalogItemId);
        boolean businessFieldMatch = startsWith(medView.code(), normalizedQuery)
                || contains(medView.name(), normalizedQuery)
                || contains(medView.aliasName(), normalizedQuery)
                || matchesCompoundForm(medView.name(), normalizedQuery)
                || contains(medView.preparationSpec(), normalizedQuery)
                || matchedProduct != null && (startsWith(matchedProduct.code(), normalizedQuery)
                        || contains(matchedProduct.name(), normalizedQuery)
                        || startsWith(matchedProduct.approvalCode(), normalizedQuery)
                        || startsWith(matchedProduct.registrationCode(), normalizedQuery)
                        || startsWith(matchedProduct.purchaseCode(), normalizedQuery));
        return directoryMatch || businessFieldMatch;
    }

    private static final java.util.regex.Pattern COMPOUND_FORM_PATTERN =
            java.util.regex.Pattern.compile("^(.*?)[（\\(](.*?)[）\\)]$");

    private boolean matchesCompoundForm(String catalogName, String normalizedQuery) {
        if (catalogName == null || normalizedQuery == null || normalizedQuery.isBlank()) return false;
        var matcher = COMPOUND_FORM_PATTERN.matcher(catalogName.trim());
        if (!matcher.matches()) return false;
        String baseName = matcher.group(1).trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
        String formPart = matcher.group(2).trim().toLowerCase(java.util.Locale.ROOT);
        String normQuery = normalizedQuery.trim().toLowerCase(java.util.Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
        if (baseName.isBlank() || formPart.isBlank()) return false;
        if (!normQuery.startsWith(baseName)) return false;
        String suffix = normQuery.substring(baseName.length());
        if (suffix.isBlank()) return false;
        for (String form : formPart.split("[,，、/\\s]+")) {
            String cleanForm = form.replaceAll("[\\p{P}\\p{Z}\\s]+", "");
            if (suffix.equals(cleanForm) || suffix.equals(cleanForm.replaceAll("剂$", "")) || (cleanForm + "剂").equals(suffix)) {
                return true;
            }
        }
        return false;
    }

    private record SiteStockCandidates(
            Map<Long, BigDecimal> availableByStockItemId,
            List<StockItem> stockItems,
            Map<Long, MedicationView> medViewByCatalogItemId,
            Set<Long> matchingMedicationIds,
            Set<Long> matchingProductIds) {
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
        return inspectAvailability(tenantId, organizationId, departmentId, catalogItemId, packageId, true);
    }

    @Override
    @Transactional(readOnly = true)
    public MedicationAvailabilityView inspectMedicationAvailabilityForExactPackage(Long tenantId, Long organizationId,
                                                                                  Long departmentId, Long catalogItemId, Long packageId) {
        return inspectAvailability(tenantId, organizationId, departmentId, catalogItemId, packageId, false);
    }

    private MedicationAvailabilityView inspectAvailability(Long tenantId, Long organizationId, Long departmentId,
                                                           Long catalogItemId, Long packageId, boolean useStockDefault) {
        LocalDate today = LocalDate.now();
        var requestedCatalog = catalogLifecycleDirectory.resolve(tenantId, catalogItemId, organizationId, packageId, "SALE", today);
        StockSite site = routedPharmacy(tenantId, organizationId, departmentId, medicationType(requestedCatalog), today);
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

        Long effectivePackageId = packageId == null && useStockDefault ? stockItem.basePackageId() : packageId;
        var catalog = catalogLifecycleDirectory.resolve(tenantId, catalogItemId, organizationId,
                effectivePackageId, "SALE", today);
        BigDecimal factor = InventoryPackageFacts.factor(stockItem.baseUnitCode(), catalog.item().unitCode(),
                effectivePackageId, catalog.itemPackage(), today);
        String unit = catalog.itemPackage() == null ? catalog.item().unitCode() : catalog.itemPackage().unitCode();
        BigDecimal availableBase = availabilityService.findByItem(tenantId, site.id(), stockItem.id()).stream()
                .filter(value -> "AVAILABLE".equals(value.stockStatus()) && value.quantityAvailable().signum() > 0)
                .map(InventoryBalance::quantityAvailable).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal availablePackages = availableBase.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros();
        return new MedicationAvailabilityView(true, site.id(), site.name(), true, stockItem.id(),
                effectivePackageId, unit, factor, availableBase, availablePackages);
    }

    @Override
    @Transactional(readOnly = true)
    public DispensingPharmacy requireDispensingPharmacy(Long tenantId, Long organizationId, Long departmentId,
                                                       String medicationType, LocalDate businessDate) {
        StockSite site = routedPharmacy(tenantId, organizationId, departmentId, medicationType, businessDate);
        if (site == null) throw conflict("DISPENSE_PHARMACY_NOT_FOUND", "未配置当前科室及药品类型的发药路由");
        if (site.name() == null || site.name().isBlank()) throw conflict("DISPENSE_PHARMACY_UNCONFIRMED", "发药药房名称尚未确认");
        return new DispensingPharmacy(site.id(), site.name());
    }

    private StockSite routedPharmacy(Long tenantId, Long organizationId, Long departmentId, String medicationType, LocalDate date) {
        if (medicationType == null || medicationType.isBlank()) {
            throw conflict("MEDICATION_TYPE_UNCONFIRMED", "药品类型尚未确认，无法确定发药药房");
        }
        var resolution = routing.resolveDetailed(tenantId, organizationId, departmentId, medicationType, "OUTPATIENT", date);
        if ("NOT_CONFIGURED".equals(resolution.status())) return null;
        if (!resolution.matched()) throw conflict(resolution.errorCode(), resolution.errorMessage());
        return stockSiteRepository.findByIdAndTenantId(resolution.route().stockSiteId(), tenantId)
                .orElseThrow(() -> conflict("ROUTE_TARGET_UNAVAILABLE", "已配置的发药药房不可用"));
    }

    private String medicationType(CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog) {
        if (catalog == null || catalog.medication() == null) {
            throw conflict("MEDICATION_CATALOG_REQUIRED", "当前目录未确认药品产品，无法确定发药药房");
        }
        return catalog.medication().medicationType();
    }

    @Override
    @Transactional
    public PrescriptionFreezeResult freezePrescription(PrescriptionFreezeCommand command) {
        LocalDate today = LocalDate.now();
        String reservationGroup = "RX-" + command.prescriptionId();

        int frozenCount = 0;
        for (PrescriptionItemFreezeRequest item : command.items()) {
            var catalog = catalogLifecycleDirectory.resolve(command.tenantId(), item.catalogItemId(),
                    command.organizationId(), item.packageId(), "SALE", today);
            StockSite site = routedPharmacy(command.tenantId(), command.organizationId(), command.departmentId(),
                    medicationType(catalog), today);
            if (site == null) throw conflict("DISPENSE_PHARMACY_NOT_FOUND", "未配置当前门诊科室及药品类型的发药路由");
            Long targetSiteId = site.id();
            StockItem stockItem = stockItemRepository.findByTenantIdAndStockSiteIdAndCatalogItemId(
                    command.tenantId(), targetSiteId, item.catalogItemId())
                    .filter(value -> "ACTIVE".equals(value.status())).orElse(null);

            if (stockItem == null) {
                throw conflict("STOCK_ITEM_NOT_FOUND", "目标发药药房未纳入该药品经营项目，无法开立");
            }

            FreezeLineStock lineStock = prepareFreezeLineStock(command, item, targetSiteId, stockItem, today);

            allocateAndFreeze(command, item, targetSiteId, stockItem,
                    lineStock.requiredBaseQuantity(), lineStock.balances());
            frozenCount++;
        }

        freezeRepository.flush();
        availabilityService.flush();
        return new PrescriptionFreezeResult(command.prescriptionId(), reservationGroup, frozenCount, true);
    }

    private FreezeLineStock prepareFreezeLineStock(PrescriptionFreezeCommand command, PrescriptionItemFreezeRequest item,
                                                   Long targetSiteId, StockItem stockItem, LocalDate today) {
        BigDecimal requiredBaseQuantity = item.baseQuantity();
        if (requiredBaseQuantity == null || requiredBaseQuantity.signum() <= 0
                || requiredBaseQuantity.stripTrailingZeros().scale() > 8
                || requiredBaseQuantity.precision() - requiredBaseQuantity.scale() > 20
                || item.baseUnitCode() == null || item.baseUnitCode().isBlank()
                || !item.baseUnitCode().equals(stockItem.baseUnitCode())) {
            throw conflict("PRESCRIPTION_FREEZE_QUANTITY_UNCONFIRMED", "医嘱基础数量或单位快照与库存项目不一致，无法冻结");
        }

        List<InventoryBalance> balances = availabilityService.lockIssuable(
                command.tenantId(), targetSiteId, stockItem.id(), today, stockItem.issuePolicy());

        if (balances.stream().anyMatch(balance -> !item.baseUnitCode().equals(balance.baseUnitCode())
                || !stockItem.id().equals(balance.stockItemId()) || !targetSiteId.equals(balance.stockSiteId()))) {
            throw conflict("PRESCRIPTION_FREEZE_BALANCE_MISMATCH", "库存余额的项目、药房或单位与医嘱快照不一致");
        }
        BigDecimal totalAvailable = balances.stream()
                .map(InventoryBalance::quantityAvailable)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalAvailable.compareTo(requiredBaseQuantity) < 0) {
            throw conflict("INVENTORY_INSUFFICIENT",
                    "药品产品【%s】药房可用库存不足（需要 %s %s，当前仅剩 %s %s），请调减数量或更换药品".formatted(
                            item.catalogItemId(), requiredBaseQuantity.stripTrailingZeros().toPlainString(), item.baseUnitCode(),
                            totalAvailable.stripTrailingZeros().toPlainString(), item.baseUnitCode()));
        }

        return new FreezeLineStock(requiredBaseQuantity, balances);
    }

    private void allocateAndFreeze(PrescriptionFreezeCommand command, PrescriptionItemFreezeRequest item,
                                   Long targetSiteId, StockItem stockItem, BigDecimal requiredBaseQuantity,
                                   List<InventoryBalance> balances) {
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
    }

    private record FreezeLineStock(BigDecimal requiredBaseQuantity, List<InventoryBalance> balances) {
    }

    @Override
    @Transactional
    public void releasePrescription(PrescriptionReleaseCommand command) {
        List<PrescriptionInventoryFreeze> freezes = freezeRepository.lockActiveByPrescriptionId(
                command.tenantId(), command.prescriptionId());

        Map<InventoryBalance, BigDecimal> releases = new java.util.LinkedHashMap<>();
        for (PrescriptionInventoryFreeze freeze : freezes) {
            InventoryBalance balance = availabilityService.lockDimension(
                    command.tenantId(), freeze.stockBinId(), freeze.stockItemId(), freeze.stockLotId(), "AVAILABLE")
                    .orElseThrow(() -> conflict("PRESCRIPTION_FREEZE_BALANCE_MISSING", "冻结对应的库存余额缺失，不能标记为已释放"));
            if (freeze.quantityFrozen() == null || freeze.quantityFrozen().signum() <= 0
                    || freeze.baseUnitCode() == null || !freeze.baseUnitCode().equals(balance.baseUnitCode())
                    || !freeze.stockSiteId().equals(balance.stockSiteId())
                    || !freeze.stockItemId().equals(balance.stockItemId())
                    || !freeze.stockBinId().equals(balance.stockBinId())
                    || !freeze.stockLotId().equals(balance.stockLotId())) {
                throw conflict("PRESCRIPTION_FREEZE_BALANCE_MISMATCH", "冻结记录与库存余额的维度、数量或单位不一致，不能释放");
            }
            releases.merge(balance, freeze.quantityFrozen(), BigDecimal::add);
        }
        releases.forEach((balance, quantity) -> {
            if (balance.quantityFrozen().compareTo(quantity) < 0) {
                throw conflict("PRESCRIPTION_FREEZE_BALANCE_INSUFFICIENT", "库存冻结量不足以释放全部对应记录，请核实库存账");
            }
        });
        releases.forEach(InventoryBalance::unfreeze);
        freezes.forEach(freeze -> freeze.release(command.actorId(), command.reason() == null ? "处方撤销释放" : command.reason()));
        freezeRepository.flush();
        availabilityService.flush();
    }
}
