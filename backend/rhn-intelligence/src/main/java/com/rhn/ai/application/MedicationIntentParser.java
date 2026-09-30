package com.rhn.ai.application;

import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses prescribing semantics only; it never invents catalog identities or missing directions. */
@Service
public class MedicationIntentParser {
    private static final String NUMBER = "([0-9]+(?:\\.[0-9]+)?|\\.[0-9]+)";
    private static final Pattern DOSE = Pattern.compile(NUMBER + "\\s*(kg|g|mg|ug|μg|µg|ng|L|mL|ml|uL|μL|µL|千克|克|毫克|微克|纳克|升|毫升|微升)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DURATION = Pattern.compile("(?:疗程|连用|用药|共)?\\s*" + NUMBER + "\\s*(天|日|周|月)");
    private static final Pattern QUANTITY = Pattern.compile("(?:共|开|数量)\\s*" + NUMBER + "\\s*(盒|瓶|支|袋|片|粒|包|贴|吸|枚|套)");
    private static final Map<String, String> FREQUENCIES = ordered(Map.entry("每日四次", "QID"), Map.entry("一日四次", "QID"),
            Map.entry("每日三次", "TID"), Map.entry("一日三次", "TID"), Map.entry("每日两次", "BID"),
            Map.entry("一日两次", "BID"), Map.entry("每日一次", "QD"), Map.entry("一日一次", "QD"),
            Map.entry("每晚一次", "QN"), Map.entry("必要时", "PRN"), Map.entry("q.i.d.", "QID"),
            Map.entry("t.i.d.", "TID"), Map.entry("b.i.d.", "BID"), Map.entry("q.d.", "QD"),
            Map.entry("qid", "QID"), Map.entry("tid", "TID"), Map.entry("bid", "BID"),
            Map.entry("qd", "QD"), Map.entry("qn", "QN"), Map.entry("prn", "PRN"));
    private static final Map<String, String> ROUTES = ordered(Map.entry("静脉滴注", "IV_DRIP"),
            Map.entry("静脉注射", "IV"), Map.entry("肌内注射", "IM"), Map.entry("肌肉注射", "IM"),
            Map.entry("皮下注射", "SC"), Map.entry("雾化吸入", "INHALATION"), Map.entry("口服", "ORAL"),
            Map.entry("外用", "TOPICAL"));

    public ParsedMedication parse(String name, String details) {
        String source = join(name, details);
        String medicationName = cleanMedicationName(name);
        Matcher dose = DOSE.matcher(source);
        BigDecimal doseValue = null;
        String doseUnit = null;
        if (dose.find()) {
            doseValue = decimal(dose.group(1));
            doseUnit = ClinicalDoseUnits.resolve(dose.group(2)).map(ClinicalDoseUnits.Unit::code).orElse(null);
        }
        Matcher duration = DURATION.matcher(source);
        BigDecimal durationValue = duration.find() ? decimal(duration.group(1)) : null;
        String durationUnit = durationValue == null ? null : duration.group(2).replace("日", "天");
        Matcher quantity = QUANTITY.matcher(source);
        BigDecimal quantityValue = quantity.find() ? decimal(quantity.group(1)) : null;
        String quantityUnit = quantityValue == null ? null : quantity.group(2);

        String lower = source.toLowerCase(Locale.ROOT);
        String frequency = firstCode(lower, FREQUENCIES);
        String route = firstCode(source, ROUTES);
        List<String> ingredients = splitIngredients(medicationName);
        return new ParsedMedication(medicationName, Strings.trimToNull(name), ingredients, doseValue, doseUnit,
                route, frequency, durationValue, durationUnit, quantityValue, quantityUnit, source);
    }

    private String cleanMedicationName(String value) {
        String clean = Strings.trimToNull(value);
        if (clean == null) return null;
        clean = DOSE.matcher(clean).replaceAll("");
        for (String token : FREQUENCIES.keySet()) clean = clean.replaceAll("(?i)" + Pattern.quote(token), "");
        for (String token : ROUTES.keySet()) clean = clean.replaceAll("(?i)" + Pattern.quote(token), "");
        clean = DURATION.matcher(clean).replaceAll("");
        clean = QUANTITY.matcher(clean).replaceAll("");
        return clean.replaceAll("[，,；;：:0-9.]+$", "").trim();
    }

    private List<String> splitIngredients(String value) {
        if (value == null) return List.of();
        String[] parts = value.split("[+/＋]", -1);
        if (parts.length < 2) return List.of();
        List<String> result = new ArrayList<>();
        for (String part : parts) if (!part.isBlank()) result.add(part.trim());
        return List.copyOf(result);
    }

    private String firstCode(String source, Map<String, String> values) {
        return values.entrySet().stream().filter(entry -> source.contains(entry.getKey()))
                .map(Map.Entry::getValue).findFirst().orElse(null);
    }

    @SafeVarargs
    private static Map<String, String> ordered(Map.Entry<String, String>... entries) {
        Map<String, String> result = new LinkedHashMap<>();
        for (var entry : entries) result.put(entry.getKey(), entry.getValue());
        return java.util.Collections.unmodifiableMap(result);
    }

    private BigDecimal decimal(String value) { return new BigDecimal(value).stripTrailingZeros(); }
    private String join(String left, String right) {
        return (Strings.trimToNull(left) == null ? "" : Strings.trimToNull(left)) + " " + (Strings.trimToNull(right) == null ? "" : Strings.trimToNull(right));
    }

    public record ParsedMedication(String medicationName, String productHint, List<String> ingredientMentions,
                                   BigDecimal doseValue, String doseUnit, String routeCode,
                                   String frequencyCode, BigDecimal durationValue, String durationUnit,
                                   BigDecimal quantity, String quantityUnit, String sourceText) {
        public boolean hasExecutableDirections() {
            return doseValue != null && doseUnit != null && routeCode != null && frequencyCode != null
                    && quantity != null && quantityUnit != null;
        }
    }
}
