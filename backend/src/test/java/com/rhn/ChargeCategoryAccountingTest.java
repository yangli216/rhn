package com.rhn;

import com.rhn.billing.application.ChargeCategoryResolver;
import com.rhn.billing.domain.ChargeCategory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.when;

class ChargeCategoryAccountingTest {

    @Test
    @DisplayName("标准分类字典映射：精准解析医保与公立医疗15+项核心大类")
    void should_resolve_standard_accounting_categories() {
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(null);

        assertEquals("诊察挂号费", resolver.label(1L, "REGISTRATION"));
        assertEquals("检验费", resolver.label(1L, "LABORATORY"));
        assertEquals("检查费", resolver.label(1L, "EXAMINATION"));
        assertEquals("检查影像费", resolver.label(1L, "IMAGING"));
        assertEquals("治疗处置费", resolver.label(1L, "TREATMENT"));
        assertEquals("手术费", resolver.label(1L, "SURGERY"));
        assertEquals("护理费", resolver.label(1L, "NURSING"));
        assertEquals("床位费", resolver.label(1L, "BED"));
        assertEquals("输血费", resolver.label(1L, "BLOOD"));
        assertEquals("材料费", resolver.label(1L, "MATERIAL"));
        assertEquals("西药费", resolver.label(1L, "WESTERN_MED"));
        assertEquals("中成药费", resolver.label(1L, "CHINESE_PATENT_MED"));
        assertEquals("中药饮片费", resolver.label(1L, "HERBAL_MED"));
        assertEquals("药品费", resolver.label(1L, "MEDICATION"));
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
    @DisplayName("用户自定义分类代码但未配置字典名称时：保留独立编码并人性化显示，绝不粗暴混入其他费")
    void should_preserve_custom_code_when_dict_text_not_found() {
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(null);

        ChargeCategory customCategory = resolver.resolveByCode(1L, "AI_TELEMEDICINE");
        assertNotNull(customCategory);
        assertEquals("AI_TELEMEDICINE", customCategory.code());
        assertEquals("Ai telemedicine", customCategory.name());
    }

    @Test
    @DisplayName("历史存量数据平滑降级：未记录 SD_ACCTG_CAT 时按业务来源类型回退兼容")
    void should_fallback_gracefully_for_legacy_charge_items() {
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(null);

        // 挂号业务来源
        ChargeItem regCharge = Mockito.mock(ChargeItem.class);
        when(regCharge.accountingCategory()).thenReturn(null);
        when(regCharge.sourceType()).thenReturn("REGISTRATION_HOLD");
        ChargeCategory regCat = resolver.resolve(1L, regCharge);
        assertEquals("REGISTRATION", regCat.code());
        assertEquals("挂号费", regCat.name());

        // 发药业务来源
        ChargeItem medCharge = Mockito.mock(ChargeItem.class);
        when(medCharge.accountingCategory()).thenReturn(null);
        when(medCharge.sourceType()).thenReturn("MED_DISPENSE");
        ChargeCategory medCat = resolver.resolve(1L, medCharge);
        assertEquals("MEDICATION", medCat.code());
        assertEquals("药品费", medCat.name());

        // 床日业务来源
        ChargeItem bedCharge = Mockito.mock(ChargeItem.class);
        when(bedCharge.accountingCategory()).thenReturn(null);
        when(bedCharge.sourceType()).thenReturn("INPATIENT_BED_DAY");
        ChargeCategory bedCat = resolver.resolve(1L, bedCharge);
        assertEquals("BED", bedCat.code());
        assertEquals("床位费", bedCat.name());
    }

    @Test
    @DisplayName("新记录显式包含 SD_ACCTG_CAT 时：优先以快照分类独立核算")
    void should_prioritize_explicit_accounting_category() {
        ChargeCategoryResolver resolver = new ChargeCategoryResolver(null);

        // 检验类明细
        ChargeItem labCharge = Mockito.mock(ChargeItem.class);
        when(labCharge.accountingCategory()).thenReturn("LABORATORY");
        ChargeCategory labCat = resolver.resolve(1L, labCharge);
        assertEquals("LABORATORY", labCat.code());
        assertEquals("检验费", labCat.name());

        // 手术类明细
        ChargeItem surgCharge = Mockito.mock(ChargeItem.class);
        when(surgCharge.accountingCategory()).thenReturn("SURGERY");
        ChargeCategory surgCat = resolver.resolve(1L, surgCharge);
        assertEquals("SURGERY", surgCat.code());
        assertEquals("手术费", surgCat.name());
    }
}
