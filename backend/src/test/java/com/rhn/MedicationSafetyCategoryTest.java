package com.rhn;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.api.MedicationSafetyCategoryContracts.*;
import com.rhn.quality.medication.application.MedicationSafetyCategoryService;
import com.rhn.quality.medication.domain.RuleDefinition;
import com.rhn.quality.medication.domain.RuleVersion;
import com.rhn.quality.medication.domain.rule.AgeContraindicationRule;
import com.rhn.quality.medication.domain.rule.DisulfiramInteractionRule;
import com.rhn.quality.medication.domain.rule.NsaidDuplicateRule;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class MedicationSafetyCategoryTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired MedicationSafetyCategoryService service;
    @Autowired JsonCodec codec;

    private static final Long TEST_TENANT = 362387869790209L;

    @BeforeEach
    void setupContext() {
        TenantContext.set(TEST_TENANT);
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(
                TEST_TENANT, 7L, "doctor", "qmed-test", Set.of("MASTER_DATA.MANAGE"),
                362387869790211L, 362387869790212L, "DEPARTMENT", Set.of(), Set.of()
        ));
    }

    @AfterEach
    void clearTenant() {
        TenantContext.clear();
    }

    @Test
    void presetSafetyCategoriesExistAfterMigration() {
        List<CategoryView> categories = service.listCategories(null, null);
        assertThat(categories).isNotEmpty();

        List<String> codes = categories.stream().map(CategoryView::code).toList();
        assertThat(codes).contains(
                "DISULFIRAM_INDUCER",
                "ETHANOL_SOLVENT",
                "SYSTEMIC_NSAID",
                "QUINOLONE_PEDIATRIC_CONTRA",
                "ASPIRIN_PEDIATRIC_CONTRA"
        );
    }

    @Test
    void categoryLifecycleAndMemberManagement() {
        // 1. 创建自定义分类
        String catCode = "CUSTOM_HEPATOTOXIC_" + System.currentTimeMillis();
        CategoryView created = service.createCategory(new CreateCategoryRequest(
                catCode, "高危肝毒性药物监控", "SPECIAL_POPULATION_CONTRAINDICATION", "严重肝损害或ALT超标时慎用"
        ));
        assertNotNull(created.id());
        assertEquals(catCode, created.code());
        assertFalse(created.isSystem());

        // 2. 更新分类
        CategoryView updated = service.updateCategory(created.id(), new UpdateCategoryRequest(
                created.revision(), "高危肝毒性药物监控-修订", "临床肝功能异常时严禁使用", "ACTIVE"
        ));
        assertEquals("高危肝毒性药物监控-修订", updated.name());

        // 3. 批量添加药品成员
        int added = service.addMembers(created.id(), new AddMembersRequest(List.of(
                new MemberItem(99901L, "TEST-DRUG-01", "利福平胶囊", "0.15g*100粒", "胶囊剂"),
                new MemberItem(99902L, "TEST-DRUG-02", "异烟肼片", "0.1g*100片", "片剂")
        )));
        assertEquals(2, added);

        // 4. 查询成员
        List<MemberView> members = service.listMembers(created.id(), null);
        assertThat(members).hasSize(2);
        assertThat(members.stream().map(MemberView::medicationName)).contains("利福平胶囊", "异烟肼片");

        // 5. 药品标签反查
        List<MedicationTagView> tags = service.listTagsForMedication(99901L, "利福平胶囊");
        assertThat(tags.stream().map(MedicationTagView::categoryCode)).contains(catCode);

        // 6. 移除成员
        Long memberToRemove = members.getFirst().id();
        service.removeMember(created.id(), memberToRemove);
        assertThat(service.listMembers(created.id(), null)).hasSize(1);

        // 7. 删除自定义分类
        service.deleteCategory(created.id());
        assertThrows(RuntimeException.class, () -> service.getCategory(created.id()));
    }

    @Test
    void systemCategoryProtectedFromDeletion() {
        CategoryView disulfiram = service.listCategories("DISULFIRAM_INDUCER", null).getFirst();
        assertTrue(disulfiram.isSystem());

        assertThrows(RuntimeException.class, () -> service.deleteCategory(disulfiram.id()));
    }

    @Test
    void disulfiramInteractionRuleDynamicallyMatchesCategoryMembers() {
        CategoryView inducerCat = service.listCategories("DISULFIRAM_INDUCER", null).getFirst();

        // 动态向双硫仑致敏类添加一个非经典药名
        String customDrugName = "新型头孢试验药-" + System.currentTimeMillis();
        service.addMembers(inducerCat.id(), new AddMembersRequest(List.of(
                new MemberItem(88801L, "SPEC-CEPH-01", customDrugName, "1.0g", "注射剂")
        )));

        DisulfiramInteractionRule rule = new DisulfiramInteractionRule(codec, service);
        RuleVersion mockVersion = mockRuleVersion(DisulfiramInteractionRule.CODE);

        // 模拟处方：新型头孢 + 藿香正气水
        PrescriptionSafetySnapshot snapshot = mockSnapshot(List.of(
                mockMedItem(1L, 88801L, customDrugName, "1.0g", "注射剂"),
                mockMedItem(2L, 88802L, "藿香正气水", "10ml*10支", "合剂")
        ), 30);

        var findings = rule.evaluate(snapshot, mockVersion);
        assertThat(findings).isNotEmpty();
        assertThat(findings.getFirst().message()).contains(customDrugName);
        assertThat(findings.getFirst().message()).contains("藿香正气水");
    }

    @Test
    void nsaidDuplicateRuleDynamicallyMatchesCategoryMembers() {
        CategoryView nsaidCat = service.listCategories("SYSTEMIC_NSAID", null).getFirst();

        String customNsaid1 = "新型COX2抑制药甲";
        String customNsaid2 = "新型COX2抑制药乙";
        service.addMembers(nsaidCat.id(), new AddMembersRequest(List.of(
                new MemberItem(77701L, "COX-01", customNsaid1, "200mg", "胶囊剂"),
                new MemberItem(77702L, "COX-02", customNsaid2, "100mg", "片剂")
        )));

        NsaidDuplicateRule rule = new NsaidDuplicateRule(codec, service);
        RuleVersion mockVersion = mockRuleVersion(NsaidDuplicateRule.CODE);

        PrescriptionSafetySnapshot snapshot = mockSnapshot(List.of(
                mockMedItem(1L, 77701L, customNsaid1, "200mg", "胶囊剂"),
                mockMedItem(2L, 77702L, customNsaid2, "100mg", "片剂")
        ), 45);

        var findings = rule.evaluate(snapshot, mockVersion);
        assertThat(findings).isNotEmpty();
        assertThat(findings.getFirst().message()).contains("多种全身性非甾体抗炎药");
    }

    @Test
    void ageContraindicationRuleDynamicallyMatchesQuinoloneCategory() {
        CategoryView quinoloneCat = service.listCategories("QUINOLONE_PEDIATRIC_CONTRA", null).getFirst();

        String newQuinolone = "新一代广谱沙星药物";
        service.addMembers(quinoloneCat.id(), new AddMembersRequest(List.of(
                new MemberItem(66601L, "QUINO-NEW", newQuinolone, "0.5g", "片剂")
        )));

        AgeContraindicationRule rule = new AgeContraindicationRule(codec, service);
        RuleVersion mockVersion = mockRuleVersion(AgeContraindicationRule.CODE);

        // 14岁儿童处方
        PrescriptionSafetySnapshot snapshotChild = mockSnapshot(List.of(
                mockMedItem(1L, 66601L, newQuinolone, "0.5g", "片剂")
        ), 14);

        var findingsChild = rule.evaluate(snapshotChild, mockVersion);
        assertThat(findingsChild).isNotEmpty();
        assertThat(findingsChild.getFirst().message()).contains("未满18周岁");
        assertThat(findingsChild.getFirst().message()).contains(newQuinolone);

        // 25岁成人处方不应触发
        PrescriptionSafetySnapshot snapshotAdult = mockSnapshot(List.of(
                mockMedItem(1L, 66601L, newQuinolone, "0.5g", "片剂")
        ), 25);
        var findingsAdult = rule.evaluate(snapshotAdult, mockVersion);
        assertThat(findingsAdult).isEmpty();
    }

    @Test
    void standardCatalogLoadingAndBatchImportWork() {
        // 1. 标准目录分类汇总可获取
        List<StandardCatalogCategorySummary> summaries = service.listStandardCatalogCategories();
        assertThat(summaries).isNotEmpty();
        assertThat(summaries.stream().map(StandardCatalogCategorySummary::sub))
                .contains("（八）喹诺酮类", "（二）解热镇痛、抗炎、抗风湿药");

        // 2. 查找标准目录候选用药
        List<MemberItem> candidates = service.searchMedicationsByStandardCatalog(
                "一、抗微生物药", "（八）喹诺酮类", false, null
        );
        assertThat(candidates).isNotEmpty();
        assertThat(candidates.stream().map(MemberItem::medicationName))
                .anyMatch(n -> n.contains("沙星"));

        // 3. 一键批量导入候选药品
        CategoryView testCat = service.createCategory(new CreateCategoryRequest(
                "BATCH_IMPORT_TEST_" + System.currentTimeMillis(),
                "批量导入测试类", "AGE_CONTRAINDICATION", "测试说明",
                "一、抗微生物药", "（八）喹诺酮类", true
        ));

        CatalogImportResult result = service.importFromCatalog(testCat.id(), new CatalogImportRequest(
                "一、抗微生物药", "（八）喹诺酮类", true
        ));
        assertThat(result.importedCount()).isGreaterThan(0);

        List<MemberView> members = service.listMembers(testCat.id(), null);
        assertThat(members).isNotEmpty();

        // 清理
        service.deleteCategory(testCat.id());
    }

    @Test
    void standardCatalogInheritanceAndTopicalFiltering() {
        // QUINOLONE_PEDIATRIC_CONTRA 关联了 "（八）喹诺酮类", 并且 systemicOnly = true
        // 模拟一个未显式加入该分类、但在药品目录中的喹诺酮药品（如莫西沙星片）
        boolean oralQuinoloneMatched = service.isMedicationInCategory(
                TEST_TENANT, null, "盐酸莫西沙星片", "QUINOLONE_PEDIATRIC_CONTRA", "片剂"
        );
        assertTrue(oralQuinoloneMatched, "口服莫西沙星片应当通过标准目录继承被判定属于喹诺酮类");

        // 外用制剂（例如左氧氟沙星滴眼液）因 systemicOnly=true 不应被判定为儿童全身禁用
        boolean eyeDropsMatched = service.isMedicationInCategory(
                TEST_TENANT, null, "左氧氟沙星滴眼液", "QUINOLONE_PEDIATRIC_CONTRA", "滴眼剂"
        );
        assertFalse(eyeDropsMatched, "左氧氟沙星滴眼液属于局部制剂，systemicOnly 应排除");

        // SYSTEMIC_NSAID 关联了 "（二）解热镇痛、抗炎、抗风湿药", 且 systemicOnly = true
        boolean oralIbuprofen = service.isMedicationInCategory(
                TEST_TENANT, null, "布洛芬缓释胶囊", "SYSTEMIC_NSAID", "胶囊剂"
        );
        assertTrue(oralIbuprofen, "布洛芬缓释胶囊应当通过目录继承被判定属于全身NSAID");

        boolean topicalGel = service.isMedicationInCategory(
                TEST_TENANT, null, "双氯芬酸钠二乙胺乳胶剂", "SYSTEMIC_NSAID", "凝胶剂"
        );
        assertFalse(topicalGel, "双氯芬酸外用凝胶因 systemicOnly 应排除");
    }

    @Test
    void controllerEndpointsWorkThroughMockMvc() throws Exception {
        mockMvc.perform(get("/api/quality/medication-safety/categories")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].code").exists());

        mockMvc.perform(get("/api/quality/medication-safety/categories/standard-catalog-categories")
                        .with(rhnWorkContext()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$[0].sub").exists());
    }

    private RuleVersion mockRuleVersion(String code) {
        return new RuleVersion(
                1001L, new RuleDefinition(2001L, code, code, "测试规则"),
                1, "qmed-standard-shadow-v2", "java:test:1", "SHADOW",
                com.rhn.outpatient.api.MedicationSafetyDecision.Severity.HIGH,
                com.rhn.outpatient.api.MedicationSafetyDecision.Status.REQUIRE_OVERRIDE,
                com.rhn.outpatient.api.MedicationSafetyDecision.OverridePolicy.REASON_REQUIRED,
                Instant.now().minusSeconds(86400), null,
                List.of(new com.rhn.outpatient.api.MedicationSafetyDecision.Evidence(
                        "DRUG_SPECIFICATION", "说明书", "2024", "1", "禁忌", "测试禁忌依据", "CLINICAL_EVIDENCE"
                ))
        );
    }

    private PrescriptionSafetySnapshot mockSnapshot(List<PrescriptionSafetySnapshot.MedicationItem> items, int ageYears) {
        return new PrescriptionSafetySnapshot(
                PrescriptionSafetySnapshot.SCHEMA_VERSION, TEST_TENANT, 5001L, 0L,
                101L, 201L, 362387869790211L, 362387869790212L,
                "DRAFT", items,
                new PrescriptionSafetySnapshot.PatientSafetyContext(
                        true, true, null, List.of(), ageYears, "MALE"
                )
        );
    }

    private PrescriptionSafetySnapshot.MedicationItem mockMedItem(Long reqId, Long medId, String name, String spec, String doseForm) {
        String snapshotJson = """
                {
                  "id": %d,
                  "name": "%s",
                  "preparationSpec": "%s",
                  "doseForm": "%s"
                }
                """.formatted(medId, name, spec, doseForm);
        return new PrescriptionSafetySnapshot.MedicationItem(
                reqId, 0L, medId, null, null,
                "DRAFT", "RESOLVED", BigDecimal.ONE, "盒",
                100L, "PO", "ORAL", "RESOLVED",
                200L, "QD", "{}",
                BigDecimal.valueOf(3), "天", snapshotJson,
                "{}", "{}"
        );
    }
}
