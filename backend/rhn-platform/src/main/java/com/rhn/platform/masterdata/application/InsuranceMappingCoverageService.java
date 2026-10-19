package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.InsuranceCoverageViews.CategorySummary;
import com.rhn.platform.masterdata.api.InsuranceCoverageViews.CoverageItem;
import com.rhn.platform.masterdata.api.InsuranceCoverageViews.CoverageReport;
import com.rhn.platform.masterdata.api.StandardMappingViews.ItemTermMappingView;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.SupplyItemRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/**
 * 在用且可收费的药品、诊疗、耗材与医保目录映射的对照覆盖率。判定口径复用
 * {@link ItemStandardMappingService#isConfirmedInsuranceMapping}，与快捷预结算取目录映射的规则一致。
 */
@Service
public class InsuranceMappingCoverageService {
    public static final List<String> CATEGORIES = List.of("DRUG", "SERVICE", "SUPPLY");
    static final int MAX_PAGE_SIZE = 200;
    private static final Set<String> STATUSES = Set.of("MAPPED", "UNMAPPED", "AMBIGUOUS", "EXPIRED");

    private final MedicationProductRepository drugs;
    private final ServiceCatalogItemRepository services;
    private final SupplyItemRepository supplies;
    private final ItemStandardMappingService mappings;
    private final ExecutionContextProvider contextProvider;

    InsuranceMappingCoverageService(MedicationProductRepository drugs, ServiceCatalogItemRepository services,
                                    SupplyItemRepository supplies, ItemStandardMappingService mappings,
                                    ExecutionContextProvider contextProvider) {
        this.drugs = drugs; this.services = services; this.supplies = supplies;
        this.mappings = mappings; this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public CoverageReport report(String systemCode, String category, String status, String query,
                                 LocalDate businessDate, int page, int size) {
        if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) throw badRequest("COVERAGE_PAGE_INVALID", "分页参数不正确");
        List<CoverageItem> all = classify(normalize(systemCode), businessDate);
        List<CoverageItem> filtered = filter(all, category, status, query);
        int from = (int) Math.min((long) page * size, filtered.size());
        return new CoverageReport(date(businessDate), normalize(systemCode), summarize(all), filtered.subList(from,
                Math.min(filtered.size(), from + size)), page, size, filtered.size());
    }

    /** 导出当前筛选下的全部未达标项目（UTF-8 带 BOM 的 CSV，兼容表格软件）。 */
    @Transactional(readOnly = true)
    public String exportCsv(String systemCode, String category, String status, String query, LocalDate businessDate) {
        List<CoverageItem> items = filter(classify(normalize(systemCode), businessDate), category, status, query);
        StringBuilder out = new StringBuilder("﻿类别,项目编码,项目名称,对照状态,说明,医保目录编码\n");
        for (CoverageItem item : items) {
            out.append(csv(categoryLabel(item.category()))).append(',').append(csv(item.code())).append(',')
                    .append(csv(item.name())).append(',').append(csv(statusLabel(item.status()))).append(',')
                    .append(csv(item.detail())).append(',').append(csv(String.join(";", item.termCodes()))).append('\n');
        }
        return out.toString();
    }

    private List<CoverageItem> classify(String systemCode, LocalDate businessDate) {
        Long tenantId = contextProvider.requireCurrent().tenantId();
        LocalDate at = date(businessDate);
        Map<Long, CoverageItem> base = new LinkedHashMap<>();
        collect(base, "DRUG", drugs.findChargeableRefs(tenantId, at));
        collect(base, "SERVICE", services.findChargeableRefs(tenantId, at));
        collect(base, "SUPPLY", supplies.findChargeableRefs(tenantId, at));
        Map<Long, List<ItemTermMappingView>> history = mappings.insuranceMappingHistory(tenantId, base.keySet());
        List<CoverageItem> result = new ArrayList<>();
        for (CoverageItem item : base.values()) {
            List<ItemTermMappingView> candidates = history.getOrDefault(item.catalogItemId(), List.of()).stream()
                    .filter(value -> systemCode == null || systemCode.equals(value.systemCode())).toList();
            List<ItemTermMappingView> valid = candidates.stream()
                    .filter(value -> ItemStandardMappingService.isConfirmedInsuranceMapping(value, systemCode, at)).toList();
            List<String> codes = valid.stream().map(ItemTermMappingView::termCode).distinct().sorted().toList();
            if (valid.size() == 1) {
                result.add(item(item, "MAPPED", "存在唯一有效映射", codes));
            } else if (valid.size() > 1) {
                result.add(item(item, "AMBIGUOUS",
                        "存在 " + valid.size() + " 个有效映射，快捷预结算会因歧义被拒绝", codes));
            } else if (candidates.stream().anyMatch(value -> equivalent(value) && ended(value, at))) {
                result.add(item(item, "EXPIRED",
                        "原映射已过期、停用或尚未生效，需续期或重新对照", List.of()));
            } else {
                result.add(item(item, "UNMAPPED",
                        candidates.isEmpty() ? "尚未建立医保目录映射" : "仅有非等价（EXACT/EQUIVALENT 以外）的映射", List.of()));
            }
        }
        return result;
    }

