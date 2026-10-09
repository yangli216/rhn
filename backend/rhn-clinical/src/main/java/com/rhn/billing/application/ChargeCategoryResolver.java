package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeCategory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 费用归并分类解析器：
 * 1. 优先读取费用明细的会计大类快照 (SD_ACCTG_CAT)；
 * 2. 结合租户字典 (BD_ACCOUNTING_CATEGORY) 动态解析标准分类或机构自定义扩展分类；
 * 3. 对未知或自定义分类保持代码独立归并（避免粗暴混入其他费）；
 * 4. 未标注分类的历史数据明确显示“分类未确认”，不根据业务来源补齐分类。
 */
@Component
public class ChargeCategoryResolver {

    private final DictionaryDirectory dictionaryDirectory;

    public ChargeCategoryResolver(DictionaryDirectory dictionaryDirectory) {
        this.dictionaryDirectory = dictionaryDirectory;
    }

    /**
     * 根据 ChargeItem 解析归并分类及显示名称
     */
    public ChargeCategory resolve(Long tenantId, ChargeItem charge) {
        if (charge == null) return unclassified();
        String category = charge.accountingCategory();
        if (category != null && !category.isBlank()) {
            return resolveByCode(tenantId, category.trim());
        }
        return unclassified();
    }

    /**
     * 根据分类编码与租户上下文解析分类对象
     */
    public ChargeCategory resolveByCode(Long tenantId, String code) {
        if (code == null || code.isBlank() || "UNCLASSIFIED".equals(code.trim())) return unclassified();
        String trimmed = code.trim();
        // 1. 尝试从租户字典中解析自定义或标准字典条目名称
        if (dictionaryDirectory != null && tenantId != null) {
            Map<String, String> dict = dictionaryDirectory.resolveItemTexts(tenantId, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY);
            if (dict == null) throw new IllegalStateException("会计分类字典未返回，无法确认分类名称");
            if (dict.containsKey(trimmed) && dict.get(trimmed) != null && !dict.get(trimmed).isBlank()) {
                return new ChargeCategory(trimmed, dict.get(trimmed));
            }
        }
        // 字典未收录的编码保持原值，不维护第二套名称。
        return new ChargeCategory(trimmed, trimmed);
    }

    public String label(Long tenantId, String code) {
        return resolveByCode(tenantId, code).name();
    }

    private ChargeCategory unclassified() {
        return new ChargeCategory("UNCLASSIFIED", "分类未确认");
    }
}
