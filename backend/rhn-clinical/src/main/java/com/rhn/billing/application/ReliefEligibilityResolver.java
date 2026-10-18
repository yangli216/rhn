package com.rhn.billing.application;

import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefAttributeConditions;
import com.rhn.billing.domain.ReliefPolicyVersion;
import com.rhn.billing.domain.ReliefQualification;
import com.rhn.billing.domain.ReliefQualificationMode;
import com.rhn.billing.domain.ReliefRosterEntry;
import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.Period;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 按政策版本的资格条件判定居民是否享受：名单按资格类别与业务日期有效期判定，属性条件按年龄、性别与本次医保险种判定。
 * 外部资格接口尚未接入，按配置的失败处理执行：阻断结算、视为不符合，或提示需人工确认（本期等同不符合）。
 * 判定依据作为快照写入减免记录。
 */
@Component
class ReliefEligibilityResolver {
    private final JsonCodec json;

    ReliefEligibilityResolver(JsonCodec json) { this.json = json; }

    Eligibility resolve(ReliefPolicyVersion version, List<ReliefQualification> qualifications, Facts facts) {
        if (qualifications.isEmpty()) return new Eligibility(false, "政策未配置资格条件", null);
        List<Map<String, Object>> evidence = new ArrayList<>();
        List<String> failures = new ArrayList<>();
        for (ReliefQualification qualification : qualifications) {
            String failure = check(qualification, facts, evidence);
            if (failure != null) failures.add(failure);
        }
        boolean eligible = version.qualificationMode() == ReliefQualificationMode.ALL
                ? failures.isEmpty() : failures.size() < qualifications.size();
        return new Eligibility(eligible, eligible ? null : String.join("；", failures),
                eligible ? json.write(evidence) : null);
    }

    private String check(ReliefQualification qualification, Facts facts, List<Map<String, Object>> evidence) {
        return switch (qualification.source()) {
            case ALL -> {
                evidence.add(Map.of("source", "ALL"));
                yield null;
            }
            case ROSTER -> {
                ReliefRosterEntry entry = facts.roster().stream()
                        .filter(value -> value.qualificationType().equals(qualification.qualificationType())
                                && value.validOn(facts.businessDate()))
                        .findFirst().orElse(null);
                if (entry == null) yield "不在有效的“" + facts.typeName(qualification.qualificationType()) + "”名单中";
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("source", "ROSTER"); item.put("qualificationType", entry.qualificationType());
                item.put("rosterId", String.valueOf(entry.id()));
                if (entry.evidenceNo() != null) item.put("evidenceNo", entry.evidenceNo());
                evidence.add(item);
                yield null;
            }
            case ATTRIBUTE -> {
                ReliefAttributeConditions conditions = json.read(qualification.conditionsJson(), ReliefAttributeConditions.class);
                String failure = attributeFailure(conditions, facts);
                if (failure == null) evidence.add(Map.of("source", "ATTRIBUTE", "conditions", conditions));
                yield failure;
            }
            case PROVIDER -> switch (qualification.failurePolicy()) {
                case BLOCK -> throw conflict("RELIEF_QUALIFICATION_PROVIDER_UNAVAILABLE",
                        "外部资格接口“" + qualification.providerCode() + "”尚未接入，按政策配置阻断结算");
                case INELIGIBLE -> "外部资格接口尚未接入，本次不享受";
                case MANUAL_CONFIRM -> "外部资格需人工确认，本期暂不支持";
            };
        };
    }

    private static String attributeFailure(ReliefAttributeConditions conditions, Facts facts) {
        ResidentSnapshot resident = facts.resident();
        if (conditions.minAge() != null || conditions.maxAge() != null) {
            if (resident.birthDate() == null) return "居民缺少出生日期，无法判断年龄条件";
            int age = Period.between(resident.birthDate(), facts.businessDate()).getYears();
            if (conditions.minAge() != null && age < conditions.minAge()) return "年龄未达到 " + conditions.minAge() + " 岁";
            if (conditions.maxAge() != null && age > conditions.maxAge()) return "年龄超过 " + conditions.maxAge() + " 岁";
        }
        if (conditions.genders() != null && !conditions.genders().isEmpty()
                && !conditions.genders().contains(resident.gender())) {
            return "性别不符合政策条件";
        }
        if (conditions.coverageTypes() != null && !conditions.coverageTypes().isEmpty()) {
            if (facts.coverageType() == null) return "未使用医保结算，无法判断险种条件";
            if (conditions.coverageTypes().stream().noneMatch(type -> type.equalsIgnoreCase(facts.coverageType()))) {
                return "医保险种不符合政策条件";
            }
        }
        return null;
    }

    /** 判定所需事实：居民、有效名单、本次医保险种（自费为空）和业务日期。 */
    record Facts(ResidentSnapshot resident, List<ReliefRosterEntry> roster, String coverageType,
                 LocalDate businessDate, Map<String, String> qualificationTypeNames) {
        String typeName(String code) { return qualificationTypeNames.getOrDefault(code, code); }
    }

    record Eligibility(boolean eligible, String reason, String evidenceJson) {}
}
