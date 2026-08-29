package com.rhn.healthcore.api;

import java.time.LocalDate;

/** Stable patient-domain boundary for consumers that need an active coverage reference. */
public interface CoverageDirectory {
    CoverageView requireActive(Long coverageId, Long residentId, LocalDate serviceDate);

    record CoverageView(Long id, Long residentId, String coverageTypeCode, String payerName,
                        boolean primary, LocalDate validFrom, LocalDate validTo) {}
}
