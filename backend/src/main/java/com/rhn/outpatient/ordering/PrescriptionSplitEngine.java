package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.*;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * 门诊处方自动分方规则引擎。
 * 遵循国家《处方管理办法》与三甲医院标准，执行六维分流装箱策略：
 * 1. 发药库房隔离 (Stock Site)
 * 2. 处方大类隔离 (Category: HERBAL / WESTERN / CHINESE_PATENT)
 * 3. 给药途径隔离 (Route: INFUSION vs ORAL)
 * 4. 特殊药品单列 (Single Order)
 * 5. 输液同组原子性保护 (Infusion Group Atomicity)
 * 6. 处方容量装箱约束 (Capacity Limit <= 5)
 */
@Component
public class PrescriptionSplitEngine {
    private static final int MAX_REGULAR_CAPACITY = 5;

    private final CatalogLifecycleDirectory catalogDirectory;
    private final MedicationRouteDirectory routeDirectory;

    public PrescriptionSplitEngine(CatalogLifecycleDirectory catalogDirectory,
                                   MedicationRouteDirectory routeDirectory) {
        this.catalogDirectory = catalogDirectory;
        this.routeDirectory = routeDirectory;
    }

    public List<SplitPrescriptionPlan> plan(EncounterDirectory.EncounterSnapshot encounter,
                                            List<BatchOrderMedicationItem> items) {
        if (items == null || items.isEmpty()) return List.of();
        Long tenantId = encounter.tenantId();
        LocalDate businessDate = encounter.registeredAt() != null
                ? encounter.registeredAt().atZone(java.time.ZoneOffset.UTC).toLocalDate()
                : LocalDate.now();

        // 1. 结构化解析每个药品医嘱项
        List<ItemMeta> metas = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            BatchOrderMedicationItem item = items.get(i);
            MedicationSnapshot med = item.medicationId() != null
                    ? catalogDirectory.requireMedication(tenantId, item.medicationId())
                    : null;
            String category = clean(item.categoryCode());
            if (category == null && med != null) {
                category = med.medicationType();
            }
            if (category == null) category = "WESTERN";

            String routeCode = clean(item.routeCode());
            RouteSnapshot route = routeCode != null
                    ? routeDirectory.resolveActive(tenantId, routeCode, "OUTPATIENT", businessDate).orElse(null)
                    : null;

            boolean isInfusion = "INFUSION".equalsIgnoreCase(clean(item.routeExecutionType()))
                    || (route != null && route.infusion());

            boolean singleOrder = med != null && med.singleOrder();

            Long stockSiteId = item.stockSiteId() != null ? item.stockSiteId() : 0L;
            String stockSiteName = clean(item.stockSiteName()) != null ? clean(item.stockSiteName()) : "默认药房";

            String adminKey = clean(item.administrationGroupKey());

            metas.add(new ItemMeta(i, item, med, category, isInfusion, singleOrder,
                    stockSiteId, stockSiteName, adminKey));
        }

        // 2. 多维分流桶划分
        Map<String, List<ItemMeta>> normalBuckets = new LinkedHashMap<>();
        List<ItemMeta> singleOrderItems = new ArrayList<>();

        for (ItemMeta meta : metas) {
            if (meta.singleOrder()) {
                singleOrderItems.add(meta);
                continue;
            }
            String bucketKey;
            if ("HERBAL".equalsIgnoreCase(meta.category())) {
                bucketKey = "HERBAL|" + meta.stockSiteId();
            } else {
                bucketKey = meta.stockSiteId() + "|" + meta.category() + "|" + (meta.isInfusion() ? "INFUSION" : "ORAL");
            }
            normalBuckets.computeIfAbsent(bucketKey, k -> new ArrayList<>()).add(meta);
        }

        List<SplitPrescriptionPlan> plans = new ArrayList<>();

        // 3. 处理普通桶装箱
        for (Map.Entry<String, List<ItemMeta>> entry : normalBuckets.entrySet()) {
            List<ItemMeta> bucketItems = entry.getValue();
            if (bucketItems.isEmpty()) continue;
            ItemMeta first = bucketItems.getFirst();

            // 如果是草药桶，一剂成方，不限5种
            if ("HERBAL".equalsIgnoreCase(first.category())) {
                List<SplitPrescriptionPlan.PlannedMedicationItem> planned = bucketItems.stream()
                        .map(m -> new SplitPrescriptionPlan.PlannedMedicationItem(m.item(), false, null))
                        .toList();
                List<String> reasons = new ArrayList<>();
                reasons.add("草药饮片专方");
                if (first.stockSiteId() > 0) reasons.add("发药药房隔离（" + first.stockSiteName() + "）");
                plans.add(new SplitPrescriptionPlan("HERBAL", "门诊草药处方", first.stockSiteId(),
                        first.stockSiteName(), "HERBAL", reasons, planned));
                continue;
            }

            // 非草药桶：按输液组聚合为原子装箱单元 (AtomicGroup)
            List<AtomicUnit> units = packageUnits(bucketItems);

            // 执行容量装箱 (Capacity Limit <= 5)
            List<List<AtomicUnit>> prescriptionBins = packUnits(units);

            for (int pIdx = 0; pIdx < prescriptionBins.size(); pIdx++) {
                List<AtomicUnit> bin = prescriptionBins.get(pIdx);
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
                if (first.stockSiteId() > 0) {
                    reasons.add("发药药房隔离（" + first.stockSiteName() + "）");
                }
                if (prescriptionBins.size() > 1) {
                    reasons.add("单方5种容量限制分方（第 " + (pIdx + 1) + " 张）");
                    title += " " + (pIdx + 1);
                }

                plans.add(new SplitPrescriptionPlan(
                        first.category(),
                        title,
                        first.stockSiteId(),
                        first.stockSiteName(),
                        first.isInfusion() ? "INFUSION" : "ORAL",
                        reasons,
                        planned
                ));
            }
        }

        // 4. 处理单列医嘱专方 (Single Order)
        for (ItemMeta s : singleOrderItems) {
            String title = "门诊专方（" + (s.med() != null ? s.med().name() : "单列医嘱") + "）";
            List<String> reasons = List.of("单列药品一药一方", "发药药房隔离（" + s.stockSiteName() + "）");
            plans.add(new SplitPrescriptionPlan(
                    s.category(),
                    title,
                    s.stockSiteId(),
                    s.stockSiteName(),
                    s.isInfusion() ? "INFUSION" : "ORAL",
                    reasons,
                    List.of(new SplitPrescriptionPlan.PlannedMedicationItem(s.item(), false, null))
            ));
        }

        return plans;
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

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
}
