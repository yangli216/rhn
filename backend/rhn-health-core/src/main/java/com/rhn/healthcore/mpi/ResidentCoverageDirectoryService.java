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
    @Transactional
    public CoverageView requireOrProvisionActive(Long coverageId, Long residentId, LocalDate serviceDate,
                                                 String coverageTypeCode, String payerName) {
        Long tenantId = TenantContext.requireTenantId();
        LocalDate date = serviceDate == null ? LocalDate.now() : serviceDate;
        if (coverageId != null) {
            return requireActive(coverageId, residentId, date);
        }
        var existing = repository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(tenantId, residentId, "ACTIVE")
                .stream().filter(v -> !v.validFrom().isAfter(date) && (v.validTo() == null || !v.validTo().isBefore(date)))
                .findFirst();
        if (existing.isPresent()) {
            var value = existing.get();
            return new CoverageView(value.id(), value.residentId(), value.coverageTypeCode(), value.payerName(),
                    value.primary(), value.validFrom(), value.validTo());
        }
        String code = coverageTypeCode != null && !coverageTypeCode.isBlank() ? coverageTypeCode.trim() : "01";
        String payer = payerName != null && !payerName.isBlank() ? payerName.trim() : "江西省南昌市城镇职工基本医疗保险";
        ResidentCoverage created = repository.save(new ResidentCoverage(tenantId, residentId, code, payer,
                "MED-" + residentId, true, LocalDate.of(2020, 1, 1), null, "SYSTEM"));
        return new CoverageView(created.id(), created.residentId(), created.coverageTypeCode(), created.payerName(),
                created.primary(), created.validFrom(), created.validTo());
    }
}
