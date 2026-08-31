package com.rhn.outpatient.encounter;

import com.rhn.outpatient.api.OutpatientEncounterTerminationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class EncounterTerminationService implements OutpatientEncounterTerminationDirectory {
    private final EncounterRepository encounters;
    private final EncounterStatusEventRepository statusEvents;
    private final EncounterWorkSessionRepository workSessions;
    private final OutpatientRegistrationDirectory registrations;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider contextProvider;

    public EncounterTerminationService(EncounterRepository encounters,
                                       EncounterStatusEventRepository statusEvents,
                                       EncounterWorkSessionRepository workSessions,
                                       OutpatientRegistrationDirectory registrations,
                                       DomainEventPublisher eventPublisher,
                                       ExecutionContextProvider contextProvider) {
        this.encounters = encounters;
        this.statusEvents = statusEvents;
        this.workSessions = workSessions;
        this.registrations = registrations;
        this.eventPublisher = eventPublisher;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public TerminationSnapshot requireCandidate(Long encounterId) {
        return snapshot(requireAccessible(encounterId, false));
    }

    @Override
    @Transactional
    public TerminationSnapshot terminate(TerminationCommand command) {
        Encounter encounter = requireAccessible(command.encounterId(), true);
        if (encounter.status() == EncounterStatus.TERMINATED) return snapshot(encounter);
        ExecutionContext context = contextProvider.requireCurrent();
        long expectedRevision = encounter.version();
        String reason = command.reason().trim();
        String code = command.terminationCode().trim();
        statusEvents.save(new EncounterStatusEvent(encounter, encounter.status().name(),
                EncounterStatus.TERMINATED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                command.commandCode().trim(), code + "：" + reason));
        workSessions.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
                encounter.tenantId(), encounter.id(), "ACTIVE").ifPresent(session -> session.close("TERMINATED"));
        registrations.markTerminated(encounter.id(), command.commandCode().trim(), reason);
        encounter.terminate(code, reason, context.subjectId());
        encounters.flush();
        eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), "ENCOUNTER_TERMINATED", 1,
                "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(),
                Map.of("encounterNo", encounter.encounterNo(), "terminationCode", code, "reason", reason));
        return snapshot(encounter);
    }

    private Encounter requireAccessible(Long encounterId, boolean lock) {
        Long tenantId = TenantContext.requireTenantId();
        Encounter encounter = (lock
                ? encounters.findWithLockByIdAndTenantId(encounterId, tenantId)
                : encounters.findByIdAndTenantId(encounterId, tenantId))
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.hasWorkContext() && (!context.canAccessOrganization(encounter.organizationId())
                || !context.canAccessDepartment(encounter.departmentId()))) {
            throw forbidden("ENCOUNTER_FORBIDDEN", "无权处理当前工作上下文之外的就诊");
        }
        return encounter;
    }

    private TerminationSnapshot snapshot(Encounter encounter) {
        return new TerminationSnapshot(encounter.id(), encounter.tenantId(), encounter.organizationId(),
                encounter.departmentId(), encounter.residentId(), encounter.encounterNo(), encounter.status().name(),
                encounter.terminationCode(), encounter.terminationReason(), encounter.terminatedAt());
    }
}
