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

    /**
     * 已登记的保障编号（如医保个人编号）。仅读取，不校验有效期；保障在申请创建时已核验，
     * 缺失时返回空，调用方不得以其他标识替代。
     */
    default java.util.Optional<String> findMemberNo(Long coverageId, Long residentId) { return java.util.Optional.empty(); }

    /** 患者当前有效保障登记的全部保障编号（去空），供医保鉴权核对返回的个人编号；未知时返回空列表，调用方不得据此放行或拒绝。 */
    default java.util.List<String> findActiveMemberNos(Long residentId, LocalDate serviceDate) { return java.util.List.of(); }

    record CoverageView(Long id, Long residentId, String coverageTypeCode, String payerName,
                        boolean primary, LocalDate validFrom, LocalDate validTo) {}
}
