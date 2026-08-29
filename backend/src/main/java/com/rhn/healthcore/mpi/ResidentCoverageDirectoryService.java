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
}
