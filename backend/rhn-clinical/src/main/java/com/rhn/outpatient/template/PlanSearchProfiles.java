package com.rhn.outpatient.template;

import com.rhn.outpatient.api.PlanSearchProfile;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory.DiagnosisSnapshot;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.PlanTaskInput;
import com.rhn.shared.json.JsonCodec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashSet;
import java.util.List;

/** Fast, lossless derivation at save time: no remote call or new clinical assertions. */
final class PlanSearchProfiles {
    private PlanSearchProfiles() {}

    static PlanSearchProfile build(OutpatientPlanTemplate plan, List<OutpatientPlanDiagnosis> diagnoses,
                                   List<OutpatientPlanMedication> medications, List<OutpatientPlanServiceLine> services,
                                   List<PlanTaskInput> tasks, OutpatientNoteTemplate note, JsonCodec json) {
        var diagnosisFacts = diagnoses.stream().map(d -> new DiagnosisSnapshot(d.codeSystem(), d.diagnosisDomain(),
                d.code(), d.name(), d.type())).toList();
        var conditions = tasks.stream().filter(t -> "CONDITION".equals(t.kind()))
                .map(t -> t.text() + (t.details() == null || t.details().isBlank() ? "" : "：" + t.details())).distinct().toList();
        var keywords = new LinkedHashSet<String>();
        add(keywords, plan.name()); add(keywords, plan.description());
        diagnoses.forEach(d -> { add(keywords, d.name()); add(keywords, d.code()); });
        conditions.forEach(c -> add(keywords, c));
        medications.forEach(m -> add(keywords, m.medicationName()));
        services.forEach(s -> add(keywords, s.itemName()));
        if (note != null) {
            var content = json.read(note.contentJson(), OutpatientNoteTemplateContracts.NoteContent.class);
            add(keywords, content.chiefComplaint());
        }
        String summary = plan.description();
        if (summary == null || summary.isBlank()) {
            summary = String.join("、", diagnoses.stream().map(OutpatientPlanDiagnosis::name).distinct().toList());
            if (summary.isBlank()) summary = plan.name();
            if (!conditions.isEmpty()) summary += "；" + conditions.getFirst();
        }
        String noteHash = note == null ? null : hash(note.contentJson());
        // IDs, usage counters, timestamps and row revision are deliberately absent from the clinical identity.
        var canonical = Arrays.asList(plan.name(), plan.description(), diagnosisFacts,
                medications.stream().map(m -> Arrays.asList(m.medicationId(), m.catalogItemId(), m.packageId(),
                        m.categoryCode(), m.medicationCode(), m.doseValue(), m.doseUnit(), m.routeCode(), m.frequencyCode(),
                        m.durationValue(), m.durationUnit(), m.quantity(), m.quantityUnit(), m.medicationInstruction(),
                        m.substitutionAllowed(), m.selfProvided(), m.reason())).toList(),
                services.stream().map(s -> Arrays.asList(s.catalogItemId(), s.itemCode(), s.serviceType(), s.quantity(),
                        s.unitCode(), s.reason(), s.clinicalDescription())).toList(),
                tasks.stream().map(t -> Arrays.asList(t.kind(), t.text(), t.details())).toList(), noteHash);
        return new PlanSearchProfile(1, hash(json.write(canonical)), summary.substring(0, Math.min(500, summary.length())),
                keywords.stream().limit(150).toList(), conditions, diagnosisFacts, plan.noteTemplateId(), noteHash);
    }

    static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static void add(LinkedHashSet<String> words, String value) {
        if (value == null || value.isBlank()) return;
        // Delimiters only; no clinical phrase rewriting, inferred conditions, or hardcoded medical synonyms.
        for (String part : value.split("[，。；、：:;\\s]+")) {
            if (!part.isBlank()) words.add(part.substring(0, Math.min(120, part.length())));
        }
    }
}
