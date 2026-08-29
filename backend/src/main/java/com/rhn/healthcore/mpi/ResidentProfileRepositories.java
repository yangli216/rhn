package com.rhn.healthcore.mpi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

interface ResidentDemographicProfileRepository extends JpaRepository<ResidentDemographicProfile, Long> {
    Optional<ResidentDemographicProfile> findByTenantIdAndResidentId(Long tenantId, Long residentId);
}

interface ResidentAddressRepository extends JpaRepository<ResidentAddress, Long> {
    List<ResidentAddress> findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(Long tenantId, Long residentId, String status);
    void deleteByTenantIdAndResidentId(Long tenantId, Long residentId);
}

interface ResidentRelatedPersonRepository extends JpaRepository<ResidentRelatedPerson, Long> {
    List<ResidentRelatedPerson> findByTenantIdAndResidentIdAndStatusOrderByEmergencyContactDescIdAsc(
            Long tenantId, Long residentId, String status);
    void deleteByTenantIdAndResidentId(Long tenantId, Long residentId);
}

interface ResidentCoverageRepository extends JpaRepository<ResidentCoverage, Long> {
    List<ResidentCoverage> findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(Long tenantId, Long residentId, String status);
    void deleteByTenantIdAndResidentId(Long tenantId, Long residentId);
}

interface ResidentEmploymentRepository extends JpaRepository<ResidentEmployment, Long> {
    List<ResidentEmployment> findByTenantIdAndResidentIdAndStatusOrderByPrimaryDescIdAsc(Long tenantId, Long residentId, String status);
    void deleteByTenantIdAndResidentId(Long tenantId, Long residentId);
}
