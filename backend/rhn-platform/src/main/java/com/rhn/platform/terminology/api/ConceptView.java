package com.rhn.platform.terminology.api;


public record ConceptView(Long id, String system, String systemVersion, String code, String display, String status) {
}

