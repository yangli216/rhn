package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.InpatientMedicationSupplyGenerationRun;
import com.rhn.pharmacy.infrastructure.InpatientMedicationSupplyGenerationRunRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.idempotency.CommandCodes;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

@Service
class WardMedicationSupplyGenerationRunService {
    private static final Duration LEASE = Duration.ofMinutes(5);
    private final InpatientMedicationSupplyGenerationRunRepository runs;

    WardMedicationSupplyGenerationRunService(InpatientMedicationSupplyGenerationRunRepository runs) {
        this.runs = runs;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Long ensure(RunSeed seed, Instant now) {
        String medicationType = normalizeMedicationType(seed.medicationTypeSnapshot());
        String jobKey = jobKey(seed, medicationType);
        InpatientMedicationSupplyGenerationRun existing = runs
                .lockByTenantIdAndJobKey(seed.tenantId(), jobKey).orElse(null);
        if (existing != null) {
            if (completeRoute(seed)) {
                existing.recoverRouting(seed.stockSiteId(), seed.dispenseRouteId(), seed.dispenseRouteRevision(), now);
            } else {
                existing.refreshRoutingBlock(seed.routingErrorCode(), seed.routingError(), now);
            }
            return existing.id();
        }
        return runs.saveAndFlush(new InpatientMedicationSupplyGenerationRun(
                seed.tenantId(), seed.organizationId(), seed.nursingUnitDepartmentId(), medicationType,
                seed.stockSiteId(), seed.dispenseRouteId(), seed.dispenseRouteRevision(),
                seed.businessDate(), seed.shiftCode(), seed.windowStart(), seed.windowEnd(), jobKey,
                CommandCodes.prefixed("AUTO-IPMS-", jobKey), seed.routingErrorCode(), seed.routingError(), now)).id();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public List<RunWork> claim(String workerId, Instant now) {
        List<InpatientMedicationSupplyGenerationRun> claimed = runs.lockDispatchable(now, PageRequest.of(0, 10));
        claimed.forEach(value -> value.claim(workerId, now, LEASE));
        runs.flush();
        return claimed.stream().map(value -> new RunWork(value.id(), value.tenantId(), value.organizationId(),
                value.stockSiteId(), value.nursingUnitDepartmentId(), value.dispenseRouteId(),
                value.dispenseRouteRevision(), value.medicationTypeSnapshot(), value.businessDate(), value.shiftCode(),
                value.commandCode(), value.attemptCount())).toList();
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void succeed(Long runId, String workerId, int attemptCount,
                        Long batchId, boolean noDemand, Instant now) {
        InpatientMedicationSupplyGenerationRun run = runs.lockById(runId).orElse(null);
        if (run == null) return;
        if (noDemand) run.noDemand(workerId, attemptCount, now);
        else run.succeed(workerId, attemptCount, batchId, now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void fail(Long runId, String workerId, int attemptCount, RuntimeException error, Instant now) {
        InpatientMedicationSupplyGenerationRun run = runs.lockById(runId).orElse(null);
        if (run == null) return;
        String code = error instanceof BusinessException business ? business.code()
                : "INPATIENT_SUPPLY_GENERATION_FAILED";
        run.fail(workerId, attemptCount, code, error, now);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void blockRouting(Long runId, String workerId, int attemptCount,
                             String errorCode, String errorMessage, Instant now) {
        InpatientMedicationSupplyGenerationRun run = runs.lockById(runId).orElse(null);
        if (run != null) run.blockRouting(workerId, attemptCount, errorCode, errorMessage, now);
    }

    private boolean completeRoute(RunSeed seed) {
        return seed.stockSiteId() != null && seed.dispenseRouteId() != null && seed.dispenseRouteRevision() != null;
    }

    private String normalizeMedicationType(String value) {
        return value == null || value.isBlank() ? "*" : value.trim().toUpperCase(Locale.ROOT);
    }

    private String jobKey(RunSeed seed, String medicationType) {
        return seed.organizationId() + ":" + seed.nursingUnitDepartmentId() + ":" + medicationType + ":"
                + seed.businessDate() + ":" + seed.shiftCode();
    }

    record RunSeed(Long tenantId, Long organizationId, Long nursingUnitDepartmentId,
                   String medicationTypeSnapshot, Long stockSiteId, Long dispenseRouteId,
                   Long dispenseRouteRevision, LocalDate businessDate, String shiftCode,
                   Instant windowStart, Instant windowEnd, String routingErrorCode, String routingError) {
        /** Compatibility bridge while discovery moves from route-first to demand-scope-first discovery. */
        RunSeed(Long tenantId, Long organizationId, Long stockSiteId, Long nursingUnitDepartmentId,
                Long dispenseRouteId, long dispenseRouteRevision, LocalDate businessDate,
                String shiftCode, Instant windowStart, Instant windowEnd,
                String ignoredJobKey, String ignoredCommandCode) {
            this(tenantId, organizationId, nursingUnitDepartmentId, "*", stockSiteId, dispenseRouteId,
                    dispenseRouteRevision, businessDate, shiftCode, windowStart, windowEnd, null, null);
        }
    }

    record RunWork(Long runId, Long tenantId, Long organizationId, Long stockSiteId,
                   Long nursingUnitDepartmentId, Long dispenseRouteId, Long dispenseRouteRevision,
                   String medicationTypeSnapshot, LocalDate businessDate,
                   String shiftCode, String commandCode, int attemptCount) {
    }
}
