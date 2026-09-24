package com.rhn.billing.domain;

public record ChargeCategory(String code, String name) {
    public ChargeCategory {
        if (code == null || code.isBlank()) {
            code = "OTHER";
        }
        code = code.trim();
        if (name == null || name.isBlank()) {
            name = code;
        }
    }
}
