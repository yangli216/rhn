package com.rhn.ai.application;

import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Confirms explicit source specifications against catalog facts; never infers unit conversions. */
final class MedicationSpecificationEvidence {
    private static final String SPECIFICATION_BOUNDARY =
            "[;；,，。\\n\\r]|单次剂量|每次|一次|常规用法|给药途径|途径|频次|疗程|连用|数量|共|口服|静脉|肌内|外用|用法"
                    + "|建议规格|规格|含量|浓度|strength|specification|concentration|$";
    private static final String SPECIFICATION_END = "(?=" + SPECIFICATION_BOUNDARY + ")";
    private static final Pattern LABELED = Pattern.compile(
            "(?:建议)?(?:规格|含量|浓度|strength|specification|concentration)\\s*[:：]?\\s*(.*?)"
                    + SPECIFICATION_END,
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMBER = Pattern.compile("[0-9]+(?:\\.[0-9]+)?|\\.[0-9]+");
    private static final Pattern PLACEHOLDER = Pattern.compile(
            "(?:建议)?规格\\s*[:：]\\s*(?:待确认|不明确|未知|未提供)", Pattern.CASE_INSENSITIVE);
    private static final Pattern PER_UNIT = Pattern.compile(
            "[0-9]+(?:\\.[0-9]+)?\\s*(?:mg|μg|ug|g|ml|mL)\\s*[/／]\\s*(?:粒|片|支|袋|包|瓶|枚|贴|管|吸)",
            Pattern.CASE_INSENSITIVE);

    private MedicationSpecificationEvidence() {}

    static String addSuggestedSpecification(String itemName, String details, String suggestedSpecification) {
        if (suggestedSpecification == null || suggestedSpecification.isBlank()
                || hasUsableSpecification(itemName) || hasUsableSpecification(details)) return details;
        String suggestion = "建议规格：" + suggestedSpecification.trim();
        String source = details == null ? "" : details.trim();
        var placeholder = PLACEHOLDER.matcher(source);
        if (placeholder.find()) return placeholder.replaceFirst(java.util.regex.Matcher.quoteReplacement(suggestion));
        return source.isBlank() ? suggestion : suggestion + "；" + source;
    }

    static String catalogSpecification(String specification, String preparationUnit) {
        if (specification == null || specification.isBlank() || preparationUnit == null || preparationUnit.isBlank()
                || specification.matches(".*[/／].*")) return specification;
        return specification.trim() + "/" + preparationUnit.trim();
    }

    private static boolean hasUsableSpecification(String value) {
        if (value == null || value.isBlank()) return false;
        var labels = LABELED.matcher(value);
        while (labels.find()) {
            String specification = labels.group(1).trim();
            if (!specification.isBlank() && !PLACEHOLDER.matcher("规格：" + specification).matches()) return true;
        }
        return PER_UNIT.matcher(value).find();
    }

    static String reviewReason(MedicationIntentParser.ParsedMedication intent, String catalogSpecification) {
        List<String> requested = new ArrayList<>();
        String name = text(intent.medicationName()).replace("()", "");
        String hint = text(intent.productHint());
        if (!hint.isEmpty() && !hint.equals(name)) {
            if (name.isEmpty() || !hint.startsWith(name)) return "药品名称中的附加限定尚未核实，请人工确认产品及规格";
            String suffix = unwrap(hint.substring(name.length()));
            if (!suffix.isEmpty()) requested.add(suffix);
        }
        var labels = LABELED.matcher(intent.sourceText() == null ? "" : intent.sourceText());
        while (labels.find()) {
            if (labels.group(1).isBlank()) return "来源指定了规格但未提供完整内容，请人工确认";
            requested.add(labels.group(1));
        }
        // Source quotes may retain a strength that was removed from the reviewed item's name.
        if (!name.isEmpty()) {
            String source = intent.sourceText() == null ? "" : Normalizer.normalize(intent.sourceText(), Normalizer.Form.NFKC)
                    .toLowerCase(Locale.ROOT).replaceAll("[\\p{Zs}\\t]+", "");
            var named = Pattern.compile(Pattern.quote(name) + "\\s*[(]?\\s*((?:[0-9]|\\.[0-9]).*?)"
                    + "(?=" + SPECIFICATION_BOUNDARY + "|" + Pattern.quote(name) + ")", Pattern.CASE_INSENSITIVE).matcher(source);
            while (named.find()) requested.add(named.group(1).replaceAll("[)]+$", ""));
        }
        if (requested.isEmpty()) return null;
        var requirements = requested.stream().map(MedicationSpecificationEvidence::canonical).distinct().toList();
        if (requirements.size() != 1) return "来源中存在多个不一致的药品规格，请明确后重新匹配";
        return reviewExplicitSpecification(requirements.getFirst(), catalogSpecification);
    }

    static String reviewExplicitSpecification(String requestedSpecification, String catalogSpecification) {
        if (requestedSpecification == null || requestedSpecification.isBlank()) return null;
        if (catalogSpecification == null || catalogSpecification.isBlank()) return "来源包含明确规格，但目录规格缺失，未自动选择产品";
        String requested = canonical(requestedSpecification);
        String catalog = canonical(catalogSpecification);
        boolean sameStrengthWithoutRequestedPresentation = !requested.matches(".*[/／].*")
                && catalog.matches(Pattern.quote(requested) + "[/／].+");
        if (!requested.equals(catalog) && !sameStrengthWithoutRequestedPresentation) {
            return "来源规格与目录规格未确认一致，未替换规格或推算换算，请人工核对";
        }
        return null;
    }

    private static String canonical(String value) {
        String source = unwrap(text(value));
        var numbers = NUMBER.matcher(source);
        StringBuilder result = new StringBuilder();
        while (numbers.find()) numbers.appendReplacement(result,
                new BigDecimal(numbers.group()).stripTrailingZeros().toPlainString());
        numbers.appendTail(result);
        return result.toString();
    }

    private static String text(String value) {
        return value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFKC)
                .toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private static String unwrap(String value) {
        while (value.length() >= 2 && ((value.startsWith("(") && value.endsWith(")"))
                || (value.startsWith("[") && value.endsWith("]")))) value = value.substring(1, value.length() - 1);
        return value;
    }
}
