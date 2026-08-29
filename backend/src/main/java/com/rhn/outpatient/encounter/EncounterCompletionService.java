package com.rhn.outpatient.encounter;

import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
class EncounterCompletionService {
    private final EncounterCompletionCheckRepository checkRepository;
    private final EncounterCompletionIssueRepository issueRepository;

    EncounterCompletionService(EncounterCompletionCheckRepository checkRepository,
                               EncounterCompletionIssueRepository issueRepository) {
        this.checkRepository = checkRepository;
        this.issueRepository = issueRepository;
    }

    CompletionDecision evaluate(Encounter encounter, boolean identityChecked, boolean noteSigned,
                                boolean hasPrimaryDiagnosis) {
        List<CompletionIssue> issues = new ArrayList<>();
        if (!identityChecked) issues.add(new CompletionIssue("IDENTITY_CHECK_MISSING", "接诊身份核验未完成"));
        if (encounter.chiefComplaint() == null || encounter.chiefComplaint().isBlank()) {
            issues.add(new CompletionIssue("CHIEF_COMPLAINT_MISSING", "主诉未填写"));
        }
        if (!hasPrimaryDiagnosis) issues.add(new CompletionIssue("PRIMARY_DIAGNOSIS_MISSING", "主要诊断未确认"));
        if (!noteSigned) issues.add(new CompletionIssue("OUTPATIENT_NOTE_UNSIGNED", "门诊病历尚未签署"));

        return new CompletionDecision(issues.isEmpty(), List.copyOf(issues));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    void recordBlocked(Encounter encounter, CompletionDecision decision,
                       ExecutionContext context, String commandCode) {
        record(encounter, decision, context, commandCode);
    }

    @Transactional
    void recordPassed(Encounter encounter, CompletionDecision decision,
                      ExecutionContext context, String commandCode) {
        record(encounter, decision, context, commandCode);
    }

    private void record(Encounter encounter, CompletionDecision decision,
                        ExecutionContext context, String commandCode) {
        EncounterCompletionCheck check = checkRepository.saveAndFlush(new EncounterCompletionCheck(
                encounter.tenantId(), encounter.id(), encounter.version(), decision.passed(), commandCode,
                context.practitionerId(), context.subjectId()));
        issueRepository.saveAll(decision.issues().stream().map(issue -> new EncounterCompletionIssue(
                encounter.tenantId(), check.id(), issue.code(), issue.description())).toList());
        issueRepository.flush();
    }

    record CompletionDecision(boolean passed, List<CompletionIssue> issues) {}
    record CompletionIssue(String code, String description) {}
}
