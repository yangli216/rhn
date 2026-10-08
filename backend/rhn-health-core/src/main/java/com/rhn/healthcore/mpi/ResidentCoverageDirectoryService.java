package com.rhn.healthcore.mpi;

import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.platform.tenant.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class ResidentCoverageDirectoryService implements CoverageDirectory {
    private final ResidentCoverageRepository repository;

    ResidentCoverageDirectoryService(ResidentCoverageRepository repository) { this.repository = repository; }

    @Override
    @Transactional(readOnly = true)
    public CoverageView requireActive(Long coverageId, Long residentId, LocalDate serviceDate) {
        ResidentCoverage value = repository.findByIdAndTenantId(coverageId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("COVERAGE_NOT_FOUND", "未找到患者保障信息"));
        LocalDate date = serviceDate == null ? LocalDate.now() : serviceDate;
        if (!value.residentId().equals(residentId)) {
            throw conflict("COVERAGE_RESIDENT_MISMATCH", "保障信息不属于当前患者");
        }
        if (!"ACTIVE".equals(value.status()) || value.validFrom().isAfter(date)
                || value.validTo() != null && value.validTo().isBefore(date)) {
            throw conflict("COVERAGE_NOT_ACTIVE", "保障信息在就诊日期无效");
        }
        return new CoverageView(value.id(), value.residentId(), value.coverageTypeCode(), value.payerName(),
                value.primary(), value.validFrom(), value.validTo());
    }

    @Override
    @Transactional(readOnly = true)
    public CoverageView requireExistingActive(Long coverageId, Long residentId, LocalDate serviceDate,
                                               String coverageTypeCode) {
        if (coverageId != null) {
            CoverageView value = requireActive(coverageId, residentId, serviceDate);
            if (coverageTypeCode != null && !coverageTypeCode.isBlank()
                    && !value.coverageTypeCode().equalsIgnoreCase(coverageTypeCode.trim())) {
                throw conflict("INSURANCE_COVERAGE_TYPE_MISMATCH", "医保申请类型与患者保障类型不一致");
            }
            return value;
        }
        LocalDate date = java.util.Objects.requireNonNull(serviceDate, "serviceDate");
        var candidates = repository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(
                        TenantContext.requireTenantId(), residentId, "ACTIVE").stream()
                .filter(v -> !v.validFrom().isAfter(date) && (v.validTo() == null || !v.validTo().isBefore(date)))
                .filter(v -> coverageTypeCode == null || coverageTypeCode.isBlank()
                        || v.coverageTypeCode().equalsIgnoreCase(coverageTypeCode.trim())).toList();
        if (candidates.isEmpty()) throw conflict("COVERAGE_REQUIRED", "患者没有就诊日期有效的保障信息，请先核实并维护参保资料");
        var primary = candidates.stream().filter(ResidentCoverage::primary).toList();
        var eligible = primary.isEmpty() ? candidates : primary;
        if (eligible.size() != 1) throw conflict("COVERAGE_AMBIGUOUS", "患者存在多条有效保障信息，请明确选择本次使用的保障记录");
        return requireActive(eligible.getFirst().id(), residentId, date);
    }
}
