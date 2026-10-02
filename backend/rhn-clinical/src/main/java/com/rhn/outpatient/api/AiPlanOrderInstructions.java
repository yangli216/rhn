package com.rhn.outpatient.api;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/** Extracts the labeled patient instructions and clinical purpose from AI plan output. */
public final class AiPlanOrderInstructions {
    private static final Pattern LABEL = Pattern.compile(
            "(常规用法|建议规格|规格|适用条件|使用指征|目的|不建议常规使用|嘱托|用药嘱托|注意事项)[：:]\\s*");

    private AiPlanOrderInstructions() { }

    public static String medication(String text) {
        List<Section> sections = sections(text);
        return collect(sections, Set.of("嘱托", "用药嘱托", "注意事项"));
    }

    public static String service(String text) {
        List<Section> sections = sections(text);
        return collect(sections, Set.of("目的"));
    }

    private static String collect(List<Section> sections, Set<String> labels) {
        Set<String> result = new LinkedHashSet<>();
        for (Section section : sections) {
            if (!labels.contains(section.label()) || section.value().isBlank()
                    || Set.of("无", "无特殊嘱托", "无特殊要求").contains(section.value())) continue;
            result.add(section.value());
        }
        return result.isEmpty() ? null : String.join("；", result);
    }

    private static List<Section> sections(String text) {
        List<Section> result = new ArrayList<>();
        if (text == null || text.isBlank()) return result;
        var matcher = LABEL.matcher(text);
        String label = null;
        int start = 0;
        while (matcher.find()) {
            if (label != null) result.add(new Section(label, clean(text.substring(start, matcher.start()))));
            label = matcher.group(1);
            start = matcher.end();
        }
        if (label != null) result.add(new Section(label, clean(text.substring(start))));
        return result;
    }

    private static String clean(String value) {
        return value.trim().replaceAll("[；;。\\s]+$", "");
    }

    private record Section(String label, String value) { }
}
