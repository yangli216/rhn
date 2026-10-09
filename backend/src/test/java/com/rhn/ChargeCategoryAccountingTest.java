package com.rhn;

import com.rhn.billing.application.ChargeCategoryResolver;
import com.rhn.billing.domain.ChargeCategory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

class ChargeCategoryAccountingTest {

    @Test
    void missing_standard_dictionary_items_do_not_fall_back_to_local_chinese_labels() {
        var directory = Mockito.mock(DictionaryDirectory.class);
        when(directory.resolveItemTexts(1L, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY)).thenReturn(Map.of());
        var resolver = new ChargeCategoryResolver(directory);
        assertEquals("LABORATORY", resolver.label(1L, "LABORATORY"));
        assertEquals("IMAGING", resolver.label(1L, "IMAGING"));
        assertEquals("OTHER", resolver.label(1L, "OTHER"));
    }

    @Test
    @DisplayName("支持租户自定义分类：基于租户字典动态解析用户自定义的费用归并大类")
    void should_support_tenant_custom_accounting_categories() {
        DictionaryDirectory dictionaryDirectory = Mockito.mock(DictionaryDirectory.class);
        Long tenantId = 888L;

        // 模拟用户在租户字典 BD_ACCOUNTING_CATEGORY 中自定义维护了"康复理疗费"与"健康体检费"
        when(dictionaryDirectory.resolveItemTexts(tenantId, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY))
                .thenReturn(Map.of(
                        "REHAB", "康复理疗费",
                        "HEALTH_CHECK", "健康体检费",
                        "TCM_SPECIAL", "中医特色技术费"
                ));

        ChargeCategoryResolver resolver = new ChargeCategoryResolver(dictionaryDirectory);

        // 验证用户自定义的三个大类均能被精准动态解析
        ChargeCategory rehab = resolver.resolveByCode(tenantId, "REHAB");
        assertNotNull(rehab);
        assertEquals("REHAB", rehab.code());
        assertEquals("康复理疗费", rehab.name());

        ChargeCategory healthCheck = resolver.resolveByCode(tenantId, "HEALTH_CHECK");
        assertNotNull(healthCheck);
        assertEquals("HEALTH_CHECK", healthCheck.code());
        assertEquals("健康体检费", healthCheck.name());

        ChargeCategory tcm = resolver.resolveByCode(tenantId, "TCM_SPECIAL");
        assertNotNull(tcm);
        assertEquals("TCM_SPECIAL", tcm.code());
        assertEquals("中医特色技术费", tcm.name());
    }

    @Test
    @DisplayName("用户自定义分类代码但未配置字典名称时：保留独立编码并显示原编码，绝不粗暴混入其他费")
    void should_preserve_custom_code_when_dict_text_not_found() {
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(null);

        ChargeCategory customCategory = resolver.resolveByCode(1L, "AI_TELEMEDICINE");
        assertNotNull(customCategory);
        assertEquals("AI_TELEMEDICINE", customCategory.code());
        assertEquals("AI_TELEMEDICINE", customCategory.name());
    }

    @Test
    @DisplayName("历史缺失分类明确标注为未确认，不从来源类型推定")
    void missing_snapshots_are_not_guessed_from_source_types() {
        var resolver = new ChargeCategoryResolver(null);
        for (String source : java.util.List.of("REGISTRATION_HOLD", "MED_DISPENSE", "INPATIENT_BED_DAY", "SERVICE_REQUEST", "UNKNOWN")) {
            var charge = Mockito.mock(ChargeItem.class);
            when(charge.sourceType()).thenReturn(source);
            var category = resolver.resolve(1L, charge);
            assertEquals("UNCLASSIFIED", category.code()); assertEquals("分类未确认", category.name());
        }
        assertEquals("UNCLASSIFIED", resolver.resolve(1L, null).code());
        assertEquals("UNCLASSIFIED", resolver.resolveByCode(1L, " ").code());
        assertEquals("OTHER", resolver.resolveByCode(1L, "OTHER").code());
        assertEquals("OTHER", resolver.resolveByCode(1L, "OTHER").name());
    }

    @Test
    void dictionary_failure_is_not_silently_reported_as_a_successful_lookup() {
        var directory = Mockito.mock(DictionaryDirectory.class);
        var resolver = new ChargeCategoryResolver(directory);
        when(directory.resolveItemTexts(1L, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY)).thenThrow(new IllegalStateException("unavailable"));
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> resolver.label(1L,"LABORATORY"));
        Mockito.doReturn(null).when(directory).resolveItemTexts(1L, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY);
        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class, () -> resolver.label(1L,"LABORATORY"));
    }

    @Test
    @DisplayName("新记录显式包含 SD_ACCTG_CAT 时：优先以快照分类独立核算")
    void should_prioritize_explicit_accounting_category() {
        var directory = Mockito.mock(DictionaryDirectory.class);
        when(directory.resolveItemTexts(1L, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY))
                .thenReturn(Map.of("LABORATORY", "本院检验费", "SURGERY", "手术费"));
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(directory);

        // 检验类明细
        ChargeItem labCharge = Mockito.mock(ChargeItem.class);
        when(labCharge.accountingCategory()).thenReturn("LABORATORY");
        ChargeCategory labCat = resolver.resolve(1L, labCharge);
        assertEquals("LABORATORY", labCat.code());
        assertEquals("本院检验费", labCat.name());

        // 手术类明细
        ChargeItem surgCharge = Mockito.mock(ChargeItem.class);
        when(surgCharge.accountingCategory()).thenReturn("SURGERY");
        ChargeCategory surgCat = resolver.resolve(1L, surgCharge);
        assertEquals("SURGERY", surgCat.code());
        assertEquals("手术费", surgCat.name());
    }
}
