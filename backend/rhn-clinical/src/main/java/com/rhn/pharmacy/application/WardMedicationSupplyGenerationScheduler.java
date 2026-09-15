package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.WardMedicationSupplyCandidateDirectory;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

@Service
@ConditionalOnProperty(prefix = "rhn.pharmacy.inpatient-supply.auto-generation",
        name = "scheduler-enabled", havingValue = "true", matchIfMissing = true)
public class WardMedicationSupplyGenerationScheduler {
    static final String ENABLED_KEY = "pharmacy.inpatient-supply.auto-generation.enabled";
    static final String LEAD_TIME_KEY = "pharmacy.inpatient-supply.auto-generation.lead-time";
    private static final Duration DISCOVERY_HORIZON = Duration.ofHours(16);
    private static final Logger log = LoggerFactory.getLogger(WardMedicationSupplyGenerationScheduler.class);

    private final WardMedicationSupplyCandidateDirectory candidates;
    private final DispenseRouteApplicationService routes;
    private final ConfigurationDirectory configuration;
    private final OrganizationDirectory organizations;
    private final WardMedicationSupplyGenerationRunService runService;
    private final WardMedicationSupplyApplicationService supply;
    private final String workerId;

    public WardMedicationSupplyGenerationScheduler(
            WardMedicationSupplyCandidateDirectory candidates,
            DispenseRouteApplicationService routes,
            ConfigurationDirectory configuration,
            OrganizationDirectory organizations,
            WardMedicationSupplyGenerationRunService runService,
            WardMedicationSupplyApplicationService supply,
            @Value("${rhn.instance-id}") String workerId) {
        this.candidates = candidates;
        this.routes = routes;
        this.configuration = configuration;
        this.organizations = organizations;
        this.runService = runService;
        this.supply = supply;
        this.workerId = workerId;
    }

    @Scheduled(fixedDelayString = "${rhn.pharmacy.inpatient-supply.auto-generation.poll-interval-ms:60000}")
    public void poll() {
        pollAt(Instant.now());
    }

    /** Deterministic time entry point used by integration tests and operational replay. */
    public void pollAt(Instant now) {
        discover(now);
        for (var run : runService.claim(workerId, now)) {
            try {
                var result = supply.generateAutomatically(
                        new WardMedicationSupplyApplicationService.AutomaticGenerateCommand(
                                run.tenantId(), run.organizationId(), run.stockSiteId(),
                                run.nursingUnitDepartmentId(), run.medicationTypeSnapshot(),
                                run.dispenseRouteId(), run.dispenseRouteRevision(),
                                run.businessDate(), run.shiftCode(), run.commandCode()));
                runService.succeed(run.runId(), workerId, run.attemptCount(),
                        result.batchId(), result.noDemand(), now);
            } catch (RuntimeException error) {
                runService.fail(run.runId(), workerId, run.attemptCount(), error, now);
                log.warn("Automatic inpatient supply generation failed for run {}: {}",
                        run.runId(), error.getMessage());
            }
        }
    }

    private void discover(Instant now) {
        for (var scope : candidates.discoverEligibleScopes(now, now.plus(DISCOVERY_HORIZON))) {
            try {
                if (!configuration.resolveCurrent(scope.tenantId(), null, scope.organizationId(),
                        scope.nursingUnitDepartmentId(), ENABLED_KEY).value().asBoolean(false)) continue;
                int leadMinutes = configuration.resolveCurrent(scope.tenantId(), null, scope.organizationId(),
                        scope.nursingUnitDepartmentId(), LEAD_TIME_KEY).value().asInt(120);
                ZoneId zone = organizationZone(scope.tenantId(), scope.organizationId());
                SupplyWindow target = upcomingWindow(now, zone, leadMinutes);
                if (target == null || candidates.eligibleOccurrences(scope.tenantId(), scope.organizationId(),
                        scope.nursingUnitDepartmentId(), scope.medicationTypeSnapshot(),
                        target.from(), target.to()).isEmpty()) continue;
                var resolution = routes.resolveDetailed(scope.tenantId(), scope.organizationId(),
                        scope.nursingUnitDepartmentId(), scope.medicationTypeSnapshot(),
                        "INPATIENT", target.businessDate());
                var matched = resolution.route();
                runService.ensure(new WardMedicationSupplyGenerationRunService.RunSeed(
                        scope.tenantId(), scope.organizationId(), scope.nursingUnitDepartmentId(),
                        scope.medicationTypeSnapshot(), matched == null ? null : matched.stockSiteId(),
                        matched == null ? null : matched.routeId(),
                        matched == null ? null : matched.routeRevision(), target.businessDate(),
                        target.shiftCode(), target.from(), target.to(),
                        resolution.errorCode(), resolution.errorMessage()), now);
            } catch (DataIntegrityViolationException ignored) {
                // Another application instance created the same deterministic run.
            } catch (RuntimeException error) {
                log.warn("Automatic inpatient supply discovery skipped scope {}/{}/{}: {}",
                        scope.organizationId(), scope.nursingUnitDepartmentId(),
                        scope.medicationTypeSnapshot(), error.getMessage());
            }
        }
    }

    private ZoneId organizationZone(Long tenantId, Long organizationId) {
        String code = organizations.requireOrganization(tenantId, organizationId).timezoneCode();
        return ZoneId.of(code == null || code.isBlank() ? "Asia/Shanghai" : code);
    }

    private SupplyWindow upcomingWindow(Instant now, ZoneId zone, int leadMinutes) {
        int boundedLead = Math.max(1, Math.min(480, leadMinutes));
        ZonedDateTime localNow = now.atZone(zone);
        Instant latest = now.plusSeconds(boundedLead * 60L);
        for (int dayOffset = 0; dayOffset <= 1; dayOffset++) {
            LocalDate date = localNow.toLocalDate().plusDays(dayOffset);
            for (Shift shift : List.of(
                    new Shift("NIGHT", LocalTime.MIDNIGHT),
                    new Shift("DAY", LocalTime.of(8, 0)),
                    new Shift("EVENING", LocalTime.of(16, 0)))) {
                Instant from = date.atTime(shift.start()).atZone(zone).toInstant();
                if (from.isBefore(now) || from.isAfter(latest)) continue;
                return new SupplyWindow(date, shift.code(), from, from.plusSeconds(8 * 60 * 60L));
            }
        }
        return null;
    }

    private record Shift(String code, LocalTime start) {
    }

    private record SupplyWindow(LocalDate businessDate, String shiftCode, Instant from, Instant to) {
    }
}
