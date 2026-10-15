package com.rhn.ai.application;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/** Only explicit amounts in the catalog unit can become an order quantity. */
final class PlanInvestigationAmounts {
    private static final Pattern LABEL = Pattern.compile("(?:(?:数量|总量)\\s*[:：]\\s*|(?:数量|总量|共)\\s*[:：]?\\s*(?=[+\\-0-9零一二三四五六七八九十约]))([^，,；;。\\n]+)");
    private static final Pattern UNLABELED_COUNT = Pattern.compile("[0-9零一二三四五六七八九十]\\s*(?:次|套|份|项|EA)");
    private static final Pattern AMOUNT = Pattern.compile("([0-9]+(?:\\.[0-9]+)?)\\s*([^\\s]+)");
    /** Labeled fields written for the reviewing doctor or the patient; they describe the order, they do not restrict it. */
    private static final Pattern ADVICE_FIELD = Pattern.compile("(?:^|[；;\\s])(?:目的|嘱托|适用条件|不建议常规使用|备注)[：:][^；;\\n]*");

    private PlanInvestigationAmounts() {}

    /**
     * The text that states what is ordered and how many: advice fields such as "适用条件：每3次发热后" are removed so that
     * their numbers are not mistaken for an order quantity. The full text still becomes the order note.
     */
    static String withoutAdvice(String evidence) {
        return evidence == null ? "" : ADVICE_FIELD.matcher(evidence).replaceAll(" ");
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
