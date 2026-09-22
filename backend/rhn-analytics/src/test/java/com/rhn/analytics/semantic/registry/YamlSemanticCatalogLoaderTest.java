package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class YamlSemanticCatalogLoaderTest {

    @Test
    @DisplayName("YAML 语义资产包加载测试：验证门诊本体数据资产包 outpatient-ontology.v1.yaml 完整性")
    void load_outpatient_ontology_yaml_asset_successfully() {
        SemanticCatalog catalog = YamlSemanticCatalogLoader.load("semantic/outpatient-ontology.v1.yaml");

        assertNotNull(catalog);
        assertEquals("1.0.0", catalog.version());
        assertEquals("OUTPATIENT", catalog.domain());

        // 验证实体
        assertEquals(7, catalog.entities().size());
        assertTrue(catalog.entities().stream().anyMatch(e -> e.code().equals("DEPARTMENT")));
        assertTrue(catalog.entities().stream().anyMatch(e -> e.code().equals("CHARGE")));
        assertEquals("RHN_PI_PAT", catalog.entities().stream().filter(e -> e.code().equals("PATIENT")).findFirst().orElseThrow().table());
        assertEquals("RHN_VIS_ENC", catalog.entities().stream().filter(e -> e.code().equals("ENCOUNTER")).findFirst().orElseThrow().table());
        assertEquals(6, catalog.entities().stream().filter(e -> e.table() != null).count());
        assertNull(catalog.entities().stream().filter(e -> e.code().equals("PRESCRIPTION")).findFirst().orElseThrow().table(),
            "An unimplemented entity must not acquire a guessed physical table");

        // 验证关系
        assertEquals(9, catalog.relationships().size());
        assertTrue(catalog.relationships().stream().anyMatch(r ->
            r.from().equals("CHARGE") && r.to().equals("DEPARTMENT") && r.cardinality() == Cardinality.MANY_TO_ONE));
        assertTrue(catalog.relationships().stream().anyMatch(r ->
            r.from().equals("ENCOUNTER") && r.to().equals("DIAGNOSIS") && r.fanoutRisk()));
        assertTrue(catalog.relationships().stream().filter(r -> r.from().equals("ORDER") && r.to().equals("DEPARTMENT"))
            .flatMap(r -> r.conditions().stream()).anyMatch(c -> c.fromField().equals("ID_DEPT_REQ") && c.toField().equals("ID_DEPT")));

        // 验证维度与属性
        assertEquals(9, catalog.dimensions().size());
        DimensionDefinition chargeDept = catalog.dimensions().stream()
            .filter(d -> d.code().equals("CHARGE_DEPARTMENT"))
            .findFirst()
            .orElseThrow();
        assertEquals("收费科室", chargeDept.name());
        assertFalse(chargeDept.attributes().isEmpty());
        DimensionAttribute attr = chargeDept.attributes().get(0);
        assertEquals("dept_type", attr.code());
        assertEquals("SD_DEPT_TYPE", attr.physicalColumn());
        assertTrue(attr.valueAliases().containsKey("CLINICAL"));
        assertTrue(attr.valueAliases().get("CLINICAL").contains("诊疗科室"));

        // 验证指标与默认过滤
        assertEquals(15, catalog.metrics().size());
        MetricDefinition drugCharge = catalog.metrics().stream()
            .filter(m -> m.code().equals("OP_DRUG_CHARGE_AMOUNT"))
            .findFirst()
            .orElseThrow();
        assertEquals("门诊药品费用净发生额", drugCharge.name());
        assertEquals(Aggregate.SUM, drugCharge.aggregate());
        assertEquals("CHARGE", drugCharge.source());
        assertEquals(3, drugCharge.defaultFilters().size());
        assertTrue(drugCharge.defaultFilters().stream().anyMatch(f -> f.field().equals("deptType") && f.values().contains("CLINICAL")));
        assertTrue(drugCharge.forbiddenMeanings().contains("实际收款"));
        assertTrue(drugCharge.forbiddenMeanings().contains("医保到账"));
    }

    @Test
    @DisplayName("加载不存在的资产包应抛出清晰异常")
    void load_nonexistent_asset_throws_exception() {
        assertThrows(RuntimeException.class, () -> YamlSemanticCatalogLoader.load("semantic/non-existent.yaml"));
    }
}
