package com.rhn.platform.printing.api;

public record PrintTemplateView(
        Long id,
        String templateCode,
        String templateName,
        String documentType,
        String scope,
        int currentVersion,
        String layoutSchema
) {}
