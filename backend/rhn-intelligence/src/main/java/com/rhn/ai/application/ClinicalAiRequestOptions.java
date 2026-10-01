package com.rhn.ai.application;

import java.net.URI;
import java.util.Locale;
import java.util.Map;

/** Provider extensions must not leak into unrelated OpenAI-compatible services. */
public final class ClinicalAiRequestOptions {
    private ClinicalAiRequestOptions() { }

    public static void applyNonThinkingDefault(Map<String, Object> body, URI endpoint, String model) {
        if (endpoint != null && endpoint.getHost() != null && endpoint.getHost().endsWith(".aliyuncs.com")) {
            body.put("enable_thinking", false);
        }
    }
}
