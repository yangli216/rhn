package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentUsageSuggestion;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.OrderableMedicationView;
import com.rhn.platform.masterdata.api.ClinicalDoseUnits;
import com.rhn.platform.masterdata.api.ClinicalFrequencySemantics;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Deterministic projection of a model usage draft onto the hospital's live master data. Each field is validated
 * independently (a bad field is dropped, the others survive); nothing is invented and prompt rules are never the
 * only guard. Output is only ever a draft for physician review.
 */
@Service
public class TreatmentUsageMapper {
    static final String SCENE = "OUTPATIENT";
    static final int MAX_DURATION_DAYS = 30;
    private static final int MAX_DOSE_SCALE = 4;

    /** Normalized route wording (code, Chinese name or common abbreviation) to canonical active-route names. */
    static final Map<String, String> ROUTE_ALIASES = routeAliases();
    private static final Pattern DAILY_TIMES = Pattern.compile("(?:每日|每天|一日|日)([0-9一二两三四])次");
    private static final Pattern EVERY_HOURS = Pattern.compile("(?:每隔|每)([0-9]+)小时(?:一次)?");
    private static final Pattern Q_HOURS = Pattern.compile("Q([0-9]+)H");
    private static final Map<String, Integer> LATIN_DAILY = Map.of("QD", 1, "BID", 2, "TID", 3, "QID", 4);

    private final MedicationRouteDirectory routes;
    private final OrderFrequencyDirectory frequencies;

    public TreatmentUsageMapper(MedicationRouteDirectory routes, OrderFrequencyDirectory frequencies) {
        this.routes = routes;
        this.frequencies = frequencies;
    }

    public Session session(ExecutionContext context, LocalDate date) {
        return new Session(context, date == null ? LocalDate.now() : date);
    }

    /** Directory reads are lazy and shared by every candidate of one intent. */
    public final class Session {
        private final ExecutionContext context;
        private final LocalDate date;
        private List<RouteSnapshot> activeRoutes;
        private List<FrequencySnapshot> activeFrequencies;

        private Session(ExecutionContext context, LocalDate date) { this.context = context; this.date = date; }

        /** Returns null when nothing survives, or when the drug is one whose usage must be hand-checked. */
        public TreatmentUsageSuggestion map(TreatmentUsageSuggestion raw, OrderableMedicationView medication) {
            if (raw == null || medication == null || manualOnly(medication)) return null;
            BigDecimal doseValue = null;
            String doseUnit = null;
            if (raw.doseValue() != null && raw.doseUnit() != null) {
                String unit = catalogUnit(medication, raw.doseUnit());
                BigDecimal value = raw.doseValue().stripTrailingZeros();
                if (unit != null && value.signum() > 0 && value.scale() <= MAX_DOSE_SCALE) {
                    doseValue = value;
                    doseUnit = unit;
                }
            }
            String routeCode = null;
            if (raw.routeCode() != null) {
                RouteSnapshot route = route(raw.routeCode());
                // Infusion needs diluent/rate/set-up decisions that a one-line draft cannot carry.
                if (route != null && route.infusion()) return null;
                routeCode = route == null ? null : route.code();
            }
            String frequencyCode = raw.frequencyCode() == null ? null : frequencyCode(raw.frequencyCode());
            Integer days = raw.durationDays() != null && raw.durationDays() >= 1
                    && raw.durationDays() <= MAX_DURATION_DAYS ? raw.durationDays() : null;
            if (doseValue == null && routeCode == null && frequencyCode == null && days == null) return null;
            return new TreatmentUsageSuggestion(doseValue, doseUnit, routeCode, frequencyCode, days);
        }

        private RouteSnapshot route(String wording) {
            var active = activeRoutes();
            String token = normalize(wording);
            var byCode = active.stream().filter(item -> token.equals(normalize(item.code()))).toList();
            if (byCode.size() == 1) return byCode.getFirst();
            String canonical = ROUTE_ALIASES.getOrDefault(token, wording);
            String canonicalToken = normalize(canonical);
            var byName = active.stream().filter(item -> canonicalToken.equals(normalize(item.name()))).toList();
            if (byName.size() == 1) return byName.getFirst();
            if (!byName.isEmpty()) return null; // the same wording matches several active routes: do not pick one
            try {
                return routes.resolveActive(context.tenantId(), wording.trim(), SCENE, date).orElse(null);
            } catch (RuntimeException exception) {
                return null;
            }
        }

        private String frequencyCode(String wording) {
            var active = activeFrequencies();
            String token = normalize(wording);
            var direct = active.stream().filter(item -> token.equals(normalize(item.code()))
                    || token.equals(normalize(item.name())) || token.equals(normalize(item.shortName()))).toList();
            if (direct.size() == 1) return direct.getFirst().code();
            if (direct.size() > 1) return null;
            Rate rate = rate(token);
            if (rate == null) return null;
            var same = active.stream().filter(item -> {
                var semantics = ClinicalFrequencySemantics.interpret(item);
                return semantics.dailyRateComputable() && rate.kind().equals(semantics.kind())
                        && perDay(semantics.doses(), semantics.perDays()).compareTo(rate.perDay()) == 0;
            }).toList();
            if (same.size() == 1) return same.getFirst().code();
            var named = same.stream().filter(item -> token.equals(normalize(item.code()))).toList();
            return named.size() == 1 ? named.getFirst().code() : null;
        }

