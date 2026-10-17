package com.rhn.quality.medication.api;

import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.CategoryReference;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory.Reference;
import java.util.List;

/**
 * Plain-language rule cards are the editable middle layer between source text and a knowledge draft.
 * AI only proposes cards; the service normalizes them and the frontend compiles confirmed cards deterministically.
 */
public final class MedicationRuleConversationContracts {
    private MedicationRuleConversationContracts() {}
    public record Card(String id, String kind, String title, String quote, List<String> groupA, List<String> groupB,
            String matchMode, String exposureScope, Integer minimumOrders, String ageMode, String ageUnit,
            Integer minimumAgeInclusive, Integer maximumAgeExclusive, List<String> routesA, List<String> routesB,
            String proposedAction, String severity, String clinicalMeaning, String otherConditions, List<String> questions,
            /** Set by the service when a card was re-interpreted; never trusted from model output. */ String boundaryNote) {}
    public record Message(String role, String text) {}
    public record TurnRequest(String source, List<Card> cards, String message, List<Message> history) {}
    /** categories: standard catalog classifications whose name equals the written name; candidates: exact-name drug specifications. */
    public record Candidates(String name, List<Reference> candidates, List<CategoryReference> categories) {}
    public record CardView(Card card, String state, String kindName, List<String> missing, List<Candidates> groupACandidates, List<Candidates> groupBCandidates) {}
    public record TurnResult(Long runId, String reply, List<CardView> cards) {}
    /** Raw model output; unknown shapes are rejected by normalization rather than trusted. */
    public record Output(String reply, List<Card> cards) {}
}
