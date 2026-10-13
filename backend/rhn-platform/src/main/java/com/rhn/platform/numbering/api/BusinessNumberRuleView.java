package com.rhn.platform.numbering.api;

public record BusinessNumberRuleView(String businessCode, BusinessNumberRule rule,
                                     BusinessNumberSequence sequence, String status, String message) {}
