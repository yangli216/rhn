package com.rhn.outpatient.encounter;

import com.rhn.outpatient.api.OutpatientEncounterCancellationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class EncounterCancellationService implements OutpatientEncounterCancellationDirectory {
    private final EncounterRepository encounters;
    private final EncounterStatusEventRepository statusEvents;
    private final OutpatientRegistrationDirectory registrations;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;

    public EncounterCancellationService(EncounterRepository encounters,
                                        EncounterStatusEventRepository statusEvents,
                                        OutpatientRegistrationDirectory registrations,
                                        DomainEventPublisher eventPublisher,
                                        ExecutionContextProvider contextProvider) {
        this.encounters = encounters;
        this.statusEvents = statusEvents;
        this.registrations = registrations;
        this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional
    public CancellationSnapshot prepare(Long encounterId) {
        Encounter encounter = requireAccessible(encounterId);
        requireWithdrawable(encounter);
        return snapshot(encounter, registrations.requireCancellationReady(encounterId));
    }

    @Override
    @Transactional
    public CancellationSnapshot cancelBeforeService(Long encounterId, String commandCode, String reason) {
        Encounter encounter = requireAccessible(encounterId);
        requireWithdrawable(encounter);
        ExecutionContext context = contextProvider.requireCurrent();
        String normalizedCommandCode = commandCode.trim();
        String normalizedReason = reason.trim();
        OutpatientRegistrationDirectory.CancellationSnapshot closed = registrations.cancelBeforeService(
                encounterId, normalizedCommandCode, normalizedReason);
        if (encounter.status() != EncounterStatus.CANCELLED) {
            long expectedRevision = encounter.version();
            statusEvents.save(new EncounterStatusEvent(encounter, EncounterStatus.REGISTERED.name(),
                    EncounterStatus.CANCELLED.name(), expectedRevision, context.practitionerId(),
                    context.subjectId(), normalizedCommandCode, normalizedReason));
            encounter.cancelBeforeService();
            encounters.flush();
            eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), "OUTPATIENT_REGISTRATION_CANCELLED",
                    1, "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(),
                    Map.of("encounterNo", encounter.encounterNo(), "reason", normalizedReason,
                            "registrationId", closed.registrationId()));
        }
        return snapshot(encounter, closed);
    }

    private Encounter requireAccessible(Long encounterId) {
        Encounter encounter = encounters.findWithLockByIdAndTenantId(encounterId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.hasWorkContext() && (!context.canAccessOrganization(encounter.organizationId())
                || !context.canAccessDepartment(encounter.departmentId()))) {
            throw forbidden("ENCOUNTER_FORBIDDEN", "无权处理当前工作上下文之外的就诊");
        }
        return encounter;
    }

    private void requireWithdrawable(Encounter encounter) {
        if (!(encounter.status() == EncounterStatus.REGISTERED
                || encounter.status() == EncounterStatus.CANCELLED)) {
            throw conflict("ENCOUNTER_ALREADY_IN_SERVICE", "该就诊已经开始接诊，不能退号");
        }
    }

    private CancellationSnapshot snapshot(Encounter encounter,
                                          OutpatientRegistrationDirectory.CancellationSnapshot registration) {
        return new CancellationSnapshot(encounter.id(), encounter.tenantId(), encounter.organizationId(),
                encounter.departmentId(), encounter.residentId(), encounter.encounterNo(), encounter.status().name(),
                registration.registrationId(), registration.registrationStatus(), registration.queueStatus(),
                registration.appointmentStatus());
    }
}
