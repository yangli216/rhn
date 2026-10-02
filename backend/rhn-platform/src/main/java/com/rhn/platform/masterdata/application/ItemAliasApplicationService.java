package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemAliasCommands.ItemAliasCommand;
import com.rhn.platform.masterdata.api.ItemAliasViews.ItemAliasView;
import com.rhn.platform.masterdata.domain.ItemAlias;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.ItemAliasRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.search.application.SearchEntryProjectionService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ItemAliasApplicationService {
    private final ItemAliasRepository aliases;
    private final ServiceCatalogItemRepository services;
    private final SearchEntryProjectionService searchProjections;
    private final ExecutionContextProvider contextProvider;

    public ItemAliasApplicationService(ItemAliasRepository aliases, ServiceCatalogItemRepository services,
                                       SearchEntryProjectionService searchProjections,
                                       ExecutionContextProvider contextProvider) {
        this.aliases = aliases;
        this.services = services;
        this.searchProjections = searchProjections;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public List<ItemAliasView> list(Long catalogItemId) {
        ExecutionContext context = current();
        requireService(context.tenantId(), catalogItemId);
        return aliases.findByTenantIdAndCatalogItemIdAndStatusOrderByAliasName(
                        context.tenantId(), catalogItemId, "ACTIVE").stream().map(this::view).toList();
    }

    @Transactional
    public List<ItemAliasView> replace(Long catalogItemId, Collection<ItemAliasCommand> commands) {
        ExecutionContext context = current();
        requireService(context.tenantId(), catalogItemId);
        List<ItemAliasCommand> values = commands == null ? List.of() : commands.stream().toList();
        if (values.stream().anyMatch(value -> value == null || value.aliasName() == null || value.aliasName().isBlank())) {
            throw badRequest("ITEM_ALIAS_NAME_REQUIRED", "项目别名不能为空");
        }
        if (values.stream().map(value -> value.aliasName().trim().toUpperCase(Locale.ROOT)).distinct().count() != values.size()) {
            throw badRequest("ITEM_ALIAS_DUPLICATE", "项目别名不能重复");
        }
        if (values.stream().anyMatch(value -> value.status() == null || !Set.of("ACTIVE", "INACTIVE").contains(value.status()))) {
            throw badRequest("ITEM_ALIAS_STATUS_INVALID", "项目别名状态无效");
        }
        // Hibernate inserts before entity deletes; flush removals before reusing alias unique keys.
        aliases.deleteAll(aliases.findByTenantIdAndCatalogItemIdOrderByAliasName(context.tenantId(), catalogItemId));
        aliases.flush();
        List<ItemAlias> saved = aliases.saveAll(values.stream().map(value -> new ItemAlias(
                context.tenantId(), catalogItemId,
                required(value.aliasType(), "项目别名类型"), value.aliasName().trim(), null, null, null,
                value.primaryAlias(), required(value.status(), "项目别名状态"))).toList());
        searchProjections.synchronizeService(requireService(context.tenantId(), catalogItemId), context.subjectId());
        return saved.stream().map(this::view).toList();
    }

    private ItemAliasView view(ItemAlias value) {
        return new ItemAliasView(value.id(), value.catalogItemId(), value.aliasType(), value.aliasName(),
                value.primaryAlias(), value.status());
    }

    private ServiceCatalogItem requireService(Long tenantId, Long id) {
        if (id == null) throw notFound("SERVICE_NOT_FOUND", "未找到诊疗项目");
        return services.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE")
                .orElseThrow(() -> notFound("SERVICE_NOT_FOUND", "未找到诊疗项目"));
    }

    private String required(String value, String label) {
        if (value == null || value.isBlank()) throw badRequest("ITEM_ALIAS_FIELD_REQUIRED", label + "不能为空");
        return value.trim();
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }
}
