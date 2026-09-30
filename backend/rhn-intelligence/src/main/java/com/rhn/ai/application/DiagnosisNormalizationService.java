package com.rhn.ai.application;

import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Resolves model or user diagnosis text against one explicitly selected diagnosis domain. */
@Service
public class DiagnosisNormalizationService {
    public static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final Map<String, String> SYSTEM_BY_DOMAIN = Map.of(
            "WESTERN_MEDICINE", ICD10_SYSTEM,
            "TCM_DISEASE", "RHN.BD.CS.TCM_DISEASE",
            "TCM_SYNDROME", "RHN.BD.CS.TCM_SYNDROME");
    private static final Pattern CODE_TOKEN = Pattern.compile(
            "(?i)(?:^|[\\[（(\\s])([A-Z]\\d{2}(?:\\.[A-Z0-9]+)?)(?:$|[\\]）)\\s])");

    private final TerminologyDirectory terminology;

    public DiagnosisNormalizationService(TerminologyDirectory terminology) {
        this.terminology = terminology;
    }

    public Result normalize(long tenantId, String codeSystem, String diagnosisDomain,
                            String codeOrName, LocalDate atDate) {
        String value = Strings.trimToNull(codeOrName);
        if (value == null) return Result.unavailable("诊断名称或编码为空");
        Identity identity = identity(codeSystem, diagnosisDomain);
        if (identity == null) return Result.domainMismatch("诊断编码体系与诊断领域不一致");

        String code = extractCode(value);
        if (code != null) {
            var concept = terminology.findConcept(tenantId, identity.codeSystem(), code, atDate);
            return concept.map(item -> verifyDomain(tenantId, identity, item, atDate, "EXACT_CODE"))
                    .orElseGet(() -> Result.unavailable("指定诊断目录中不存在编码 " + code));
        }

        List<TerminologyConceptSnapshot> matches = terminology.findDiseasesByExactName(
                tenantId, identity.codeSystem(), value, atDate);
        if (matches.isEmpty()) return Result.unavailable("指定诊断目录中没有标准名或别名完全匹配项");
        if (matches.size() == 1) {
            return verifyDomain(tenantId, identity, matches.getFirst(), atDate, "EXACT_NAME_OR_ALIAS");
        }
        var category = unambiguousParentCategory(matches);
        if (category != null) {
            return verifyDomain(tenantId, identity, category, atDate, "EXACT_CATEGORY_NAME");
        }
        return new Result(Status.AMBIGUOUS, null, identity.codeSystem(), identity.diagnosisDomain(),
                "同名标准诊断存在多个候选", matches);
    }

    private Result verifyDomain(long tenantId, Identity identity, TerminologyConceptSnapshot concept,
                                LocalDate atDate, String evidence) {
        var disease = terminology.requireDisease(tenantId, concept.id(), atDate);
        if (!identity.codeSystem().equals(disease.systemCode())
                || !identity.diagnosisDomain().equals(disease.diagnosisDomain())) {
            return Result.domainMismatch("诊断编码体系与诊断领域不一致");
        }
        return new Result(Status.EXACT_MATCH, concept, disease.systemCode(), disease.diagnosisDomain(),
                evidence, List.of(concept));
    }

    private Identity identity(String codeSystem, String diagnosisDomain) {
        String system = Strings.trimToNull(codeSystem);
        String domain = Strings.trimToNull(diagnosisDomain);
        if (system == null && domain == null) return new Identity(ICD10_SYSTEM, "WESTERN_MEDICINE");
        if (system == null) system = SYSTEM_BY_DOMAIN.get(domain);
        if (domain == null) {
            String selectedSystem = system;
            domain = SYSTEM_BY_DOMAIN.entrySet().stream()
                    .filter(entry -> entry.getValue().equals(selectedSystem))
                    .map(Map.Entry::getKey).findFirst().orElse(null);
        }
        return system != null && domain != null && system.equals(SYSTEM_BY_DOMAIN.get(domain))
                ? new Identity(system, domain) : null;
    }

    private String extractCode(String value) {
        String upper = value.toUpperCase(Locale.ROOT);
        if (upper.matches("[A-Z]\\d{2}(?:\\.[A-Z0-9]+)?")) return upper;
        var matcher = CODE_TOKEN.matcher(value);
        return matcher.find() ? matcher.group(1).toUpperCase(Locale.ROOT) : null;
    }

    private TerminologyConceptSnapshot unambiguousParentCategory(List<TerminologyConceptSnapshot> matches) {
        var sorted = matches.stream().sorted(Comparator.comparingInt(value -> value.code().length())).toList();
        var parent = sorted.getFirst();
        if (!parent.code().matches("[A-Z]\\d{2}")) return null;
        return sorted.stream().skip(1).allMatch(value -> value.code().startsWith(parent.code() + "."))
                ? parent : null;
    }

    public enum Status { EXACT_MATCH, AMBIGUOUS, UNAVAILABLE, DOMAIN_MISMATCH }

    public record Result(Status status, TerminologyConceptSnapshot concept, String codeSystem,
                         String diagnosisDomain, String evidence,
                         List<TerminologyConceptSnapshot> candidates) {
        public Result {
            candidates = candidates == null ? List.of() : List.copyOf(candidates);
        }
        static Result unavailable(String evidence) {
            return new Result(Status.UNAVAILABLE, null, null, null, evidence, List.of());
        }
        static Result domainMismatch(String evidence) {
            return new Result(Status.DOMAIN_MISMATCH, null, null, null, evidence, List.of());
        }
        public boolean matched() { return status == Status.EXACT_MATCH && concept != null; }
    }

    private record Identity(String codeSystem, String diagnosisDomain) {}
}
