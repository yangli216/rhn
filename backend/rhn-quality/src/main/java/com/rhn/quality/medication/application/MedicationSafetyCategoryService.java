package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationSafetyCategoryContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationSafetyCategoryStore;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationSafetyCategoryService implements com.rhn.quality.medication.domain.MedicationSafetyCategoryMembership {
    private final MedicationSafetyCategoryStore store;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    // 标准目录内存数据
    private final List<StandardCatalogCategorySummary> standardCatalogSummaries = new ArrayList<>();
    private final Map<String, List<String>> genericNamesBySubCategory = new HashMap<>();

    // 高性能本地内存缓存：(tenantId + ":" + categoryCode) -> 药品成员名称与目录继承配置
    private final Map<String, CacheEntry> categoryCache = new ConcurrentHashMap<>();
    private static final long CACHE_TTL_MS = 30_000L;

    private record CachedCategoryData(
            Set<String> directMemberNames,
            String catalogSub,
            boolean systemicOnly,
            List<String> catalogGenericNames
    ) {}

    private record CacheEntry(CachedCategoryData data, long timestamp) {
        boolean isExpired() {
            return System.currentTimeMillis() - timestamp > CACHE_TTL_MS;
        }
    }

    public MedicationSafetyCategoryService(
            MedicationSafetyCategoryStore store,
            ExecutionContextProvider contextProvider,
            JsonCodec jsonCodec
    ) {
        this.store = store;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
        loadStandardCatalogData();
    }

    private void loadStandardCatalogData() {
        try {
            ClassPathResource resource = new ClassPathResource("medication-standard-catalog.json");
            if (!resource.exists()) return;
            try (InputStream input = resource.getInputStream()) {
                JsonNode root = jsonCodec.readTree(new String(input.readAllBytes(), StandardCharsets.UTF_8));
                JsonNode entriesNode = root.path("entries");

                Map<String, Set<String>> namesBySub = new LinkedHashMap<>();
                Map<String, String> majorBySub = new HashMap<>();

                entriesNode.forEach(entry -> {
                    String name = entry.path("name").asString("");
                    if (name.isBlank()) return;
                    JsonNode categories = entry.path("categories");
                    categories.forEach(cat -> {
                        String major = cat.path("major").asString("").trim();
                        String sub = cat.path("sub").asString("").trim();
                        if (!sub.isBlank()) {
                            namesBySub.computeIfAbsent(sub, k -> new LinkedHashSet<>()).add(name);
                            if (!major.isBlank()) {
                                majorBySub.put(sub, major);
                            }
                        }
                    });
                });

                for (var entry : namesBySub.entrySet()) {
                    String sub = entry.getKey();
                    String major = majorBySub.getOrDefault(sub, "");
                    List<String> names = List.copyOf(entry.getValue());
                    genericNamesBySubCategory.put(sub, names);
                    standardCatalogSummaries.add(new StandardCatalogCategorySummary(
                            major, sub, names.size(), names
                    ));
                }
                standardCatalogSummaries.sort(Comparator.comparing(StandardCatalogCategorySummary::major)
                        .thenComparing(StandardCatalogCategorySummary::sub));
            }
        } catch (Exception e) {
            // 标准目录加载异常降级，不阻断系统启动
        }
    }

    @Transactional(readOnly = true)
    public List<CategoryView> listCategories(String query, String ruleKind) {
        Long tenantId = TenantContext.requireTenantId();
        return store.findCategories(tenantId, query, ruleKind);
    }

    @Transactional(readOnly = true)
    public CategoryView getCategory(Long id) {
        Long tenantId = TenantContext.requireTenantId();
        return store.findCategoryById(tenantId, id)
                .orElseThrow(() -> notFound("SAFETY_CATEGORY_NOT_FOUND", "未找到指定合理用药安全分类"));
    }

    @Transactional
    public CategoryView createCategory(CreateCategoryRequest req) {
        Long tenantId = TenantContext.requireTenantId();
        Long userId = contextProvider.requireCurrent().subjectId();
        if (req.code() == null || req.code().isBlank()) {
            throw badRequest("CATEGORY_CODE_REQUIRED", "分类编码不能为空");
        }
        if (req.name() == null || req.name().isBlank()) {
            throw badRequest("CATEGORY_NAME_REQUIRED", "分类名称不能为空");
        }
        if (req.ruleKind() == null || req.ruleKind().isBlank()) {
            throw badRequest("RULE_KIND_REQUIRED", "规则类别不能为空");
        }
        if (store.findCategoryByCode(tenantId, req.code().trim().toUpperCase()).isPresent()) {
            throw conflict("CATEGORY_CODE_EXISTS", "该分类编码已存在");
        }
        CategoryView created = store.createCategory(tenantId, userId, req);
        invalidateCache(tenantId, req.code().trim().toUpperCase());
        return created;
    }

    @Transactional
    public CategoryView updateCategory(Long id, UpdateCategoryRequest req) {
        Long tenantId = TenantContext.requireTenantId();
        Long userId = contextProvider.requireCurrent().subjectId();
        CategoryView existing = getCategory(id);
        if (req.name() == null || req.name().isBlank()) {
            throw badRequest("CATEGORY_NAME_REQUIRED", "分类名称不能为空");
        }
        CategoryView updated = store.updateCategory(tenantId, id, userId, req);
        invalidateCache(tenantId, existing.code());
        return updated;
    }

    @Transactional
    public void deleteCategory(Long id) {
        Long tenantId = TenantContext.requireTenantId();
        CategoryView existing = getCategory(id);
        if (existing.isSystem()) {
            throw forbidden("SYSTEM_CATEGORY_PROTECTED", "系统预置核心分类不可删除，仅可维护其药品成员");
        }
        store.deleteCategory(tenantId, id);
        invalidateCache(tenantId, existing.code());
    }

    @Transactional(readOnly = true)
    public List<MemberView> listMembers(Long categoryId, String query) {
        Long tenantId = TenantContext.requireTenantId();
        CategoryView cat = getCategory(categoryId);
        List<MemberView> directMembers = store.findMembers(tenantId, categoryId, query);

        // 如果该安全分类配置了标准目录级联继承，获取目录下匹配的药品，合并未显式纳管的成员
        if (cat.catalogSub() != null && !cat.catalogSub().isBlank()) {
            List<String> genericNames = genericNamesBySubCategory.getOrDefault(cat.catalogSub(), List.of());
            if (!genericNames.isEmpty()) {
                List<MemberItem> catalogMedications = store.findMedicationsByGenericNames(
                        tenantId, genericNames, cat.systemicOnly()
                );
                Set<Long> directMedIds = new HashSet<>();
                Set<String> directNames = new HashSet<>();
                for (var dm : directMembers) {
                    if (dm.medicationId() != null) directMedIds.add(dm.medicationId());
                    directNames.add(dm.medicationName());
                }

                String lowerQ = query != null ? query.trim().toLowerCase() : "";
                List<MemberView> inheritedMembers = new ArrayList<>();
                for (var med : catalogMedications) {
                    if (directMedIds.contains(med.medicationId()) || directNames.contains(med.medicationName())) {
                        continue;
                    }
                    if (!lowerQ.isBlank() && !med.medicationName().toLowerCase().contains(lowerQ)
                            && !(med.medicationCode() != null && med.medicationCode().toLowerCase().contains(lowerQ))) {
                        continue;
                    }
                    inheritedMembers.add(new MemberView(
                            -med.medicationId(), // 负ID标识目录继承虚成员
                            categoryId,
                            med.medicationId(),
                            med.medicationCode(),
                            med.medicationName(),
                            med.preparationSpec(),
                            med.doseForm(),
                            Instant.now(),
                            true // inherited
                    ));
                }
                List<MemberView> combined = new ArrayList<>(directMembers);
                combined.addAll(inheritedMembers);
                return combined;
            }
        }
        return directMembers;
    }

    @Transactional
    public int addMembers(Long categoryId, AddMembersRequest req) {
        Long tenantId = TenantContext.requireTenantId();
        Long userId = contextProvider.requireCurrent().subjectId();
        CategoryView cat = getCategory(categoryId);
        if (req.items().isEmpty()) return 0;
        int added = store.addMembers(tenantId, categoryId, userId, req.items());
        invalidateCache(tenantId, cat.code());
        return added;
    }

    @Transactional
    public void removeMember(Long categoryId, Long memberId) {
        Long tenantId = TenantContext.requireTenantId();
        CategoryView cat = getCategory(categoryId);
        store.removeMember(tenantId, categoryId, memberId);
        invalidateCache(tenantId, cat.code());
    }

    // ==========================================
    // 标准目录复用与一键批量导入
    // ==========================================

    @Transactional(readOnly = true)
    public List<StandardCatalogCategorySummary> listStandardCatalogCategories() {
        return Collections.unmodifiableList(standardCatalogSummaries);
    }

    @Transactional(readOnly = true)
    public List<MemberItem> searchMedicationsByStandardCatalog(
            String catalogMajor,
            String catalogSub,
            Boolean systemicOnly,
            Long excludeCategoryId
    ) {
        Long tenantId = TenantContext.requireTenantId();
        if (catalogSub == null || catalogSub.isBlank()) return List.of();
        List<String> genericNames = genericNamesBySubCategory.getOrDefault(catalogSub.trim(), List.of());
        if (genericNames.isEmpty()) return List.of();

        List<MemberItem> found = store.findMedicationsByGenericNames(
                tenantId, genericNames, Boolean.TRUE.equals(systemicOnly)
        );

        if (excludeCategoryId != null) {
            List<MemberView> existing = store.findMembers(tenantId, excludeCategoryId, null);
            Set<Long> existingMedIds = new HashSet<>();
            Set<String> existingNames = new HashSet<>();
            for (var m : existing) {
                if (m.medicationId() != null) existingMedIds.add(m.medicationId());
                existingNames.add(m.medicationName());
            }
            return found.stream()
                    .filter(m -> !existingMedIds.contains(m.medicationId()) && !existingNames.contains(m.medicationName()))
                    .toList();
        }
        return found;
    }

    @Transactional
    public CatalogImportResult importFromCatalog(Long categoryId, CatalogImportRequest req) {
        Long tenantId = TenantContext.requireTenantId();
        Long userId = contextProvider.requireCurrent().subjectId();
        CategoryView cat = getCategory(categoryId);

        if (req.catalogSub() == null || req.catalogSub().isBlank()) {
            throw badRequest("CATALOG_SUB_REQUIRED", "必须指定导入的标准目录分类");
        }
        List<String> genericNames = genericNamesBySubCategory.getOrDefault(req.catalogSub().trim(), List.of());
        if (genericNames.isEmpty()) {
            return new CatalogImportResult(0, 0, 0);
        }

        List<MemberItem> candidates = store.findMedicationsByGenericNames(
                tenantId, genericNames, Boolean.TRUE.equals(req.systemicOnly())
        );

        int imported = store.addMembers(tenantId, categoryId, userId, candidates);
        int skipped = candidates.size() - imported;
        invalidateCache(tenantId, cat.code());

        return new CatalogImportResult(imported, skipped, candidates.size());
    }

    @Transactional(readOnly = true)
    public List<MedicationTagView> listTagsForMedication(Long medicationId, String medName) {
        Long tenantId = TenantContext.requireTenantId();
        return store.findCategoriesByMedication(tenantId, medicationId, medName);
    }

    /**
     * 规则引擎判断药品是否属于指定安全分类。
     * 支持高性能缓存与双层匹配（1. 显式纳管清单；2. 标准目录级联继承）。
     */
    public boolean isMedicationInCategory(Long tenantId, Long medicationId, String medName, String categoryCode, String doseForm) {
        if (categoryCode == null || categoryCode.isBlank()) return false;
        String normalizedCode = categoryCode.trim().toUpperCase();
        CachedCategoryData data = getCachedCategoryData(tenantId, normalizedCode);

        // 1. 显式直接纳管成员判定
        if (medName != null && !medName.isBlank()) {
            String trimmedName = medName.trim();
            if (data.directMemberNames().contains(trimmedName)) return true;
            for (String mbr : data.directMemberNames()) {
                if (trimmedName.contains(mbr) || mbr.contains(trimmedName)) {
                    return true;
                }
            }
        }

        // 2. 标准目录级联继承判定
        if (data.catalogSub() != null && !data.catalogSub().isBlank() && !data.catalogGenericNames().isEmpty()) {
            // 如果要求全身给药，且当前为外用/局部剂型，则排除
            if (data.systemicOnly() && isTopicalDoseForm(doseForm)) {
                return false;
            }
            if (medName != null && !medName.isBlank()) {
                String trimmedName = medName.trim();
                for (String cName : data.catalogGenericNames()) {
                    if (trimmedName.contains(cName) || cName.contains(trimmedName)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * 保持向后兼容：三参数重载
     */
    public boolean isMedicationInCategory(Long tenantId, Long medicationId, String medName, String categoryCode) {
        return isMedicationInCategory(tenantId, medicationId, medName, categoryCode, null);
    }

    public Set<String> getMemberNames(Long tenantId, String categoryCode) {
        return getCachedCategoryData(tenantId, categoryCode).directMemberNames();
    }

    private CachedCategoryData getCachedCategoryData(Long tenantId, String categoryCode) {
        String key = tenantId + ":" + categoryCode;
        CacheEntry entry = categoryCache.get(key);
        if (entry != null && !entry.isExpired()) {
            return entry.data();
        }

        Set<String> freshDirect = store.findMemberNamesByCategory(tenantId, categoryCode);
        Optional<CategoryView> catOpt = store.findCategoryByCode(tenantId, categoryCode);
        String catalogSub = catOpt.map(CategoryView::catalogSub).orElse(null);
        boolean systemicOnly = catOpt.map(CategoryView::systemicOnly).orElse(false);
        List<String> catalogNames = catalogSub != null ? genericNamesBySubCategory.getOrDefault(catalogSub, List.of()) : List.of();

        CachedCategoryData data = new CachedCategoryData(freshDirect, catalogSub, systemicOnly, catalogNames);
        categoryCache.put(key, new CacheEntry(data, System.currentTimeMillis()));
        return data;
    }

    private void invalidateCache(Long tenantId, String categoryCode) {
        if (categoryCode != null) {
            categoryCache.remove(tenantId + ":" + categoryCode);
        } else {
            categoryCache.clear();
        }
    }

    public static boolean isTopicalDoseForm(String doseForm) {
        if (doseForm == null) return false;
        String df = doseForm.trim();
        return df.contains("膏") || df.contains("贴") || df.contains("凝胶") || df.contains("栓")
                || df.contains("滴眼") || df.contains("滴鼻") || df.contains("滴耳")
                || df.contains("喷雾") || df.contains("洗剂") || df.contains("搽剂")
                || df.contains("涂剂") || df.contains("外用");
    }
}
