package com.rhn.outpatient.triage;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.healthcore.api.ClinicalValidationDirectory.VitalSignsInput;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineInput;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.RuleAssessment;
import com.rhn.outpatient.triage.TriageContracts.CreateTriageRequest;
import com.rhn.outpatient.triage.TriageContracts.DepartmentRecommendationResponse;
import com.rhn.outpatient.triage.TriageContracts.PendingEncounterResponse;
import com.rhn.outpatient.triage.TriageContracts.TriageRecordResponse;
import com.rhn.outpatient.triage.TriageContracts.TriageStatisticsResponse;
import com.rhn.outpatient.triage.TriageContracts.UpdateTriageRequest;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.id.GlobalIds;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Transactional
public class OutpatientTriageService {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter TRIAGE_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final OutpatientTriageRepository triageRepository;
    private final OutpatientRegistrationDirectory registrationDirectory;
    private final ClinicalValidationDirectory clinicalValidationDirectory;
    private final TriageAssessmentEngine assessmentEngine;

    public OutpatientTriageService(OutpatientTriageRepository triageRepository,
                                  OutpatientRegistrationDirectory registrationDirectory,
                                  ClinicalValidationDirectory clinicalValidationDirectory,
                                  TriageAssessmentEngine assessmentEngine) {
        this.triageRepository = triageRepository;
        this.registrationDirectory = registrationDirectory;
        this.clinicalValidationDirectory = clinicalValidationDirectory;
        this.assessmentEngine = assessmentEngine;
    }

    public TriageRecordResponse createTriageRecord(CreateTriageRequest request) {
        Long tenantId = TenantContext.requireTenantId();
        Long orgId = request.organizationId() != null ? request.organizationId() : 362387869790210L;

        // 验证生命体征
        validateVitals(request.temperature(), request.pulseRate(), request.respiratoryRate(),
                request.systolic(), request.diastolic(), request.oxygenSaturation());

        // 生成分诊唯一单号: TR + yyyyMMdd + 6位序列
        String dateStr = LocalDate.now(SHANGHAI_ZONE).format(TRIAGE_DATE_FORMATTER);
        long seq = Math.abs(GlobalIds.next() % 1000000L);
        String triageNo = "TR" + dateStr + String.format("%06d", seq);

        boolean fever = request.fever() || (request.temperature() != null
                && request.temperature().compareTo(BigDecimal.valueOf(37.3)) >= 0);

        OutpatientTriageRecord entity = new OutpatientTriageRecord(
                tenantId, orgId, triageNo, request.patientName().trim(), request.gender().trim());

        entity.updateDemographics(request.residentId(), request.age(), request.birthDate(),
                request.phone(), request.idCardNo(), request.healthRecordNo());

        if (request.nurseId() != null || request.nurseName() != null) {
            entity.updateStaff(request.nurseId(), request.nurseName());
        }

        entity.updateArrivalAndCompanion(request.arrivalMethod(), request.companionType());

        entity.updateClinicalAssessment(
                request.chiefComplaint(),
                request.symptoms(),
                request.temperature(),
                request.pulseRate(),
                request.respiratoryRate(),
                request.systolic(),
                request.diastolic(),
                request.oxygenSaturation(),
                request.bloodGlucose(),
                request.painScore(),
                request.consciousness(),
                fever,
                request.epidemicHistory(),
                request.riskTags()
        );

        RuleAssessment rule = assessmentEngine.assessRules(assessmentRequest(request));
        String safeLevel = TriageAssessmentEngine.moreUrgent(rule.level(), request.triageLevel());
        entity.updateTriageDecision(
                safeLevel,
                safeReason(request.triageReason(), request.triageLevel(), safeLevel, rule.summary()),
                request.targetDepartmentId(),
                request.targetDepartmentName(),
                request.targetDoctorId(),
                request.targetDoctorName(),
                request.greenChannel(),
                request.disposition(),
                request.notes()
        );

        if (request.encounterId() != null) {
            entity.bindEncounter(request.encounterId(), request.registrationId());
        }

        OutpatientTriageRecord saved = triageRepository.save(entity);
        return TriageRecordResponse.from(saved);
    }

