package com.rhn.healthplanning.application;

import com.rhn.healthcore.api.ConditionDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.healthplanning.api.HypertensionCandidateView;
import com.rhn.outpatient.api.HypertensionCareDirectory;
import com.rhn.healthplanning.domain.CareTask;
import com.rhn.healthplanning.domain.CareTaskEvent;
import com.rhn.healthplanning.domain.CareTaskPriority;
import com.rhn.healthplanning.domain.CareTaskType;
import com.rhn.healthplanning.infrastructure.CareTaskEventRepository;
import com.rhn.healthplanning.infrastructure.CareTaskRepository;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.terminology.api.TerminologyConceptSnapshot;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class HypertensionScreeningService implements HypertensionCareDirectory {
    public static final String RULE_CODE = "WS_T_872_2025.SUSPECTED_HYPERTENSION";
    public static final String RULE_VERSION = "2025-09-19";
    public static final String GUIDANCE_VERSION = "NATIONAL_PRIMARY_HTN_2020";
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final String ICD10_HYPERTENSION = "I10";
    private static final int SYSTOLIC_THRESHOLD = 140;
    private static final int DIASTOLIC_THRESHOLD = 90;
    private static final int SEVERE_SYSTOLIC = 180;
    private static final int SEVERE_DIASTOLIC = 110;
    private static final Duration RECHECK_WINDOW = Duration.ofDays(28);
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final ResidentDirectory residentDirectory;
    private final ConditionDirectory conditionDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final CareTaskRepository taskRepository;
    private final CareTaskEventRepository eventRepository;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher eventPublisher;
    private final JsonCodec jsonCodec;

    public HypertensionScreeningService(ResidentDirectory residentDirectory,
                                        ConditionDirectory conditionDirectory,
                                        TerminologyDirectory terminologyDirectory,
                                        CareTaskRepository taskRepository,
                                        CareTaskEventRepository eventRepository,
                                        ExecutionContextProvider contextProvider,
                                        DomainEventPublisher eventPublisher,
                                        JsonCodec jsonCodec) {
        this.residentDirectory = residentDirectory;
        this.conditionDirectory = conditionDirectory;
        this.terminologyDirectory = terminologyDirectory;
        this.taskRepository = taskRepository;
        this.eventRepository = eventRepository;
        this.contextProvider = contextProvider;
        this.eventPublisher = eventPublisher;
        this.jsonCodec = jsonCodec;
    }

    @Override
    @Transactional
    public ScreeningOutcome evaluateBloodPressure(ScreeningCommand command) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) {
            return ScreeningOutcome.notApplicable("WORK_CONTEXT_NOT_SELECTED", RULE_CODE, RULE_VERSION);
        }
        requireClinicalContext(command, context);
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshotForUpdate(command.residentId());
        int age = Period.between(resident.birthDate(), command.measuredAt().atZone(BUSINESS_ZONE).toLocalDate()).getYears();
        if (age < 18) return ScreeningOutcome.notApplicable("NOT_APPLICABLE_AGE", RULE_CODE, RULE_VERSION);
        if (command.systolic() < SYSTOLIC_THRESHOLD && command.diastolic() < DIASTOLIC_THRESHOLD) {
            return ScreeningOutcome.notApplicable("NO_CANDIDATE", RULE_CODE, RULE_VERSION);
        }

        LocalDate businessDate = command.measuredAt().atZone(BUSINESS_ZONE).toLocalDate();
        TerminologyConceptSnapshot term = terminologyDirectory.requireConcept(
                command.tenantId(), ICD10_SYSTEM, ICD10_HYPERTENSION, businessDate);
        String conditionKey = "RESIDENT:" + command.residentId() + ":" + term.systemCode() + ":" + term.code();
        ConditionDirectory.ConditionSnapshot condition = conditionDirectory.ensureSuspected(
                new ConditionDirectory.RecordSuspectedCondition(command.tenantId(), command.residentId(), term.id(),
                        conditionKey, term.systemUri(), term.systemVersion(), term.code(), term.display(),
                        command.measuredAt(), command.measuredAt(), context.practitionerId(), context.subjectId()));
        if (condition.confirmed()) {
            return ScreeningOutcome.notApplicable("ALREADY_CONFIRMED", RULE_CODE, RULE_VERSION);
        }

        boolean severe = command.systolic() >= SEVERE_SYSTOLIC || command.diastolic() >= SEVERE_DIASTOLIC;
        String taskCode = "HTN-RECHECK:" + condition.id();
        CareTask task = taskRepository.findByTenantIdAndTaskCode(command.tenantId(), taskCode).orElse(null);
        boolean created = task == null;
        if (created) {
            task = taskRepository.saveAndFlush(CareTask.hypertensionRecheck(command.tenantId(), command.residentId(),
                    command.encounterId(), condition.id(), taskCode, command.organizationId(), command.departmentId(),
                    severe ? CareTaskPriority.URGENT : CareTaskPriority.HIGH,
                    severe ? command.measuredAt() : command.measuredAt().plus(RECHECK_WINDOW),
                    severe ? "血压显著升高：立即复测并评估转诊" : "疑诊高血压：完成非同日复测",
                    severe ? "单次血压达到显著升高阈值，需立即规范复测，并由临床人员评估是否转诊；系统不自动确诊。"
                            : "首次发现血压升高，请在4周内完成另外2次非同日规范测量；单次异常不作为高血压确诊。",
                    context.practitionerId(), context.subjectId()));
        }

        String commandCode = "SCREEN:" + command.encounterId() + ":" + command.systolicObservationId()
                + ":" + command.diastolicObservationId();
        if (!eventRepository.existsByTenantIdAndCareTaskIdAndCommandCode(command.tenantId(), task.id(), commandCode)) {
            Map<String, Object> evidence = evidence(command, age, severe, task.dueAt());
            String evidenceJson = jsonCodec.write(evidence);
            eventRepository.save(new CareTaskEvent(task, created, commandCode,
                    "诊室血压 " + command.systolic() + "/" + command.diastolic() + " mmHg，识别为疑诊候选",
                    RULE_CODE, RULE_VERSION, evidenceJson, sha256(evidenceJson), context.practitionerId(),
                    context.subjectId(), command.measuredAt()));
        }
        if (created) publishReady(task, command, context);
        return new ScreeningOutcome(severe ? "URGENT_RECHECK" : "SUSPECTED", condition.id(), task.id(),
                task.taskCode(), RULE_CODE, RULE_VERSION);
    }

    @Transactional(readOnly = true)
    public List<HypertensionCandidateView> candidates(Long residentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) {
            throw forbidden("WORK_CONTEXT_REQUIRED", "请先选择机构和科室工作上下文");
        }
        List<CareTask> tasks = residentId == null
                ? taskRepository.findByTenantIdAndTaskTypeOrderByDueAt(context.tenantId(), CareTaskType.RECHECK)
                : taskRepository.findByTenantIdAndResidentIdAndTaskTypeOrderByCreatedAtDesc(context.tenantId(),
                residentDirectory.resolveCanonicalResidentId(residentId), CareTaskType.RECHECK);
        return tasks.stream()
                .filter(task -> context.canAccessOrganization(task.ownerOrganizationId())
                        && context.canAccessDepartment(task.ownerDepartmentId()))
                .sorted(Comparator.comparing(CareTask::dueAt, Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::view)
                .toList();
    }

    private void requireClinicalContext(ScreeningCommand command, ExecutionContext context) {
        if (!context.tenantId().equals(command.tenantId()) || !context.canAccessOrganization(command.organizationId())
                || !context.canAccessDepartment(command.departmentId())) {
            throw forbidden("CARE_SCREENING_CONTEXT_FORBIDDEN", "不能在当前机构或科室之外执行慢病筛查");
        }
        if (context.subjectId() == null || context.practitionerId() == null) {
            throw forbidden("CLINICAL_PRACTITIONER_REQUIRED", "慢病筛查必须由已绑定医务人员身份的账号发起");
        }
    }

    private Map<String, Object> evidence(ScreeningCommand command, int age, boolean severe, java.time.Instant dueAt) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("contractVersion", "RHN.HYPERTENSION_SCREENING_EVIDENCE.V1");
        value.put("decision", severe ? "URGENT_RECHECK" : "SUSPECTED");
        value.put("diagnosticMeaning", "CANDIDATE_NOT_DIAGNOSIS");
        value.put("residentAge", age);
        value.put("encounterId", command.encounterId());
        value.put("measuredAt", command.measuredAt().toString());
        value.put("systolic", observation(command.systolicObservationId(), "8480-6", command.systolic(), command.unitCode()));
        value.put("diastolic", observation(command.diastolicObservationId(), "8462-4", command.diastolic(), command.unitCode()));
        value.put("thresholds", Map.of("systolic", SYSTOLIC_THRESHOLD, "diastolic", DIASTOLIC_THRESHOLD,
                "severeSystolic", SEVERE_SYSTOLIC, "severeDiastolic", SEVERE_DIASTOLIC));
        value.put("rule", Map.of("code", RULE_CODE, "version", RULE_VERSION,
                "guidanceVersion", GUIDANCE_VERSION,
                "standard", "WS/T 872-2025 基层医疗卫生机构高血压防治管理标准"));
        value.put("recheckDueAt", dueAt.toString());
        return value;
    }

    private Map<String, Object> observation(Long id, String code, Integer value, String unit) {
        return Map.of("id", id, "system", "http://loinc.org", "code", code, "value", value, "unit", unit);
    }

    private HypertensionCandidateView view(CareTask task) {
        var resident = residentDirectory.requireSnapshot(task.residentId());
        var condition = conditionDirectory.require(task.tenantId(), task.conditionId());
        List<HypertensionCandidateView.EvidenceEventView> events = eventRepository
                .findByTenantIdAndCareTaskIdOrderByOccurredAt(task.tenantId(), task.id()).stream()
                .map(event -> new HypertensionCandidateView.EvidenceEventView(event.id(), event.eventType(),
                        event.commandCode(), event.resultDescription(), event.ruleCode(), event.ruleVersion(),
                        event.evidenceJson() == null ? Map.of() : jsonCodec.readObject(event.evidenceJson()),
                        event.evidenceHash(), event.occurredAt()))
                .toList();
        return new HypertensionCandidateView(task.id(), task.revision(), task.taskCode(), task.status().name(),
                task.priority().name(), task.residentId(), resident.fullName(), task.encounterId(), task.conditionId(),
                condition.conditionCode(), condition.conditionName(), condition.verificationStatus(),
                task.ownerOrganizationId(), task.ownerDepartmentId(), task.dueAt(), task.title(), task.description(),
                task.createdAt(), events);
    }

    private void publishReady(CareTask task, ScreeningCommand command, ExecutionContext context) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("departmentId", command.departmentId());
        payload.put("residentId", command.residentId());
        payload.put("encounterId", command.encounterId());
        payload.put("title", task.title());
        payload.put("summary", task.description());
        payload.put("priority", task.priority().name());
        payload.put("dueAt", task.dueAt().toString());
        payload.put("actorId", context.subjectId());
        eventPublisher.publish(command.tenantId(), command.organizationId(), "CARE_TASK_READY", 1,
                "CareTask", task.id(), task.revision(), command.residentId(), command.measuredAt(), payload);
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
