package com.rhn.healthcore.api;

import java.time.LocalDate;

/** Stable patient-domain boundary for consumers that need an active coverage reference. */
public interface CoverageDirectory {
    CoverageView requireActive(Long coverageId, Long residentId, LocalDate serviceDate);

    /** Resolve existing coverage only; absence or ambiguity must not provision patient facts. */
    default CoverageView requireExistingActive(Long coverageId, Long residentId, LocalDate serviceDate,
                                               String coverageTypeCode) {
        if (coverageId == null) throw com.rhn.shared.api.BusinessErrors.badRequest(
                "COVERAGE_REQUIRED", "请选择已核实的患者保障信息");
        return requireActive(coverageId, residentId, serviceDate);
    }

    record CoverageView(Long id, Long residentId, String coverageTypeCode, String payerName,
                        boolean primary, LocalDate validFrom, LocalDate validTo) {}
}
