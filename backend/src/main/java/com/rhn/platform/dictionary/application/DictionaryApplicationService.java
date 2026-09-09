package com.rhn.platform.dictionary.application;

import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.platform.dictionary.api.DictionaryChangeResponse;
import com.rhn.platform.dictionary.api.DictionaryCategoryResponse;
import com.rhn.platform.dictionary.api.DictionaryDetailResponse;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.dictionary.api.DictionaryItemResponse;
import com.rhn.platform.dictionary.api.DictionarySummaryResponse;
import com.rhn.platform.dictionary.api.DictionaryValue;
import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.domain.DictionaryChange;
import com.rhn.platform.dictionary.domain.DictionaryCategory;
import com.rhn.platform.dictionary.domain.DictionaryChangeTargetType;
import com.rhn.platform.dictionary.domain.DictionaryChangeType;
import com.rhn.platform.dictionary.domain.DictionaryCodePolicy;
import com.rhn.platform.dictionary.domain.DictionaryDefinition;
import com.rhn.platform.dictionary.domain.DictionaryItem;
import com.rhn.platform.dictionary.domain.DictionaryScopeType;
import com.rhn.platform.dictionary.domain.DictionaryStatus;
import com.rhn.platform.dictionary.infrastructure.DictionaryChangeRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryCategoryRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryDefinitionRepository;
import com.rhn.platform.dictionary.infrastructure.DictionaryItemRepository;
import com.rhn.platform.dictionary.translation.DictionaryTextCache;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class DictionaryApplicationService implements DictionaryDirectory {
    private final DictionaryDefinitionRepository definitionRepository;
    private final DictionaryCategoryRepository categoryRepository;
    private final DictionaryItemRepository itemRepository;
    private final DictionaryChangeRepository changeRepository;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;
    private final IdentityAccessDirectory identityAccessDirectory;
    private final SystemEnumDirectory systemEnumDirectory;
    private final DictionaryTextCache dictionaryTextCache;
    private final ObjectProvider<DictionaryAttributeDirectory> attributeDirectoryProvider;

    public DictionaryApplicationService(DictionaryDefinitionRepository definitionRepository,
                                        DictionaryCategoryRepository categoryRepository,
                                        DictionaryItemRepository itemRepository,
                                        DictionaryChangeRepository changeRepository,
                                        ExecutionContextProvider contextProvider,
                                        JsonCodec jsonCodec,
                                        IdentityAccessDirectory identityAccessDirectory,
                                        SystemEnumDirectory systemEnumDirectory,
                                        DictionaryTextCache dictionaryTextCache,
                                        ObjectProvider<DictionaryAttributeDirectory> attributeDirectoryProvider) {
        this.definitionRepository = definitionRepository;
        this.categoryRepository = categoryRepository;
        this.itemRepository = itemRepository;
        this.changeRepository = changeRepository;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
        this.identityAccessDirectory = identityAccessDirectory;
        this.systemEnumDirectory = systemEnumDirectory;
        this.dictionaryTextCache = dictionaryTextCache;
        this.attributeDirectoryProvider = attributeDirectoryProvider;
    }

    @Transactional(readOnly = true)
    public List<DictionarySummaryResponse> list(String query, Long categoryId, DictionaryScopeType scopeType,
                                                DictionaryStatus status) {
        ExecutionContext context = current();
        String normalizedQuery = query == null ? null : query.trim().toLowerCase(Locale.ROOT);
        Set<Long> categoryIds = categoryId == null ? Set.of() : descendantCategoryIds(categoryId, context.tenantId());
        return definitionRepository.findByScopeTypeOrTenantIdOrderByUpdatedAtDesc(
                        DictionaryScopeType.PLATFORM, context.tenantId()).stream()
                .filter(value -> categoryId == null || categoryIds.contains(value.categoryId()))
                .filter(value -> scopeType == null || value.scopeType() == scopeType)
                .filter(value -> status == null || value.status() == status)
                .filter(value -> normalizedQuery == null || normalizedQuery.isBlank()
                        || value.code().toLowerCase(Locale.ROOT).contains(normalizedQuery)
                        || value.name().toLowerCase(Locale.ROOT).contains(normalizedQuery))
                .map(this::summary)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DictionaryCategoryResponse> categories() {
        return visibleCategories().stream().map(this::categoryResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<DictionaryChangeResponse> categoryChanges(Long id) {
        requireVisibleCategory(id);
        return changeRepository.findByCategoryIdAndTargetTypeOrderByChangedAtDesc(
                        id, DictionaryChangeTargetType.CATEGORY).stream()
                .map(this::changeResponse).toList();
    }

    @Transactional
    public DictionaryCategoryResponse createCategory(DictionaryScopeType scopeType, Long parentId, String code,
                                                       String name, String description, int sortOrder,
                                                       String reason, String requestCode) {
        DictionaryCategoryResponse repeated = repeatedCategory(requestCode, null);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        String scopeCode = scopeType == DictionaryScopeType.PLATFORM
                ? "PLATFORM" : "TENANT:" + context.tenantId();
        String normalizedCode = DictionaryCodePolicy.requireCategoryCode(code);
        if (categoryRepository.existsByScopeCodeAndCode(scopeCode, normalizedCode)) {
            throw conflict("DICTIONARY_CATEGORY_CODE_DUPLICATE", "当前作用域下已存在相同分类编码");
        }
        validateCategoryParent(scopeType, context.tenantId(), null, parentId);
        DictionaryCategory category = categoryRepository.saveAndFlush(new DictionaryCategory(
                scopeType, context.tenantId(), parentId, normalizedCode, name, description,
                sortOrder, context.subjectId()));
        append(category, DictionaryChangeType.CREATE_CATEGORY, null,
                jsonCodec.write(categorySnapshot(category)), reason, requestCode, context.subjectId());
        return categoryResponse(category);
    }

    @Transactional
    public DictionaryCategoryResponse updateCategory(Long id, long expectedRevision, Long parentId,
                                                       String name, String description, int sortOrder,
                                                       String reason, String requestCode) {
        DictionaryCategoryResponse repeated = repeatedCategory(requestCode, id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryCategory category = requireVisibleCategory(id);
        validateCategoryParent(category.scopeType(), category.tenantId(), id, parentId);
        String before = jsonCodec.write(categorySnapshot(category));
        boolean moved = !Objects.equals(category.parentId(), parentId) || category.sortOrder() != sortOrder;
        runRevisionGuard(() -> category.update(expectedRevision, parentId, name, description,
                sortOrder, context.subjectId()));
        categoryRepository.saveAndFlush(category);
        append(category, moved ? DictionaryChangeType.MOVE_CATEGORY : DictionaryChangeType.UPDATE_CATEGORY,
                before, jsonCodec.write(categorySnapshot(category)), reason, requestCode, context.subjectId());
        return categoryResponse(category);
    }

    @Transactional
    public DictionaryCategoryResponse changeCategoryStatus(Long id, long expectedRevision, boolean enabled,
                                                            String reason, String requestCode) {
        DictionaryCategoryResponse repeated = repeatedCategory(requestCode, id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryCategory category = requireVisibleCategory(id);
        if (!enabled && (categoryRepository.existsByParentIdAndStatus(id, DictionaryStatus.ACTIVE)
                || definitionRepository.existsByCategoryIdAndStatus(id, DictionaryStatus.ACTIVE))) {
            throw conflict("DICTIONARY_CATEGORY_IN_USE", "请先迁移或停用该分类下的启用子分类和字典");
        }
        String before = jsonCodec.write(categorySnapshot(category));
        runRevisionGuard(() -> {
            if (enabled) category.enable(expectedRevision, context.subjectId());
            else category.disable(expectedRevision, context.subjectId());
        });
        categoryRepository.saveAndFlush(category);
        append(category, enabled ? DictionaryChangeType.ENABLE_CATEGORY : DictionaryChangeType.DISABLE_CATEGORY,
                before, jsonCodec.write(categorySnapshot(category)), reason, requestCode, context.subjectId());
        return categoryResponse(category);
    }

    @Transactional(readOnly = true)
    public DictionaryDetailResponse get(Long id) {
        return detail(requireVisible(id));
    }

    @Transactional(readOnly = true)
    public List<DictionaryChangeResponse> changes(Long id) {
        requireVisible(id);
        return changeRepository.findByDictionaryIdOrderByChangedAtDesc(id).stream()
                .map(this::changeResponse)
                .toList();
    }

    @Transactional
    public DictionaryDetailResponse create(DictionaryScopeType scopeType, Long categoryId, String code, String name,
                                           String description, String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, null);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        String normalizedCode = DictionaryCodePolicy.requireDictionaryCode(code);
        DictionaryCategory category = requireActiveCategory(categoryId);
        requireSameScope(scopeType, context.tenantId(), category);
        if (systemEnumDirectory.isSystemEnumCode(normalizedCode)) {
            throw badRequest("DICTIONARY_CODE_RESERVED", normalizedCode + " 是平台只读系统枚举编码，不能创建为普通字典");
        }
        String scopeCode = scopeType == DictionaryScopeType.PLATFORM
                ? "PLATFORM" : "TENANT:" + context.tenantId();
        if (definitionRepository.existsByScopeCodeAndCode(scopeCode, normalizedCode)) {
            throw conflict("DICTIONARY_CODE_DUPLICATE", "当前作用域下已存在相同字典编码");
        }
        DictionaryDefinition definition = definitionRepository.saveAndFlush(new DictionaryDefinition(
                scopeType, context.tenantId(), category.id(), normalizedCode, name, description, context.subjectId()));
        append(definition, null, DictionaryChangeType.CREATE_DICT, null,
                jsonCodec.write(definitionSnapshot(definition)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Transactional
    public DictionaryDetailResponse update(Long id, long expectedRevision, Long categoryId, String name,
                                           String description, String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryDefinition definition = requireVisible(id);
        requireMutable(definition);
        DictionaryCategory category = requireActiveCategory(categoryId);
        requireSameScope(definition.scopeType(), definition.tenantId(), category);
        String before = jsonCodec.write(definitionSnapshot(definition));
        boolean moved = !Objects.equals(definition.categoryId(), category.id());
        runRevisionGuard(() -> definition.update(category.id(), name, description, expectedRevision, context.subjectId()));
        definitionRepository.saveAndFlush(definition);
        append(definition, null, moved ? DictionaryChangeType.MOVE_DICT : DictionaryChangeType.UPDATE_DICT, before,
                jsonCodec.write(definitionSnapshot(definition)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Transactional
    public DictionaryDetailResponse changeStatus(Long id, long expectedRevision, boolean enabled,
                                                 String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, id);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryDefinition definition = requireVisible(id);
        requireMutable(definition);
        String before = jsonCodec.write(definitionSnapshot(definition));
        runRevisionGuard(() -> {
            if (enabled) definition.enable(expectedRevision, context.subjectId());
            else definition.disable(expectedRevision, context.subjectId());
        });
        definitionRepository.saveAndFlush(definition);
        append(definition, null, enabled ? DictionaryChangeType.ENABLE_DICT : DictionaryChangeType.DISABLE_DICT,
                before, jsonCodec.write(definitionSnapshot(definition)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Transactional
    public DictionaryDetailResponse addItem(Long dictionaryId, long expectedRevision, String code,
                                            String name, String description, int sortOrder,
                                            Long parentItemId,
                                            String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, dictionaryId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryDefinition definition = requireVisible(dictionaryId);
        requireMutable(definition);
        String normalizedCode = DictionaryCodePolicy.requireItemCode(code);
        if (itemRepository.existsByDictionaryIdAndCode(dictionaryId, normalizedCode)) {
            throw conflict("DICTIONARY_ITEM_CODE_DUPLICATE", "该字典下已存在相同字典项编码");
        }
        validateItemParent(dictionaryId, null, parentItemId, true);
        runRevisionGuard(() -> definition.touchForItemChange(expectedRevision, context.subjectId()));
        DictionaryItem item = itemRepository.save(new DictionaryItem(
                dictionaryId, parentItemId, normalizedCode, name, description, sortOrder));
        definitionRepository.saveAndFlush(definition);
        append(definition, item.id(), DictionaryChangeType.ADD_ITEM, null,
                jsonCodec.write(itemSnapshot(item)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Transactional
    public DictionaryDetailResponse updateItem(Long dictionaryId, Long itemId, long expectedRevision,
                                               String name, String description, int sortOrder,
                                               Long parentItemId,
                                               String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, dictionaryId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryDefinition definition = requireVisible(dictionaryId);
        requireMutable(definition);
        DictionaryItem item = requireItem(dictionaryId, itemId);
        validateItemParent(dictionaryId, itemId, parentItemId, item.status() == DictionaryStatus.ACTIVE);
        String before = jsonCodec.write(itemSnapshot(item));
        runRevisionGuard(() -> definition.touchForItemChange(expectedRevision, context.subjectId()));
        item.update(parentItemId, name, description, sortOrder);
        itemRepository.save(item);
        definitionRepository.saveAndFlush(definition);
        append(definition, item.id(), DictionaryChangeType.UPDATE_ITEM, before,
                jsonCodec.write(itemSnapshot(item)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Transactional
    public DictionaryDetailResponse changeItemStatus(Long dictionaryId, Long itemId, long expectedRevision,
                                                     boolean enabled, String reason, String requestCode) {
        DictionaryDetailResponse repeated = repeated(requestCode, dictionaryId);
        if (repeated != null) return repeated;
        ExecutionContext context = currentWithActor();
        DictionaryDefinition definition = requireVisible(dictionaryId);
        requireMutable(definition);
        DictionaryItem item = requireItem(dictionaryId, itemId);
        if (!enabled && itemRepository.existsByDictionaryIdAndParentItemIdAndStatus(
                dictionaryId, itemId, DictionaryStatus.ACTIVE)) {
            throw conflict("DICTIONARY_ITEM_HAS_ACTIVE_CHILDREN", "请先停用该字典项下的启用子项");
        }
        if (enabled && item.parentItemId() != null
                && requireItem(dictionaryId, item.parentItemId()).status() != DictionaryStatus.ACTIVE) {
            throw conflict("DICTIONARY_ITEM_PARENT_INACTIVE", "请先启用上级字典项");
        }
        String before = jsonCodec.write(itemSnapshot(item));
        runRevisionGuard(() -> definition.touchForItemChange(expectedRevision, context.subjectId()));
        if (enabled) item.enable(); else item.disable();
        itemRepository.save(item);
        definitionRepository.saveAndFlush(definition);
        append(definition, item.id(), enabled ? DictionaryChangeType.ENABLE_ITEM : DictionaryChangeType.DISABLE_ITEM,
                before, jsonCodec.write(itemSnapshot(item)), reason, requestCode, context.subjectId());
        invalidateTextCacheAfterCommit(definition);
        return detail(definition);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DictionaryValue> resolveActiveItems(Long tenantId, String dictionaryCode) {
        String code = DictionaryCodePolicy.requireDictionaryCode(dictionaryCode);
        DictionaryDefinition definition = definitionRepository.findByTenantIdAndCode(tenantId, code)
                .or(() -> definitionRepository.findByScopeTypeAndCode(DictionaryScopeType.PLATFORM, code))
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "未找到可用字典 " + code));
        return resolveActiveItemsForDefinition(tenantId, definition);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DictionaryValue> resolveActiveItems(Long tenantId, Long dictionaryId) {
        if (tenantId == null || tenantId <= 0) throw badRequest("TENANT_REQUIRED", "租户标识不能为空");
        DictionaryDefinition definition = definitionRepository.findVisibleById(dictionaryId, tenantId)
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "未找到可用字典"));
        return resolveActiveItemsForDefinition(tenantId, definition);
    }

    private List<DictionaryValue> resolveActiveItemsForDefinition(Long tenantId, DictionaryDefinition definition) {
        List<DictionaryItem> activeItems = itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(definition.id()).stream()
                .filter(item -> item.status() == DictionaryStatus.ACTIVE)
                .toList();
        if (activeItems.isEmpty()) return List.of();
        ExecutionContext ctx = null;
        try {
            ctx = contextProvider.requireCurrent();
        } catch (Exception ignored) {
        }
        Long orgId = ctx != null ? ctx.organizationId() : null;
        Long deptId = ctx != null ? ctx.departmentId() : null;
        DictionaryAttributeDirectory attrDir = attributeDirectoryProvider.getIfAvailable();
        Map<Long, Map<String, String>> scalarAttrs = attrDir != null
                ? attrDir.resolveScalarAttributes(
                        definition.id(), activeItems.stream().map(DictionaryItem::id).toList(),
                        tenantId, orgId, deptId)
                : Map.of();
        Map<Long, String> itemCodes = activeItems.stream().collect(Collectors.toMap(DictionaryItem::id, DictionaryItem::code));
        return activeItems.stream()
                .map(item -> new DictionaryValue(item.code(), item.name(), item.sortOrder(),
                        scalarAttrs.getOrDefault(item.id(), Map.of()), itemCodes.get(item.parentItemId())))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<com.rhn.platform.dictionary.api.DictionaryItemReference> resolveActiveItemReferences(
            Long tenantId, String dictionaryCode) {
        String code = DictionaryCodePolicy.requireDictionaryCode(dictionaryCode);
        DictionaryDefinition definition = definitionRepository.findByTenantIdAndCode(tenantId, code)
                .or(() -> definitionRepository.findByScopeTypeAndCode(DictionaryScopeType.PLATFORM, code))
                .filter(value -> value.status() == DictionaryStatus.ACTIVE)
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "未找到可用字典 " + code));
        return itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(definition.id()).stream()
                .filter(item -> item.status() == DictionaryStatus.ACTIVE)
                .map(item -> new com.rhn.platform.dictionary.api.DictionaryItemReference(
                        item.id(), item.code(), item.name(), item.sortOrder()))
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, String> resolveItemTexts(Long tenantId, String dictionaryCode) {
        String code = DictionaryCodePolicy.requireDictionaryCode(dictionaryCode);
        if (tenantId == null || tenantId <= 0) return Map.of();
        DictionaryDefinition definition = definitionRepository.findByTenantIdAndCode(tenantId, code)
                .or(() -> definitionRepository.findByScopeTypeAndCode(DictionaryScopeType.PLATFORM, code))
                .orElse(null);
        if (definition == null) return Map.of();
        return itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(definition.id()).stream()
                .collect(Collectors.toUnmodifiableMap(DictionaryItem::code, DictionaryItem::name,
                        (left, right) -> left));
    }

    private void invalidateTextCacheAfterCommit(DictionaryDefinition definition) {
        Runnable invalidation = definition.scopeType() == DictionaryScopeType.PLATFORM
                ? () -> dictionaryTextCache.invalidateDictionary(definition.code())
                : () -> dictionaryTextCache.invalidateTenant(definition.tenantId(), definition.code());
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            invalidation.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                invalidation.run();
            }
        });
    }

    private DictionaryDetailResponse repeated(String requestCode, Long expectedDictionaryId) {
        if (requestCode == null || requestCode.isBlank()) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        DictionaryChange prior = changeRepository.findFirstByRequestCodeOrderByChangedAtAsc(requestCode.trim()).orElse(null);
        if (prior == null) return null;
        if (prior.dictionaryId() == null) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于字典分类变更");
        }
        if (expectedDictionaryId != null && !expectedDictionaryId.equals(prior.dictionaryId())) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项字典变更");
        }
        return detail(requireVisible(prior.dictionaryId()));
    }

    private DictionaryCategoryResponse repeatedCategory(String requestCode, Long expectedCategoryId) {
        if (requestCode == null || requestCode.isBlank()) throw badRequest("REQUEST_CODE_REQUIRED", "请求编码不能为空");
        DictionaryChange prior = changeRepository.findFirstByRequestCodeOrderByChangedAtAsc(requestCode.trim()).orElse(null);
        if (prior == null) return null;
        if (prior.targetType() != DictionaryChangeTargetType.CATEGORY) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于字典或字典项变更");
        }
        if (expectedCategoryId != null && !expectedCategoryId.equals(prior.categoryId())) {
            throw conflict("REQUEST_CODE_REUSED", "请求编码已用于另一项字典分类变更");
        }
        return categoryResponse(requireVisibleCategory(prior.categoryId()));
    }

    private void append(DictionaryDefinition definition, Long itemId, DictionaryChangeType type,
                        String before, String after, String reason, String requestCode, Long actorId) {
        changeRepository.save(new DictionaryChange(definition, itemId, type, before, after,
                reason, requestCode, actorId));
    }

    private void append(DictionaryCategory category, DictionaryChangeType type,
                        String before, String after, String reason, String requestCode, Long actorId) {
        changeRepository.save(new DictionaryChange(category, type, before, after,
                reason, requestCode, actorId));
    }

    private DictionaryDefinition requireVisible(Long id) {
        return definitionRepository.findVisibleById(id, current().tenantId())
                .orElseThrow(() -> notFound("DICTIONARY_NOT_FOUND", "字典不存在或无权访问"));
    }

    private List<DictionaryCategory> visibleCategories() {
        ExecutionContext context = current();
        return categoryRepository.findByScopeTypeOrTenantIdOrderBySortOrderAscNameAsc(
                DictionaryScopeType.PLATFORM, context.tenantId());
    }

    private DictionaryCategory requireVisibleCategory(Long id) {
        if (id == null) throw badRequest("DICTIONARY_CATEGORY_REQUIRED", "请选择字典分类");
        return categoryRepository.findVisibleById(id, current().tenantId())
                .orElseThrow(() -> notFound("DICTIONARY_CATEGORY_NOT_FOUND", "字典分类不存在或无权访问"));
    }

    private DictionaryCategory requireActiveCategory(Long id) {
        DictionaryCategory category = requireVisibleCategory(id);
        if (category.status() != DictionaryStatus.ACTIVE) {
            throw badRequest("DICTIONARY_CATEGORY_INACTIVE", "停用分类不能用于新建或调整字典");
        }
        return category;
    }

    private void requireSameScope(DictionaryScopeType scopeType, Long tenantId, DictionaryCategory category) {
        String scopeCode = scopeType == DictionaryScopeType.PLATFORM ? "PLATFORM" : "TENANT:" + tenantId;
        if (category.scopeType() != scopeType || !Objects.equals(category.scopeCode(), scopeCode)) {
            throw badRequest("DICTIONARY_CATEGORY_SCOPE_MISMATCH", "字典与所属分类必须处于相同作用域");
        }
    }

    private void validateCategoryParent(DictionaryScopeType scopeType, Long tenantId,
                                        Long categoryId, Long parentId) {
        if (parentId == null) return;
        DictionaryCategory parent = requireActiveCategory(parentId);
        requireSameScope(scopeType, tenantId, parent);
        Set<Long> visited = new HashSet<>();
        DictionaryCategory current = parent;
        while (current != null) {
            if (!visited.add(current.id()) || Objects.equals(current.id(), categoryId)) {
                throw badRequest("DICTIONARY_CATEGORY_CYCLE", "分类不能移动到自身或自身后代下");
            }
            current = current.parentId() == null ? null : requireVisibleCategory(current.parentId());
        }
    }

    private Set<Long> descendantCategoryIds(Long categoryId, Long tenantId) {
        DictionaryCategory root = categoryRepository.findVisibleById(categoryId, tenantId)
                .orElseThrow(() -> notFound("DICTIONARY_CATEGORY_NOT_FOUND", "字典分类不存在或无权访问"));
        List<DictionaryCategory> categories = categoryRepository
                .findByScopeTypeOrTenantIdOrderBySortOrderAscNameAsc(DictionaryScopeType.PLATFORM, tenantId);
        Set<Long> result = new HashSet<>();
        result.add(root.id());
        boolean changed;
        do {
            changed = false;
            for (DictionaryCategory category : categories) {
                if (category.parentId() != null && result.contains(category.parentId()) && result.add(category.id())) {
                    changed = true;
                }
            }
        } while (changed);
        return result;
    }

    private DictionaryItem requireItem(Long dictionaryId, Long itemId) {
        return itemRepository.findByIdAndDictionaryId(itemId, dictionaryId)
                .orElseThrow(() -> notFound("DICTIONARY_ITEM_NOT_FOUND", "字典项不存在"));
    }

    private void requireMutable(DictionaryDefinition definition) {
        if (definition.systemManaged()) {
            throw forbidden("SYSTEM_DICTIONARY_READ_ONLY", "系统托管字典由代码和数据库迁移维护，不能在线修改");
        }
    }

    private ExecutionContext current() {
        return contextProvider.requireCurrent();
    }

    private ExecutionContext currentWithActor() {
        ExecutionContext context = current();
        if (context.subjectId() != null) return context;
        Long accountId = identityAccessDirectory.findActiveAccount(context.tenantId(), context.actor())
                .map(account -> account.id())
                .orElseThrow(() -> badRequest("DICTIONARY_ACTOR_REQUIRED",
                        "字典变更必须由可审计的用户账号发起"));
        return new ExecutionContext(context.tenantId(), accountId, context.actor(),
                context.correlationId(), context.authorities());
    }

    private void runRevisionGuard(Runnable mutation) {
        RevisionGuard.run("DICTIONARY_REVISION_CONFLICT",
                "字典已被其他操作更新，请刷新后重试", mutation);
    }

    private DictionarySummaryResponse summary(DictionaryDefinition definition) {
        DictionaryCategory category = categoryRepository.findById(definition.categoryId()).orElse(null);
        return new DictionarySummaryResponse(definition.id(), definition.revision(), definition.scopeType(),
                definition.scopeCode(), definition.tenantId(), definition.categoryId(),
                category == null ? "UNCATEGORIZED" : category.code(),
                category == null ? "未分类" : category.name(), definition.code(), definition.name(),
                definition.description(), definition.systemManaged(), definition.status(),
                itemRepository.countByDictionaryId(definition.id()),
                definition.updatedAt(), definition.updatedBy());
    }

    private DictionaryDetailResponse detail(DictionaryDefinition definition) {
        DictionaryCategory category = categoryRepository.findById(definition.categoryId()).orElse(null);
        List<DictionaryItem> itemEntities = itemRepository.findByDictionaryIdOrderBySortOrderAscCodeAsc(definition.id());
        Map<Long, String> itemCodes = itemEntities.stream().collect(Collectors.toMap(DictionaryItem::id, DictionaryItem::code));
        List<DictionaryItemResponse> items = itemEntities.stream()
                .map(item -> itemResponse(item, itemCodes)).toList();
        return new DictionaryDetailResponse(definition.id(), definition.revision(), definition.scopeType(),
                definition.scopeCode(), definition.tenantId(), definition.categoryId(),
                category == null ? "UNCATEGORIZED" : category.code(),
                category == null ? "未分类" : category.name(), definition.code(), definition.name(),
                definition.description(), definition.systemManaged(), definition.status(),
                definition.createdAt(), definition.createdBy(),
                definition.updatedAt(), definition.updatedBy(), items);
    }

    private DictionaryItemResponse itemResponse(DictionaryItem item, Map<Long, String> itemCodes) {
        return new DictionaryItemResponse(item.id(), item.parentItemId(), itemCodes.get(item.parentItemId()),
                item.code(), item.name(), item.description(),
                item.sortOrder(), item.status());
    }

    private void validateItemParent(Long dictionaryId, Long itemId, Long parentItemId, boolean childActive) {
        if (parentItemId == null) return;
        if (parentItemId.equals(itemId)) {
            throw badRequest("DICTIONARY_ITEM_PARENT_INVALID", "字典项不能以自身作为上级");
        }
        DictionaryItem current = requireItem(dictionaryId, parentItemId);
        if (childActive && current.status() != DictionaryStatus.ACTIVE) {
            throw conflict("DICTIONARY_ITEM_PARENT_INACTIVE", "启用的字典项不能归入已停用的上级");
        }
        Set<Long> visited = new HashSet<>();
        while (current != null) {
            if (!visited.add(current.id()) || current.id().equals(itemId)) {
                throw badRequest("DICTIONARY_ITEM_PARENT_CYCLE", "字典项层级不能形成循环");
            }
            current = current.parentItemId() == null ? null : requireItem(dictionaryId, current.parentItemId());
        }
    }

    private DictionaryChangeResponse changeResponse(DictionaryChange change) {
        return new DictionaryChangeResponse(change.id(), change.categoryId(), change.dictionaryId(), change.itemId(),
                change.attributeDefinitionId(),
                change.changeType(), change.targetType(),
                change.beforeJson() == null ? null : jsonCodec.readTree(change.beforeJson()),
                change.afterJson() == null ? null : jsonCodec.readTree(change.afterJson()),
                change.reason(), change.requestCode(), change.changedAt(), change.changedBy());
    }

    private Map<String, Object> definitionSnapshot(DictionaryDefinition value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id().toString());
        result.put("revision", value.revision());
        result.put("scopeType", value.scopeType().name());
        result.put("scopeCode", value.scopeCode());
        result.put("tenantId", value.tenantId() == null ? null : value.tenantId().toString());
        result.put("categoryId", value.categoryId().toString());
        result.put("code", value.code());
        result.put("name", value.name());
        result.put("description", value.description());
        result.put("systemManaged", value.systemManaged());
        result.put("status", value.status().name());
        return result;
    }

    private DictionaryCategoryResponse categoryResponse(DictionaryCategory value) {
        return new DictionaryCategoryResponse(value.id(), value.revision(), value.scopeType(),
                value.scopeCode(), value.tenantId(), value.parentId(), value.code(), value.name(),
                value.description(), value.sortOrder(), value.status(),
                definitionRepository.countByCategoryId(value.id()), value.createdAt(), value.createdBy(),
                value.updatedAt(), value.updatedBy());
    }

    private Map<String, Object> categorySnapshot(DictionaryCategory value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id().toString());
        result.put("revision", value.revision());
        result.put("scopeType", value.scopeType().name());
        result.put("scopeCode", value.scopeCode());
        result.put("tenantId", value.tenantId() == null ? null : value.tenantId().toString());
        result.put("parentId", value.parentId() == null ? null : value.parentId().toString());
        result.put("code", value.code());
        result.put("name", value.name());
        result.put("description", value.description());
        result.put("sortOrder", value.sortOrder());
        result.put("status", value.status().name());
        return result;
    }

    private Map<String, Object> itemSnapshot(DictionaryItem value) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", value.id().toString());
        result.put("dictionaryId", value.dictionaryId().toString());
        result.put("parentItemId", value.parentItemId() == null ? null : value.parentItemId().toString());
        result.put("code", value.code());
        result.put("name", value.name());
        result.put("description", value.description());
        result.put("sortOrder", value.sortOrder());
        result.put("status", value.status().name());
        return result;
    }
}
