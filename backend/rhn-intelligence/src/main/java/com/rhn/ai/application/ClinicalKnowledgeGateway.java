package com.rhn.ai.application;

import java.util.List;

/** Read-only boundary for an institution-approved medical knowledge service. */
public interface ClinicalKnowledgeGateway {
    List<KnowledgeResult> search(String query, int limit, ClinicalAssistantSettings runtimeSettings);

    record KnowledgeResult(String id, String title, String excerpt, Double score,
                           String sourceName, String sourceId, String publishYear,
                           String resourcePosition) {}
}
