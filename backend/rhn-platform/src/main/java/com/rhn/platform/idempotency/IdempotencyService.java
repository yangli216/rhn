package com.rhn.platform.idempotency;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class IdempotencyService {
    private final IdempotencyRecordRepository repository;
    private final ExecutionContextProvider contextProvider;

    public IdempotencyService(IdempotencyRecordRepository repository, ExecutionContextProvider contextProvider) {
        this.repository = repository;
        this.contextProvider = contextProvider;
    }

    @Transactional
    public IdempotencyReservation reserve(String operationCode, String idempotencyKey, String canonicalRequest) {
        ExecutionContext context = contextProvider.requireCurrent();
        String requestHash = sha256(canonicalRequest == null ? "" : canonicalRequest);
        return repository.findByTenantIdAndOperationCodeAndIdempotencyKey(
                context.tenantId(), operationCode, idempotencyKey).map(existing -> {
            if (!existing.requestHash().equals(requestHash)) {
                throw conflict("IDEMPOTENCY_KEY_REUSED", "幂等键已用于不同请求");
            }
            if (existing.status().equals("COMPLETED")) {
                return new IdempotencyReservation(false, true, existing.resourceType(), existing.resourceId(),
                        existing.responseStatus(), existing.responseJson());
            }
            throw conflict("IDEMPOTENCY_IN_PROGRESS", "相同请求正在处理中");
        }).orElseGet(() -> {
            repository.saveAndFlush(new IdempotencyRecord(context.tenantId(), operationCode, idempotencyKey,
                    requestHash, Duration.ofHours(24)));
            return new IdempotencyReservation(true, false, null, null, null, null);
        });
    }

    @Transactional
    public void complete(String operationCode, String idempotencyKey, String resourceType, Long resourceId,
                         int responseStatus, String responseJson) {
        ExecutionContext context = contextProvider.requireCurrent();
        IdempotencyRecord record = repository.findByTenantIdAndOperationCodeAndIdempotencyKey(
                context.tenantId(), operationCode, idempotencyKey)
                .orElseThrow(() -> conflict("IDEMPOTENCY_RESERVATION_MISSING", "幂等请求尚未登记"));
        record.complete(resourceType, resourceId, responseStatus, responseJson);
    }

    @Scheduled(cron = "${rhn.idempotency.cleanup-cron:0 15 3 * * *}")
    @Transactional
    public void cleanupExpired() {
        repository.deleteByExpiresAtBefore(Instant.now());
    }

    private String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
