package com.rhn.inpatient.infrastructure;

import com.rhn.inpatient.domain.InpatientBedProfile;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface InpatientBedProfileRepository extends JpaRepository<InpatientBedProfile, Long> {
    List<InpatientBedProfile> findByTenantId(Long tenantId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select value from InpatientBedProfile value where value.tenantId = :tenantId and value.bedLocationId = :bedId")
    Optional<InpatientBedProfile> findLocked(@Param("tenantId") Long tenantId, @Param("bedId") Long bedId);
}
