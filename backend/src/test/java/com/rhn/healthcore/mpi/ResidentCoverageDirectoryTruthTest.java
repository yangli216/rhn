package com.rhn.healthcore.mpi;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ResidentCoverageDirectoryTruthTest {
    final ResidentCoverageRepository repository = mock(ResidentCoverageRepository.class);
    final ResidentCoverageDirectoryService service = new ResidentCoverageDirectoryService(repository);
    final LocalDate date = LocalDate.of(2026,10,4);
    @BeforeEach void setup() { TenantContext.set(1L); }
    @AfterEach void clear() { TenantContext.clear(); verify(repository, never()).save(any()); }
    ResidentCoverage coverage(long id, boolean primary, String type) {
        var value = mock(ResidentCoverage.class);
        when(value.id()).thenReturn(id); when(value.residentId()).thenReturn(2L);
        when(value.primary()).thenReturn(primary); when(value.coverageTypeCode()).thenReturn(type);
        when(value.validFrom()).thenReturn(date.minusDays(1)); when(value.status()).thenReturn("ACTIVE");
        when(repository.findByIdAndTenantId(id,1L)).thenReturn(Optional.of(value));
        return value;
    }
    void candidates(ResidentCoverage... values) { when(repository.findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(1L,2L,"ACTIVE")).thenReturn(List.of(values)); }
    @Test void absenceDoesNotProvisionCoverage() {
        candidates();
        assertEquals("COVERAGE_REQUIRED", assertThrows(BusinessException.class, () -> service.requireExistingActive(null,2L,date,null)).code());
    }
    @Test void selectsTheExistingPrimaryCoverageWithoutChangingItsType() {
        candidates(coverage(3L,false,"390"),coverage(4L,true,"310"));
        assertEquals(4L,service.requireExistingActive(null,2L,date,null).id());
        assertEquals("310",service.requireExistingActive(null,2L,date,null).coverageTypeCode());
    }
    @Test void explicitTypeCanSelectAnExistingNonPrimaryRecord() {
        candidates(coverage(3L,false,"390"),coverage(4L,true,"310"));
        assertEquals(3L,service.requireExistingActive(null,2L,date,"390").id());
    }
    @Test void ambiguousRecordsRequireAnExplicitChoice() {
        candidates(coverage(3L,true,"310"),coverage(4L,true,"310"));
        assertEquals("COVERAGE_AMBIGUOUS",assertThrows(BusinessException.class,()->service.requireExistingActive(null,2L,date,null)).code());
        assertEquals(3L,service.requireExistingActive(3L,2L,date,"310").id());
    }
    @Test void expiredAndFutureRecordsAreNotActiveAtServiceDate() {
        var expired=coverage(3L,true,"310"); when(expired.validTo()).thenReturn(date.minusDays(1));
        var future=coverage(4L,true,"310"); when(future.validFrom()).thenReturn(date.plusDays(1)); candidates(expired,future);
        assertThrows(BusinessException.class,()->service.requireExistingActive(null,2L,date,null));
    }
    @Test void explicitRecordMustMatchResidentTypeAndServiceDate() {
        coverage(3L,true,"310");
        assertEquals("COVERAGE_RESIDENT_MISMATCH",assertThrows(BusinessException.class,()->service.requireExistingActive(3L,99L,date,null)).code());
        assertEquals("INSURANCE_COVERAGE_TYPE_MISMATCH",assertThrows(BusinessException.class,()->service.requireExistingActive(3L,2L,date,"390")).code());
        assertEquals("COVERAGE_NOT_ACTIVE",assertThrows(BusinessException.class,()->service.requireExistingActive(3L,2L,date.minusDays(3),null)).code());
    }
}
