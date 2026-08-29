package com.rhn.platform.printing.api;

public record PrintContent(String fileName, String mediaType, byte[] content) {
    public PrintContent {
        content = content.clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }
}
