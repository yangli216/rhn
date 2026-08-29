package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ClinicalObservationDirectory;
import com.rhn.healthplanning.api.HypertensionCareDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class EncounterService implements EncounterDirectory {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final EncounterRepository encounterRepository;
    private final EncounterDiagnosisRepository diagnosisRepository;
    private final EncounterDiagnosisRevisionRepository diagnosisRevisionRepository;
    private final EncounterIdentityCheckRepository identityCheckRepository;
    private final EncounterStatusEventRepository statusEventRepository;
    private final EncounterWorkSessionRepository workSessionRepository;
    private final EncounterCompletionService completionService;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final OutpatientRegistrationDirectory registrationDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final ClinicalObservationDirectory clinicalObservationDirectory;
    private final HypertensionCareDirectory hypertensionCareDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider executionContextProvider;
    private final JsonCodec jsonCodec;

    public EncounterService(EncounterRepository encounterRepository,
                            EncounterDiagnosisRepository diagnosisRepository,
                            EncounterDiagnosisRevisionRepository diagnosisRevisionRepository,
                            EncounterIdentityCheckRepository identityCheckRepository,
                            EncounterStatusEventRepository statusEventRepository,
                            EncounterWorkSessionRepository workSessionRepository,
                            EncounterCompletionService completionService,
                            ResidentDirectory residentDirectory,
                            OrganizationDirectory organizationDirectory,
                            OutpatientRegistrationDirectory registrationDirectory,
                            ClinicalDocumentDirectory clinicalDocumentDirectory,
                            ClinicalObservationDirectory clinicalObservationDirectory,
                            HypertensionCareDirectory hypertensionCareDirectory,
                            DomainEventPublisher eventPublisher,
                            ExecutionContextProvider executionContextProvider,
                            JsonCodec jsonCodec) {
        this.encounterRepository = encounterRepository;
        this.diagnosisRepository = diagnosisRepository;
        this.diagnosisRevisionRepository = diagnosisRevisionRepository;
        this.identityCheckRepository = identityCheckRepository;
        this.statusEventRepository = statusEventRepository;
        this.workSessionRepository = workSessionRepository;
        this.completionService = completionService;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.registrationDirectory = registrationDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.clinicalObservationDirectory = clinicalObservationDirectory;
        this.hypertensionCareDirectory = hypertensionCareDirectory;
        this.eventPublisher = eventPublisher;
        this.executionContextProvider = executionContextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    public EncounterResponse register(RegisterEncounterRequest request) {
        String idempotencyCode = request.idempotencyCode() == null || request.idempotencyCode().isBlank()
                ? "REG-" + com.rhn.shared.id.GlobalIds.next() : request.idempotencyCode().trim();
        var replay = registrationDirectory.findByIdempotency(idempotencyCode);
        if (replay.isPresent()) return get(replay.get().encounterId());
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshotForUpdate(request.residentId());
        Long residentId = resident.id();
        replay = registrationDirectory.findByIdempotency(idempotencyCode);
        if (replay.isPresent()) return get(replay.get().encounterId());
        if (resident.deceased()) {
            throw conflict("RESIDENT_DECEASED", "已登记死亡的居民不能发起普通门诊挂号");
        }
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (context.hasWorkContext() && (!context.canAccessOrganization(request.organizationId())
                || !context.canAccessDepartment(request.departmentId()))) {
            throw forbidden("ENCOUNTER_CONTEXT_FORBIDDEN", "不能在当前机构或科室之外发起接诊");
        }
        organizationDirectory.requireDepartment(tenantId, request.organizationId(), request.departmentId());
        encounterRepository.findFirstByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                        tenantId, residentId, request.organizationId(), request.departmentId(),
                        java.util.List.of(EncounterStatus.REGISTERED, EncounterStatus.IN_PROGRESS))
                .ifPresent(value -> { throw conflict("ENCOUNTER_ACTIVE_DUPLICATE", "该居民在当前科室已有进行中的就诊"); });
        Encounter encounter = encounterRepository.saveAndFlush(new Encounter(tenantId, residentId,
                nextEncounterNo(), request.organizationId(), request.departmentId()));
        OutpatientRegistrationDirectory.RegistrationSnapshot registration = registrationDirectory.register(
                new OutpatientRegistrationDirectory.RegisterCommand(residentId, encounter.id(),
                        request.organizationId(), request.departmentId(), request.scheduleId(), request.slotHoldId(), idempotencyCode,
                        request.registrationSource(), request.visitType()));
        String source = request.registrationSource() == null || request.registrationSource().isBlank()
                ? (registration.scheduleId() == null ? "DIRECT" : "WINDOW") : request.registrationSource();
        String visitType = request.visitType() == null || request.visitType().isBlank() ? "GENERAL" : request.visitType();
        encounter.bindRegistration(registration.registrationId(), registration.scheduleId(),
                registration.appointmentId(), source, visitType);
        statusEventRepository.save(new EncounterStatusEvent(encounter, null, EncounterStatus.REGISTERED.name(),
                encounter.version(), context.practitionerId(), context.subjectId(), idempotencyCode,
                "门诊挂号创建就诊"));
        encounterRepository.flush();
        publish(encounter, "OUTPATIENT_REGISTERED", "门诊挂号", Map.of(
                "encounterNo", encounter.encounterNo(),
                "registrationNo", registration.registrationNo(),
                "ticketNo", registration.ticketNo(),
                "organizationId", encounter.organizationId(),
                "departmentId", encounter.departmentId()));
        return toResponse(encounter);
    }

    @Override
    @Transactional
    public EncounterSnapshot completeRegistration(RegistrationCompletionCommand command) {
        EncounterResponse value = register(new RegisterEncounterRequest(command.residentId(), command.organizationId(),
                command.departmentId(), command.scheduleId(), command.slotHoldId(), command.idempotencyCode(),
                command.registrationSource(), command.visitType()));
        return new EncounterSnapshot(value.id(), TenantContext.requireTenantId(), value.residentId(),
                value.organizationId(), value.departmentId(), value.encounterNo(), value.clinicianId(),
                value.status().name());
    }

    @Transactional
    public EncounterResponse start(Long encounterId, StartEncounterRequest request) {
        Encounter encounter = requireEncounter(encounterId);
        ExecutionContext context = executionContextProvider.requireCurrent();
        Map<String, Boolean> factors = Map.copyOf(request.factorResults());
        if (factors.isEmpty() || factors.values().stream().anyMatch(value -> !Boolean.TRUE.equals(value))) {
            throw badRequest("ENCOUNTER_IDENTITY_CHECK_FAILED", "开始接诊前必须完成患者身份核验");
        }
        if (!(Boolean.TRUE.equals(factors.get("NAME"))
                && factors.entrySet().stream().anyMatch(entry -> !"NAME".equals(entry.getKey())
                && Boolean.TRUE.equals(entry.getValue())))) {
            throw badRequest("ENCOUNTER_IDENTITY_FACTOR_INSUFFICIENT", "请核对患者姓名和至少一项附加身份因子");
        }
        long expectedRevision = encounter.version();
        String commandCode = request.commandCode() == null || request.commandCode().isBlank()
                ? "START-" + encounterId + "-" + expectedRevision : request.commandCode().trim();
        String terminalCode = request.terminalCode();
        identityCheckRepository.save(new EncounterIdentityCheck(encounter.tenantId(), encounter.residentId(),
                encounter.id(), jsonCodec.write(factors), context.practitionerId(), context.subjectId(),
                terminalCode, commandCode));
        statusEventRepository.save(new EncounterStatusEvent(encounter, EncounterStatus.REGISTERED.name(),
                EncounterStatus.IN_PROGRESS.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, "身份核验通过并开始接诊"));
        workSessionRepository.save(new EncounterWorkSession(encounter.tenantId(), encounter.id(),
                context.practitionerId(), context.subjectId(), terminalCode));
        encounter.start(context.actor());
        registrationDirectory.markInService(encounterId, commandCode);
        encounterRepository.flush();
        publish(encounter, "ENCOUNTER_STARTED", "开始门诊接诊", Map.of("clinician", context.actor()));
        return toResponse(encounter);
    }

    @Transactional
    public EncounterResponse recordClinicalData(Long encounterId, RecordClinicalDataRequest request) {
        Encounter encounter = requireEncounter(encounterId);
        encounter.recordClinicalData(request.chiefComplaint().trim(), request.systolic(), request.diastolic());

        Long tenantId = TenantContext.requireTenantId();
        validateDiagnoses(request);
        ExecutionContext context = executionContextProvider.requireCurrent();
        List<EncounterDiagnosis> existing = diagnosisRepository
                .findByTenantIdAndEncounterIdOrderByRecordedAt(tenantId, encounterId);
        Map<String, EncounterDiagnosis> byCode = existing.stream().collect(Collectors.toMap(
                EncounterDiagnosis::code, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Set<String> incomingCodes = new LinkedHashSet<>();
        List<EncounterDiagnosisRevision> revisions = new java.util.ArrayList<>();
        for (RecordClinicalDataRequest.DiagnosisInput input : request.diagnoses()) {
            String code = input.code().trim();
            incomingCodes.add(code);
            EncounterDiagnosis diagnosis = byCode.get(code);
            String changeType;
            if (diagnosis == null) {
                diagnosis = diagnosisRepository.save(new EncounterDiagnosis(tenantId, encounterId, code,
                        input.display().trim(), input.type(), context.subjectId()));
                changeType = "ADDED";
            } else {
                changeType = "ACTIVE".equals(diagnosis.diagnosisStatus()) ? "UPDATED" : "RESTORED";
                diagnosis.revise(input.display().trim(), input.type(), context.subjectId());
            }
            revisions.add(new EncounterDiagnosisRevision(diagnosis, changeType, "门诊病历保存",
                    context.practitionerId(), context.subjectId()));
        }
        for (EncounterDiagnosis diagnosis : existing) {
            if ("ACTIVE".equals(diagnosis.diagnosisStatus()) && !incomingCodes.contains(diagnosis.code())) {
                diagnosis.exclude(context.subjectId());
                revisions.add(new EncounterDiagnosisRevision(diagnosis, "EXCLUDED", "本次病历已移除该诊断",
                        context.practitionerId(), context.subjectId()));
            }
        }
        diagnosisRepository.flush();
        diagnosisRevisionRepository.saveAll(revisions);
        diagnosisRevisionRepository.flush();
        List<EncounterDiagnosis> diagnoses = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStatusOrderByRecordedAt(tenantId, encounterId, "ACTIVE");

        Map<String, Object> noteContent = new LinkedHashMap<>();
        noteContent.put("encounterNo", encounter.encounterNo());
        noteContent.put("chiefComplaint", request.chiefComplaint().trim());
        noteContent.put("presentIllness", clinicalText(request.presentIllness()));
        noteContent.put("medicalHistory", clinicalText(request.medicalHistory()));
        noteContent.put("physicalExam", clinicalText(request.physicalExam()));
        noteContent.put("treatmentPlan", clinicalText(request.treatmentPlan()));
        Map<String, Object> vitalSigns = new LinkedHashMap<>();
        vitalSigns.put("systolic", request.systolic());
        vitalSigns.put("diastolic", request.diastolic());
        if (request.temperature() != null) vitalSigns.put("temperature", request.temperature());
        if (request.pulseRate() != null) vitalSigns.put("pulseRate", request.pulseRate());
        if (request.respiratoryRate() != null) vitalSigns.put("respiratoryRate", request.respiratoryRate());
        if (request.heightCm() != null) vitalSigns.put("heightCm", request.heightCm());
        if (request.weightKg() != null) vitalSigns.put("weightKg", request.weightKg());
        if (request.oxygenSaturation() != null) vitalSigns.put("oxygenSaturation", request.oxygenSaturation());
        noteContent.put("vitalSigns", vitalSigns);
        noteContent.put("diagnoses", diagnoses.stream().map(diagnosis -> Map.of(
                "code", diagnosis.code(), "display", diagnosis.display(),
                "type", diagnosis.diagnosisType().name())).toList());
        clinicalDocumentDirectory.upsertEncounterDraft(encounter.residentId(), encounter.id(),
                encounter.organizationId(), encounter.departmentId(), "OUTPATIENT_NOTE", "门诊病历",
                "RHN.OUTPATIENT_NOTE.V2", noteContent,
                "门诊接诊记录更新");
        encounterRepository.flush();
        Instant measuredAt = Instant.now();
        ClinicalObservationDirectory.BloodPressureEvidence bloodPressure = clinicalObservationDirectory
                .recordBloodPressure(new ClinicalObservationDirectory.BloodPressureCommand(tenantId,
                        encounter.residentId(), encounter.id(), request.systolic(), request.diastolic(), measuredAt,
                        context.practitionerId(), context.actor()));
        HypertensionCareDirectory.ScreeningOutcome screening = hypertensionCareDirectory.evaluateBloodPressure(
                new HypertensionCareDirectory.ScreeningCommand(tenantId, encounter.residentId(), encounter.id(),
                        encounter.organizationId(), encounter.departmentId(), bloodPressure.systolicObservationId(),
                        bloodPressure.diastolicObservationId(), bloodPressure.systolic(), bloodPressure.diastolic(),
                        bloodPressure.unitCode(), bloodPressure.effectiveAt()));

        Map<String, Object> vitalPayload = new LinkedHashMap<>();
        vitalPayload.put("systolic", request.systolic());
        vitalPayload.put("diastolic", request.diastolic());
        vitalPayload.put("systolicObservationId", bloodPressure.systolicObservationId());
        vitalPayload.put("diastolicObservationId", bloodPressure.diastolicObservationId());
        vitalPayload.put("unit", bloodPressure.unitCode());
        vitalPayload.put("measuredAt", bloodPressure.effectiveAt().toString());
        vitalPayload.put("hypertensionScreeningDecision", screening.decision());
        if (screening.conditionId() != null) vitalPayload.put("conditionId", screening.conditionId());
        if (screening.careTaskId() != null) vitalPayload.put("careTaskId", screening.careTaskId());
        publish(encounter, "VITAL_SIGNS_RECORDED",
                "血压 " + request.systolic() + "/" + request.diastolic() + " mmHg", vitalPayload);
        for (EncounterDiagnosis diagnosis : diagnoses) {
            publish(encounter, "DIAGNOSIS_RECORDED", diagnosis.display(), Map.of(
                    "code", diagnosis.code(), "display", diagnosis.display(), "type", diagnosis.diagnosisType().name()));
        }
        return EncounterResponse.from(encounter, diagnoses);
    }

    @Transactional
    public EncounterResponse complete(Long encounterId) {
        Encounter encounter = requireEncounter(encounterId);
        ExecutionContext context = executionContextProvider.requireCurrent();
        boolean noteSigned = true;
        BusinessException documentFailure = null;
        try {
            clinicalDocumentDirectory.requireSignedEncounterDocument(encounter.id(), "OUTPATIENT_NOTE");
        } catch (BusinessException exception) {
            noteSigned = false;
            documentFailure = exception;
        }
        List<EncounterDiagnosis> currentDiagnoses = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStatusOrderByRecordedAt(
                        encounter.tenantId(), encounter.id(), "ACTIVE");
        boolean identityChecked = identityCheckRepository.existsByTenantIdAndEncounterIdAndResult(
                encounter.tenantId(), encounter.id(), "PASS");
        boolean hasPrimaryDiagnosis = currentDiagnoses.stream()
                .anyMatch(diagnosis -> diagnosis.diagnosisType() == EncounterDiagnosis.DiagnosisType.PRIMARY);
        // The endpoint currently has no client-supplied idempotency key. Keep each
        // completion attempt independently auditable so a corrected retry is not
        // rejected by the completion-check unique constraint.
        String commandCode = "COMPLETE-" + encounterId + "-" + encounter.version() + "-"
                + com.rhn.shared.id.GlobalIds.next();
        EncounterCompletionService.CompletionDecision decision = completionService.evaluate(encounter,
                identityChecked, noteSigned, hasPrimaryDiagnosis);
        if (!decision.passed()) {
            completionService.recordBlocked(encounter, decision, context, commandCode);
            if (documentFailure != null && decision.issues().size() == 1) throw documentFailure;
            throw conflict("ENCOUNTER_COMPLETION_BLOCKED", decision.issues().stream()
                    .map(EncounterCompletionService.CompletionIssue::description).collect(Collectors.joining("；")));
        }
        completionService.recordPassed(encounter, decision, context, commandCode);
        long expectedRevision = encounter.version();
        statusEventRepository.save(new EncounterStatusEvent(encounter, EncounterStatus.IN_PROGRESS.name(),
                EncounterStatus.COMPLETED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, "诊毕检查通过"));
        workSessionRepository.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
                encounter.tenantId(), encounter.id(), "ACTIVE").ifPresent(session -> session.close("COMPLETED"));
        encounter.complete();
        registrationDirectory.markCompleted(encounterId, commandCode);
        encounterRepository.flush();
        publish(encounter, "ENCOUNTER_COMPLETED", "门诊就诊完成", Map.of("encounterNo", encounter.encounterNo()));
        return toResponse(encounter);
    }

    @Transactional(readOnly = true)
    public EncounterResponse get(Long encounterId) {
        return toResponse(requireEncounter(encounterId));
    }

    @Transactional(readOnly = true)
    public List<EncounterResponse> byResident(Long residentId) {
        residentId = residentDirectory.resolveCanonicalResidentId(residentId);
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        List<Encounter> encounters = context.hasWorkContext() && context.departmentId() != null
                ? encounterRepository.findTop20ByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdOrderByRegisteredAtDesc(
                tenantId, residentId, context.organizationId(), context.departmentId())
                : encounterRepository.findTop20ByTenantIdAndResidentIdOrderByRegisteredAtDesc(tenantId, residentId);
        return encounters
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public EncounterSnapshot requireAccessible(Long encounterId) {
        Encounter encounter = requireEncounter(encounterId);
        return snapshot(encounter);
    }

    @Override
    @Transactional(readOnly = true)
    public EncounterSnapshot requireActiveForOrdering(Long encounterId) {
        Encounter encounter = requireEncounter(encounterId);
        if (encounter.status() != EncounterStatus.IN_PROGRESS) {
            throw conflict("ENCOUNTER_NOT_ORDERABLE", "只有接诊中的就诊可以开立诊疗请求");
        }
        return snapshot(encounter);
    }

    private EncounterSnapshot snapshot(Encounter encounter) {
        return new EncounterSnapshot(encounter.id(), encounter.tenantId(), encounter.residentId(),
                encounter.organizationId(), encounter.departmentId(), encounter.encounterNo(), encounter.clinicianId(),
                encounter.status().name());
    }

    private Encounter requireEncounter(Long encounterId) {
        Encounter encounter = encounterRepository.findByIdAndTenantId(encounterId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (context.hasWorkContext() && (!context.canAccessOrganization(encounter.organizationId())
                || !context.canAccessDepartment(encounter.departmentId()))) {
            throw forbidden("ENCOUNTER_FORBIDDEN", "无权访问当前工作上下文之外的就诊");
        }
        return encounter;
    }

    private EncounterResponse toResponse(Encounter encounter) {
        return EncounterResponse.from(encounter, diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStatusOrderByRecordedAt(
                        encounter.tenantId(), encounter.id(), "ACTIVE"));
    }

    private void validateDiagnoses(RecordClinicalDataRequest request) {
        long primaryCount = request.diagnoses().stream()
                .filter(input -> input.type() == EncounterDiagnosis.DiagnosisType.PRIMARY).count();
        long distinctCodes = request.diagnoses().stream().map(input -> input.code().trim()).distinct().count();
        if (primaryCount > 1) {
            throw badRequest("PRIMARY_DIAGNOSIS_DUPLICATED", "病历草稿最多只能有一个主要诊断");
        }
        if (distinctCodes != request.diagnoses().size()) {
            throw badRequest("DIAGNOSIS_DUPLICATED", "同一诊断不能重复录入");
        }
    }

    private String clinicalText(String value) {
        return value == null ? "" : value.trim();
    }

    private void publish(Encounter encounter, String type, String summary, Map<String, Object> payload) {
        Map<String, Object> details = new LinkedHashMap<>(payload);
        details.put("encounterNo", encounter.encounterNo());
        details.put("summary", summary);
        eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), type, 1,
                "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(), details);
    }

    private String nextEncounterNo() {
        return "OP" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }
}
