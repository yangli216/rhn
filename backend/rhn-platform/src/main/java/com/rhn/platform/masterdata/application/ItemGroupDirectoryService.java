package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.ItemGroupDirectory;
import com.rhn.platform.masterdata.domain.ItemGroup;
import com.rhn.platform.masterdata.domain.ItemGroupMember;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.ItemGroupMemberRepository;
import com.rhn.platform.masterdata.infrastructure.ItemGroupRepository;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class ItemGroupDirectoryService implements ItemGroupDirectory {
    private final ItemGroupRepository groups;
    private final ItemGroupMemberRepository members;
    private final ServiceCatalogItemRepository services;
    private final OrganizationCatalogItemRepository adoptions;
    private final MasterDataSearchDirectory search;

    public ItemGroupDirectoryService(ItemGroupRepository groups, ItemGroupMemberRepository members,
                                     ServiceCatalogItemRepository services,
                                     OrganizationCatalogItemRepository adoptions,
                                     MasterDataSearchDirectory search) {
        this.groups = groups;
        this.members = members;
        this.services = services;
        this.adoptions = adoptions;
        this.search = search;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ItemGroupSnapshot> searchOrderableGroups(Long tenantId, Long organizationId,
                                                         String serviceType, String query, LocalDate at) {
        if (tenantId == null || organizationId == null || at == null) return List.of();
        String expectedType = switch (serviceType == null ? "" : serviceType) {
            case "LABORATORY" -> "LIS";
            case "EXAMINATION" -> "PACS";
            default -> null;
        };
        if (expectedType == null) return List.of();
        Set<Long> searchIds = query == null || query.isBlank()
                ? Set.of() : search.findMatchingTargetIds("ITEM_GROUP", tenantId, organizationId, null, query);
        return groups.findByTenantIdOrderByName(tenantId).stream()
                .filter(group -> expectedType.equals(group.groupType()))
                .filter(group -> group.organizationId() == null || organizationId.equals(group.organizationId()))
                .filter(group -> group.usageType() == null || outpatientUsage(group.usageType()))
                .filter(group -> "ACTIVE".equals(group.status()) && effective(group.validFrom(), group.validTo(), at))
                .filter(group -> query == null || query.isBlank() || searchIds.contains(group.id())
                        || contains(group.name(), query) || contains(group.code(), query))
                .map(group -> snapshot(tenantId, organizationId, group, serviceType, at))
                .filter(Objects::nonNull)
                .toList();
    }

    private ItemGroupSnapshot snapshot(Long tenantId, Long organizationId, ItemGroup group,
                                       String serviceType, LocalDate at) {
        List<ItemGroupMember> configured = members.findByTenantIdAndItemGroupIdOrderBySortOrder(tenantId, group.id());
        if (configured.isEmpty()) return null;
        Map<Long, ServiceCatalogItem> serviceById = configured.stream().map(ItemGroupMember::catalogItemId).distinct()
                .map(id -> services.findByIdAndTenantIdAndItemType(id, tenantId, "SERVICE").orElse(null))
                .filter(Objects::nonNull).collect(Collectors.toMap(ServiceCatalogItem::id, Function.identity()));
        Map<Long, OrganizationCatalogItem> adoptionById = adoptions
                .findByTenantIdAndOrganizationIdAndCatalogItemIdIn(tenantId, organizationId, serviceById.keySet()).stream()
                .filter(value -> effective(value.validFrom(), value.validTo(), at))
                .collect(Collectors.toMap(OrganizationCatalogItem::catalogItemId, Function.identity(),
                        (left, right) -> left.validFrom().isAfter(right.validFrom()) ? left : right));
        List<MemberSnapshot> result = new ArrayList<>();
        List<Long> unavailableOptionalMembers = new ArrayList<>();
        for (ItemGroupMember member : configured) {
            ServiceCatalogItem service = serviceById.get(member.catalogItemId());
            OrganizationCatalogItem adoption = adoptionById.get(member.catalogItemId());
            if (service == null || !"ACTIVE".equals(service.status()) || !service.orderable()
                    || !effective(service.validFrom(), service.validTo(), at)
                    || !outpatientUsage(service.usageType())
                    || !serviceType.equals(service.serviceType())
                    || adoption == null || !"ACTIVE".equals(adoption.status())
                    || !adoption.orderable() || !adoption.executable()) {
                if (member.requiredMember()) return null;
                unavailableOptionalMembers.add(member.catalogItemId());
                continue;
            }
            result.add(new MemberSnapshot(service.id(), service.code(), service.name(), service.serviceType(),
                    member.quantity(), member.unitCode() == null ? service.unitCode() : member.unitCode(),
                    member.memberDescription(), member.requiredMember(), service.unitCode(),
                    service.chargeable() && adoption.chargeable()));
        }
        return new ItemGroupSnapshot(group.id(), group.revision(), group.code(),
                group.name(), group.groupType(), result, List.copyOf(unavailableOptionalMembers));
    }

    private boolean outpatientUsage(String value) {
        return "OUTPATIENT".equals(value) || "COMMON".equals(value);
    }

    private boolean effective(LocalDate from, LocalDate to, LocalDate at) {
        return from != null && !from.isAfter(at) && (to == null || !to.isBefore(at));
    }

    private boolean contains(String value, String query) {
        return value != null && query != null && value.toUpperCase().contains(query.trim().toUpperCase());
    }
}
