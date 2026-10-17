package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Practitioner;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PractitionerRepository extends JpaRepository<Practitioner, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Practitioner p where p.id = :id and p.tenantId = :tenantId")
    java.util.Optional<Practitioner> lockByIdAndTenantId(@org.springframework.data.repository.query.Param("id") Long id,
            @org.springframework.data.repository.query.Param("tenantId") Long tenantId);

    Optional<Practitioner> findByIdAndTenantId(Long id, Long tenantId);
    Optional<Practitioner> findByTenantIdAndCode(Long tenantId, String code);
    List<Practitioner> findByTenantIdOrderByCode(Long tenantId);
}
