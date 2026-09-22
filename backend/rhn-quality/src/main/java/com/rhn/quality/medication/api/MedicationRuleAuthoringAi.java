package com.rhn.quality.medication.api;

/** Implemented by Intelligence; Quality runtime never calls an LLM during evaluation. */
public interface MedicationRuleAuthoringAi {
    record Status(boolean available, String model, String message) {}
    Status status();
    String generate(String systemPrompt, String input);
    default String generate(String systemPrompt, String input, String promptVersion) { return generate(systemPrompt, input); }
}