    public TriageRecordResponse updateTriageRecord(Long id, UpdateTriageRequest request) {
        Long tenantId = TenantContext.requireTenantId();
        OutpatientTriageRecord entity = triageRepository.findByTenantIdAndId(tenantId, id)
                .orElseThrow(() -> new BusinessException("OUTPATIENT_TRIAGE_NOT_FOUND", "未找到指定预检分诊记录", HttpStatus.NOT_FOUND));

        validateVitals(request.temperature(), request.pulseRate(), request.respiratoryRate(),
                request.systolic(), request.diastolic(), request.oxygenSaturation());

        boolean fever = request.fever() || (request.temperature() != null
                && request.temperature().compareTo(BigDecimal.valueOf(37.3)) >= 0);

        entity.updateDemographics(request.residentId(), request.age(), request.birthDate(),
                request.phone(), request.idCardNo(), request.healthRecordNo());
        entity.updateArrivalAndCompanion(request.arrivalMethod(), request.companionType());
        entity.updateClinicalAssessment(
                request.chiefComplaint(),
                request.symptoms(),
                request.temperature(),
                request.pulseRate(),
                request.respiratoryRate(),
                request.systolic(),
                request.diastolic(),
                request.oxygenSaturation(),
                request.bloodGlucose(),
                request.painScore(),
                request.consciousness(),
                fever,
                request.epidemicHistory(),
                request.riskTags()
        );
        RuleAssessment rule = assessmentEngine.assessRules(assessmentRequest(request));
        String safeLevel = TriageAssessmentEngine.moreUrgent(rule.level(), request.triageLevel());
        entity.updateTriageDecision(
                safeLevel,
                safeReason(request.triageReason(), request.triageLevel(), safeLevel, rule.summary()),
                request.targetDepartmentId(),
                request.targetDepartmentName(),
                request.targetDoctorId(),
                request.targetDoctorName(),
                request.greenChannel(),
                request.disposition(),
                request.notes()
        );

        if (request.status() != null) {
            entity.updateStatus(request.status());
        }
        if (request.encounterId() != null) {
            entity.bindEncounter(request.encounterId(), request.registrationId());
        }

        OutpatientTriageRecord saved = triageRepository.save(entity);
        return TriageRecordResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public TriageRecordResponse getTriageRecord(Long id) {
        Long tenantId = TenantContext.requireTenantId();
        OutpatientTriageRecord entity = triageRepository.findByTenantIdAndId(tenantId, id)
                .orElseThrow(() -> new BusinessException("OUTPATIENT_TRIAGE_NOT_FOUND", "未找到指定预检分诊记录", HttpStatus.NOT_FOUND));
        return TriageRecordResponse.from(entity);
    }

    @Transactional(readOnly = true)
    public TriageRecordResponse getTriageRecordByEncounter(Long encounterId) {
        Long tenantId = TenantContext.requireTenantId();
        return triageRepository.findByTenantIdAndEncounterId(tenantId, encounterId)
                .map(TriageRecordResponse::from)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public Page<TriageRecordResponse> searchTriageRecords(
            Long organizationId, LocalDate date, String triageLevel, String status, String query, Pageable pageable) {
        Long tenantId = TenantContext.requireTenantId();
        LocalDate searchDate = date != null ? date : LocalDate.now(SHANGHAI_ZONE);
        Instant fromTime = searchDate.atStartOfDay(SHANGHAI_ZONE).toInstant();
        Instant toTime = searchDate.plusDays(1).atStartOfDay(SHANGHAI_ZONE).minusNanos(1).toInstant();

        Long orgId = organizationId != null ? organizationId : 362387869790210L;
        String cleanQuery = (query != null && !query.trim().isEmpty()) ? query.trim() : null;
        String cleanLevel = (triageLevel != null && !triageLevel.trim().isEmpty() && !"ALL".equalsIgnoreCase(triageLevel)) ? triageLevel.trim() : null;
        String cleanStatus = (status != null && !status.trim().isEmpty() && !"ALL".equalsIgnoreCase(status)) ? status.trim() : null;

        return triageRepository.searchTriageRecords(tenantId, orgId, fromTime, toTime, cleanLevel, cleanStatus, cleanQuery, pageable)
                .map(TriageRecordResponse::from);
    }

    @Transactional(readOnly = true)
    public TriageStatisticsResponse todayStatistics(Long organizationId, LocalDate date) {
        Long tenantId = TenantContext.requireTenantId();
        LocalDate targetDate = date != null ? date : LocalDate.now(SHANGHAI_ZONE);
        Instant fromTime = targetDate.atStartOfDay(SHANGHAI_ZONE).toInstant();
        Instant toTime = targetDate.plusDays(1).atStartOfDay(SHANGHAI_ZONE).minusNanos(1).toInstant();
        Long orgId = organizationId != null ? organizationId : 362387869790210L;

        List<OutpatientTriageRecord> records = triageRepository.findTodayRecords(tenantId, orgId, fromTime, toTime);

        long total = records.size();
        long l1 = records.stream().filter(r -> "LEVEL_1_CRITICAL".equalsIgnoreCase(r.getTriageLevel())).count();
        long l2 = records.stream().filter(r -> "LEVEL_2_URGENT".equalsIgnoreCase(r.getTriageLevel())).count();
        long l3 = records.stream().filter(r -> "LEVEL_3_ROUTINE_URGENT".equalsIgnoreCase(r.getTriageLevel())).count();
        long l4 = records.stream().filter(r -> "LEVEL_4_NON_URGENT".equalsIgnoreCase(r.getTriageLevel())).count();
        long fever = records.stream().filter(OutpatientTriageRecord::isFever).count();
        long greenChannel = records.stream().filter(r -> r.getGreenChannel() != null && !"NONE".equalsIgnoreCase(r.getGreenChannel())).count();

        return new TriageStatisticsResponse(total, l1, l2, l3, l4, fever, greenChannel);
    }

    public TriageRecordResponse bindEncounter(Long triageId, Long encounterId, Long registrationId) {
        Long tenantId = TenantContext.requireTenantId();
        OutpatientTriageRecord record = triageRepository.findByTenantIdAndId(tenantId, triageId)
                .orElseThrow(() -> new BusinessException("OUTPATIENT_TRIAGE_NOT_FOUND", "未找到指定预检分诊记录", HttpStatus.NOT_FOUND));
        record.bindEncounter(encounterId, registrationId);
        return TriageRecordResponse.from(triageRepository.save(record));
    }

    @Transactional(readOnly = true)
    public List<PendingEncounterResponse> listPendingEncounters(LocalDate date) {
        Long tenantId = TenantContext.requireTenantId();
        LocalDate queueDate = date != null ? date : LocalDate.now(SHANGHAI_ZONE);

        List<ReceptionQueueItem> rawQueue = registrationDirectory.queue(queueDate);
        if (rawQueue == null || rawQueue.isEmpty()) {
            return Collections.emptyList();
        }

        Instant fromTime = queueDate.atStartOfDay(SHANGHAI_ZONE).toInstant();
        Instant toTime = queueDate.plusDays(1).atStartOfDay(SHANGHAI_ZONE).minusNanos(1).toInstant();

        // 获取今天所有已分诊记录，建立 encounterId 映射
        Long orgId = 362387869790210L;
        List<OutpatientTriageRecord> todayTriages = triageRepository.findTodayRecords(tenantId, orgId, fromTime, toTime);
        Map<Long, OutpatientTriageRecord> triageByEncounter = todayTriages.stream()
                .filter(t -> t.getEncounterId() != null)
                .collect(Collectors.toMap(OutpatientTriageRecord::getEncounterId, t -> t, (a, b) -> a));

        List<PendingEncounterResponse> results = new ArrayList<>();
        for (ReceptionQueueItem item : rawQueue) {
            OutpatientTriageRecord tr = triageByEncounter.get(item.encounterId());
            boolean triaged = tr != null;
            String level = tr != null ? tr.getTriageLevel() : null;
            Long trId = tr != null ? tr.getId() : null;
            String trNo = tr != null ? tr.getTriageNo() : null;

            int ageVal = 0;
            if (item.birthDate() != null) {
                ageVal = Math.max(0, queueDate.getYear() - item.birthDate().getYear());
            }

            results.add(new PendingEncounterResponse(
                    item.encounterId(),
                    item.registrationId(),
                    item.residentId(),
                    item.healthRecordNo(),
                    item.residentName(),
                    item.gender(),
                    item.birthDate(),
                    ageVal,
                    null, // phone
                    item.registrationNo(),
                    item.ticketNo(),
                    item.sequenceNo(),
                    item.serviceQueueId(),
                    item.serviceName(),
                    item.practitionerName(),
                    item.registeredAt(),
                    triaged,
                    level,
                    trId,
                    trNo
            ));
        }

        // 待分诊排在前面
        results.sort(Comparator.comparing(PendingEncounterResponse::triaged)
                .thenComparing(PendingEncounterResponse::sequenceNo));
        return results;
    }

    @Transactional(readOnly = true)
    public List<DepartmentRecommendationResponse> recommendDepartments(
            String chiefComplaint, String symptoms, BigDecimal temp, BigDecimal sbp, BigDecimal dbp,
            BigDecimal spo2, BigDecimal pulse, Integer age, String gender) {
        return assessmentEngine.assess(new BaselineInput(chiefComplaint, symptoms, temp, pulse, null, sbp, dbp,
                        spo2, null, null, "ALERT", age, gender)).departmentRecommendations().stream()
                .map(value -> new DepartmentRecommendationResponse(value.departmentId(), value.departmentName(),
                        value.score(), value.rationale(), value.availableSlotCount(), value.alertNotice(),
                        "LOCAL_ASSIST", value.scheduledToday()))
                .toList();
    }

    private static BaselineInput assessmentRequest(CreateTriageRequest request) {
        return new BaselineInput(request.chiefComplaint(), request.symptoms(), request.temperature(),
                request.pulseRate(), request.respiratoryRate(), request.systolic(), request.diastolic(),
                request.oxygenSaturation(), request.bloodGlucose(), request.painScore(), request.consciousness(),
                request.age(), request.gender());
    }

    private static BaselineInput assessmentRequest(UpdateTriageRequest request) {
        return new BaselineInput(request.chiefComplaint(), request.symptoms(), request.temperature(),
                request.pulseRate(), request.respiratoryRate(), request.systolic(), request.diastolic(),
                request.oxygenSaturation(), request.bloodGlucose(), request.painScore(), request.consciousness(),
                request.age(), request.gender());
    }

    private static String safeReason(String submittedReason, String submittedLevel, String safeLevel,
                                     String ruleSummary) {
        if (safeLevel.equals(submittedLevel)) return submittedReason;
        String prefix = submittedReason == null || submittedReason.isBlank() ? "" : submittedReason.trim() + "；";
        return prefix + "系统安全规则已将分级提升至最低安全级别：" + ruleSummary;
    }

    private void validateVitals(BigDecimal temp, BigDecimal pulse, BigDecimal resp,
                                BigDecimal sbp, BigDecimal dbp, BigDecimal spo2) {
        if (temp == null && pulse == null && resp == null && sbp == null && dbp == null && spo2 == null) {
            return;
        }
        try {
            clinicalValidationDirectory.validateVitalSigns(new VitalSignsInput(
                    temp, pulse, resp, sbp, dbp, spo2, null, null, null, null
            ));
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            // 如有特定校验错误，转为业务异常
            throw new BusinessException("CLINICAL_VITAL_INVALID", "生命体征数值超出医学正常范围: " + e.getMessage(), HttpStatus.BAD_REQUEST);
        }
    }
}
