package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.domain.*;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ItemGroupDirectoryServiceTest {
    final ItemGroupRepository groups = mock(ItemGroupRepository.class);
    final ItemGroupMemberRepository members = mock(ItemGroupMemberRepository.class);
    final ServiceCatalogItemRepository services = mock(ServiceCatalogItemRepository.class);
    final OrganizationCatalogItemRepository adoptions = mock(OrganizationCatalogItemRepository.class);
    final MasterDataSearchDirectory search = mock(MasterDataSearchDirectory.class);
    final ItemGroupDirectoryService directory = new ItemGroupDirectoryService(groups, members, services, adoptions, search);
    final LocalDate today = LocalDate.of(2026, 10, 2);
    final ItemGroup group = mock(ItemGroup.class);
    final ServiceCatalogItem item = mock(ServiceCatalogItem.class);
    final OrganizationCatalogItem adoption = mock(OrganizationCatalogItem.class);
    final ItemGroupMember member = mock(ItemGroupMember.class);

    @BeforeEach void setup() {
        when(groups.findByTenantIdOrderByName(1L)).thenReturn(List.of(group));
        when(group.id()).thenReturn(10L);
        when(group.organizationId()).thenReturn(null);
        when(group.name()).thenReturn("肾功能");
        when(group.groupType()).thenReturn("LIS");
        when(group.status()).thenReturn("ACTIVE");
        when(group.validFrom()).thenReturn(today.minusDays(1));
        when(members.findByTenantIdAndItemGroupIdOrderBySortOrder(1L, 10L)).thenReturn(List.of(member));
        when(member.catalogItemId()).thenReturn(20L);
        when(member.quantity()).thenReturn(new BigDecimal("2.5"));
        when(member.unitCode()).thenReturn("EA");
        when(member.requiredMember()).thenReturn(true);
        when(services.findByIdAndTenantIdAndItemType(20L, 1L, "SERVICE")).thenReturn(Optional.of(item));
        when(item.id()).thenReturn(20L);
        when(item.status()).thenReturn("ACTIVE");
        when(item.orderable()).thenReturn(true);
        when(item.serviceType()).thenReturn("LABORATORY");
        when(item.usageType()).thenReturn("COMMON");
        when(item.validFrom()).thenReturn(today);
        when(item.validTo()).thenReturn(today);
        when(item.unitCode()).thenReturn("ML");
        when(adoptions.findByTenantIdAndOrganizationIdAndCatalogItemIdIn(eq(1L), eq(3L), any())).thenReturn(List.of(adoption));
        when(adoption.catalogItemId()).thenReturn(20L);
        when(adoption.validFrom()).thenReturn(today);
        when(adoption.status()).thenReturn("ACTIVE");
        when(adoption.orderable()).thenReturn(true);
        when(adoption.executable()).thenReturn(true);
    }

    @Test void preservesQuantityAndOverrideUnitIncludingValidityBoundary() {
        var result = directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today);
        assertEquals(1, result.size());
        assertEquals(new BigDecimal("2.5"), result.getFirst().members().getFirst().quantity());
        assertEquals("EA", result.getFirst().members().getFirst().unitCode());
        when(member.unitCode()).thenReturn(null);
        assertEquals("ML", directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)
                .getFirst().members().getFirst().unitCode());
    }

    @Test void excludesExpiredAndFutureRequiredMembers() {
        when(item.validTo()).thenReturn(today.minusDays(1));
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
        when(item.validTo()).thenReturn(null);
        when(item.validFrom()).thenReturn(today.plusDays(1));
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
    }

    @ParameterizedTest @ValueSource(strings = {"INPATIENT", "EMERGENCY", ""})
    void excludesNonOutpatientMembers(String usage) {
        when(item.usageType()).thenReturn(usage);
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
    }

    @Test void skipsUnavailableOptionalMemberButRejectsUnavailableRequiredMember() {
        ItemGroupMember optional = mock(ItemGroupMember.class);
        when(optional.catalogItemId()).thenReturn(21L);
        when(members.findByTenantIdAndItemGroupIdOrderBySortOrder(1L, 10L)).thenReturn(List.of(member, optional));
        assertEquals(1, directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today)
                .getFirst().members().size());
        when(optional.requiredMember()).thenReturn(true);
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
    }

    @Test void respectsGroupScopeAndUsageAndAdoptionAvailability() {
        when(group.organizationId()).thenReturn(4L);
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
        when(group.organizationId()).thenReturn(3L);
        when(group.usageType()).thenReturn("INPATIENT");
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
        when(group.usageType()).thenReturn("OUTPATIENT");
        when(adoption.executable()).thenReturn(false);
        assertTrue(directory.searchOrderableGroups(1L, 3L, "LABORATORY", "肾功能", today).isEmpty());
        assertTrue(directory.searchOrderableGroups(1L, 3L, "MEDICATION", "肾功能", today).isEmpty());
        assertTrue(directory.searchOrderableGroups(2L, 3L, "LABORATORY", "肾功能", today).isEmpty());
    }
}
