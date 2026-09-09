package com.rhn.outpatient.encounter;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ClinicalObservationDirectory;
import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.healthplanning.api.HypertensionCareDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.idempotency.IdempotencyService;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientNoteFormDirectory;
import com.rhn.outpatient.api.RegistrationValidityPolicy;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.terminology.api.DiseaseReferenceSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
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
    private static final String START_OPERATION = "OUTPATIENT.ENCOUNTER.START";
    private static final String SUSPEND_OPERATION = "OUTPATIENT.ENCOUNTER.SUSPEND";
    private static final String RESUME_OPERATION = "OUTPATIENT.ENCOUNTER.RESUME";
    private static final String RECORD_OPERATION = "OUTPATIENT.ENCOUNTER.RECORD";
    private static final String COMPLETE_OPERATION = "OUTPATIENT.ENCOUNTER.COMPLETE";
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final EncounterRepository encounterRepository;
    private final EncounterDiagnosisRepository diagnosisRepository;
    private final EncounterDiagnosisRevisionRepository diagnosisRevisionRepository;
    private final EncounterIdentityCheckRepository identityCheckRepository;
    private final EncounterStatusEventRepository statusEventRepository;
    private final EncounterWorkSessionRepository workSessionRepository;
    private final EncounterCompletionService completionService;
    private final OutpatientReferralService referralService;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final OutpatientRegistrationDirectory registrationDirectory;
    private final OutpatientNoteFormDirectory noteFormDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final ClinicalObservationDirectory clinicalObservationDirectory;
    private final ClinicalValidationDirectory clinicalValidationDirectory;
    private final HypertensionCareDirectory hypertensionCareDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final DomainEventPublisher eventPublisher;
    private final IdempotencyService idempotencyService;
    private final ExecutionContextProvider executionContextProvider;
    private final JsonCodec jsonCodec;
    private final com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory inventoryDirectory;
    private final RegistrationValidityPolicy validityPolicy;

    public EncounterService(EncounterRepository encounterRepository,
                            EncounterDiagnosisRepository diagnosisRepository,
                            EncounterDiagnosisRevisionRepository diagnosisRevisionRepository,
                            EncounterIdentityCheckRepository identityCheckRepository,
                            EncounterStatusEventRepository statusEventRepository,
                            EncounterWorkSessionRepository workSessionRepository,
                            EncounterCompletionService completionService,
                            OutpatientReferralService referralService,
                            ResidentDirectory residentDirectory,
                            OrganizationDirectory organizationDirectory,
                            OutpatientRegistrationDirectory registrationDirectory,
                            OutpatientNoteFormDirectory noteFormDirectory,
                            ClinicalDocumentDirectory clinicalDocumentDirectory,
                            ClinicalObservationDirectory clinicalObservationDirectory,
                            ClinicalValidationDirectory clinicalValidationDirectory,
                            HypertensionCareDirectory hypertensionCareDirectory,
                            TerminologyDirectory terminologyDirectory,
                            DomainEventPublisher eventPublisher,
                            IdempotencyService idempotencyService,
                            ExecutionContextProvider executionContextProvider,
                            JsonCodec jsonCodec,
                            com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory inventoryDirectory,
                            RegistrationValidityPolicy validityPolicy) {
        this.encounterRepository = encounterRepository;
        this.diagnosisRepository = diagnosisRepository;
        this.diagnosisRevisionRepository = diagnosisRevisionRepository;
        this.identityCheckRepository = identityCheckRepository;
        this.statusEventRepository = statusEventRepository;
        this.workSessionRepository = workSessionRepository;
        this.completionService = completionService;
        this.referralService = referralService;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.registrationDirectory = registrationDirectory;
        this.noteFormDirectory = noteFormDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.clinicalObservationDirectory = clinicalObservationDirectory;
        this.clinicalValidationDirectory = clinicalValidationDirectory;
        this.hypertensionCareDirectory = hypertensionCareDirectory;
        this.terminologyDirectory = terminologyDirectory;
        this.eventPublisher = eventPublisher;
        this.idempotencyService = idempotencyService;
        this.executionContextProvider = executionContextProvider;
        this.jsonCodec = jsonCodec;
        this.inventoryDirectory = inventoryDirectory;
        this.validityPolicy = validityPolicy;
    }

    @Transactional
    public EncounterResponse register(RegisterEncounterRequest request) {
        String idempotencyCode = request.idempotencyCode() == null || request.idempotencyCode().isBlank()
                ? "REG-" + com.rhn.shared.id.GlobalIds.next() : request.idempotencyCode().trim();
        var replay = registrationDirectory.findByIdempotency(idempotencyCode);
        if (replay.isPresent()) return get(replay.get().encounterId());
        Long residentId = requireRegistrationEligible(request.residentId(), request.organizationId(), request.departmentId());
        replay = registrationDirectory.findByIdempotency(idempotencyCode);
        if (replay.isPresent()) return get(replay.get().encounterId());
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        Encounter encounter = encounterRepository.saveAndFlush(new Encounter(tenantId, residentId,
                nextEncounterNo(), request.organizationId(), request.departmentId()));
        OutpatientRegistrationDirectory.RegistrationSnapshot registration = registrationDirectory.register(
                new OutpatientRegistrationDirectory.RegisterCommand(residentId, encounter.id(),
                        request.organizationId(), request.departmentId(), request.appointmentId(), request.scheduleId(),
                        request.slotHoldId(), idempotencyCode,
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
    public void validateRegistration(RegistrationEligibilityCommand command) {
        requireRegistrationEligible(command.residentId(), command.organizationId(), command.departmentId());
    }

    private Long requireRegistrationEligible(Long residentId, Long organizationId, Long departmentId) {
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshotForUpdate(residentId);
        if (resident.deceased()) {
            throw conflict("RESIDENT_DECEASED", "已登记死亡的居民不能发起普通门诊挂号");
        }
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (context.hasWorkContext() && !context.canAccessOrganization(organizationId)) {
            throw forbidden("ENCOUNTER_CONTEXT_FORBIDDEN", "不能在当前机构之外发起接诊");
        }
        organizationDirectory.requireDepartment(tenantId, organizationId, departmentId);
        List<Encounter> activeEncounters = encounterRepository.findByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdAndStatusIn(
                tenantId, resident.id(), organizationId, departmentId,
                List.of(EncounterStatus.REGISTERED, EncounterStatus.IN_PROGRESS, EncounterStatus.SUSPENDED));
        Instant now = Instant.now();
        Long userId = context.hasWorkContext() ? context.subjectId() : null;
        boolean hasUnexpiredActive = activeEncounters.stream()
                .anyMatch(enc -> validityPolicy.isValid(enc.registeredAt(), now, tenantId, userId, organizationId, departmentId));
        if (hasUnexpiredActive) {
            throw conflict("ENCOUNTER_ACTIVE_DUPLICATE", "该居民在当前科室已有进行中的就诊");
        }
        return resident.id();
    }

    @Override
    @Transactional
    public EncounterSnapshot completeRegistration(RegistrationCompletionCommand command) {
        EncounterResponse value = register(new RegisterEncounterRequest(command.residentId(), command.organizationId(),
                command.departmentId(), command.appointmentId(), command.scheduleId(), command.slotHoldId(), command.idempotencyCode(),
                command.registrationSource(), command.visitType()));
        Encounter encounter = encounterRepository.findByIdAndTenantId(value.id(), TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        return snapshot(encounter);
    }

    @Transactional
    public EncounterResponse start(Long encounterId, StartEncounterRequest request) {
        Encounter encounter = requireEncounterWithLock(encounterId);
        if (encounter.status() == EncounterStatus.IN_PROGRESS) {
            return toResponse(encounter);
        }
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
        var reservation = idempotencyService.reserve(START_OPERATION, commandCode,
                canonicalCommand(encounterId, request));
        if (reservation.replay()) return replayEncounter(reservation.responseJson());
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
        return completeCommand(START_OPERATION, commandCode, encounter);
    }

    @Transactional
    public EncounterResponse suspend(Long encounterId, SuspendEncounterRequest request) {
        Encounter encounter = requireEncounterWithLock(encounterId);
        ExecutionContext context = executionContextProvider.requireCurrent();
        long expectedRevision = encounter.version();
        String commandCode = clean(request.commandCode()) == null
                ? "SUSPEND-" + encounterId + "-" + expectedRevision : clean(request.commandCode());
        String reason = request.reason().trim();
        var reservation = idempotencyService.reserve(SUSPEND_OPERATION, commandCode,
                canonicalCommand(encounterId, request));
        if (reservation.replay()) return replayEncounter(reservation.responseJson());
        statusEventRepository.save(new EncounterStatusEvent(encounter, EncounterStatus.IN_PROGRESS.name(),
                EncounterStatus.SUSPENDED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, reason));
        workSessionRepository.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
                encounter.tenantId(), encounter.id(), "ACTIVE").ifPresent(session -> session.close("SUSPENDED"));
        encounter.suspend();
        registrationDirectory.markSuspended(encounterId, commandCode, reason);
        encounterRepository.flush();
        publish(encounter, "ENCOUNTER_SUSPENDED", "门诊接诊暂挂", Map.of("reason", reason));
        return completeCommand(SUSPEND_OPERATION, commandCode, encounter);
    }

    @Transactional
    public EncounterResponse resume(Long encounterId, ResumeEncounterRequest request) {
        Encounter encounter = requireEncounterWithLock(encounterId);
        if (encounter.status() == EncounterStatus.IN_PROGRESS) {
            return toResponse(encounter);
        }
        ExecutionContext context = executionContextProvider.requireCurrent();
        long expectedRevision = encounter.version();
        String commandCode = clean(request.commandCode()) == null
                ? "RESUME-" + encounterId + "-" + expectedRevision : clean(request.commandCode());
        var reservation = idempotencyService.reserve(RESUME_OPERATION, commandCode,
                canonicalCommand(encounterId, request));
        if (reservation.replay()) return replayEncounter(reservation.responseJson());
        statusEventRepository.save(new EncounterStatusEvent(encounter, EncounterStatus.SUSPENDED.name(),
                EncounterStatus.IN_PROGRESS.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, "患者返回，恢复门诊接诊"));
        workSessionRepository.save(new EncounterWorkSession(encounter.tenantId(), encounter.id(),
                context.practitionerId(), context.subjectId(), clean(request.terminalCode())));
        encounter.resume(context.actor());
        registrationDirectory.markResumed(encounterId, commandCode);
        encounterRepository.flush();
        publish(encounter, "ENCOUNTER_RESUMED", "恢复门诊接诊", Map.of("clinician", context.actor()));
        return completeCommand(RESUME_OPERATION, commandCode, encounter);
    }

    @Transactional
    public EncounterResponse recordClinicalData(Long encounterId, RecordClinicalDataRequest request) {
        Encounter encounter = requireEncounterWithLock(encounterId);
        Long tenantId = TenantContext.requireTenantId();
        clinicalValidationDirectory.validateVitalSigns(new ClinicalValidationDirectory.VitalSignsInput(
                request.temperature(), decimal(request.pulseRate()), decimal(request.respiratoryRate()),
                decimal(request.systolic()), decimal(request.diastolic()), decimal(request.oxygenSaturation()),
                request.heightCm(), request.weightKg(), null, null));
        validateDiagnoses(request);
        String commandCode = clean(request.commandCode()) == null
                ? "RECORD-" + encounterId + "-" + encounter.version() + "-" + com.rhn.shared.id.GlobalIds.next()
                : clean(request.commandCode());
        var reservation = idempotencyService.reserve(RECORD_OPERATION, commandCode,
                canonicalCommand(encounterId, request));
        if (reservation.replay()) return replayEncounter(reservation.responseJson());
        encounter.recordClinicalData(request.chiefComplaint().trim(), request.systolic(), request.diastolic());

        ExecutionContext context = executionContextProvider.requireCurrent();
        List<EncounterDiagnosis> existing = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStageOrderBySortOrderAscRecordedAtAsc(
                        tenantId, encounterId, "ENCOUNTER");
        Map<String, EncounterDiagnosis> byCode = existing.stream().collect(Collectors.toMap(
                EncounterDiagnosis::terminologyKey, Function.identity(), (left, right) -> left, LinkedHashMap::new));
        Set<String> incomingCodes = new LinkedHashSet<>();
        List<EncounterDiagnosisRevision> revisions = new java.util.ArrayList<>();
        for (int index = 0; index < request.diagnoses().size(); index++) {
            RecordClinicalDataRequest.DiagnosisInput input = request.diagnoses().get(index);
            int sortOrder = index + 1;
            ResolvedDiagnosis resolved = resolveDiagnosis(tenantId, input);
            String key = resolved.terminologyKey();
            incomingCodes.add(key);
            EncounterDiagnosis diagnosis = byCode.get(key);
            String changeType;
            if (diagnosis == null) {
                diagnosis = diagnosisRepository.save(new EncounterDiagnosis(tenantId, encounterId, "ENCOUNTER",
                        resolved.conceptId(), resolved.systemCode(), resolved.systemVersion(), resolved.diagnosisDomain(),
                        clean(input.diagnosisGroupId()), resolved.code(), resolved.display(), input.type(), "CONFIRMED",
                        resolved.managementJson(), sortOrder, context.subjectId()));
                changeType = "ADDED";
            } else {
                changeType = "ACTIVE".equals(diagnosis.diagnosisStatus()) ? "UPDATED" : "RESTORED";
                diagnosis.revise(resolved.conceptId(), resolved.systemCode(), resolved.systemVersion(),
                        resolved.diagnosisDomain(), clean(input.diagnosisGroupId()), resolved.display(), input.type(),
                        "CONFIRMED", resolved.managementJson(), sortOrder, context.subjectId());
            }
            revisions.add(new EncounterDiagnosisRevision(diagnosis, changeType, "门诊病历保存",
                    context.practitionerId(), context.subjectId()));
        }
        for (EncounterDiagnosis diagnosis : existing) {
            if ("ACTIVE".equals(diagnosis.diagnosisStatus()) && !incomingCodes.contains(diagnosis.terminologyKey())) {
                diagnosis.exclude(context.subjectId());
                revisions.add(new EncounterDiagnosisRevision(diagnosis, "EXCLUDED", "本次病历已移除该诊断",
                        context.practitionerId(), context.subjectId()));
            }
        }
        diagnosisRepository.flush();
        diagnosisRevisionRepository.saveAll(revisions);
        diagnosisRevisionRepository.flush();
        List<EncounterDiagnosis> diagnoses = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        tenantId, encounterId, "ENCOUNTER", "ACTIVE");

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
        String noteSchema = "RHN.OUTPATIENT_NOTE.V2";
        if (request.noteFormVersionId() != null) {
            OutpatientNoteFormDirectory.ResolvedForm form = noteFormDirectory.resolvePublished(
                    request.noteFormVersionId(), request.structuredData());
            noteContent.put("structuredForm", form.definitionSnapshot());
            noteContent.put("structuredData", form.normalizedValues());
            noteSchema = "RHN.OUTPATIENT_NOTE.V3";
        } else if (request.structuredData() != null && !request.structuredData().isEmpty()) {
            throw badRequest("NOTE_FORM_VERSION_REQUIRED", "提交结构化病历字段时必须选择病历表单");
        }
        clinicalDocumentDirectory.upsertEncounterDraft(encounter.residentId(), encounter.id(),
                encounter.organizationId(), encounter.departmentId(), "OUTPATIENT_NOTE", "门诊病历",
                noteSchema, noteContent,
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
            Map<String, Object> payload = new LinkedHashMap<>();
            if (diagnosis.conceptId() != null) payload.put("conceptId", diagnosis.conceptId());
            if (diagnosis.codeSystemCodeSnapshot() != null) {
                payload.put("systemCode", diagnosis.codeSystemCodeSnapshot());
            }
            if (diagnosis.codeSystemVersionSnapshot() != null) {
                payload.put("systemVersion", diagnosis.codeSystemVersionSnapshot());
            }
            payload.put("diagnosisDomain", diagnosis.diagnosisDomain());
            payload.put("code", diagnosis.code());
            payload.put("display", diagnosis.display());
            payload.put("type", diagnosis.diagnosisType().name());
            payload.put("managementPrograms", managementEnvelope(diagnosis).programs());
            publish(encounter, "DIAGNOSIS_RECORDED", diagnosis.display(), payload);
        }
        EncounterResponse response = EncounterResponse.from(encounter,
                diagnoses.stream().map(this::diagnosisResponse).toList());
        idempotencyService.complete(RECORD_OPERATION, commandCode, "Encounter", encounter.id(), 200,
                jsonCodec.write(response));
        return response;
    }

    private static java.math.BigDecimal decimal(Integer value) {
        return value == null ? null : java.math.BigDecimal.valueOf(value);
    }

    @Transactional
    public EncounterResponse complete(Long encounterId) {
        return complete(encounterId, CompleteEncounterRequest.defaultRequest());
    }

    @Transactional
    public EncounterResponse complete(Long encounterId, CompleteEncounterRequest request) {
        Encounter encounter = requireEncounterWithLock(encounterId);
        ExecutionContext context = executionContextProvider.requireCurrent();
        referralService.requireNoOpenConsultation(encounter.tenantId(), encounter.id());
        String commandCode = clean(request.commandCode()) == null
                ? "COMPLETE-" + encounterId + "-" + encounter.version() + "-"
                + com.rhn.shared.id.GlobalIds.next() : clean(request.commandCode());
        var reservation = idempotencyService.reserve(COMPLETE_OPERATION, commandCode,
                canonicalCommand(encounterId, request));
        if (reservation.replay()) return replayEncounter(reservation.responseJson());
        boolean noteSigned = true;
        BusinessException documentFailure = null;
        try {
            clinicalDocumentDirectory.requireSignedEncounterDocument(encounter.id(), "OUTPATIENT_NOTE");
        } catch (BusinessException exception) {
            noteSigned = false;
            documentFailure = exception;
        }
        List<EncounterDiagnosis> currentDiagnoses = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        encounter.tenantId(), encounter.id(), "ENCOUNTER", "ACTIVE");
        boolean identityChecked = identityCheckRepository.existsByTenantIdAndEncounterIdAndResult(
                encounter.tenantId(), encounter.id(), "PASS");
        boolean hasPrimaryDiagnosis = currentDiagnoses.stream()
                .anyMatch(diagnosis -> diagnosis.diagnosisType() == EncounterDiagnosis.DiagnosisType.PRIMARY);
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
        String disposition = clean(request.dispositionCode()) == null ? "HOME" : clean(request.dispositionCode());
        String dispositionReason = "诊毕检查通过；转归=" + disposition
                + (clean(request.dispositionNote()) == null ? "" : "；说明=" + clean(request.dispositionNote()));
        statusEventRepository.save(new EncounterStatusEvent(encounter, EncounterStatus.IN_PROGRESS.name(),
                EncounterStatus.COMPLETED.name(), expectedRevision, context.practitionerId(), context.subjectId(),
                commandCode, dispositionReason));
        workSessionRepository.findFirstByTenantIdAndEncounterIdAndStatusOrderByStartedAtDesc(
                encounter.tenantId(), encounter.id(), "ACTIVE").ifPresent(session -> session.close("COMPLETED"));
        encounter.complete();
        registrationDirectory.markCompleted(encounterId, commandCode);
        encounterRepository.flush();
        Map<String, Object> completionDetails = new LinkedHashMap<>();
        completionDetails.put("encounterNo", encounter.encounterNo());
        completionDetails.put("dispositionCode", disposition);
        if (clean(request.dispositionNote()) != null) {
            completionDetails.put("dispositionNote", clean(request.dispositionNote()));
        }
        publish(encounter, "ENCOUNTER_COMPLETED", "门诊就诊完成", completionDetails);
        return completeCommand(COMPLETE_OPERATION, commandCode, encounter);
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

    @Override
    @Transactional(readOnly = true)
    public List<EncounterSnapshot> findAccessible(Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return List.of();
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        return encounterRepository.findByTenantIdAndIdIn(tenantId, encounterIds).stream()
                .filter(encounter -> !context.hasWorkContext()
                        || context.canAccessOrganization(encounter.organizationId())
                        && context.canAccessDepartment(encounter.departmentId()))
                .map(this::snapshot)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public EncounterSnapshot requireOrganizationAccessible(Long encounterId) {
        Encounter encounter = encounterRepository.findByIdAndTenantId(encounterId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (!context.hasWorkContext() || !context.canAccessOrganization(encounter.organizationId())) {
            throw forbidden("ENCOUNTER_FORBIDDEN", "无权访问当前机构之外的就诊");
        }
        return snapshot(encounter);
    }

    @Override
    @Transactional(readOnly = true)
    public List<EncounterSnapshot> findOrganizationAccessible(Collection<Long> encounterIds) {
        if (encounterIds == null || encounterIds.isEmpty()) return List.of();
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (!context.hasWorkContext()) return List.of();
        return encounterRepository.findByTenantIdAndIdIn(tenantId, encounterIds).stream()
                .filter(encounter -> context.canAccessOrganization(encounter.organizationId()))
                .map(this::snapshot)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<EncounterSnapshot> recentForResident(Long residentId, int limit) {
        Long canonicalResidentId = residentDirectory.resolveCanonicalResidentId(residentId);
        Long tenantId = TenantContext.requireTenantId();
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            return List.of();
        }
        int cappedLimit = Math.max(0, Math.min(limit, 20));
        return encounterRepository
                .findTop20ByTenantIdAndResidentIdAndOrganizationIdAndDepartmentIdOrderByRegisteredAtDesc(
                        tenantId, canonicalResidentId, context.organizationId(), context.departmentId())
                .stream().limit(cappedLimit).map(this::snapshot).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public PharmacyClinicalSnapshot requireForPharmacy(Long tenantId, Long encounterId) {
        Encounter encounter = encounterRepository.findByIdAndTenantId(encounterId, tenantId)
                .orElseThrow(() -> notFound("ENCOUNTER_NOT_FOUND", "未找到该次就诊"));
        List<DiagnosisSnapshot> diagnoses = diagnosisRepository
                .findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        tenantId, encounterId, "ENCOUNTER", "ACTIVE")
                .stream().map(value -> new DiagnosisSnapshot(
                        value.code(), value.display(), value.diagnosisType().name())).toList();
        return new PharmacyClinicalSnapshot(encounter.id(), encounter.residentId(), encounter.encounterNo(),
                encounter.clinicianId(), encounter.chiefComplaint(), diagnoses);
    }

    private EncounterSnapshot snapshot(Encounter encounter) {
        String departmentName = null;
        if (encounter.departmentId() != null) {
            try {
                departmentName = organizationDirectory.requireDepartment(
                        encounter.tenantId(), encounter.organizationId(), encounter.departmentId()).name();
            } catch (Exception ignored) {}
        }
        return new EncounterSnapshot(encounter.id(), encounter.tenantId(), encounter.residentId(),
                encounter.organizationId(), encounter.departmentId(), encounter.encounterNo(), encounter.clinicianId(),
                encounter.status().name(), encounter.version(), departmentName, encounter.registeredAt());
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

    private Encounter requireEncounterWithLock(Long encounterId) {
        Encounter encounter = encounterRepository.findWithLockByIdAndTenantId(
                        encounterId, TenantContext.requireTenantId())
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
                .findByTenantIdAndEncounterIdAndDiagnosisStageAndDiagnosisStatusOrderBySortOrderAscRecordedAtAsc(
                        encounter.tenantId(), encounter.id(), "ENCOUNTER", "ACTIVE")
                .stream().map(this::diagnosisResponse).toList());
    }

    private void validateDiagnoses(RecordClinicalDataRequest request) {
        long primaryCount = request.diagnoses().stream()
                .filter(input -> input.type() == EncounterDiagnosis.DiagnosisType.PRIMARY).count();
        long distinctCodes = request.diagnoses().stream().map(input -> input.conceptId() == null
                ? "LEGACY|" + input.code().trim() : "CONCEPT|" + input.conceptId()).distinct().count();
        if (!request.diagnoses().isEmpty() && (primaryCount != 1
                || request.diagnoses().getFirst().type() != EncounterDiagnosis.DiagnosisType.PRIMARY)) {
            throw badRequest("PRIMARY_DIAGNOSIS_ORDER_INVALID", "首项必须是唯一的主要诊断");
        }
        if (distinctCodes != request.diagnoses().size()) {
            throw badRequest("DIAGNOSIS_DUPLICATED", "同一诊断不能重复录入");
        }
    }

    private ResolvedDiagnosis resolveDiagnosis(Long tenantId, RecordClinicalDataRequest.DiagnosisInput input) {
        if (input.conceptId() == null) {
            return new ResolvedDiagnosis(null, null, null,
                    input.diagnosisDomain() == null ? "WESTERN_MEDICINE" : input.diagnosisDomain(), input.code().trim(),
                    input.display().trim(), jsonCodec.write(new DiseaseManagementEnvelope(List.of())));
        }
        DiseaseReferenceSnapshot value = terminologyDirectory.requireDisease(tenantId, input.conceptId(), LocalDate.now());
        if (input.diagnosisDomain() != null && !input.diagnosisDomain().equals(value.diagnosisDomain())) {
            throw badRequest("DIAGNOSIS_DOMAIN_MISMATCH", "诊断体系与所选疾病术语不一致");
        }
        return new ResolvedDiagnosis(value.conceptId(), value.systemCode(), value.systemVersion(),
                value.diagnosisDomain(), value.code(), value.display(),
                jsonCodec.write(new DiseaseManagementEnvelope(value.managementPrograms())));
    }

    private EncounterResponse.DiagnosisResponse diagnosisResponse(EncounterDiagnosis value) {
        return new EncounterResponse.DiagnosisResponse(value.conceptId(), value.codeSystemCodeSnapshot(),
                value.codeSystemVersionSnapshot(), value.diagnosisDomain(), value.diagnosisGroupId(), value.code(),
                value.display(), value.diagnosisType().name(), value.sortOrder(), managementEnvelope(value).programs().stream()
                .map(program -> new EncounterResponse.ManagementProgramResponse(program.id(), program.code(),
                        program.name(), program.managementType(), program.triggerAction(), program.reportCardType(),
                        program.reportDeadlineHours())).toList());
    }

    private DiseaseManagementEnvelope managementEnvelope(EncounterDiagnosis value) {
        if (value.managementSnapshotJson() == null || value.managementSnapshotJson().isBlank()) {
            return new DiseaseManagementEnvelope(List.of());
        }
        return jsonCodec.read(value.managementSnapshotJson(), DiseaseManagementEnvelope.class);
    }

    private record DiseaseManagementEnvelope(
            List<DiseaseReferenceSnapshot.DiseaseManagementSnapshot> programs) {
        private DiseaseManagementEnvelope {
            programs = programs == null ? List.of() : List.copyOf(programs);
        }
    }

    private record ResolvedDiagnosis(Long conceptId, String systemCode, String systemVersion,
                                     String diagnosisDomain, String code, String display, String managementJson) {
        String terminologyKey() { return (systemCode == null ? "LEGACY" : systemCode) + "|" + code; }
    }

    private String canonicalCommand(Long encounterId, Object request) {
        return encounterId + "|" + jsonCodec.write(request);
    }

    private EncounterResponse replayEncounter(String responseJson) {
        return jsonCodec.read(responseJson, EncounterResponse.class);
    }

    private EncounterResponse completeCommand(String operation, String commandCode, Encounter encounter) {
        EncounterResponse response = toResponse(encounter);
        idempotencyService.complete(operation, commandCode, "Encounter", encounter.id(), 200,
                jsonCodec.write(response));
        return response;
    }

    private String clinicalText(String value) {
        return value == null ? "" : value.trim();
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void publish(Encounter encounter, String type, String summary, Map<String, Object> payload) {
        Map<String, Object> details = new LinkedHashMap<>(payload);
        details.put("encounterNo", encounter.encounterNo());
        details.put("summary", summary);
        eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), type, 1,
                "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(), details);
    }

    @Transactional(readOnly = true)
    public List<com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.OrderableMedicationView> searchOrderableMedications(
            Long encounterId, String query) {
        var encounter = requireActiveForOrdering(encounterId);
        return inventoryDirectory.findOrderableMedications(
                encounter.tenantId(),
                encounter.organizationId(),
                encounter.departmentId(),
                query
        );
    }

    private String nextEncounterNo() {
        return "OP" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }
}
