package com.rhn;

import com.rhn.platform.masterdata.api.StandardCatalogEntryReview.*;
import com.rhn.platform.masterdata.api.StandardCatalogReview.Identity;
import com.rhn.platform.masterdata.application.StandardCatalogEntryReviewService;
import com.rhn.platform.masterdata.application.StandardCatalogEditionService;
import com.rhn.platform.masterdata.application.StandardCatalogReviewService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ResetDatabaseBeforeEachTestMethod
class StandardCatalogEntryReviewTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired StandardCatalogEntryReviewService reviews;
    @Autowired StandardCatalogEditionService editions;
    @Autowired StandardCatalogReviewService sources;
    void actor(long tenant,boolean manage) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant,7L,"核对员","entry-review-test",manage ? Set.of("MASTER_DATA.MANAGE") : Set.of(),Long.valueOf(ORGANIZATION),Long.valueOf(DEPARTMENT),"DEPARTMENT",Set.of(),Set.of()));
    }
    String entry() {return editions.content(0L).path("entries").get(0).path("id").asString();}
    @Test void saves_exact_entry_and_isolates_tenant_version_and_provenance() {
        actor(Long.parseLong(TENANT),true); var identity=editions.current().identity(); var id=entry();
        var result=reviews.change(0L,id,new EntryReviewChange(identity,0,"CHECKED",""));
        assertThat(result.actor()).isEqualTo("核对员");
        assertThat(reviews.view(0L).entries()).containsExactly(result);
        assertThat(sources.view().status()).isEqualTo("UNVERIFIED");
        var issue=reviews.change(0L,id,new EntryReviewChange(identity,1,"ISSUE","规格有差异"));
        assertThat(reviews.view(0L).entries()).containsExactly(issue);
        assertThatThrownBy(()->reviews.change(0L,id,new EntryReviewChange(identity,1,"CHECKED",""))).hasMessageContaining("刷新");
        var wrong=new Identity(identity.catalogId(),identity.catalogVersion(),"other",identity.sourceHash());
        assertThatThrownBy(()->reviews.change(0L,id,new EntryReviewChange(wrong,2,"CHECKED",""))).hasMessageContaining("版本已变化");
        actor(999999L,true); assertThat(reviews.view(0L).entries()).isEmpty();
    }
    @Test void rejects_missing_note_unknown_entry_and_absent_permission() {
        actor(Long.parseLong(TENANT),true); var identity=editions.current().identity();
        assertThatThrownBy(()->reviews.change(0L,entry(),new EntryReviewChange(identity,0,"ISSUE"," "))).hasMessageContaining("说明");
        assertThatThrownBy(()->reviews.change(0L,"missing",new EntryReviewChange(identity,0,"CHECKED",""))).hasMessageContaining("不存在");
        actor(Long.parseLong(TENANT),false);
        assertThatThrownBy(()->reviews.change(0L,entry(),new EntryReviewChange(identity,0,"CHECKED",""))).hasMessageContaining("权限");
    }
    @Test void http_contract_requires_management_and_round_trips() throws Exception {
        actor(Long.parseLong(TENANT),true);
        String path="/api/platform/master-data/medication-standard-catalog/editions/0/entry-reviews";
        actor(Long.parseLong(TENANT),false);
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isForbidden());
        actor(Long.parseLong(TENANT),true);
        mockMvc.perform(post(path+"/"+entry()).with(rhnWorkContext()).contentType(org.springframework.http.MediaType.APPLICATION_JSON)
            .content(objectMapper.writeValueAsString(new EntryReviewChange(editions.current().identity(),0,"CHECKED",""))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CHECKED"));
        mockMvc.perform(get(path).with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.entries[0].revision").value(1));
    }
}
