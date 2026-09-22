package com.rhn.quality.medication.api;

import java.time.Instant;
import java.util.List;

/** Requirement clarification is user intent, never clinical evidence or executable knowledge. */
public final class MedicationRuleIntakeContracts {
    private MedicationRuleIntakeContracts() {}
    public record Capability(String kind,String name,boolean knowledgeWorkflow,List<String> prerequisites,String boundary) {}
    public record Answer(String questionId,String value) {}
    public record PharmacyOrigin(Long organizationId, Long departmentId, Long taskId,
            com.rhn.pharmacy.api.PharmacyViews.PharmacyReviewView review,
            com.rhn.outpatient.api.MedicationSafetyDecision.Finding finding) {}
    public record FeedbackOrigin(MedicationKnowledgeFeedbackContracts.Event feedback, Long knowledgeId, int knowledgeVersion, String title, PharmacyOrigin pharmacy) {
        public FeedbackOrigin(MedicationKnowledgeFeedbackContracts.Event feedback, Long knowledgeId, int knowledgeVersion, String title) {
            this(feedback, knowledgeId, knowledgeVersion, title, null);
        }
        public Long organizationId() { return pharmacy == null ? feedback.basis().organizationId() : pharmacy.organizationId(); }
        public Long departmentId() { return pharmacy == null ? feedback.basis().departmentId() : pharmacy.departmentId(); }
        public Long feedbackId() { return pharmacy == null ? feedback.id() : pharmacy.review().id(); }
    }
    public record PharmacyImprovementRequest(Request intake, Long findingId, boolean confirmed) {}
    public record ImprovementRequest(Request intake, Long feedbackId, String expectedBasisHash, boolean confirmed) {}
    public record Request(String requirement,Long parentId,List<Answer> answers) {}
    public record Clarification(Long analysisId,String questionId,String question,String answer) {}
    public record Input(String requirement,List<Clarification> clarifications) {}
    public record Quoted(String dimension,String source,String quote) {}
    public record Proposed(String kind,String source,String quote,String scope,String scopeSource,String scopeQuote,List<Quoted> conditions,List<String> questions) {}
    public record Output(List<Proposed> intents) {}
    public record Citation(String source,String quote,int start,int end) {}
    public record Condition(String dimension,Citation citation) {}
    public record Intent(String kind,String name,Citation citation,String scope,Citation scopeCitation,List<Condition> conditions,Capability capability) {}
    public record Question(String id,String text,String origin) {}
    public record Result(String status,List<Intent> intents,List<Question> questions,List<String> notes) {}
    public record Run(Long id,Long parentId,Input input,String inputHash,String model,String promptVersion,String capabilityVersion,Result result,String resultHash,String rawOutput,boolean rawTruncated,Long actorId,String actor,Instant createdAt) {}
    public record Summary(Long id,Long parentId,String requirement,String status,String actor,Instant createdAt) {}
}
