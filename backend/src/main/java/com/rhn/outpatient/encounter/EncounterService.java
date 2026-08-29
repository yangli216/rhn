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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.notFound;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class EncounterService implements EncounterDirectory {
    private static final DateTimeFormatter NUMBER_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final EncounterRepository encounterRepository;
    private final EncounterDiagnosisRepository diagnosisRepository;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final OutpatientRegistrationDirectory registrationDirectory;
    private final ClinicalDocumentDirectory clinicalDocumentDirectory;
    private final ClinicalObservationDirectory clinicalObservationDirectory;
    private final HypertensionCareDirectory hypertensionCareDirectory;
    private final DomainEventPublisher eventPublisher;
    private final ExecutionContextProvider executionContextProvider;

    public EncounterService(EncounterRepository encounterRepository,
                            EncounterDiagnosisRepository diagnosisRepository,
                            ResidentDirectory residentDirectory,
                            OrganizationDirectory organizationDirectory,
                            OutpatientRegistrationDirectory registrationDirectory,
                            ClinicalDocumentDirectory clinicalDocumentDirectory,
                            ClinicalObservationDirectory clinicalObservationDirectory,
                            HypertensionCareDirectory hypertensionCareDirectory,
                            DomainEventPublisher eventPublisher,
                            ExecutionContextProvider executionContextProvider) {
        this.encounterRepository = encounterRepository;
        this.diagnosisRepository = diagnosisRepository;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.registrationDirectory = registrationDirectory;
        this.clinicalDocumentDirectory = clinicalDocumentDirectory;
        this.clinicalObservationDirectory = clinicalObservationDirectory;
        this.hypertensionCareDirectory = hypertensionCareDirectory;
        this.eventPublisher = eventPublisher;
        this.executionContextProvider = executionContextProvider;
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
                        request.organizationId(), request.departmentId(), request.scheduleId(), idempotencyCode,
                        request.registrationSource(), request.visitType()));
        String source = request.registrationSource() == null || request.registrationSource().isBlank()
                ? (registration.scheduleId() == null ? "DIRECT" : "WINDOW") : request.registrationSource();
        String visitType = request.visitType() == null || request.visitType().isBlank() ? "GENERAL" : request.visitType();
        encounter.bindRegistration(registration.registrationId(), registration.scheduleId(),
                registration.appointmentId(), source, visitType);
        encounterRepository.flush();
        publish(encounter, "OUTPATIENT_REGISTERED", "门诊挂号", Map.of(
                "encounterNo", encounter.encounterNo(),
                "registrationNo", registration.registrationNo(),
                "ticketNo", registration.ticketNo(),
                "organizationId", encounter.organizationId(),
                "departmentId", encounter.departmentId()));
        return toResponse(encounter);
    }

    @Transactional
    public EncounterResponse start(Long encounterId) {
        Encounter encounter = requireEncounter(encounterId);
        encounter.start(actor());
        registrationDirectory.markInService(encounterId, "START-" + encounterId + "-" + encounter.version());
        encounterRepository.flush();
        publish(encounter, "ENCOUNTER_STARTED", "开始门诊接诊", Map.of("clinician", actor()));
        return toResponse(encounter);
    }

    @Transactional
    public EncounterResponse recordClinicalData(Long encounterId, RecordClinicalDataRequest request) {
        Encounter encounter = requireEncounter(encounterId);
        encounter.recordClinicalData(request.chiefComplaint().trim(), request.systolic(), request.diastolic());

        Long tenantId = TenantContext.requireTenantId();
        diagnosisRepository.deleteByTenantIdAndEncounterId(tenantId, encounterId);
        List<EncounterDiagnosis> diagnoses = request.diagnoses().stream()
                .map(input -> new EncounterDiagnosis(tenantId, encounterId, input.code().trim(),
                        input.display().trim(), input.type()))
                .toList();
        diagnosisRepository.saveAll(diagnoses);

        clinicalDocumentDirectory.upsertEncounterDraft(encounter.residentId(), encounter.id(),
                encounter.organizationId(), encounter.departmentId(), "OUTPATIENT_NOTE", "门诊病历",
                "RHN.OUTPATIENT_NOTE.V1", Map.of(
                        "encounterNo", encounter.encounterNo(),
                        "chiefComplaint", request.chiefComplaint().trim(),
                        "vitalSigns", Map.of("systolic", request.systolic(), "diastolic", request.diastolic()),
                        "diagnoses", diagnoses.stream().map(diagnosis -> Map.of(
                                "code", diagnosis.code(), "display", diagnosis.display(),
                                "type", diagnosis.diagnosisType().name())).toList()),
                "门诊接诊记录更新");
        encounterRepository.flush();
        Instant measuredAt = Instant.now();
        ExecutionContext context = executionContextProvider.requireCurrent();
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
        clinicalDocumentDirectory.requireSignedEncounterDocument(encounter.id(), "OUTPATIENT_NOTE");
        encounter.complete();
        registrationDirectory.markCompleted(encounterId, "COMPLETE-" + encounterId + "-" + encounter.version());
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
                .findByTenantIdAndEncounterIdOrderByRecordedAt(encounter.tenantId(), encounter.id()));
    }

    private void publish(Encounter encounter, String type, String summary, Map<String, Object> payload) {
        Map<String, Object> details = new LinkedHashMap<>(payload);
        details.put("encounterNo", encounter.encounterNo());
        details.put("summary", summary);
        eventPublisher.publish(encounter.tenantId(), encounter.organizationId(), type, 1,
                "Encounter", encounter.id(), encounter.version(), encounter.residentId(), Instant.now(), details);
    }

    private String actor() {
        return executionContextProvider.requireCurrent().actor();
    }

    private String nextEncounterNo() {
        return "OP" + NUMBER_TIME.format(Instant.now()) + com.rhn.shared.id.GlobalIds.randomSuffix(6);
    }
}
