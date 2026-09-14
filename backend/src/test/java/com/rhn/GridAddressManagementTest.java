package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GridAddressManagementTest extends RhnIntegrationTestSupport {

    @Test
    void grid_addresses_support_three_or_five_levels_and_pinyin_filtering() throws Exception {
        mockMvc.perform(get("/api/platform/grid-addresses").param("maxLevel", "3").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(7))
                .andExpect(jsonPath("$[0].level").value("PROVINCE"))
                .andExpect(jsonPath("$[0].code").value("320000000000"));

        mockMvc.perform(get("/api/platform/grid-addresses").param("maxLevel", "5").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(14));

        mockMvc.perform(get("/api/platform/grid-addresses")
                        .param("maxLevel", "5").param("query", "QHSQ").with(rhn()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].code").value("320115002001"))
                .andExpect(jsonPath("$[0].fullPath").value("江苏省/南京市/江宁区/秣陵街道/青禾社区"));

        mockMvc.perform(get("/api/platform/grid-addresses").param("maxLevel", "4").with(rhn()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_LEVEL_MODE_INVALID"));
    }

    @Test
    void grid_address_management_enforces_contiguous_hierarchy_revision_and_child_status() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 6).toUpperCase();
        String provinceCode = (70 + Math.abs(suffix.hashCode() % 20)) + "0000000000";
        String cityCode = provinceCode.substring(0, 2) + "0100000000";
        JsonNode province = json(mockMvc.perform(post("/api/platform/grid-addresses").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"level":"PROVINCE","code":"%s","name":"测试省%s",
                                 "pinyinCode":"CSS","sortOrder":90}
                                """.formatted(provinceCode, suffix)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.revision").value(0))
                .andReturn().getResponse().getContentAsString());
        String provinceId = province.get("id").asString();

        JsonNode city = json(mockMvc.perform(post("/api/platform/grid-addresses").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"parentId":"%s","level":"CITY","code":"%s","name":"测试市",
                                 "pinyinCode":"CSS","sortOrder":10}
                                """.formatted(provinceId, cityCode)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.fullPath").value("测试省" + suffix + "/测试市"))
                .andReturn().getResponse().getContentAsString());

        mockMvc.perform(post("/api/platform/grid-addresses").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"parentId":"%s","level":"COUNTY","code":"%s","name":"错误县",
                                 "pinyinCode":"CWX","sortOrder":10}
                                """.formatted(provinceId, provinceCode.substring(0, 2) + "0101000000")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_LEVEL_INVALID"));

        mockMvc.perform(post("/api/platform/grid-addresses").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"parentId":"%s","level":"CITY","code":"330100000000","name":"错误前缀市",
                                 "pinyinCode":"CWQZS","sortOrder":20}
                                """.formatted(provinceId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_CODE_PREFIX_INVALID"));

        mockMvc.perform(post("/api/platform/grid-addresses").with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"level":"PROVINCE","code":"320000","name":"六位编码省",
                                 "pinyinCode":"LWBM","sortOrder":99}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_CODE_INVALID"));

        mockMvc.perform(post("/api/platform/grid-addresses/{id}/status", provinceId).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"expectedRevision\":0,\"status\":\"INACTIVE\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_CHILD_ACTIVE"));

        mockMvc.perform(put("/api/platform/grid-addresses/{id}", city.get("id").asString()).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"parentId":"%s","name":"测试新城",
                                 "pinyinCode":"CSXC","sortOrder":20}
                                """.formatted(provinceId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.fullPath").value("测试省" + suffix + "/测试新城"));

        mockMvc.perform(put("/api/platform/grid-addresses/{id}", city.get("id").asString()).with(rhn())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"expectedRevision":0,"parentId":"%s","name":"过期修改",
                                 "pinyinCode":"GQXG","sortOrder":20}
                                """.formatted(provinceId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_REVISION_CONFLICT"));
    }
}
