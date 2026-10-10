package com.rhn.ai.application;

import com.rhn.diagnostics.api.DiagnosticReportDirectory;
import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Read-only server evidence and canonical fingerprint. Access is validated by the caller before assembly. */
@Service
class ClinicalAiContextAssembler {
    private final ResidentDirectory residentDirectory;
    private final AllergyDirectory allergyDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final DiagnosticReportDirectory diagnosticReportDirectory;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final OutpatientClinicalHistoryDirectory historyDirectory;
    private final JsonCodec jsonCodec;
    ClinicalAiContextAssembler(ResidentDirectory residentDirectory, AllergyDirectory allergyDirectory, ClinicalDocumentDirectory clinicalDocumentDirectory, DiagnosticReportDirectory diagnosticReportDirectory, OutpatientPlanTemplateDirectory planDirectory, OutpatientClinicalHistoryDirectory historyDirectory, JsonCodec jsonCodec) {
        this.residentDirectory = residentDirectory;
        this.allergyDirectory = allergyDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.diagnosticReportDirectory = diagnosticReportDirectory;
        this.planDirectory = planDirectory;
        this.historyDirectory = historyDirectory;
        this.jsonCodec = jsonCodec;
    }
    ServerContext load(ExecutionContext context, EncounterDirectory.EncounterSnapshot encounter, boolean includePlans) {
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(encounter.residentId());
        List<AllergyDirectory.AllergySnapshot> allergies = allergyDirectory
                .activeForResident(encounter.residentId()).stream()
                .filter(value -> "ALLERGY".equals(value.assertionType()))
                .sorted(Comparator.comparing(AllergyDirectory.AllergySnapshot::id,
                        Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        ClinicalDocumentDirectory.EncounterDocumentAnchor document = clinicalDocumentDirectory
                .findEncounterDocumentAnchor(encounter.id(), "OUTPATIENT_NOTE").orElse(null);
        List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plans = includePlans ? planDirectory.searchIndexForCurrentContext() : List.of();
        Instant historySince = Instant.now().minus(java.time.Duration.ofDays(90));
        List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory = historyDirectory
                .recentForResident(encounter.residentId(), encounter.id(), historySince, 10);
        List<DiagnosticReportResponse> reportCandidates = new ArrayList<>(diagnosticReportDirectory
                .listByEncounter(encounter.id()));
        Instant reportSince = Instant.now().minus(java.time.Duration.ofDays(14));
        clinicalHistory.stream().filter(value -> value.registeredAt() != null && !value.registeredAt().isBefore(reportSince))
                .forEach(value -> reportCandidates.addAll(diagnosticReportDirectory.listByEncounter(value.encounterId())));
        List<DiagnosticReportResponse> reports = currentReports(reportCandidates);

        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("tenantId", context.tenantId());
        canonical.put("encounterId", encounter.id());
        canonical.put("encounterRevision", encounter.revision());
        canonical.put("encounterStatus", encounter.status());
        Map<String, Object> documentAnchor = new LinkedHashMap<>();
        documentAnchor.put("present", document != null);
        if (document != null) {
            documentAnchor.put("id", document.id());
            documentAnchor.put("version", document.version());
            documentAnchor.put("status", document.status());
        }
        canonical.put("outpatientNote", documentAnchor);
        canonical.put("resident", Map.of("id", resident.id(), "gender", safe(resident.gender()),
                "birthDate", resident.birthDate() == null ? "" : resident.birthDate().toString(),
                "deceased", resident.deceased()));
        canonical.put("allergies", allergies.stream().map(this::allergyFact).toList());
        canonical.put("availablePlans", plans.stream().sorted(Comparator.comparing(OutpatientPlanTemplateDirectory.PlanTemplateSnapshot::id)).map(value -> Map.of(
                "id", value.id(), "name", safe(value.name()), "description", safe(value.description()),
                "diagnoses", value.diagnoses(), "medications", value.medications(),
                "services", value.services(), "tasks", value.tasks(),
                "contentHash", value.searchProfile() == null ? "" : value.searchProfile().contentHash())).toList());
        canonical.put("diagnosticReports", reports.stream().map(value -> Map.of(
                "id", value.id(), "version", value.reportVersion(), "status", safe(value.status()),
                "digest", safe(value.contentDigest()), "issuedAt", value.issuedAt() == null ? "" : value.issuedAt().toString()))
                .toList());
        canonical.put("clinicalHistory", clinicalHistory);
        return new ServerContext(resident, allergies, plans, reports, clinicalHistory, sha256(canonical));
    }

    private List<DiagnosticReportResponse> currentReports(List<DiagnosticReportResponse> values) {
        Map<String, DiagnosticReportResponse> current = new LinkedHashMap<>();
        for (DiagnosticReportResponse value : values) {
            if (value == null) continue;
            String key = value.requestId() + "|" + safe(value.reportCode());
            DiagnosticReportResponse previous = current.get(key);
            if (previous == null || value.reportVersion() > previous.reportVersion()) current.put(key, value);
        }
        return current.values().stream().filter(value -> !"CANCELLED".equals(value.status()))
                .sorted(Comparator.comparing(DiagnosticReportResponse::issuedAt,
                        Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(50).toList();
    }

    private Map<String, Object> allergyFact(AllergyDirectory.AllergySnapshot value) {
        Map<String, Object> fact = new LinkedHashMap<>();
        fact.put("id", value.id());
        fact.put("assertionType", value.assertionType());
        fact.put("categoryCode", value.categoryCode());
        fact.put("criticalityCode", value.criticalityCode());
        fact.put("reactionSeverity", value.reactionSeverity());
        fact.put("substanceCodeSystemUri", value.substanceCodeSystemUri());
        fact.put("substanceCode", value.substanceCode());
        fact.put("substanceDisplay", value.substanceDisplay());
        fact.put("reactionText", value.reactionText());
        return fact;
    }

    private String sha256(Object canonical) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256")
                    .digest(jsonCodec.write(canonical).getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static String normalized(String value) { return safe(value).toLowerCase(Locale.ROOT); }
    private static String safe(String value) { return value == null ? "" : value.trim(); }
    record ServerContext(ResidentDirectory.ResidentSnapshot resident,
                                 List<AllergyDirectory.AllergySnapshot> allergies,
                                 List<OutpatientPlanTemplateDirectory.PlanTemplateSnapshot> plans,
                                 List<DiagnosticReportResponse> reports,
                                 List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> clinicalHistory,
                                 String hash) {}
}
