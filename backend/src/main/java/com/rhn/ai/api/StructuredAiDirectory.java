package com.rhn.ai.api;

/** Server-owned prompts and structured output using the configured model; no business data access. */
public interface StructuredAiDirectory {
    record Status(boolean available, String model, String message) {}
    Status status();
    String complete(String systemPrompt, String input);
}
