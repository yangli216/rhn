package com.rhn.healthcore.condition;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

interface ConditionRepository extends JpaRepository<Condition, Long> {
    Optional<Condition> findByTenantIdAndConditionKey(Long tenantId, String conditionKey);
    Optional<Condition> findByIdAndTenantId(Long id, Long tenantId);
}
