package com.rhn;

import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import com.rhn.platform.masterdata.domain.OrganizationCatalogItem;
import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.OrganizationCatalogItemRepository;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.RequestCorrelationContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Real persisted catalog and adoption rows: UI search limits must not prove clinical uniqueness. */
class ServiceOrderableCatalogCompletenessTest extends RhnIntegrationTestSupport {
    @Autowired ServiceCatalogItemRepository services;
    @Autowired OrganizationCatalogItemRepository adoptions;
    @Autowired ServiceCatalogDirectory directory;
    ServiceCatalogItem seed;
    Long actor;
    final LocalDate today = LocalDate.of(2026, 10, 4);

    @BeforeEach void context() {
        TenantContext.set(Long.valueOf(TENANT));
        RequestCorrelationContext.set("catalog-completeness");
        seed = services.findById(362387869795101L).orElseThrow();
        actor = (Long) ReflectionTestUtils.getField(seed, "createdBy");
    }
    @AfterEach void clear() { TenantContext.clear(); RequestCorrelationContext.clear(); }

    @Test void findsOrderableItemsBeyondTheFirstHundredUnadoptedMatches() {
        var rows = new ArrayList<ServiceCatalogItem>();
        for (int i = 0; i < 101; i++) rows.add(item("LATE-" + i, "AAA-LATE-" + i));
        var target = item("LATE-TARGET", "ZZZ-LATE-TARGET");
        rows.add(target);
        services.saveAllAndFlush(rows);
        adopt(target, target.code(), target.name());
        assertThat(directory.searchOrderableServices("LATE-", "LABORATORY", Long.valueOf(ORGANIZATION), today))
                .extracting(value -> value.id()).containsExactly(target.id());
    }

    @Test void doesNotHideTheNinthSameNameCandidate() {
        var rows = new ArrayList<ServiceCatalogItem>();
        for (int i = 0; i < 9; i++) rows.add(item("NINE-" + i, "NINE-SAME-NAME"));
        services.saveAllAndFlush(rows);
        rows.forEach(row -> adopt(row, row.code(), row.name()));
        assertThat(directory.searchOrderableServices("NINE-SAME-NAME", "LABORATORY", Long.valueOf(ORGANIZATION), today))
                .extracting(value -> value.id()).containsExactlyInAnyOrderElementsOf(rows.stream().map(ServiceCatalogItem::id).toList());
    }

    @Test void resolvesAllInstitutionNamesWithoutDependingOnLimitedSearchProjectionHits() {
        var rows = List.of(item("LOCAL-A", "全球目录甲"), item("LOCAL-B", "全球目录乙"));
        services.saveAllAndFlush(rows);
        rows.forEach(row -> adopt(row, row.code(), "机构同名检验"));
        assertThat(directory.searchOrderableServices("机构同名检验", "LABORATORY", Long.valueOf(ORGANIZATION), today))
                .extracting(value -> value.id()).containsExactlyInAnyOrderElementsOf(rows.stream().map(ServiceCatalogItem::id).toList());
    }

    @Test void resolvesAdoptionAtTheRequestedBusinessDateInsteadOfSubstitutingToday() {
        var value = services.saveAndFlush(item("DATE-CHECK", "DATE-CHECK"));
        adoptions.saveAndFlush(new OrganizationCatalogItem(Long.valueOf(TENANT), actor, Long.valueOf(ORGANIZATION),
                value.id(), Long.valueOf(DEPARTMENT), "PAST", "历史项目名", true, true, true, false, false, false, false,
                "ACTIVE", LocalDate.of(2020, 1, 1), LocalDate.of(2021, 12, 31)));
        adoptions.saveAndFlush(new OrganizationCatalogItem(Long.valueOf(TENANT), actor, Long.valueOf(ORGANIZATION),
                value.id(), Long.valueOf(DEPARTMENT), "PRESENT", "当前项目名", true, true, true, false, false, false, false,
                "ACTIVE", LocalDate.of(2022, 1, 1), null));
        var past = LocalDate.of(2021, 1, 1);
        assertThat(directory.searchOrderableServices("DATE-CHECK", "LABORATORY", Long.valueOf(ORGANIZATION), past))
                .extracting(row -> row.organizationAdoption().localCode()).containsExactly("PAST");
        assertThat(directory.findOrderableServicesByIds(List.of(value.id()), Long.valueOf(ORGANIZATION), past))
                .extracting(row -> row.organizationAdoption().localCode()).containsExactly("PAST");
        assertThat(directory.searchOrderableServices("DATE-CHECK", "LABORATORY", Long.valueOf(ORGANIZATION), today))
                .extracting(row -> row.organizationAdoption().localCode()).containsExactly("PRESENT");
    }

    private ServiceCatalogItem item(String code, String name) {
        return new ServiceCatalogItem(Long.valueOf(TENANT), actor, seed.itemTypeId(), code, name, "次", true, true,
                "ACTIVE", LocalDate.of(2020, 1, 1), null, "LABORATORY", null, "COMMON", false, false, true,
                null, null, null, null, null, null, null, null, false, null, null);
    }
    private void adopt(ServiceCatalogItem item, String code, String name) {
        adoptions.saveAndFlush(new OrganizationCatalogItem(Long.valueOf(TENANT), actor, Long.valueOf(ORGANIZATION),
                item.id(), Long.valueOf(DEPARTMENT), code, name, true, true, true, false, false, false, false,
                "ACTIVE", LocalDate.of(2020, 1, 1), null));
    }
}
