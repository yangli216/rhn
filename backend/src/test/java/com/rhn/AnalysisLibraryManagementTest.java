package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestPropertySource(properties="rhn.analytics.pilot-enabled=true")
@Transactional
class AnalysisLibraryManagementTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;
    @jakarta.persistence.PersistenceContext jakarta.persistence.EntityManager entities;
    private static final String SPEC="""
      {"title":"诊断统计","template":"RANKING","metrics":["DIAGNOSIS_RECORDS"],"dimension":"DIAGNOSIS","scope":"CURRENT","period":{"kind":"MONTH_TO_DATE"},"limit":10}
      """;
    private JsonNode save() throws Exception {
        return json(mockMvc.perform(post("/api/analytics/pages/saved").with(rhnWorkContext()).contentType("application/json").content(SPEC))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }
    @Test void editing_rename_archive_and_restore_append_versions_and_reject_stale_updates() throws Exception {
        var initial=save();String id=initial.path("id").asString();String root=initial.path("functionId").asString();
        var revised=json(mockMvc.perform(put("/api/analytics/pages/saved/"+id).with(rhnWorkContext()).contentType("application/json")
                .content(SPEC.replace("诊断统计","新版诊断统计"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.functionId").value(root))
                .andReturn().getResponse().getContentAsString());
        mockMvc.perform(post("/api/analytics/pages/saved/"+id+"/rename").with(rhnWorkContext()).contentType("application/json")
                .content("{\"title\":\"过期修改\"}")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYSIS_VERSION_CONFLICT"));
        var renamed=json(mockMvc.perform(post("/api/analytics/pages/saved/"+revised.path("id").asString()+"/rename")
                .with(rhnWorkContext()).contentType("application/json").content("{\"title\":\"重命名\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(3)).andReturn().getResponse().getContentAsString());
        var archived=json(mockMvc.perform(post("/api/analytics/pages/saved/"+renamed.path("id").asString()+"/archive")
                .with(rhnWorkContext()).contentType("application/json").content("{\"archived\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.archived").value(true)).andReturn().getResponse().getContentAsString());
        mockMvc.perform(get("/api/analytics/pages/saved").with(rhnWorkContext())).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/analytics/pages/saved?includeArchived=true").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(put("/api/analytics/pages/saved/"+archived.path("id").asString()).with(rhnWorkContext()).contentType("application/json").content(SPEC))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ANALYSIS_ARCHIVED"));
        mockMvc.perform(post("/api/analytics/pages/saved/"+archived.path("id").asString()+"/archive").with(rhnWorkContext()).contentType("application/json")
                .content("{\"archived\":false}")).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(5));
        mockMvc.perform(get("/api/analytics/pages/saved/"+id+"/history").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(5))
                .andExpect(jsonPath("$[4].spec.title").value("诊断统计"));
    }
    @Test void library_returns_more_than_fifty_and_cannot_manage_another_owner() throws Exception {
        for(int i=0;i<51;i++)save();
        mockMvc.perform(get("/api/analytics/pages/saved").with(rhnWorkContext()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(51));
        var item=save();Long id=item.path("id").asLong();
        jdbc.update("update RHN_AN_DRAFT_VER set ID_USER_OWNER=999999 where ID_DRAFT_VER=?",id);
        entities.clear();
        mockMvc.perform(get("/api/analytics/pages/saved/"+id+"/history").with(rhnWorkContext())).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/analytics/pages/saved/"+id+"/rename").with(rhnWorkContext()).contentType("application/json")
                .content("{\"title\":\"非法修改\"}")).andExpect(status().isNotFound());
    }
}
