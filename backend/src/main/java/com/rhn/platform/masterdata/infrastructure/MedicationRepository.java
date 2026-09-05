package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.Medication;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MedicationRepository extends JpaRepository<Medication, Long> {
    List<Medication> findByTenantIdOrderByName(Long tenantId);
    Optional<Medication> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);

    @Query("""
            select m from Medication m
            where m.tenantId = :tenantId
              and (:medicationType is null or :medicationType = '' or m.medicationType = :medicationType)
              and (:status is null or :status = '' or m.status = :status)
              and (:query is null or :query = '' or lower(m.code) like lower(concat('%', :query, '%'))
                   or lower(m.name) like lower(concat('%', :query, '%'))
                   or lower(coalesce(m.aliasName, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(m.doseForm, '')) like lower(concat('%', :query, '%'))
                   or lower(coalesce(m.preparationSpec, '')) like lower(concat('%', :query, '%')))
            """)
    Page<Medication> search(@Param("tenantId") Long tenantId, @Param("query") String query,
                            @Param("medicationType") String medicationType, @Param("status") String status,
                            Pageable pageable);
}
