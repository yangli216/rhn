package com.rhn.platform.idempotency;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.Optional;

interface IdempotencyRecordRepository extends JpaRepository<IdempotencyRecord, Long> {
    Optional<IdempotencyRecord> findByTenantIdAndOperationCodeAndIdempotencyKey(
            Long tenantId, String operationCode, String idempotencyKey);
    long deleteByExpiresAtBefore(Instant before);
}
