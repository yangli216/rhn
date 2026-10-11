package com.rhn.quality;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;
import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.outpatient.api.PrescriptionSafetySnapshot.PatientSafetyContext;
import com.rhn.quality.medication.domain.MedicationSafetyCategoryMembership;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.ParameterizedCategoryConflictRule;
import com.rhn.quality.medication.domain.rule.ParameterizedCategoryDuplicateRule;
import com.rhn.quality.medication.domain.rule.ParameterizedCategoryPopulationRule;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ParameterizedRuleEngineTest {
    private final JsonCodec json = new JsonCodec() {
        private final ObjectMapper mapper = JsonMapper.builder().findAndAddModules().build();
        @Override public String write(Object value) { return mapper.writeValueAsString(value); }
        @Override public JsonNode readTree(String value) { return mapper.readTree(value); }
        @Override public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @Override @SuppressWarnings("unchecked")
        public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
    };

    private RuleVersion mockVersion;

    // 内存测试会员服务
    private static class InMemoryCategoryMembership implements MedicationSafetyCategoryMembership {
        private final Map<String, Set<String>> categoryDrugNames;

        InMemoryCategoryMembership(Map<String, Set<String>> categoryDrugNames) {
            this.categoryDrugNames = categoryDrugNames;
        }

        @Override
        public boolean isMedicationInCategory(Long tenantId, Long medId, String genericName, String categoryCode, String doseForm) {
            var names = categoryDrugNames.get(categoryCode);
            return names != null && genericName != null && names.contains(genericName);
        }
    }

    private final InMemoryCategoryMembership membership = new InMemoryCategoryMembership(Map.of(
            "RAS_ACEI", Set.of("卡托普利片", "依那普利胶囊"),
            "RAS_ARB", Set.of("氯沙坦钾片", "厄贝沙坦片"),
            "SYSTEMIC_NSAID", Set.of("布洛芬缓释胶囊", "双氯芬酸钠肠溶片", "塞来昔布胶囊"),
            "QUINOLONE_PEDIATRIC", Set.of("左氧氟沙星片", "环丙沙星注射液")
    ));

    @BeforeEach
    void setUp() {
        mockVersion = new RuleVersion(
                99901L,
                new RuleDefinition(999L, "QMED.TEST.RULE", "CUSTOM", "测试规则"),
                1,
                "qmed-standard-shadow-v2",
                "java:parameterized:1",
                "SHADOW",
                MedicationSafetyDecision.Severity.HIGH,
                MedicationSafetyDecision.Status.BLOCK,
                MedicationSafetyDecision.OverridePolicy.NOT_ALLOWED,
                Instant.parse("2026-01-01T00:00:00Z"),
                null,
                List.of(new MedicationSafetyDecision.Evidence("LABEL", "测试说明书", "1", "test", "contraindication", "test", "CLINICAL_EVIDENCE"))
        );
    }

    private PrescriptionSafetySnapshot.MedicationItem createItem(long requestId, String drugName, String status) {
        String snapshotJson = "{\"name\":\"" + drugName + "\",\"id\":1001,\"doseForm\":\"TABLET\"}";
        return new PrescriptionSafetySnapshot.MedicationItem(
                requestId,
                0,
                1001L,
                requestId + 1000,
                null,
                status,
                "RESOLVED",
                new BigDecimal("10.0"),
                "mg",
                100L,
                "PO",
                "ORAL",
                "RESOLVED",
                200L,
                "QD",
                "{}",
                BigDecimal.ONE,
                "DAY",
                snapshotJson,
                "{}",
                "{}"
        );
    }

    private PrescriptionSafetySnapshot createSnapshot(Integer patientAge, List<PrescriptionSafetySnapshot.MedicationItem> items) {
        var context = patientAge != null
                ? new PatientSafetyContext(true, true, null, List.of(), patientAge, "MALE")
                : null;
        return new PrescriptionSafetySnapshot(
                PrescriptionSafetySnapshot.SCHEMA_VERSION,
                1L, 2L, 0, 3L, 4L, 5L, 6L, "DRAFT", items, context, null
        );
    }

    @Test
    void templateA_conflict_rule_triggers_when_both_categories_present() {
        var rule = new ParameterizedCategoryConflictRule(
                "QMED.RULE.RAS_DUAL",
                "java:category-conflict:ras-dual",
                "RAS_ACEI",
                "RAS_ARB",
                "严禁 ACEI【%s】与 ARB【%s】联合使用，避免双重 RAS 阻断诱发肾功能衰竭。",
                "请选择其中单一品种。",
                json,
                membership
        );

        // 场景 1：同时包含 卡托普利片 (ACEI) 和 氯沙坦钾片 (ARB)
        var snapshotWithBoth = createSnapshot(50, List.of(
                createItem(101L, "卡托普利片", "ACTIVE"),
                createItem(102L, "氯沙坦钾片", "ACTIVE")
        ));
        var findings = rule.evaluate(snapshotWithBoth, mockVersion);
        assertEquals(1, findings.size());
        assertTrue(findings.getFirst().message().contains("卡托普利片"));
        assertTrue(findings.getFirst().message().contains("氯沙坦钾片"));
        assertEquals(List.of(101L, 102L), findings.getFirst().medicationRequestIds());

        // 场景 2：仅包含卡托普利片 (ACEI)
        var snapshotOnlyA = createSnapshot(50, List.of(
                createItem(101L, "卡托普利片", "ACTIVE")
        ));
        assertTrue(rule.evaluate(snapshotOnlyA, mockVersion).isEmpty());

        // 场景 3：包含已被取消的医嘱
        var snapshotCancelled = createSnapshot(50, List.of(
                createItem(101L, "卡托普利片", "ACTIVE"),
                createItem(102L, "氯沙坦钾片", "CANCELLED")
        ));
        assertTrue(rule.evaluate(snapshotCancelled, mockVersion).isEmpty());
    }

    @Test
    void templateB_population_rule_triggers_when_age_condition_matched() {
        var rule = new ParameterizedCategoryPopulationRule(
                "QMED.RULE.PEDIATRIC_QUINOLONE",
                "java:category-population:pediatric-quinolone",
                "QUINOLONE_PEDIATRIC",
                18, // < 18 岁
                null,
                "患者年龄（%d岁）低于 18 周岁，严禁开具氟喹诺酮类【%s】以避免软骨毒性。",
                "请更换为大环内酯类或头孢类适宜抗生素。",
                json,
                membership
        );

        // 场景 1：15 岁儿童开立左氧氟沙星 -> 命中
        var childSnapshot = createSnapshot(15, List.of(
                createItem(201L, "左氧氟沙星片", "ACTIVE")
        ));
        var findings = rule.evaluate(childSnapshot, mockVersion);
        assertEquals(1, findings.size());
        assertTrue(findings.getFirst().message().contains("15岁"));
        assertTrue(findings.getFirst().message().contains("左氧氟沙星片"));
        assertEquals(List.of(201L), findings.getFirst().medicationRequestIds());

        // 场景 2：25 岁成年人开立左氧氟沙星 -> 放行
        var adultSnapshot = createSnapshot(25, List.of(
                createItem(201L, "左氧氟沙星片", "ACTIVE")
        ));
        assertTrue(rule.evaluate(adultSnapshot, mockVersion).isEmpty());

        // 场景 3：年龄未提供（null） -> 放行
        var missingAgeSnapshot = createSnapshot(null, List.of(
                createItem(201L, "左氧氟沙星片", "ACTIVE")
        ));
        assertTrue(rule.evaluate(missingAgeSnapshot, mockVersion).isEmpty());
    }

    @Test
    void templateC_duplicate_rule_triggers_when_threshold_count_reached() {
        var rule = new ParameterizedCategoryDuplicateRule(
                "QMED.RULE.NSAID_DUPLICATE",
                "java:category-duplicate:nsaid",
                "SYSTEMIC_NSAID",
                2, // >= 2 种
                "处方中包含 %d 种同类非甾体抗炎药【%s】，存在严重胃肠穿孔与肾损伤风险。",
                "请保留一种。",
                json,
                membership
        );

        // 场景 1：同时开立 布洛芬缓释胶囊 + 塞来昔布胶囊 (2 种) -> 命中
        var snapshotTwoNsaids = createSnapshot(40, List.of(
                createItem(301L, "布洛芬缓释胶囊", "ACTIVE"),
                createItem(302L, "塞来昔布胶囊", "ACTIVE")
        ));
        var findings = rule.evaluate(snapshotTwoNsaids, mockVersion);
        assertEquals(1, findings.size());
        assertTrue(findings.getFirst().message().contains("布洛芬缓释胶囊"));
        assertTrue(findings.getFirst().message().contains("塞来昔布胶囊"));
        assertEquals(List.of(301L, 302L), findings.getFirst().medicationRequestIds());

        // 场景 2：仅开立 布洛芬缓释胶囊 (1 种) -> 放行
        var snapshotOneNsaid = createSnapshot(40, List.of(
                createItem(301L, "布洛芬缓释胶囊", "ACTIVE")
        ));
        assertTrue(rule.evaluate(snapshotOneNsaid, mockVersion).isEmpty());
    }
}
