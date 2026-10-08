package com.rhn.billing.domain;

public record ChargeCategory(String code, String name) {
    public ChargeCategory {
        if (code == null || code.isBlank()) {
            code = "UNCLASSIFIED";
            name = "分类未确认";
        }
        code = code.trim();
        if ("UNCLASSIFIED".equals(code)) name = "分类未确认";
        if (name == null || name.isBlank()) {
            name = code;
        }
    }
}
