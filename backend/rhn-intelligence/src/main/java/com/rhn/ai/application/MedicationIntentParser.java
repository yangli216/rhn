package com.rhn.ai.application;

import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Extracts explicit prescribing text; route/frequency tokens still require live directory resolution. */
@Service
public class MedicationIntentParser {
    private static final String NUMBER = "([0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)";
    private static final String UNITS = "kg|mg|ug|μg|µg|ng|g|mL|ml|uL|μL|µL|L|千克|毫克|微克|纳克|克|毫升|微升|升|片|粒|支|袋|包";
    private static final Pattern STRENGTH = Pattern.compile("(?<![\\p{L}\\p{N}.])" + NUMBER + "\\s*(?:" + UNITS + ")(?![a-zA-Z])", Pattern.CASE_INSENSITIVE);
    private static final Pattern DOSE = Pattern.compile("(?:单次剂量|每次|一次|常规用法)[：:]?\\s*" + NUMBER
            + "\\s*(" + UNITS + ")(?![a-zA-Z])(?!(?:\\s*[/／*×]))", Pattern.CASE_INSENSITIVE);
    private static final Pattern DURATION = Pattern.compile("(?:疗程|连用|用药|共)[：:]?\\s*" + NUMBER + "\\s*(天|日|周|月)");
    private static final Pattern DURATION_LABEL = Pattern.compile("疗程|连用");
    private static final Pattern QUANTITY = Pattern.compile("(?:共|开|数量)[：:]?\\s*" + NUMBER + "\\s*(盒|瓶|支|袋|片|粒|包|贴|吸|枚|套)");
    private static final Pattern FREQUENCY = Pattern.compile("(?<![a-zA-Z0-9])(?:q\\.i\\.d\\.|t\\.i\\.d\\.|b\\.i\\.d\\.|q\\.d\\.|qid|tid|bid|qd|qn|prn)(?![a-zA-Z0-9])"
            + "|(?:每日|一日)(?:一|二|两|三|四)次|每晚一次|必要时", Pattern.CASE_INSENSITIVE);
    private static final String ROUTE_WORDS = "静脉滴注|静脉注射|肌内注射|肌肉注射|皮下注射|雾化吸入|口服|外用";
    private static final Pattern ROUTE = Pattern.compile("(?:" + ROUTE_WORDS + ")(?=$|[\\s，,；;。:：a-zA-Z0-9]|每(?:次|日|晚)|一日)");
    private static final Pattern ROUTE_FIELD = Pattern.compile("(?:给药途径|途径)[：:]\\s*([^\\s，,；;。]+)");
    private static final Pattern FREQUENCY_FIELD = Pattern.compile("频次[：:]\\s*([^\\s，,；;。]+)");
    private static final Pattern NEGATED = Pattern.compile("停用|暂停|禁用|(?:不(?:要|可|宜|应|得|建议)?|禁止|避免|无需|无须)\\s*(?:再|继续)?\\s*(?:" + ROUTE_WORDS + "|服用|使用|用药(?!品)|给药|每次)");
    private static final String AMOUNT_LABEL = "(?:单次剂量|每次|一次|常规用法|疗程|连用|用药|数量|共|开)";
    private static final String AMOUNT_UNIT = "(?:" + UNITS + "|天|日|周|月|盒|瓶|贴|吸|枚|套)";
    private static final Pattern UNCERTAIN_AMOUNT = Pattern.compile(AMOUNT_LABEL + "[：:]?\\s*[-−]?[0-9.]+\\s*"
            + AMOUNT_UNIT + "?\\s*(?:[-–~～至或/／]|到)\\s*[0-9.]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern QUALIFIED_AMOUNT = Pattern.compile("(?:至少|至多|最多|不超过|约|大约)\\s*" + AMOUNT_LABEL
            + "|" + AMOUNT_LABEL + "[：:]?\\s*(?:至少|至多|最多|不超过|约|大约|[<>≤≥])"
            + "|" + AMOUNT_LABEL + "[：:]?\\s*[0-9.]+\\s*" + AMOUNT_UNIT + "\\s*(?:以上|以下|左右|以内)", Pattern.CASE_INSENSITIVE);
    private static final Pattern NEGATIVE_AMOUNT = Pattern.compile("(?:单次剂量|每次|一次|常规用法|疗程|连用|用药|数量|共|开)[：:]?\\s*[-−][0-9.]+");

