package com.rhn;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.infrastructure.ItemPackageRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationProductRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** 批量目录解析必须与逐项解析返回完全一致的快照。 */
class CatalogBatchResolutionTest extends RhnIntegrationTestSupport {
    @Autowired
    CatalogLifecycleDirectory catalogs;
    @Autowired
    MedicationProductRepository products;
    @Autowired
    ItemPackageRepository packages;

    @Test
    void batch_resolution_matches_per_item_resolution() {
        Long tenantId = Long.valueOf(TENANT);
        Long organizationId = Long.valueOf(ORGANIZATION);
        LocalDate at = LocalDate.of(2026, 9, 6);
        Map<Long, Long> requested = new LinkedHashMap<>();
        for (var product : products.findByTenantIdAndItemTypeOrderByName(tenantId, "MED_PRODUCT")) {
            var productPackages = packages.findByTenantIdAndCatalogItemIdInOrderByCatalogItemIdAscQuantityFactorAsc(
                    tenantId, List.of(product.id()));
            requested.put(product.id(), productPackages.isEmpty() ? null : productPackages.getFirst().id());
            if (requested.size() == 3) break;
        }
        assertThat(requested).isNotEmpty();

        var batch = catalogs.resolveAll(tenantId, organizationId, "SALE", requested, at);

        assertThat(batch).hasSize(requested.size());
        for (var entry : requested.entrySet()) {
            var single = catalogs.resolve(tenantId, entry.getKey(), organizationId, entry.getValue(), "SALE", at);
            assertThat(batch.get(entry.getKey())).usingRecursiveComparison().isEqualTo(single);
        }
    }
}
