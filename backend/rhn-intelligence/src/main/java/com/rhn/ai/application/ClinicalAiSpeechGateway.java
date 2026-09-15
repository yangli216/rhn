package com.rhn.ai.application;

/** Provider-neutral speech-to-text boundary. Implementations must not persist the audio payload. */
public interface ClinicalAiSpeechGateway {
    String transcribe(SpeechRequest request, ClinicalAssistantSettings runtimeSettings);

    record SpeechRequest(String contentType, String fileName, byte[] audio, String languageHint) {
        public SpeechRequest {
            audio = audio == null ? new byte[0] : audio.clone();
        }

        @Override
        public byte[] audio() {
            return audio.clone();
        }
    }
}
