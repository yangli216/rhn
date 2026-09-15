package com.rhn.outpatient.triage;

import com.rhn.outpatient.api.OutpatientScheduleAvailabilityDirectory;
import com.rhn.outpatient.api.OutpatientScheduleAvailabilityDirectory.DepartmentAvailability;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineAssessment;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.BaselineInput;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.CandidateDepartment;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.DepartmentRecommendation;
import com.rhn.outpatient.api.OutpatientTriageAssessmentDirectory.RuleAssessment;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class TriageAssessmentEngine implements OutpatientTriageAssessmentDirectory {
    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    private final OutpatientScheduleAvailabilityDirectory scheduleDirectory;
    private final ExecutionContextProvider contextProvider;

    public TriageAssessmentEngine(OutpatientScheduleAvailabilityDirectory scheduleDirectory,
                                  ExecutionContextProvider contextProvider) {
        this.scheduleDirectory = scheduleDirectory;
        this.contextProvider = contextProvider;
    }

    @Override
    @Transactional(readOnly = true)
    public BaselineAssessment assess(BaselineInput input) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long organizationId = context.organizationId();
        RuleAssessment rule = assessRules(input);
        List<DepartmentAvailability> departments = organizationId == null ? List.of()
                : scheduleDirectory.listDepartmentAvailability(context.tenantId(), organizationId,
                LocalDate.now(SHANGHAI_ZONE));
        return new BaselineAssessment(rule, localRecommendations(input, departments), departments.stream()
                .map(value -> new CandidateDepartment(value.departmentId(), value.departmentName(),
                        value.availableSlotCount(), value.scheduledToday())).toList());
    }

    @Override
    public RuleAssessment assessRules(BaselineInput input) {
        List<String> reasons = new ArrayList<>();
        List<String> dangerSigns = new ArrayList<>();
        boolean critical = false;
        boolean warning = false;

        if (input.consciousness() != null && !"ALERT".equalsIgnoreCase(input.consciousness())) {
            critical = true;
            add(dangerSigns, "意识状态异常");
            add(reasons, "意识状态异常，需立即评估");
        }
        if (outside(input.temperature(), 35, 40, true)) {
            critical = true; add(dangerSigns, "体温严重异常"); add(reasons, "体温达到危急阈值");
        } else if (atLeast(input.temperature(), 37.3)) warning = true;
        if (below(input.systolic(), 80) || atLeast(input.systolic(), 180)) {
            critical = true; add(dangerSigns, "收缩压严重异常"); add(reasons, "收缩压达到危急阈值");
        } else if (atLeast(input.systolic(), 150)) warning = true;
        if (below(input.diastolic(), 50) || atLeast(input.diastolic(), 110)) {
            critical = true; add(dangerSigns, "舒张压严重异常"); add(reasons, "舒张压达到危急阈值");
        } else if (atLeast(input.diastolic(), 95)) warning = true;
        if (below(input.pulseRate(), 45) || above(input.pulseRate(), 130)) {
            critical = true; add(dangerSigns, "心率严重异常"); add(reasons, "心率达到危急阈值");
        } else if (between(input.pulseRate(), 45, 55) || between(input.pulseRate(), 100, 130)) warning = true;
        if (below(input.respiratoryRate(), 8) || above(input.respiratoryRate(), 30)) {
            critical = true; add(dangerSigns, "呼吸频率严重异常"); add(reasons, "呼吸频率达到危急阈值");
        } else if (above(input.respiratoryRate(), 24)) warning = true;
        if (below(input.oxygenSaturation(), 93)) {
            critical = true; add(dangerSigns, "血氧饱和度低于93%"); add(reasons, "存在低氧血症风险");
        } else if (below(input.oxygenSaturation(), 95)) warning = true;
        if (below(input.bloodGlucose(), 2.8) || atLeast(input.bloodGlucose(), 16.7)) {
            critical = true; add(dangerSigns, "血糖达到危急阈值"); add(reasons, "血糖严重异常");
        } else if (between(input.bloodGlucose(), 2.8, 3.9)
                || between(input.bloodGlucose(), 11.1, 16.7)) warning = true;

        String clinicalText = (clean(input.chiefComplaint()) + " " + clean(input.symptoms())).toLowerCase(Locale.ROOT);
        boolean stroke = containsAny(clinicalText, "偏瘫", "口角歪斜", "言语不清", "突发肢体麻木");
        boolean chest = containsAny(clinicalText, "胸骨后压榨", "胸部压榨", "心前区压榨", "胸痛伴大汗");
        boolean severeBreathing = containsAny(clinicalText, "严重呼吸困难", "窒息", "咯血不止");
        if (stroke || chest || severeBreathing) {
            add(dangerSigns, stroke ? "疑似脑卒中征象" : chest ? "高危胸痛征象" : "严重呼吸道危险征象");
            add(reasons, "主诉存在需优先处置的危险征象");
        }

        String level;
        if (critical) level = "LEVEL_1_CRITICAL";
        else if ((input.painScore() != null && input.painScore() >= 7) || stroke || chest || severeBreathing) {
            level = "LEVEL_2_URGENT";
            if (input.painScore() != null && input.painScore() >= 7) add(reasons, "疼痛评分达到7分及以上");
        } else if (warning || atLeast(input.temperature(), 38)) {
            level = "LEVEL_3_ROUTINE_URGENT";
            add(reasons, "生命体征存在预警，建议30分钟内接诊");
        } else {
            level = "LEVEL_4_NON_URGENT";
            add(reasons, "当前资料未触发急危重规则");
        }
        return new RuleAssessment(level, String.join("；", reasons), List.copyOf(reasons), List.copyOf(dangerSigns));
    }

    private List<DepartmentRecommendation> localRecommendations(BaselineInput input,
                                                                List<DepartmentAvailability> departments) {
        String text = (clean(input.chiefComplaint()) + " " + clean(input.symptoms())).toLowerCase(Locale.ROOT);
        LinkedHashMap<Long, DepartmentRecommendation> result = new LinkedHashMap<>();
        if (input.age() != null && input.age() < 14) addMatching(result, departments,
                List.of("儿科"), 96, "儿童患者优先匹配儿科接诊资源", null);
        boolean bloodPressureCrisis = atLeast(input.systolic(), 180) || atLeast(input.diastolic(), 110);
        if (bloodPressureCrisis || containsAny(text, "胸痛", "胸部绞痛", "胸闷", "心前区", "压榨", "心悸")) addMatching(result, departments,
                List.of("心血管", "内科", "急诊", "全科"), 94, "存在胸部或心血管相关症状", "高危胸痛应优先启动胸痛救治流程");
        if (containsAny(text, "偏瘫", "口角歪斜", "言语不清", "头痛", "眩晕", "抽搐")) addMatching(result, departments,
                List.of("神经", "内科", "急诊", "全科"), 92, "存在神经系统相关症状", "突发偏瘫、口角歪斜或言语不清需立即评估卒中通道");
        if (atLeast(input.temperature(), 37.3) || containsAny(text, "发热", "发烧", "高热")) addMatching(result, departments,
                List.of("发热", "感染", "呼吸", "内科", "全科"), 90, "存在发热或感染相关表现", null);
        if (containsAny(text, "咳嗽", "咳痰", "喘息", "咽痛", "呼吸困难")) addMatching(result, departments,
                List.of("呼吸", "内科", "全科"), 88, "存在呼吸系统相关症状", below(input.oxygenSaturation(), 93) ? "血氧低于93%，需优先处置" : null);
        if (containsAny(text, "腹痛", "腹泻", "恶心", "呕吐", "便血", "胃痛")) addMatching(result, departments,
                List.of("消化", "内科", "外科", "全科"), 87, "存在消化系统或腹部症状", containsAny(text, "便血", "黑便") ? "便血或黑便需排查消化道出血" : null);
        if (containsAny(text, "外伤", "摔伤", "扭伤", "骨折", "跌倒", "关节痛")) addMatching(result, departments,
                List.of("骨科", "外科", "急诊", "全科"), 91, "存在创伤或运动系统症状", null);
        if (("FEMALE".equalsIgnoreCase(input.gender()) || "女".equals(input.gender()))
                && containsAny(text, "月经", "停经", "下腹痛", "阴道流血", "妊娠", "孕")) addMatching(result, departments,
                List.of("妇产", "妇科"), 93, "存在妇产科相关症状", null);
        if (result.isEmpty()) addMatching(result, departments, List.of("全科", "内科"), 80,
                "根据当前有限资料建议先由综合门诊评估", null);
        if (result.isEmpty()) departments.stream().sorted(Comparator
                        .comparing(DepartmentAvailability::scheduledToday).reversed()
                        .thenComparing(Comparator.comparingInt(DepartmentAvailability::availableSlotCount).reversed()))
                .limit(3).forEach(value -> result.put(value.departmentId(), response(value, 70,
                        "当前机构可接诊临床科室", null, "LOCAL_ASSIST")));
        return result.values().stream().limit(5).toList();
    }

    private static void addMatching(Map<Long, DepartmentRecommendation> target,
                                    List<DepartmentAvailability> departments, List<String> keywords, int score,
                                    String rationale, String alert) {
        for (int index = 0; index < keywords.size(); index++) {
            String keyword = keywords.get(index);
            int adjusted = Math.max(60, score - index * 3);
            departments.stream().filter(value -> value.departmentName().contains(keyword))
                    .sorted(Comparator.comparing(DepartmentAvailability::scheduledToday).reversed()
                            .thenComparing(Comparator.comparingInt(DepartmentAvailability::availableSlotCount).reversed()))
                    .forEach(value -> target.putIfAbsent(value.departmentId(),
                            response(value, adjusted, rationale, alert, "LOCAL_ASSIST")));
        }
    }

    private static DepartmentRecommendation response(DepartmentAvailability value, int score,
                                                     String rationale, String alert, String source) {
        return new DepartmentRecommendation(value.departmentId(), value.departmentName(), score, rationale,
                value.availableSlotCount(), alert, value.scheduledToday());
    }

    public static String moreUrgent(String left, String right) {
        return urgency(left) <= urgency(right) ? left : right;
    }

    private static int urgency(String level) {
        return switch (level) {
            case "LEVEL_1_CRITICAL" -> 1;
            case "LEVEL_2_URGENT" -> 2;
            case "LEVEL_3_ROUTINE_URGENT" -> 3;
            default -> 4;
        };
    }

    private static boolean outside(BigDecimal value, double low, double high, boolean highInclusive) {
        return below(value, low) || (highInclusive ? atLeast(value, high) : above(value, high));
    }
    private static boolean below(BigDecimal value, double threshold) {
        return value != null && value.compareTo(BigDecimal.valueOf(threshold)) < 0;
    }
    private static boolean above(BigDecimal value, double threshold) {
        return value != null && value.compareTo(BigDecimal.valueOf(threshold)) > 0;
    }
    private static boolean atLeast(BigDecimal value, double threshold) {
        return value != null && value.compareTo(BigDecimal.valueOf(threshold)) >= 0;
    }
    private static boolean between(BigDecimal value, double lowInclusive, double highInclusive) {
        return value != null && value.compareTo(BigDecimal.valueOf(lowInclusive)) >= 0
                && value.compareTo(BigDecimal.valueOf(highInclusive)) <= 0;
    }
    private static boolean containsAny(String value, String... needles) {
        for (String needle : needles) if (value.contains(needle)) return true;
        return false;
    }
    private static void add(List<String> values, String value) {
        if (!values.contains(value)) values.add(value);
    }
    private static String clean(String value) { return value == null ? "" : value.trim(); }
}
