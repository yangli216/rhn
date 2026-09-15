package com.rhn.platform.terminology.api;

import java.util.List;

public record DiseaseSearchPage(
        List<DiseaseConceptView> content, long totalElements, int totalPages, int page, int size
) {}

