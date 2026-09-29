package com.rhn;

import com.rhn.platform.masterdata.api.StandardSpecificationDisposition.Change;
import com.rhn.platform.masterdata.application.StandardCatalogReviewService;
import com.rhn.platform.masterdata.application.StandardMedicationCatalogService;
import com.rhn.platform.masterdata.application.StandardSpecificationDispositionService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class StandardSpecificationDispositionTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired StandardSpecificationDispositionService dispositions;
    @Autowired StandardMedicationCatalogService catalog;
    @Autowired StandardCatalogReviewService reviews;

    void actor(long tenant, boolean manage) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant, 7L, "主数据管理员", "spec-disposition-test",
                manage ? Set.of("MASTER_DATA.MANAGE") : Set.of(), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT),
                "DEPARTMENT", Set.of(), Set.of()));
    }

    String incompleteSpecification() {
        return catalog.snapshot().path("specifications").valueStream()
                .filter(spec -> !catalog.specificationIdentityIssues(spec).isEmpty())
                .findFirst().orElseThrow().path("id").asString();
    }

    String completeSpecification() {
        return catalog.snapshot().path("specifications").valueStream()
                .filter(spec -> catalog.specificationIdentityIssues(spec).isEmpty())
                .findFirst().orElseThrow().path("id").asString();
    }

    @Test
    void records_versioned_tenant_disposition_without_making_the_fragment_orderable() {
        actor(Long.parseLong(TENANT), true);
        var identity = reviews.identity();
        var specificationId = incompleteSpecification();
        var pending = dispositions.change(specificationId,
                new Change(identity, 0, "SUPPLEMENT_REQUIRED", "等待批准说明书补充具体含量"));
        assertThat(dispositions.view().specifications()).containsExactly(pending);
        var notAdopted = dispositions.change(specificationId,
                new Change(identity, 1, "NOT_ADOPTED", "本院无对应采购产品"));
        assertThat(dispositions.view().specifications()).containsExactly(notAdopted);
        assertThatThrownBy(() -> dispositions.change(specificationId,
                new Change(identity, 1, "SUPPLEMENT_REQUIRED", "过期版本"))).hasMessageContaining("刷新");
        assertThatThrownBy(() -> dispositions.change(completeSpecification(),
                new Change(identity, 0, "NOT_ADOPTED", "不应处置完整规格"))).hasMessageContaining("身份完整");
        actor(999999L, true);
        assertThat(dispositions.view().specifications()).isEmpty();
    }

    @Test
    void http_contract_requires_management_and_round_trips() throws Exception {
        actor(Long.parseLong(TENANT), true);
        var specificationId = incompleteSpecification();
        var identity = reviews.identity();
        String path = "/api/platform/master-data/medication-standard-catalog/specification-dispositions";
        actor(Long.parseLong(TENANT), false);
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isForbidden());
        actor(Long.parseLong(TENANT), true);
        mockMvc.perform(post(path + "/" + specificationId).with(rhnWorkContext())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new Change(identity, 0, "SUPPLEMENT_REQUIRED", "等待具体产品资料"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("SUPPLEMENT_REQUIRED"));
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk())
                .andExpect(jsonPath("$.specifications[0].specificationId").value(specificationId));
    }
}
