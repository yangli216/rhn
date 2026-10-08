package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GridAddressIntegrityTest extends RhnIntegrationTestSupport {
    private static final AtomicInteger PROVINCE_SEQUENCE = new AtomicInteger(70);
    @Autowired JdbcTemplate jdbc;

    @Test
    void rejects_pinyin_that_normalizes_to_empty_without_creating_a_node() throws Exception {
        for (String invalid : List.of("中文", "---", "！！")) {
            int before = count();
            createRequest(null, "PROVINCE", nextCode(), "测试省", invalid)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PINYIN_INVALID"));
            assertThat(count()).isEqualTo(before);
        }
    }

    @Test
    void rejects_empty_normalized_pinyin_on_update_without_changing_revision_or_descendants() throws Exception {
        JsonNode province = province(), city = child(province, "CITY", "0100000000", "测试市");
        List<Map<String, Object>> before = snapshot();
        update(province, null, "不应保存", "---")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PINYIN_INVALID"));
        assertThat(snapshot()).isEqualTo(before);
        assertThat(city.get("fullPath").asString()).endsWith("/测试市");
    }

    @Test
    void rejects_reparenting_an_immutable_code_to_another_prefix_without_rewriting_descendants() throws Exception {
        JsonNode province = province(), other = province();
        JsonNode city = child(province, "CITY", "0100000000", "测试市");
        child(city, "COUNTY", "01000000", "测试县");
        List<Map<String, Object>> before = snapshot();
        update(city, other, "不应移动", "BYD")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_CODE_PREFIX_INVALID"));
        assertThat(snapshot()).isEqualTo(before);
        update(city, province, "新市", "x-s")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.pinyinCode").value("XS"))
                .andExpect(jsonPath("$.fullPath").value(province.get("name").asString() + "/新市"));
        String descendant = jdbc.queryForObject("SELECT DES_FULL_PATH FROM RHN_BD_GRID_ADDR_NODE WHERE CD_LEVEL = 'COUNTY' AND ID_GRID_ADDR_NODE_PARENT = ?",
                String.class, Long.valueOf(city.get("id").asString()));
        assertThat(descendant).isEqualTo(province.get("name").asString() + "/新市/测试县");
    }

    @Test
    void does_not_create_an_active_child_below_an_inactive_parent() throws Exception {
        JsonNode province = province();
        setStatus(province, "INACTIVE").andExpect(status().isOk());
        List<Map<String, Object>> before = snapshot();
        createRequest(province, "CITY", province.get("code").asString().substring(0, 2) + "0100000000", "新市", "XS")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PARENT_INACTIVE"));
        assertThat(snapshot()).isEqualTo(before);
    }

    @Test
    void requires_parent_activation_before_child_activation_but_allows_editing_inactive_records() throws Exception {
        JsonNode province = province(), city = child(province, "CITY", "0100000000", "测试市");
        city = result(setStatus(city, "INACTIVE").andExpect(status().isOk()));
        province = result(setStatus(province, "INACTIVE").andExpect(status().isOk()));
        List<Map<String, Object>> before = snapshot();
        setStatus(city, "ACTIVE").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PARENT_INACTIVE"));
        assertThat(snapshot()).isEqualTo(before);
        city = result(update(city, province, "修订市", "XD S").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("INACTIVE")));
        province = result(setStatus(province, "ACTIVE").andExpect(status().isOk()));
        city = result(setStatus(city, "ACTIVE").andExpect(status().isOk()));
        JsonNode active = result(mockMvc.perform(get("/api/platform/grid-addresses").with(rhn()).param("maxLevel", "5"))
                .andExpect(status().isOk()));
        var ids = new java.util.HashSet<String>();
        active.forEach(node -> ids.add(node.get("id").asString()));
        assertThat(ids).contains(province.get("id").asString(), city.get("id").asString());
        for (JsonNode node : active) {
            if (node.hasNonNull("parentId")) assertThat(ids).contains(node.get("parentId").asString());
        }
    }

    @Test
    void checks_all_ancestors_before_creating_or_updating_an_active_node() throws Exception {
        JsonNode province = province(), city = child(province, "CITY", "0100000000", "测试市");
        // Reproduce a legacy inconsistency in this test's isolated H2 database.
        jdbc.update("UPDATE RHN_BD_GRID_ADDR_NODE SET SD_STATUS = 'INACTIVE' WHERE ID_GRID_ADDR_NODE = ?",
                Long.valueOf(province.get("id").asString()));
        try {
            List<Map<String, Object>> before = snapshot();
            createRequest(city, "COUNTY", city.get("code").asString().substring(0, 4) + "01000000", "测试县", "CSX")
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PARENT_INACTIVE"));
            update(city, province, "不应修改", "BYXG").andExpect(status().isConflict())
                    .andExpect(jsonPath("$.code").value("GRID_ADDRESS_PARENT_INACTIVE"));
            assertThat(snapshot()).isEqualTo(before);
        } finally {
            jdbc.update("UPDATE RHN_BD_GRID_ADDR_NODE SET SD_STATUS = 'ACTIVE' WHERE ID_GRID_ADDR_NODE = ?",
                    Long.valueOf(province.get("id").asString()));
        }
    }

    private String nextCode() { return PROVINCE_SEQUENCE.getAndIncrement() + "0000000000"; }
    private int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM RHN_BD_GRID_ADDR_NODE", Integer.class); }
    private List<Map<String, Object>> snapshot() {
        return jdbc.queryForList("SELECT * FROM RHN_BD_GRID_ADDR_NODE ORDER BY ID_GRID_ADDR_NODE");
    }
    private JsonNode province() throws Exception {
        String code = nextCode();
        return result(createRequest(null, "PROVINCE", code, "测试省" + code.substring(0, 2), "CSS").andExpect(status().isCreated()));
    }
    private JsonNode child(JsonNode parent, String level, String suffix, String name) throws Exception {
        String code = parent.get("code").asString().substring(0, 12 - suffix.length()) + suffix;
        return result(createRequest(parent, level, code, name, "CS").andExpect(status().isCreated()));
    }
    private ResultActions createRequest(JsonNode parent, String level, String code, String name, String pinyin) throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("parentId", parent == null ? null : parent.get("id").asString());
        input.put("level", level); input.put("code", code); input.put("name", name); input.put("pinyinCode", pinyin); input.put("sortOrder", 10);
        return mockMvc.perform(post("/api/platform/grid-addresses").with(rhn()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(input)));
    }
    private ResultActions update(JsonNode node, JsonNode parent, String name, String pinyin) throws Exception {
        var input = new LinkedHashMap<String, Object>();
        input.put("expectedRevision", node.get("revision").asLong());
        input.put("parentId", parent == null ? null : parent.get("id").asString());
        input.put("name", name); input.put("pinyinCode", pinyin); input.put("sortOrder", 10);
        return mockMvc.perform(put("/api/platform/grid-addresses/{id}", node.get("id").asString()).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(input)));
    }
    private ResultActions setStatus(JsonNode node, String status) throws Exception {
        return mockMvc.perform(post("/api/platform/grid-addresses/{id}/status", node.get("id").asString()).with(rhn())
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(
                        Map.of("expectedRevision", node.get("revision").asLong(), "status", status))));
    }
    private JsonNode result(ResultActions actions) throws Exception { return json(actions.andReturn().getResponse().getContentAsString()); }
}
