package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.domain.SupplyItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SupplyItemRepository extends JpaRepository<SupplyItem, Long> {
    List<SupplyItem> findByTenantIdOrderByName(Long tenantId);
    Optional<SupplyItem> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    boolean existsByTenantIdAndUdiDi(Long tenantId, String udiDi);

    /** 当前有效且可收费的目录项（id, code, name），用于标准映射覆盖率统计。 */
    @org.springframework.data.jpa.repository.Query("""
            select s.id, s.code, s.name from SupplyItem s
            where s.tenantId = :tenantId and s.status = 'ACTIVE' and s.chargeable = true
              and s.validFrom <= :at and (s.validTo is null or s.validTo >= :at)
            order by s.code
            """)
    java.util.List<Object[]> findChargeableRefs(@org.springframework.data.repository.query.Param("tenantId") Long tenantId,
                                               @org.springframework.data.repository.query.Param("at") java.time.LocalDate at);
}