        private List<RouteSnapshot> activeRoutes() {
            if (activeRoutes == null) {
                var value = routes.active(context.tenantId(), SCENE, date);
                activeRoutes = value == null ? List.of() : value;
            }
            return activeRoutes;
        }

        private List<FrequencySnapshot> activeFrequencies() {
            if (activeFrequencies == null) {
                var value = frequencies.active(context.tenantId(), context.organizationId(), context.departmentId(),
                        SCENE, "MEDICATION", date);
                activeFrequencies = value == null ? List.of() : value;
            }
            return activeFrequencies;
        }
    }

    /** Herbs, antimicrobials and skin-test drugs always need manual usage review. */
    static boolean manualOnly(OrderableMedicationView medication) {
        return "HERBAL".equalsIgnoreCase(medication.sdMedicationType()) || medication.antimicrobial()
                || medication.skinTestRequired();
    }

    /** The dose unit must be the drug's own dose/preparation/strength unit; no unit conversion is attempted. */
    static String catalogUnit(OrderableMedicationView medication, String unit) {
        for (String candidate : Arrays.asList(medication.defaultDoseUnit(), medication.preparationUnit(),
                medication.strengthUnit())) {
            if (candidate != null && !candidate.isBlank() && sameUnit(candidate, unit)) return candidate.trim();
        }
        return null;
    }

    private static boolean sameUnit(String catalog, String model) {
        var left = ClinicalDoseUnits.resolve(catalog);
        var right = ClinicalDoseUnits.resolve(model);
        if (left.isPresent() || right.isPresent()) {
            return left.isPresent() && right.isPresent() && left.get().code().equals(right.get().code());
        }
        return Normalizer.normalize(catalog.trim(), Normalizer.Form.NFKC)
                .equals(Normalizer.normalize(model.trim(), Normalizer.Form.NFKC));
    }

    record Rate(String kind, BigDecimal perDay) {}

    static Rate rate(String token) {
        Integer latin = LATIN_DAILY.get(token);
        if (latin != null) return new Rate("TIMES_PER_DAY", BigDecimal.valueOf(latin));
        Matcher q = Q_HOURS.matcher(token);
        if (q.matches()) return interval(Integer.parseInt(q.group(1)));
        Matcher hours = EVERY_HOURS.matcher(token);
        if (hours.matches()) return interval(Integer.parseInt(hours.group(1)));
        Matcher daily = DAILY_TIMES.matcher(token);
        if (daily.matches()) {
            int times = switch (daily.group(1)) {
                case "一" -> 1; case "二", "两" -> 2; case "三" -> 3; case "四" -> 4;
                default -> Integer.parseInt(daily.group(1));
            };
            return times >= 1 && times <= 6 ? new Rate("TIMES_PER_DAY", BigDecimal.valueOf(times)) : null;
        }
        return null;
    }

    private static Rate interval(int hours) {
        return hours < 1 || hours > 24 ? null : new Rate("INTERVAL", perDay(BigDecimal.valueOf(24), BigDecimal.valueOf(hours)));
    }

    private static BigDecimal perDay(BigDecimal doses, BigDecimal perDays) {
        return doses.divide(perDays, MathContext.DECIMAL64).stripTrailingZeros();
    }

    static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC).replaceAll("[\\s.。,，、/／\\-]", "")
                .toUpperCase(Locale.ROOT);
    }

    private static Map<String, String> routeAliases() {
        var map = new HashMap<String, String>();
        String[][] groups = {
                {"口服", "口服", "内服", "PO", "口服给药", "口服用药", "经口"},
                {"外用", "外用", "涂抹", "外涂", "局部外用"},
                {"肌内注射", "肌内注射", "肌肉注射", "肌注", "IM"},
                {"皮下注射", "皮下注射", "皮下", "SC", "IH", "H"},
                {"静脉注射", "静脉注射", "静推", "静脉推注", "IV"},
                {"静脉滴注", "静脉滴注", "静滴", "IVGTT", "IVDRIP", "输液", "静脉输液"},
                {"吸入", "吸入", "吸入给药"},
                {"雾化吸入", "雾化吸入", "雾化"},
                {"滴眼", "滴眼", "滴眼用", "眼用"},
                {"滴鼻", "滴鼻", "鼻用"},
                {"滴耳", "滴耳", "耳用"},
                {"含服", "含服", "舌下含服", "舌下"},
                {"直肠给药", "直肠给药", "塞肛", "纳肛"},
                {"阴道给药", "阴道给药", "塞阴道", "阴道用药"}};
        for (String[] group : groups) {
            for (int index = 1; index < group.length; index++) map.put(normalize(group[index]), group[0]);
        }
        return Map.copyOf(map);
    }
}
