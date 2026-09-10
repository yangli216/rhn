package com.rhn.outpatient.triage;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import com.rhn.healthcore.api.ClinicalValidationDirectory.VitalSignsInput;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory;
import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
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
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@Transactional
public class OutpatientTriageService {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter TRIAGE_DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final OutpatientTriageRepository triageRepository;
    private final OutpatientRegistrationDirectory registrationDirectory;
    private final ClinicalValidationDirectory clinicalValidationDirectory;

    public OutpatientTriageService(OutpatientTriageRepository triageRepository,
                                  OutpatientRegistrationDirectory registrationDirectory,
                                  ClinicalValidationDirectory clinicalValidationDirectory) {
        this.triageRepository = triageRepository;
        this.registrationDirectory = registrationDirectory;
        this.clinicalValidationDirectory = clinicalValidationDirectory;
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

        entity.updateTriageDecision(
                request.triageLevel(),
                request.triageReason(),
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
        entity.updateTriageDecision(
                request.triageLevel(),
                request.triageReason(),
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

        String text = (Objects.toString(chiefComplaint, "") + " " + Objects.toString(symptoms, "")).toLowerCase();
        List<DepartmentRecommendationResponse> list = new ArrayList<>();

        boolean isChild = age != null && age < 14;
        boolean isFemale = "FEMALE".equalsIgnoreCase(gender) || "女".equals(gender);

        // 1. 发热门诊 / 感染科
        boolean hasFeverSign = (temp != null && temp.compareTo(BigDecimal.valueOf(37.3)) >= 0)
                || text.contains("发热") || text.contains("发烧") || text.contains("高热");
        if (hasFeverSign) {
            int score = (temp != null && temp.compareTo(BigDecimal.valueOf(38.5)) >= 0) ? 96 : 90;
            list.add(new DepartmentRecommendationResponse(
                    362387869800010L, "发热门诊", score,
                    "体温超过 37.3℃ 发热警戒线或主诉发热发烧，建议进入发热筛查专线", 12,
                    temp != null && temp.compareTo(BigDecimal.valueOf(38.5)) >= 0 ? "体温达到高热(≥38.5℃)，请护士优先物理降温及指引" : null
            ));
        }

        // 2. 心血管内科 (胸痛通道)
        boolean hasChestPain = text.contains("胸痛") || text.contains("胸闷") || text.contains("心前区")
                || text.contains("压榨") || text.contains("心悸") || text.contains("气促");
        boolean bpCrisis = (sbp != null && sbp.compareTo(BigDecimal.valueOf(180)) >= 0)
                || (dbp != null && dbp.compareTo(BigDecimal.valueOf(110)) >= 0);
        if (hasChestPain || bpCrisis) {
            int score = (hasChestPain && bpCrisis) ? 98 : (hasChestPain ? 94 : 88);
            String note = bpCrisis ? "收缩压≥180mmHg或舒张压≥110mmHg，属高血压危象，必须优先干预！" : "胸部压榨性疼痛伴大汗需警惕急性心肌梗死，建议启动胸痛绿色通道。";
            list.add(new DepartmentRecommendationResponse(
                    362387869800002L, "心血管内科", score,
                    "主诉胸部疼痛或血压严重异常，建议心内科排查冠心病及心肌缺血", 8, note
            ));
        }

        // 3. 神经内科 (脑卒中通道)
        boolean hasStrokeSign = text.contains("头痛") || text.contains("眩晕") || text.contains("头晕")
                || text.contains("肢体麻木") || text.contains("偏瘫") || text.contains("言语不清")
                || text.contains("口角歪斜") || text.contains("抽搐") || text.contains("意识模糊");
        if (hasStrokeSign) {
            int score = (text.contains("偏瘫") || text.contains("口角歪斜") || text.contains("言语不清")) ? 97 : 89;
            String notice = score >= 95 ? "符合 FAST 脑卒中危急征象，请立即安排卒中绿色通道及急查头颅CT！" : null;
            list.add(new DepartmentRecommendationResponse(
                    362387869800003L, "神经内科", score,
                    "突发眩晕、头痛或单侧肢体感觉/运动障碍，需重点筛查缺血性或出血性卒中", 6, notice
            ));
        }

        // 4. 呼吸内科
        boolean hasRespiratory = text.contains("咳嗽") || text.contains("咳痰") || text.contains("喘息")
                || text.contains("咽痛") || text.contains("呼吸困难") || text.contains("胸闷");
        if (hasRespiratory && !hasChestPain) {
            list.add(new DepartmentRecommendationResponse(
                    362387869800004L, "呼吸内科", 87,
                    "伴有咳嗽、咳痰等呼吸系统症状，推荐呼吸内科专科诊疗", 15,
                    spo2 != null && spo2.compareTo(BigDecimal.valueOf(93)) < 0 ? "血氧饱和度低于 93%，存在低氧血症风险，需给予吸氧！" : null
            ));
        }

        // 5. 消化内科 / 普外科 (腹痛)
        boolean hasGastro = text.contains("腹痛") || text.contains("腹泻") || text.contains("恶心")
                || text.contains("呕吐") || text.contains("便血") || text.contains("胃痛") || text.contains("反酸");
        if (hasGastro) {
            int score = text.contains("剧烈腹痛") || text.contains("便血") ? 92 : 86;
            list.add(new DepartmentRecommendationResponse(
                    362387869800005L, "消化内科", score,
                    "出现消化道或腹部不适症状，建议消化专科就诊；若压痛反跳痛明显需排查急腹症", 10,
                    text.contains("便血") ? "便血或黑便警惕上消化道出血" : null
            ));
        }

        // 6. 骨科 / 创伤
        boolean hasTrauma = text.contains("外伤") || text.contains("摔伤") || text.contains("扭伤")
                || text.contains("骨折") || text.contains("跌倒") || text.contains("出血") || text.contains("关节痛");
        if (hasTrauma) {
            list.add(new DepartmentRecommendationResponse(
                    362387869800006L, "骨科", 91,
                    "运动系统外伤、跌倒损伤或骨关节剧痛，推荐骨科就诊", 9,
                    text.contains("出血") ? "若伤口持续活动性出血，请先前往换药处置室止血包扎" : null
            ));
        }

        // 7. 儿科
        if (isChild) {
            list.add(new DepartmentRecommendationResponse(
                    362387869800007L, "儿科", 95,
                    "患者年龄小于14周岁，符合儿童专科就医要求", 14, null
            ));
        }

        // 8. 妇产科
        if (isFemale && (text.contains("月经") || text.contains("停经") || text.contains("下腹痛")
                || text.contains("阴道流血") || text.contains("孕") || text.contains("白带"))) {
            list.add(new DepartmentRecommendationResponse(
                    362387869800008L, "妇产科", 93,
                    "女性生殖系统或妊娠相关临床表现，推荐妇产科专科", 7,
                    text.contains("停经") && text.contains("下腹痛") ? "育龄期女性停经伴腹痛需高度警惕异位妊娠破裂！" : null
            ));
        }

        // 9. 全科医疗科 (保底常设)
        list.add(new DepartmentRecommendationResponse(
                    362387869800001L, "全科医疗科", list.isEmpty() ? 90 : 75,
                    "综合诊疗、常见病多发病筛查、慢性病签约与定期开药复诊", 25, null
        ));

        // 按得分倒序
        list.sort(Comparator.comparingInt(DepartmentRecommendationResponse::score).reversed());
        return list;
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
