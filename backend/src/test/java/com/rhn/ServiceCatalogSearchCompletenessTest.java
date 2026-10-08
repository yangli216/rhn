package com.rhn;

import com.rhn.platform.masterdata.domain.ServiceCatalogItem;
import com.rhn.platform.masterdata.infrastructure.ServiceCatalogItemRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDate;
import java.util.ArrayList;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ServiceCatalogSearchCompletenessTest extends RhnIntegrationTestSupport {
    @Autowired ServiceCatalogItemRepository repository;

    @Test
    void finds_matching_services_beyond_the_initial_500_rows_and_caps_only_matching_results() throws Exception {
        ServiceCatalogItem seed = repository.findById(362387869795101L).orElseThrow();
        Long actor = (Long) ReflectionTestUtils.getField(seed, "createdBy");
        var items = new ArrayList<ServiceCatalogItem>();
        for (int index = 0; index < 501; index++) items.add(item(seed, actor, "TEST-EARLY-" + index, "AAA-" + index, "ACTIVE"));
        ServiceCatalogItem target = item(seed, actor, "TEST-LATE-MATCH", "ZZZ-LATE-MATCH", "ACTIVE");
        items.add(target);
        items.add(item(seed, actor, "TEST-LATE-INACTIVE", "ZZZ-LATE-MATCH-INACTIVE", "INACTIVE"));
        repository.saveAllAndFlush(items);
        for (String query : new String[]{"TEST-LATE-MATCH", "ZZZ-LATE-MATCH"}) {
            var result = json(mockMvc.perform(get("/api/platform/master-data/services").with(rhnWorkContext())
                            .param("query", query).param("status", "ACTIVE"))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
            assertThat(result.size()).isEqualTo(1);
            assertThat(result.get(0).get("id").asString()).isEqualTo(target.id().toString());
        }
        var capped = json(mockMvc.perform(get("/api/platform/master-data/services").with(rhnWorkContext())
                        .param("query", "TEST-EARLY").param("status", "ACTIVE"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(capped.size()).isEqualTo(500);
        for (var row : capped) assertThat(row.get("code").asString()).startsWith("TEST-EARLY-");
    }
    private ServiceCatalogItem item(ServiceCatalogItem seed, Long actor, String code, String name, String status) {
        return new ServiceCatalogItem(Long.valueOf(TENANT), actor, seed.itemTypeId(), code, name, "次", true, true,
                status, LocalDate.of(2020, 1, 1), null, "TREATMENT", null, "COMMON", false, false, true,
                null, null, null, null, null, null, null, null, false, null, null);
    }
}