    public ParsedMedication parse(String name, String details) {
        String source = join(name, details);
        String medicationName = cleanMedicationName(name);
        List<Amount> doses = amounts(DOSE, source, true), durations = amounts(DURATION, source, false), quantities = amounts(QUANTITY, source, false);
        List<String> routes = tokens(source, ROUTE_FIELD, ROUTE), frequencies = tokens(source, FREQUENCY_FIELD, FREQUENCY);
        boolean review = NEGATED.matcher(source).find() || UNCERTAIN_AMOUNT.matcher(source).find() || QUALIFIED_AMOUNT.matcher(source).find() || NEGATIVE_AMOUNT.matcher(source).find()
                || hasUnparsedDuration(source) || doses.size() > 1 || durations.size() > 1 || quantities.size() > 1 || routes.size() > 1 || frequencies.size() > 1
                || java.util.stream.Stream.of(doses, durations, quantities).flatMap(List::stream).anyMatch(value -> value.value().signum() <= 0);
        Amount dose = one(doses), duration = one(durations), quantity = one(quantities);
        return new ParsedMedication(medicationName, Strings.trimToNull(name), splitIngredients(medicationName),
                dose == null ? null : dose.value(), dose == null ? null : dose.unit(),
                one(routes), one(frequencies), duration == null ? null : duration.value(), duration == null ? null : duration.unit(),
                quantity == null ? null : quantity.value(), quantity == null ? null : quantity.unit(), source, review);
    }

    private boolean hasUnparsedDuration(String source) {
        var labels = DURATION_LABEL.matcher(source);
        while (labels.find()) {
            if (!DURATION.matcher(source).region(labels.start(), source.length()).lookingAt()) return true;
        }
        return false;
    }

    private List<Amount> amounts(Pattern pattern, String source, boolean dose) {
        var matcher = pattern.matcher(source);
        List<Amount> values = new ArrayList<>();
        while (matcher.find()) {
            String unit = matcher.group(2);
            unit = dose ? ClinicalDoseUnits.resolve(unit).map(ClinicalDoseUnits.Unit::code).orElse(unit) : unit.replace("日", "天");
            var value = new Amount(new BigDecimal(matcher.group(1)).stripTrailingZeros(), unit);
            if (!values.contains(value)) values.add(value);
        }
        return values;
    }

    private List<String> tokens(String source, Pattern field, Pattern words) {
        List<String> values = new ArrayList<>();
        var labeled = field.matcher(source);
        StringBuilder remaining = new StringBuilder(source);
        while (labeled.find()) {
            addToken(values, labeled.group(1));
            for (int index = labeled.start(); index < labeled.end(); index++) remaining.setCharAt(index, ' ');
        }
        var matcher = words.matcher(remaining);
        while (matcher.find()) addToken(values, matcher.group());
        return values;
    }
    private void addToken(List<String> values, String text) {
        String value = text.trim();
        if (values.stream().noneMatch(existing -> existing.equalsIgnoreCase(value))) values.add(value);
    }
    private <T> T one(List<T> values) { return values.size() == 1 ? values.getFirst() : null; }
    private record Amount(BigDecimal value, String unit) {}

    private String cleanMedicationName(String value) {
        String clean = Strings.trimToNull(value);
        if (clean == null) return null;
        clean = STRENGTH.matcher(clean).replaceAll("");
        clean = FREQUENCY.matcher(clean).replaceAll("");
        clean = ROUTE.matcher(clean).replaceAll("");
        clean = DURATION.matcher(clean).replaceAll("");
        clean = QUANTITY.matcher(clean).replaceAll("");
        return clean.replaceAll("[，,；;：:]+$", "").trim();
    }
    private List<String> splitIngredients(String value) {
        if (value == null) return List.of();
        String[] parts = value.split("[+/＋]", -1);
        if (parts.length < 2) return List.of();
        List<String> result = new ArrayList<>();
        for (String part : parts) if (!part.isBlank()) result.add(part.trim());
        return List.copyOf(result);
    }
    private String join(String left, String right) {
        return (Strings.trimToNull(left) == null ? "" : left.trim()) + " " + (Strings.trimToNull(right) == null ? "" : right.trim());
    }

    public record ParsedMedication(String medicationName, String productHint, List<String> ingredientMentions,
                                   BigDecimal doseValue, String doseUnit, String routeCode,
                                   String frequencyCode, BigDecimal durationValue, String durationUnit,
                                   BigDecimal quantity, String quantityUnit, String sourceText, boolean requiresReview) {
        public boolean hasExecutableDirections() {
            return !requiresReview && doseValue != null && doseUnit != null && routeCode != null && frequencyCode != null
                    && quantity != null && quantityUnit != null;
        }
    }
}
