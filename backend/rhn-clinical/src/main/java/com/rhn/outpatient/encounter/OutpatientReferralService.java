package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.OutpatientReferralFlowDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.outpatient.encounter.OutpatientReferralContracts.AcceptRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CancelRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CompleteRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CreateRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.RejectRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.View;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class OutpatientReferralService implements OutpatientReferralFlowDirectory {
    private static final Collection<ReferralStatus> OPEN_STATUSES =
            List.of(ReferralStatus.REQUESTED, ReferralStatus.ACCEPTED);
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final OutpatientReferralRequestRepository requests;
    private final OutpatientReferralEventRepository events;
    private final EncounterRepository encounters;
    private final EncounterDiagnosisRepository diagnoses;
    private final EncounterIdentityCheckRepository identityChecks;
    private final EncounterStatusEventRepository encounterEvents;
    private final EncounterWorkSessionRepository workSessions;
    private final EncounterCompletionService completionService;
    private final ClinicalDocumentDirectory clinicalDocuments;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;
    private final OutpatientRegistrationDirectory registrations;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher eventPublisher;

    public OutpatientReferralService(OutpatientReferralRequestRepository requests,
                                     OutpatientReferralEventRepository events,
                                     EncounterRepository encounters,
                                     EncounterDiagnosisRepository diagnoses,
                                     EncounterIdentityCheckRepository identityChecks,
                                     EncounterStatusEventRepository encounterEvents,
                                     EncounterWorkSessionRepository workSessions,
                                     EncounterCompletionService completionService,
                                     ClinicalDocumentDirectory clinicalDocuments,
                                     ResidentDirectory residents,
                                     OrganizationDirectory organizations,
                                     OutpatientRegistrationDirectory registrations,
                                     ExecutionContextProvider contextProvider,
                                     DomainEventPublisher eventPublisher) {
        this.requests = requests;
        this.events = events;
        this.encounters = encounters;
        this.diagnoses = diagnoses;
        this.identityChecks = identityChecks;
        this.encounterEvents = encounterEvents;
        this.workSessions = workSessions;
        this.completionService = completionService;
        this.clinicalDocuments = clinicalDocuments;
        this.residents = residents;
        this.organizations = organizations;
        this.registrations = registrations;
        this.contextProvider = contextProvider;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public View create(Long encounterId, CreateRequest input) {
        ExecutionContext context = requireWorkContext();
        var replay = requests.findByTenantIdAndCreateCommandCode(context.tenantId(), input.commandCode().trim());
        if (replay.isPresent()) return toView(replay.get());
        Encounter encounter = sourceEncounterWithLock(encounterId, context);
        if (encounter.status() != EncounterStatus.IN_PROGRESS) {
            throw conflict("REFERRAL_ENCOUNTER_STATE_INVALID", "只有接诊中的就诊可以发起会诊或转科");
        }
        ReferralType type = ReferralType.valueOf(input.referralType());
        ReferralUrgency urgency = ReferralUrgency.valueOf(input.urgency());
        DepartmentView targetDepartment = organizations.requireDepartment(context.tenantId(),
                input.targetOrganizationId(), input.targetDepartmentId());
        if (encounter.organizationId().equals(input.targetOrganizationId())
                && encounter.departmentId().equals(input.targetDepartmentId())) {
            throw conflict("REFERRAL_TARGET_SAME_DEPARTMENT", "目标科室不能与当前接诊科室相同");
        }
        if (!"ACTIVE".equals(targetDepartment.sdOrgStatus())) {
            throw conflict("REFERRAL_TARGET_DEPARTMENT_INACTIVE", "目标科室当前不可用");
        }
        if (input.targetPractitionerId() != null) {
            organizations.requireStaff(context.tenantId(), input.targetPractitionerId());
        }
        if (requests.existsByTenantIdAndEncounterIdAndReferralTypeAndStatusIn(
                context.tenantId(), encounterId, type, OPEN_STATUSES)) {
            throw conflict("REFERRAL_ACTIVE_DUPLICATE", "本次就诊已有同类型的待处理协同请求");
        }
        if (type == ReferralType.DEPARTMENT_TRANSFER) {
            if (!"CLINICAL".equals(targetDepartment.sdDepartmentProperty())) {
                throw conflict("TRANSFER_TARGET_NOT_CLINICAL", "院内转科只能转入有效的临床科室");
            }
            requireTransferReady(encounter);
            if (requests.existsByTenantIdAndEncounterIdAndReferralTypeAndStatusIn(
                    context.tenantId(), encounterId, ReferralType.INTERNAL_CONSULT, OPEN_STATUSES)) {
                throw conflict("TRANSFER_CONSULTATION_PENDING", "请先完成或撤销当前会诊，再发起转科");
            }
        }
        OutpatientReferralRequest request = requests.saveAndFlush(new OutpatientReferralRequest(
                context.tenantId(), encounter, type, input.targetOrganizationId(), input.targetDepartmentId(),
                input.targetPractitionerId(), urgency, input.referralReason().trim(),
                input.clinicalSummary().trim(), input.expectedAt(), actorId(context), input.commandCode().trim()));
        events.save(new OutpatientReferralEvent(request, null, "CREATE", input.commandCode().trim(),
                actorId(context), input.referralReason().trim()));
        if (type == ReferralType.DEPARTMENT_TRANSFER) {
            long expectedRevision = encounter.version();
            encounterEvents.save(new EncounterStatusEvent(encounter, EncounterStatus.IN_PROGRESS.name(),
                    EncounterStatus.SUSPENDED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                    input.commandCode().trim(), "等待目标科室接收转科请求 " + request.requestNo()));
            workSessions.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
                    encounter.tenantId(), encounter.id(), "ACTIVE").ifPresent(session -> session.close("SUSPENDED"));
            encounter.suspend();
            registrations.markSuspended(encounter.id(), input.commandCode().trim(),
                    "等待转入 " + targetDepartment.name());
            encounters.flush();
        }
        publish(encounter, "OUTPATIENT_REFERRAL_REQUESTED",
                type == ReferralType.INTERNAL_CONSULT ? "发起院内会诊" : "发起院内转科",
                Map.of("referralRequestId", request.id(), "requestNo", request.requestNo(),
                        "referralType", type.name(), "targetDepartmentId", targetDepartment.id(),
                        "targetDepartmentName", targetDepartment.name(), "urgency", urgency.name()));
        return toView(request);
    }

    @Transactional(readOnly = true)
    public List<View> byEncounter(Long encounterId) {
        ExecutionContext context = requireWorkContext();
        sourceEncounter(encounterId, context);
        return requests.findByTenantIdAndEncounterIdOrderByRequestedAtDesc(context.tenantId(), encounterId)
                .stream().map(this::toView).toList();
    }

    @Transactional(readOnly = true)
    public List<View> inbox() {
        ExecutionContext context = requireWorkContext();
        return requests.findByTenantIdAndTargetOrganizationIdAndTargetDepartmentIdAndStatusInOrderByRequestedAtAsc(
                        context.tenantId(), context.organizationId(), context.departmentId(), OPEN_STATUSES)
                .stream().map(this::toView).toList();
    }

    @Transactional
    public View accept(Long requestId, AcceptRequest input) {
        ExecutionContext context = requireWorkContext();
        OutpatientReferralRequest request = targetRequestWithLock(requestId, context);
        if (events.existsByTenantIdAndReferralRequestIdAndCommandCode(
                context.tenantId(), requestId, input.commandCode().trim())) return toView(request);
        String previous = request.status().name();
        request.accept(actorId(context));
        events.save(new OutpatientReferralEvent(request, previous, "ACCEPT", input.commandCode().trim(),
                actorId(context), "目标科室接收"));
        if (request.referralType() == ReferralType.DEPARTMENT_TRANSFER) {
            completeInternalTransfer(request, context, input.commandCode().trim());
        }
        return toView(requests.saveAndFlush(request));
    }

    @Transactional
    public View complete(Long requestId, CompleteRequest input) {
        ExecutionContext context = requireWorkContext();
        OutpatientReferralRequest request = targetRequestWithLock(requestId, context);
        if (events.existsByTenantIdAndReferralRequestIdAndCommandCode(
                context.tenantId(), requestId, input.commandCode().trim())) return toView(request);
        String previous = request.status().name();
        request.completeConsultation(input.opinion().trim(), actorId(context));
        events.save(new OutpatientReferralEvent(request, previous, "COMPLETE", input.commandCode().trim(),
                actorId(context), "完成会诊意见"));
        publish(sourceEncounter(request.encounterId()), "OUTPATIENT_CONSULTATION_COMPLETED", "院内会诊完成",
                Map.of("referralRequestId", request.id(), "requestNo", request.requestNo(),
                        "targetDepartmentId", request.targetDepartmentId()));
        return toView(requests.saveAndFlush(request));
    }

    @Transactional
    public View reject(Long requestId, RejectRequest input) {
        ExecutionContext context = requireWorkContext();
        OutpatientReferralRequest request = targetRequestWithLock(requestId, context);
        if (events.existsByTenantIdAndReferralRequestIdAndCommandCode(
                context.tenantId(), requestId, input.commandCode().trim())) return toView(request);
        String previous = request.status().name();
        request.reject(input.reason().trim(), actorId(context));
        events.save(new OutpatientReferralEvent(request, previous, "REJECT", input.commandCode().trim(),
                actorId(context), input.reason().trim()));
        publish(sourceEncounter(request.encounterId()), "OUTPATIENT_REFERRAL_REJECTED", "协同请求被退回",
                Map.of("referralRequestId", request.id(), "requestNo", request.requestNo(),
                        "reason", input.reason().trim()));
        return toView(requests.saveAndFlush(request));
    }

    @Transactional
    public View cancel(Long requestId, CancelRequest input) {
        ExecutionContext context = requireWorkContext();
        OutpatientReferralRequest request = requestWithLock(requestId, context.tenantId());
        sourceEncounter(request.encounterId(), context);
        if (events.existsByTenantIdAndReferralRequestIdAndCommandCode(
                context.tenantId(), requestId, input.commandCode().trim())) return toView(request);
        String previous = request.status().name();
        request.cancel(input.reason().trim(), actorId(context));
        events.save(new OutpatientReferralEvent(request, previous, "CANCEL", input.commandCode().trim(),
                actorId(context), input.reason().trim()));
        return toView(requests.saveAndFlush(request));
    }

    @Transactional(readOnly = true)
    void requireNoOpenConsultation(Long tenantId, Long encounterId) {
        if (requests.existsByTenantIdAndEncounterIdAndReferralTypeAndStatusIn(
                tenantId, encounterId, ReferralType.INTERNAL_CONSULT, OPEN_STATUSES)) {
            throw conflict("ENCOUNTER_CONSULTATION_PENDING", "本次就诊仍有待处理会诊，请先完成或撤销会诊");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Map<Long, ReferralFlowSnapshot> summarize(Long tenantId, List<Long> encounterIds) {
        if (encounterIds.isEmpty()) return Map.of();
        Map<Long, List<OutpatientReferralRequest>> grouped = new LinkedHashMap<>();
        for (OutpatientReferralRequest request : requests.findByTenantIdAndEncounterIdIn(tenantId, encounterIds)) {
            grouped.computeIfAbsent(request.encounterId(), ignored -> new ArrayList<>()).add(request);
        }
        Map<Long, ReferralFlowSnapshot> result = new LinkedHashMap<>();
        grouped.forEach((encounterId, values) -> {
            List<OutpatientReferralRequest> ordered = values.stream()
                    .sorted(Comparator.comparing(OutpatientReferralRequest::requestedAt).reversed()).toList();
            OutpatientReferralRequest active = ordered.stream()
                    .filter(value -> OPEN_STATUSES.contains(value.status())).findFirst().orElse(null);
            OutpatientReferralRequest latest = ordered.get(0);
            int completed = (int) ordered.stream().filter(value -> value.status() == ReferralStatus.COMPLETED).count();
            result.put(encounterId, new ReferralFlowSnapshot(ordered.size(),
                    (int) ordered.stream().filter(value -> OPEN_STATUSES.contains(value.status())).count(), completed,
                    active == null ? null : active.referralType().name(),
                    active == null ? null : active.status().name(),
                    organizations.requireDepartment(tenantId,
                            latest.targetOrganizationId(), latest.targetDepartmentId()).name(),
                    active == null ? null : active.requestedAt(),
                    ordered.stream().map(OutpatientReferralRequest::targetEncounterId)
                            .filter(java.util.Objects::nonNull).findFirst().orElse(null)));
        });
        return Map.copyOf(result);
    }

    private void completeInternalTransfer(OutpatientReferralRequest request, ExecutionContext context,
                                          String commandCode) {
        Encounter source = encounters.findWithLockByIdAndTenantId(request.encounterId(), context.tenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到转科来源就诊"));
        if (source.status() != EncounterStatus.SUSPENDED) {
            throw conflict("TRANSFER_SOURCE_STATE_INVALID", "转科来源就诊必须处于等待接收状态");
        }
        encounters.findFirstByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                        context.tenantId(), source.residentId(), request.targetOrganizationId(),
                        request.targetDepartmentId(), List.of(EncounterStatus.REGISTERED, EncounterStatus.IN_PROGRESS,
                                EncounterStatus.SUSPENDED))
                .ifPresent(value -> { throw conflict("TRANSFER_TARGET_ENCOUNTER_DUPLICATE",
                        "患者在目标科室已有进行中的就诊"); });
        Encounter target = encounters.saveAndFlush(new Encounter(context.tenantId(), source.residentId(),
                nextEncounterNo(), request.targetOrganizationId(), request.targetDepartmentId()));
        OutpatientRegistrationDirectory.RegistrationSnapshot registration = registrations.register(
                new OutpatientRegistrationDirectory.RegisterCommand(source.residentId(), target.id(),
                        request.targetOrganizationId(), request.targetDepartmentId(), null, null, null,
                        "TRANSFER-" + request.id(), "TRANSFER", "TRANSFER"));
        target.bindRegistration(registration.registrationId(), null, null, "TRANSFER", "TRANSFER");
        encounterEvents.save(new EncounterStatusEvent(target, null, EncounterStatus.REGISTERED.name(),
                target.version(), context.practitionerId(), context.subjectId(), commandCode,
                "接收转科请求 " + request.requestNo() + " 并创建目标就诊"));
        long expectedRevision = source.version();
        source.transfer();
        encounterEvents.save(new EncounterStatusEvent(source, EncounterStatus.SUSPENDED.name(),
                EncounterStatus.TRANSFERRED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, "目标科室已接收，目标就诊=" + target.id()));
        registrations.markTransferred(source.id(), commandCode, "目标科室已接收转科");
        request.completeTransfer(registration.registrationId(), target.id(), actorId(context));
        events.save(new OutpatientReferralEvent(request, ReferralStatus.ACCEPTED.name(), "COMPLETE",
                derivedCommand(commandCode), actorId(context), "生成目标科室就诊 " + target.encounterNo()));
        encounters.flush();
        publish(source, "OUTPATIENT_DEPARTMENT_TRANSFERRED", "院内转科已接收",
                Map.of("referralRequestId", request.id(), "targetEncounterId", target.id(),
                        "targetDepartmentId", target.departmentId()));
        publish(target, "OUTPATIENT_TRANSFER_ENCOUNTER_REGISTERED", "转科连续就诊已创建",
                Map.of("referralRequestId", request.id(), "sourceEncounterId", source.id()));
    }

    private void requireTransferReady(Encounter encounter) {
        boolean signed = true;
        try {
            clinicalDocuments.requireSignedEncounterDocument(encounter.id(), "OUTPATIENT_NOTE");
        } catch (BusinessException exception) {
            signed = false;
        }
        boolean identityChecked = identityChecks.existsByTenantIdAndEncounterIdAndResult(
                encounter.tenantId(), encounter.id(), "PASS");
        boolean primaryDiagnosis = diagnoses
                .findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        encounter.tenantId(), encounter.id(), "ENCOUNTER", "ACTIVE").stream()
                .anyMatch(value -> value.diagnosisType() == EncounterDiagnosis.DiagnosisType.PRIMARY);
        var decision = completionService.evaluate(encounter, identityChecked, signed, primaryDiagnosis);
        if (!decision.passed()) {
            throw conflict("ENCOUNTER_TRANSFER_BLOCKED", decision.issues().stream()
                    .map(EncounterCompletionService.CompletionIssue::description)
                    .collect(java.util.stream.Collectors.joining("；")));
        }
    }

    private Encounter sourceEncounter(Long encounterId, ExecutionContext context) {
        Encounter encounter = sourceEncounter(encounterId);
        if (!context.organizationId().equals(encounter.organizationId())
                || !context.departmentId().equals(encounter.departmentId())) {
            throw forbidden("REFERRAL_SOURCE_CONTEXT_FORBIDDEN", "请切换到来源接诊科室处理该协同请求");
        }
        return encounter;
    }

    private Encounter sourceEncounter(Long encounterId) {
        return encounters.findByIdAndTenantId(encounterId, contextProvider.requireCurrent().tenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到协同请求关联的就诊"));
    }

    private Encounter sourceEncounterWithLock(Long encounterId, ExecutionContext context) {
        Encounter encounter = encounters.findWithLockByIdAndTenantId(encounterId, context.tenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到协同请求关联的就诊"));
        if (!context.organizationId().equals(encounter.organizationId())
                || !context.departmentId().equals(encounter.departmentId())) {
            throw forbidden("REFERRAL_SOURCE_CONTEXT_FORBIDDEN", "请切换到来源接诊科室处理该协同请求");
        }
        return encounter;
    }

    private OutpatientReferralRequest targetRequestWithLock(Long requestId, ExecutionContext context) {
        OutpatientReferralRequest request = requestWithLock(requestId, context.tenantId());
        if (!context.organizationId().equals(request.targetOrganizationId())
                || !context.departmentId().equals(request.targetDepartmentId())) {
            throw forbidden("REFERRAL_TARGET_CONTEXT_FORBIDDEN", "请切换到目标科室处理该协同请求");
        }
        return request;
    }

    private OutpatientReferralRequest requestWithLock(Long requestId, Long tenantId) {
        return requests.findWithLockByIdAndTenantId(requestId, tenantId)
                .orElseThrow(() -> notFound("REFERRAL_REQUEST_NOT_FOUND", "未找到协同请求"));
    }

    private View toView(OutpatientReferralRequest request) {
        Encounter source = encounters.findByIdAndTenantId(request.encounterId(), request.tenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到协同请求关联的就诊"));
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(request.residentId());
        OrganizationView sourceOrganization = organizations.requireOrganization(
                request.tenantId(), source.organizationId());
        DepartmentView sourceDepartment = organizations.requireDepartment(
                request.tenantId(), source.organizationId(), source.departmentId());
        OrganizationView targetOrganization = organizations.requireOrganization(
                request.tenantId(), request.targetOrganizationId());
        DepartmentView targetDepartment = organizations.requireDepartment(
                request.tenantId(), request.targetOrganizationId(), request.targetDepartmentId());
        return new View(request.id(), request.revision(), request.requestNo(), request.encounterId(),
                source.encounterNo(), source.status().name(), request.residentId(), resident.fullName(),
                resident.healthRecordNo(), source.organizationId(), sourceOrganization.name(), source.departmentId(),
                sourceDepartment.name(), request.referralType().name(), request.targetOrganizationId(),
                targetOrganization.name(), request.targetDepartmentId(), targetDepartment.name(),
                request.targetPractitionerId(), request.urgency().name(), request.referralReason(),
                request.clinicalSummary(), request.expectedAt(), request.status().name(),
                request.targetRegistrationId(), request.targetEncounterId(), request.requestedBy(),
                request.requestedAt(), request.acceptedBy(), request.acceptedAt(), request.completedBy(),
                request.completedAt(), request.outcomeText(), request.rejectionReason());
    }

    private ExecutionContext requireWorkContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw conflict("REFERRAL_WORK_CONTEXT_REQUIRED", "请先选择门诊机构和科室");
        }
        return context;
    }

    private Long actorId(ExecutionContext context) {
        return context.practitionerId() == null ? context.subjectId() : context.practitionerId();
    }

    private String derivedCommand(String commandCode) {
        String suffix = "-TRANSFERRED";
        return commandCode.length() + suffix.length() <= 128
                ? commandCode + suffix : commandCode.substring(0, 128 - suffix.length()) + suffix;
    }

    private String nextEncounterNo() {
        return "OP" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }

    private void publish(Encounter encounter, String type, String summary, Map<String, Object> payload) {
        Map<String, Object> details = new LinkedHashMap<>(payload);
        details.put("encounterNo", encounter.encounterNo());
        details.put("summary", summary);
        eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), type, 1,
                "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(), details);
    }
}
