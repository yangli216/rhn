package com.rhn.billing.application;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 患者保障类型（字典 INS_COVERAGE_TYPE，医疗费用类别代码 01/02…）到医保网关险种类型（insutype，如 310/390）的映射。
 * 两套编码不是同一个体系：档案按字典记录保障类型，只有对接医保平台时才需要三位险种编码，所以映射放在医保接入边界。
 * 已经是三位险种编码的保障类型原样使用（兼容直接以险种编码登记的档案）。
 */
final class InsuranceTypeCodes {
    private static final Pattern INSUTYPE = Pattern.compile("^\\d{3}$");
    private static final Map<String, String> BY_COVERAGE_TYPE = Map.of(
            "01", "310", "0101", "310", "0102", "310",
            "02", "390", "0201", "390", "0202", "390");

    private InsuranceTypeCodes() {}

    static String of(String coverageTypeCode) {
        String code = coverageTypeCode == null ? "" : coverageTypeCode.trim().toUpperCase(Locale.ROOT);
        if (INSUTYPE.matcher(code).matches()) return code;
        String mapped = BY_COVERAGE_TYPE.get(code);
        if (mapped == null) {
            throw conflict("INSURANCE_TYPE_UNMAPPED", "保障类型" + (code.isEmpty() ? "" : " " + code) + " 没有对应的医保险种，不能办理医保结算");
        }
        return mapped;
    }
}
