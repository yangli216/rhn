package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeCategory;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 费用归并分类解析器：
 * 1. 优先读取费用明细的会计大类快照 (SD_ACCTG_CAT)；
 * 2. 结合租户字典 (BD_ACCOUNTING_CATEGORY) 动态解析标准分类或机构自定义扩展分类；
 * 3. 对未知或自定义分类保持代码独立归并（避免粗暴混入其他费）；
 * 4. 对未标注 SD_ACCTG_CAT 的历史数据按业务来源类型 (SD_SRC_TYPE) 平滑降级兼容。
 */
@Component
public class ChargeCategoryResolver {

    private static final Map<String, String> STANDARD_LABELS = Map.ofEntries(
            Map.entry("REGISTRATION", "诊察挂号费"),
            Map.entry("TREATMENT", "治疗处置费"),
            Map.entry("PROCEDURE", "治疗处置费"),
            Map.entry("LABORATORY", "检验费"),
            Map.entry("EXAMINATION", "检查费"),
            Map.entry("IMAGING", "检查影像费"),
            Map.entry("SURGERY", "手术费"),
            Map.entry("NURSING", "护理费"),
            Map.entry("BED", "床位费"),
            Map.entry("BLOOD", "输血费"),
            Map.entry("MATERIAL", "材料费"),
            Map.entry("WESTERN_MED", "西药费"),
            Map.entry("CHINESE_PATENT_MED", "中成药费"),
            Map.entry("HERBAL_MED", "中药饮片费"),
            Map.entry("MEDICATION", "药品费"),
            Map.entry("ORDER", "诊疗及医嘱费"),
            Map.entry("OTHER", "其他费用")
    );

    private final DictionaryDirectory dictionaryDirectory;

    public ChargeCategoryResolver(@Autowired(required = false) DictionaryDirectory dictionaryDirectory) {
        this.dictionaryDirectory = dictionaryDirectory;
    }

    /**
     * 根据 ChargeItem 解析归并分类及显示名称
     */
    public ChargeCategory resolve(Long tenantId, ChargeItem charge) {
        if (charge == null) return new ChargeCategory("OTHER", "其他费用");
        String category = charge.accountingCategory();
        if (category != null && !category.isBlank()) {
            return resolveByCode(tenantId, category.trim());
        }
        return resolveFallback(charge.sourceType());
    }

    /**
     * 根据分类编码与租户上下文解析分类对象
     */
    public ChargeCategory resolveByCode(Long tenantId, String code) {
        if (code == null || code.isBlank()) return new ChargeCategory("OTHER", "其他费用");
        String trimmed = code.trim();
        // 1. 尝试从租户字典中解析自定义或标准字典条目名称
        if (dictionaryDirectory != null && tenantId != null) {
            try {
                Map<String, String> dict = dictionaryDirectory.resolveItemTexts(
                        tenantId, MasterDataDictionaryCodes.ACCOUNTING_CATEGORY);
                if (dict != null && dict.containsKey(trimmed)) {
                    return new ChargeCategory(trimmed, dict.get(trimmed));
                }
            } catch (Exception ignored) {
                // 忽略字典查询异常，降级到内置标准映射
            }
        }
        // 2. 内置标准分类映射
        String label = STANDARD_LABELS.get(trimmed);
        if (label != null) {
            return new ChargeCategory(trimmed, label);
        }
        // 3. 用户自定义分类但暂未在字典中录入中文：保留编码并提供人性化默认名称
        return new ChargeCategory(trimmed, humanizeCode(trimmed));
    }

    public String label(Long tenantId, String code) {
        return resolveByCode(tenantId, code).name();
    }

    private ChargeCategory resolveFallback(String sourceType) {
        if (sourceType == null) return new ChargeCategory("OTHER", "其他费");
        if ("DIRECT_VISIT_SERVICE".equals(sourceType)) return new ChargeCategory("TREATMENT", "诊疗费");
        if (sourceType.startsWith("REGISTRATION")) return new ChargeCategory("REGISTRATION", "挂号费");
        if (sourceType.startsWith("INPATIENT_BED_DAY")) return new ChargeCategory("BED", "床位费");
        if (sourceType.startsWith("MEDICATION_") || sourceType.equals("MED_DISPENSE"))
            return new ChargeCategory("MEDICATION", "药品费");
        if (sourceType.startsWith("SERVICE_REQUEST")) return new ChargeCategory("TREATMENT", "诊疗费");
        return new ChargeCategory("OTHER", "其他费");
    }

    private String humanizeCode(String code) {
        if (code == null || code.isBlank()) return "其他费用";
        String replaced = code.replace('_', ' ').toLowerCase();
        return Character.toUpperCase(replaced.charAt(0)) + replaced.substring(1);
    }
}
