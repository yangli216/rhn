package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * 门诊处方自动分方规则引擎。
 * 基于实际目录与发药路由执行以下分方策略：
 * 1. 发药库房隔离 (Stock Site)
 * 2. 处方大类隔离 (Category: HERBAL / WESTERN / CHINESE_PATENT)
 * 3. 给药途径隔离 (Route: INFUSION vs NON_INFUSION)
 * 4. 特殊药品单列 (Single Order)
 * 5. 输液同组原子性保护 (Infusion Group Atomicity)
 * 6. 处方容量装箱约束 (Capacity Limit <= 5)
 */
@Component
public class PrescriptionSplitEngine {
    private static final int MAX_REGULAR_CAPACITY = 5;

    private final CatalogLifecycleDirectory catalogDirectory;
    private final MedicationRouteDirectory routeDirectory;
    private final OutpatientPrescriptionInventoryDirectory inventoryDirectory;

    public PrescriptionSplitEngine(CatalogLifecycleDirectory catalogDirectory,
                                   MedicationRouteDirectory routeDirectory,
                                   OutpatientPrescriptionInventoryDirectory inventoryDirectory) {
        this.catalogDirectory = catalogDirectory;
        this.routeDirectory = routeDirectory;
        this.inventoryDirectory = inventoryDirectory;
    }

    public List<SplitPrescriptionPlan> plan(EncounterDirectory.EncounterSnapshot encounter,
                                            List<BatchOrderMedicationItem> items) {
        if (items == null || items.isEmpty()) return List.of();
        // 与正式开立默认业务日期保持一致，不使用就诊登记日替代当前目录有效日。
        LocalDate businessDate = LocalDate.now();
        List<ItemMeta> metas = buildItemMetas(encounter, items, businessDate);

        // 2. 多维分流桶划分
        BucketPartition partition = partitionBuckets(metas);
        List<ItemMeta> singleOrderItems = partition.singleOrderItems();

        List<SplitPrescriptionPlan> plans = new ArrayList<>();

        // 3. 处理普通桶装箱
        planNormalBuckets(partition.normalBuckets(), plans);

        // 4. 处理单列医嘱专方 (Single Order)
        planSingleOrderItems(singleOrderItems, plans);

        return plans;
    }