    private static CoverageItem item(CoverageItem base, String status, String detail, List<String> termCodes) {
        return new CoverageItem(base.catalogItemId(), base.category(), base.categoryText(), base.code(), base.name(), status,
                statusLabel(status), detail, termCodes);
    }

    private static void collect(Map<Long, CoverageItem> target, String category, List<Object[]> rows) {
        for (Object[] row : rows) {
            Long id = (Long) row[0];
            target.putIfAbsent(id, new CoverageItem(id, category, categoryLabel(category), (String) row[1], (String) row[2], null, null, null, List.of()));
        }
    }

    private static boolean equivalent(ItemTermMappingView value) {
        return "EXACT".equals(value.equivalence()) || "EQUIVALENT".equals(value.equivalence());
    }

    private static boolean ended(ItemTermMappingView value, LocalDate at) {
        return !"ACTIVE".equals(value.status()) || value.validFrom().isAfter(at)
                || (value.validTo() != null && value.validTo().isBefore(at));
    }

    private List<CoverageItem> filter(List<CoverageItem> items, String category, String status, String query) {
        if (category != null && !category.isBlank() && !CATEGORIES.contains(category)) throw badRequest("COVERAGE_CATEGORY_INVALID", "目录类别不正确");
        if (status != null && !status.isBlank() && !STATUSES.contains(status)) throw badRequest("COVERAGE_STATUS_INVALID", "对照状态不正确");
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        return items.stream()
                .filter(item -> category == null || category.isBlank() || category.equals(item.category()))
                .filter(item -> status == null || status.isBlank() || status.equals(item.status()))
                .filter(item -> needle.isEmpty() || item.code().toLowerCase(Locale.ROOT).contains(needle)
                        || item.name().toLowerCase(Locale.ROOT).contains(needle))
                .sorted(Comparator.comparing(CoverageItem::category).thenComparing(CoverageItem::code))
                .toList();
    }

    private List<CategorySummary> summarize(List<CoverageItem> all) {
        Map<String, List<CoverageItem>> byCategory = all.stream().collect(Collectors.groupingBy(CoverageItem::category));
        List<CategorySummary> result = new ArrayList<>();
        for (String category : CATEGORIES) {
            List<CoverageItem> items = byCategory.getOrDefault(category, List.of());
            int mapped = count(items, "MAPPED");
            result.add(new CategorySummary(category, categoryLabel(category), items.size(), mapped, count(items, "UNMAPPED"),
                    count(items, "AMBIGUOUS"), count(items, "EXPIRED"), items.isEmpty() ? null
                    : BigDecimal.valueOf(mapped * 100L).divide(BigDecimal.valueOf(items.size()), 1, RoundingMode.HALF_UP)));
        }
        return result;
    }

    private static int count(List<CoverageItem> items, String status) {
        return (int) items.stream().filter(item -> status.equals(item.status())).count();
    }

    private static LocalDate date(LocalDate value) { return value == null ? LocalDate.now() : value; }
    private static String normalize(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private static String categoryLabel(String category) {
        return switch (category) { case "DRUG" -> "药品"; case "SERVICE" -> "诊疗"; default -> "耗材"; };
    }

    private static String statusLabel(String status) {
        return switch (status) { case "MAPPED" -> "已对照"; case "UNMAPPED" -> "未映射"; case "AMBIGUOUS" -> "歧义"; default -> "已过期"; };
    }

    /** CSV 转义并防止表格软件把以公式字符开头的单元格当作公式执行。 */
    static String csv(String value) {
        String text = value == null ? "" : value;
        if (!text.isEmpty() && "=+-@\t\r".indexOf(text.charAt(0)) >= 0) text = "'" + text;
        return "\"" + text.replace("\"", "\"\"") + "\"";
    }
}
