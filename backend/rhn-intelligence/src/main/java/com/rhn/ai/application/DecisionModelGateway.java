package com.rhn.ai.application;

import tools.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;

/** Bounded semantic judgments only; never executes business commands. */
public interface DecisionModelGateway {
    Result decide(Request request, DecisionModelSettings settings);

    record ChoiceQuestion(String id, String instructions, Map<String, String> criteria) {
        public ChoiceQuestion { criteria = java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(criteria)); }
    }
    record Request(String version, JsonNode state, List<ChoiceQuestion> questions) {
        public Request { state = state.deepCopy(); questions = List.copyOf(questions); }
        @Override public JsonNode state() { return state.deepCopy(); }
    }
    /** Provider confidence measures concentration, not clinical correctness. */
    record ChoiceAnswer(String choice, Map<String, Double> probabilities, double confidence) {
        public ChoiceAnswer { probabilities = java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(probabilities)); }
    }
    record Result(String traceId, String model, Map<String, ChoiceAnswer> answers, long latencyMs) {
        public Result { answers = java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(answers)); }
    }
}