    private List<ItemMeta> buildItemMetas(EncounterDirectory.EncounterSnapshot encounter, List<BatchOrderMedicationItem> items, LocalDate businessDate) {
        Long tenantId = encounter.tenantId();
        List<ItemMeta> metas = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            BatchOrderMedicationItem item = items.get(i);
            MedicationSnapshot med;
            if (item.catalogItemId() != null) {
                var catalog = catalogDirectory.resolve(tenantId, item.catalogItemId(), encounter.organizationId(),
                        item.packageId(), Strings.trimToNull(item.priceType()) == null ? "SALE" : item.priceType(), businessDate);
                if (catalog == null || catalog.item() == null || !"MED_PRODUCT".equals(catalog.item().itemType())
                        || !item.catalogItemId().equals(catalog.item().id()) || catalog.medication() == null) {
                    throw badRequest("SPLIT_MEDICATION_PRODUCT_UNCONFIRMED", "分方未确认真实药品产品及其通用药品");
                }
                med = catalog.medication();
                if (item.medicationId() != null && !item.medicationId().equals(med.id())) {
                    throw badRequest("MEDICATION_REQUEST_PRODUCT_MISMATCH", "所选药品产品不属于当前通用药品");
                }
            } else {
                if (item.medicationId() == null) throw badRequest("SPLIT_MEDICATION_REQUIRED", "分方必须选择真实药品");
                med = catalogDirectory.requireMedication(tenantId, item.medicationId());
            }
            if (med == null || med.id() == null || !"ACTIVE".equals(med.status())
                    || med.medicationType() == null || !Set.of("WESTERN", "CHINESE_PATENT", "HERBAL").contains(med.medicationType())) {
                throw badRequest("SPLIT_MEDICATION_UNCONFIRMED", "药品状态或分类尚未确认，无法分方");
            }
            String category = med.medicationType();
            if (Strings.trimToNull(item.categoryCode()) != null && !category.equals(item.categoryCode())) {
                throw badRequest("SPLIT_CATEGORY_CHANGED", "药品分类与当前目录不一致，请重新核对");
            }
            String routeCode = Strings.trimToNull(item.routeCode());
            if (routeCode == null) routeCode = Strings.trimToNull(med.defaultRoute());
            if (routeCode == null) throw badRequest("SPLIT_ROUTE_REQUIRED", "给药途径尚未确认，无法分方");
            RouteSnapshot route = routeDirectory.requireActive(tenantId, routeCode, "OUTPATIENT", businessDate);
            if (route == null || Strings.trimToNull(route.code()) == null || route.executionType() == null
                    || !Set.of("NONE", "ADMINISTRATION", "INFUSION").contains(route.executionType())) {
                throw badRequest("SPLIT_ROUTE_UNCONFIRMED", "给药途径执行类型尚未确认，无法分方");
            }
            if (Strings.trimToNull(item.routeExecutionType()) != null && !route.executionType().equals(item.routeExecutionType())) {
                throw badRequest("SPLIT_ROUTE_CHANGED", "给药途径执行类型与当前目录不一致，请重新核对");
            }
            boolean isInfusion = route.infusion();
            boolean singleOrder = med.singleOrder();
            Long stockSiteId = null;
            String stockSiteName = null;
            if (!item.selfProvided()) {
                var pharmacy = inventoryDirectory.requireDispensingPharmacy(tenantId, encounter.organizationId(),
                        encounter.departmentId(), category, businessDate);
                if (pharmacy == null || pharmacy.id() == null || pharmacy.id() <= 0 || Strings.trimToNull(pharmacy.name()) == null) {
                    throw badRequest("SPLIT_PHARMACY_UNCONFIRMED", "发药药房尚未确认，无法分方");
                }
                if (item.stockSiteId() != null && !item.stockSiteId().equals(pharmacy.id())) {
                    throw badRequest("SPLIT_PHARMACY_CHANGED", "发药路由已变化，请重新检索药品并核对药房");
                }
                stockSiteId = pharmacy.id(); stockSiteName = pharmacy.name();
            }
            // requireActive 同时核实正式代码和目录别名，保留已验证的输入代码以对应预览明细。
            item = item.withResolvedFacts(med.id(), category, routeCode, route.executionType(), stockSiteId, stockSiteName);

            String adminKey = Strings.trimToNull(item.administrationGroupKey());

            metas.add(new ItemMeta(i, item, med, category, isInfusion, singleOrder,
                    stockSiteId, stockSiteName, adminKey));
        }
        return metas;
    }

    private BucketPartition partitionBuckets(List<ItemMeta> metas) {
        Map<String, List<ItemMeta>> normalBuckets = new LinkedHashMap<>();
        List<ItemMeta> singleOrderItems = new ArrayList<>();

        for (ItemMeta meta : metas) {
            // 同组输液（isInfusion 且 adminKey 存在）受同组原子性保护，整体在输液桶中装箱，不拆分成独立单列专方
            if (meta.singleOrder() && !(meta.isInfusion() && meta.adminKey() != null)) {
                singleOrderItems.add(meta);
                continue;
            }
            String bucketKey;
            if ("HERBAL".equalsIgnoreCase(meta.category())) {
                bucketKey = "HERBAL|" + meta.stockSiteId();
            } else if (meta.isInfusion()) {
                // 输液桶：按发药药房与输液途径归集，确保同组输液不被大类拆散
                bucketKey = meta.stockSiteId() + "|INFUSION";
            } else {
                bucketKey = meta.stockSiteId() + "|" + meta.category() + "|NON_INFUSION";
            }
            normalBuckets.computeIfAbsent(bucketKey, k -> new ArrayList<>()).add(meta);
        }
        return new BucketPartition(normalBuckets, singleOrderItems);
    }

    private void planNormalBuckets(Map<String, List<ItemMeta>> normalBuckets, List<SplitPrescriptionPlan> plans) {
        for (Map.Entry<String, List<ItemMeta>> entry : normalBuckets.entrySet()) {
            List<ItemMeta> bucketItems = entry.getValue();
            if (bucketItems.isEmpty()) continue;
            ItemMeta first = bucketItems.getFirst();

            // 如果是草药桶，一剂成方，不限5种
            if ("HERBAL".equalsIgnoreCase(first.category())) {
                plans.add(buildHerbalPlan(bucketItems, first));
                continue;
            }

            // 非草药桶：按输液组聚合为原子装箱单元 (AtomicGroup)
            List<AtomicUnit> units = packageUnits(bucketItems);

            // 执行容量装箱 (Capacity Limit <= 5)
            List<List<AtomicUnit>> prescriptionBins = packUnits(units);

            for (int pIdx = 0; pIdx < prescriptionBins.size(); pIdx++) {
                plans.add(buildRegularBinPlan(first, prescriptionBins.get(pIdx), pIdx, prescriptionBins.size()));
            }
        }
    }

    private SplitPrescriptionPlan buildHerbalPlan(List<ItemMeta> bucketItems, ItemMeta first) {
        List<SplitPrescriptionPlan.PlannedMedicationItem> planned = bucketItems.stream()
                .map(m -> new SplitPrescriptionPlan.PlannedMedicationItem(m.item(), false, null))
                .toList();
        List<String> reasons = new ArrayList<>();
        reasons.add("草药饮片专方");
        if (first.stockSiteId() != null) reasons.add("发药药房隔离（" + first.stockSiteName() + "）");
        return new SplitPrescriptionPlan("HERBAL", "门诊草药处方", first.stockSiteId(),
                first.stockSiteName(), "HERBAL", reasons, planned);
    }

    private SplitPrescriptionPlan buildRegularBinPlan(ItemMeta first, List<AtomicUnit> bin, int pIdx, int binCount) {
        List<SplitPrescriptionPlan.PlannedMedicationItem> planned = new ArrayList<>();
        boolean hasInfusionGroup = false;

        for (AtomicUnit unit : bin) {
            if (unit.items().size() > 1) hasInfusionGroup = true;
            for (int uIdx = 0; uIdx < unit.items().size(); uIdx++) {
                ItemMeta m = unit.items().get(uIdx);
                planned.add(new SplitPrescriptionPlan.PlannedMedicationItem(
                        m.item(),
                        uIdx == 0 && unit.items().size() > 1, // 首条为组头
                        unit.groupKey()
                ));
            }
        }

        List<String> reasons = new ArrayList<>();
        String title;
        if (first.isInfusion()) {
            title = "门诊输液处方";
            reasons.add("静脉输液途径隔离");
            if (hasInfusionGroup) reasons.add("同组输液原子性保护");
        } else if ("CHINESE_PATENT".equalsIgnoreCase(first.category())) {
            title = "门诊中成药处方";
            reasons.add("中成药分类专方");
        } else {
            title = "门诊西药处方";
            reasons.add("西药分类专方");
        }
        if (first.stockSiteId() != null) {
            reasons.add("发药药房隔离（" + first.stockSiteName() + "）");
        }
        if (binCount > 1) {
            reasons.add("单方5种容量限制分方（第 " + (pIdx + 1) + " 张）");
            title += " " + (pIdx + 1);
        }

        return new SplitPrescriptionPlan(
                first.category(),
                title,
                first.stockSiteId(),
                first.stockSiteName(),
                first.isInfusion() ? "INFUSION" : "NON_INFUSION",
                reasons,
                planned
        );
    }

    private void planSingleOrderItems(List<ItemMeta> singleOrderItems, List<SplitPrescriptionPlan> plans) {
        for (ItemMeta s : singleOrderItems) {
            String title = "门诊专方（" + (s.med() != null ? s.med().name() : "单列医嘱") + "）";
            List<String> reasons = new ArrayList<>(List.of("单列药品一药一方"));
            if (s.stockSiteId() != null) reasons.add("发药药房隔离（" + s.stockSiteName() + "）");
            else reasons.add("患者自备，无需药房发药");
            plans.add(new SplitPrescriptionPlan(
                    s.category(),
                    title,
                    s.stockSiteId(),
                    s.stockSiteName(),
                    s.isInfusion() ? "INFUSION" : "NON_INFUSION",
                    reasons,
                    List.of(new SplitPrescriptionPlan.PlannedMedicationItem(s.item(), false, null))
            ));
        }
    }

    private List<AtomicUnit> packageUnits(List<ItemMeta> bucketItems) {
        List<AtomicUnit> units = new ArrayList<>();
        Map<String, List<ItemMeta>> groupedInfusions = new LinkedHashMap<>();
        for (ItemMeta item : bucketItems) {
            if (item.adminKey() != null && item.isInfusion()) {
                groupedInfusions.computeIfAbsent(item.adminKey(), k -> new ArrayList<>()).add(item);
            }
        }

        Set<Integer> processedIndexes = new HashSet<>();
        for (ItemMeta item : bucketItems) {
            if (processedIndexes.contains(item.index())) continue;
            if (item.adminKey() != null && item.isInfusion() && groupedInfusions.containsKey(item.adminKey())) {
                List<ItemMeta> group = groupedInfusions.get(item.adminKey());
                if (group.size() > MAX_REGULAR_CAPACITY) {
                    throw badRequest("INFUSION_GROUP_EXCEEDS_CAPACITY",
                            "输液同组药品数(" + group.size() + ")超过单张处方5种上限，请调整组内药品");
                }
                units.add(new AtomicUnit(item.adminKey(), group));
                group.forEach(g -> processedIndexes.add(g.index()));
            } else {
                units.add(new AtomicUnit(null, List.of(item)));
                processedIndexes.add(item.index());
            }
        }
        return units;
    }

    private List<List<AtomicUnit>> packUnits(List<AtomicUnit> units) {
        List<List<AtomicUnit>> bins = new ArrayList<>();
        List<AtomicUnit> currentBin = new ArrayList<>();
        int currentCount = 0;

        for (AtomicUnit unit : units) {
            int unitSize = unit.items().size();
            if (!currentBin.isEmpty() && currentCount + unitSize > MAX_REGULAR_CAPACITY) {
                bins.add(currentBin);
                currentBin = new ArrayList<>();
                currentCount = 0;
            }
            currentBin.add(unit);
            currentCount += unitSize;
        }
        if (!currentBin.isEmpty()) {
            bins.add(currentBin);
        }
        return bins;
    }

    private record ItemMeta(
            int index,
            BatchOrderMedicationItem item,
            MedicationSnapshot med,
            String category,
            boolean isInfusion,
            boolean singleOrder,
            Long stockSiteId,
            String stockSiteName,
            String adminKey
    ) {}

    private record AtomicUnit(
            String groupKey,
            List<ItemMeta> items
    ) {}

    private record BucketPartition(
            Map<String, List<ItemMeta>> normalBuckets,
            List<ItemMeta> singleOrderItems
    ) {}
}
