package com.rhn.ai.application;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/** Only explicit amounts in the catalog unit can become an order quantity. */
final class PlanInvestigationAmounts {
    private static final Pattern LABEL = Pattern.compile("(?:(?:数量|总量)\\s*[:：]\\s*|(?:数量|总量|共)\\s*[:：]?\\s*(?=[+\\-0-9零一二三四五六七八九十约]))([^，,；;。\\n]+)");
    private static final Pattern UNLABELED_COUNT = Pattern.compile("[0-9零一二三四五六七八九十]\\s*(?:次|套|份|项|EA)");
    private static final Pattern AMOUNT = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)\\s*([^\\s]+)");
    private static final Pattern RESTRICTION = Pattern.compile(
            "不要|不得|不做|不查|不予|不建议|无需|无须|勿|禁止|禁忌|暂缓|暂不|取消|避免|拒绝|"
            + "必要时|需要时|考虑|如果|若|除非|仅当|一旦|再决定|待确认|适用条件|使用指征|当[^；;。\\n]*时|"
            + "(?:持续|加重|异常|阳性|阴性|发热|疼痛)时|"
            + "每天|每日|每周|每月|隔日|每隔|分次|复查|复测|"
            + "至少|至多|最多|约|大于|小于|不少于|不超过|(?i:\\b(?:if|unless|not|avoid|repeat|daily|prn)\\b)");

    private PlanInvestigationAmounts() {}

    static boolean restricted(String evidence) {
        return RESTRICTION.matcher(evidence).find();
    }

    static boolean hasAmount(String evidence) {
        return LABEL.matcher(evidence).find() || UNLABELED_COUNT.matcher(evidence).find();
    }

    static BigDecimal quantity(String evidence, String catalogUnit) {
        if (catalogUnit == null || catalogUnit.isBlank()) return null;
        BigDecimal result = null;
        var labels = LABEL.matcher(evidence);
        while (labels.find()) {
            var amount = AMOUNT.matcher(labels.group(1).trim());
            if (!amount.matches() || !catalogUnit.equals(amount.group(2))) return null;
            var quantity = new BigDecimal(amount.group(1));
            if (quantity.signum() <= 0 || (result != null && result.compareTo(quantity) != 0)) return null;
            result = quantity;
        }
        // Extra unlabeled counts must not be discarded after finding one valid labeled amount.
        if (UNLABELED_COUNT.matcher(labels.replaceAll("")).find()) return null;
        return result;
    }
}
