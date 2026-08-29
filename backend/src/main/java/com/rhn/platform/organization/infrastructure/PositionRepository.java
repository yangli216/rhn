package com.rhn.platform.organization.infrastructure;

import com.rhn.platform.organization.domain.Position;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PositionRepository extends JpaRepository<Position, Long> {
    Optional<Position> findByIdAndTenantId(Long id, Long tenantId);
    boolean existsByTenantIdAndCode(Long tenantId, String code);
    List<Position> findByTenantIdOrderByCode(Long tenantId);
}
