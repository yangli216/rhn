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

    public static boolean usesDashScopeSpeech(URI endpoint, String model) {
        if (endpoint != null) {
            String path = endpoint.getPath() == null ? "" : endpoint.getPath().toLowerCase(Locale.ROOT);
            // An explicit OpenAI-compatible interface takes precedence over model/provider hints.
            if (path.endsWith("/audio/transcriptions") || path.endsWith("/audio/transcriptions/")) return false;
            if ("dashscope.aliyuncs.com".equalsIgnoreCase(endpoint.getHost())
                    || path.contains("/services/audio/asr/transcription")) return true;
        }
        // Preserve compatibility for existing DashScope proxies with custom paths.
        String normalizedModel = model == null ? "" : model.toLowerCase(Locale.ROOT);
        return normalizedModel.startsWith("qwen") || normalizedModel.startsWith("paraformer")
                || normalizedModel.startsWith("sensevoice");
    }
}
