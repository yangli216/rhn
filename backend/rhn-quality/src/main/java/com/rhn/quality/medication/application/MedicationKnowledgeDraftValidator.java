package com.rhn.quality.medication.application;

import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.platform.masterdata.api.StandardMedicationReferenceDirectory;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.shared.api.BusinessException;
import org.springframework.stereotype.Component;
import java.time.LocalDate;
import java.util.*;

/** Structural checks only: completeness is never evidence verification or permission to execute clinically. */
@Component
public class MedicationKnowledgeDraftValidator {
    private final StandardMedicationReferenceDirectory standards;
    private final MedicationRouteDirectory routes;
    public MedicationKnowledgeDraftValidator(StandardMedicationReferenceDirectory standards, MedicationRouteDirectory routes) {
        this.standards = standards; this.routes = routes;
    }
    public Assessment assess(Long tenant, Body body) {
        var issues = new ArrayList<Issue>();
        if (body == null) return new Assessment(false, List.of(new Issue("body", "REQUIRED", "请填写知识草稿")), "未形成规则说明", List.of(), List.of(), List.of(), List.of());
        required(issues, "title", body.title(), "知识标题", 200);
        choice(issues, "kind", body.kind(), "规则类型", "DUPLICATE_THERAPY", "DRUG_INTERACTION");
        boolean interaction = "DRUG_INTERACTION".equals(body.kind());
        if (interaction) choice(issues, "matchMode", body.matchMode(), "相互作用匹配方式", "GROUP_PAIR");
        else choice(issues, "matchMode", body.matchMode(), "重复用药匹配方式", "SAME_STANDARD_ENTRY", "EXPLICIT_GROUP");
        boolean universal = !interaction && "SAME_STANDARD_ENTRY".equals(body.matchMode());
        var a = resolve(issues, "groupA", body.groupA(), !universal);
        var b = resolve(issues, "groupB", body.groupB(), interaction);
        if (universal && !list(body.groupA()).isEmpty()) issue(issues, "groupA", "UNUSED", "同一标准条目模式不应附带指定药品组");
        if (!interaction && !list(body.groupB()).isEmpty()) issue(issues, "groupB", "UNUSED", "重复用药仅使用 A 组，请清除 B 组");
        if (interaction && a.stream().anyMatch(x -> b.stream().anyMatch(y -> overlap(x, y))))
            issue(issues, "groupB", "OVERLAPPING_GROUPS", "A、B 组范围重叠，请明确是重复治疗还是不同药物之间的相互作用");
        if (!interaction && (body.minimumOrders() == null || body.minimumOrders() < 2 || body.minimumOrders() > 20))
            issue(issues, "minimumOrders", "RANGE", "重复用药触发条数需为 2 至 20");
        if (interaction && body.minimumOrders() != null) issue(issues, "minimumOrders", "UNUSED", "相互作用使用 A、B 两组不同医嘱配对，不使用重复条数");
        choice(issues, "exposureScope", body.exposureScope(), "检查范围", "SAME_PRESCRIPTION");
        var c = body.conditions();
        List<RouteSnapshot> ar = List.of(), br = List.of();
        if (c == null) issue(issues, "conditions", "REQUIRED", "需明确适用人群和给药途径");
        else {
            choice(issues, "conditions.ageMode", c.ageMode(), "年龄范围", "ALL", "RANGE");
            if ("RANGE".equals(c.ageMode())) {
                choice(issues, "conditions.ageUnit", c.ageUnit(), "年龄单位", "YEAR", "MONTH", "DAY");
                if (c.minimumAgeInclusive() == null && c.maximumAgeExclusive() == null || c.minimumAgeInclusive() != null && c.minimumAgeInclusive() < 0
                        || c.maximumAgeExclusive() != null && c.maximumAgeExclusive() <= 0 || c.minimumAgeInclusive() != null && c.maximumAgeExclusive() != null && c.minimumAgeInclusive() >= c.maximumAgeExclusive())
                    issue(issues, "conditions.age", "RANGE", "需填写有效年龄下限（含）或上限（不含）");
            } else if (c.minimumAgeInclusive() != null || c.maximumAgeExclusive() != null)
                issue(issues, "conditions.age", "UNUSED", "不限年龄时不能保留隐含年龄阈值");
            ar = route(tenant, issues, "conditions.groupARoutes", c.groupARoutes());
            if (interaction) br = route(tenant, issues, "conditions.groupBRoutes", c.groupBRoutes());
            else if (c.groupBRoutes() != null && (!"ALL".equals(c.groupBRoutes().mode()) || !list(c.groupBRoutes().codes()).isEmpty()))
                issue(issues, "conditions.groupBRoutes", "UNUSED", "重复用药不使用 B 组途径条件");
            if (!blank(c.additionalConditions())) issue(issues, "conditions.additionalConditions", "UNSTRUCTURED", "补充条件尚未结构化，不能直接执行；请保留原文等待能力扩展");
        }
        var e = body.evidence();
        if (e == null) issue(issues, "evidence", "REQUIRED", "缺少来源证据");
        else {
            choice(issues, "evidence.sourceType", e.sourceType(), "来源类型", "LABEL", "GUIDELINE", "LITERATURE", "INSTITUTION_POLICY", "REGULATION");
            required(issues, "evidence.title", e.title(), "来源标题", 500);
            required(issues, "evidence.publisher", e.publisher(), "发布机构", 300);
            required(issues, "evidence.edition", e.edition(), "来源版本或发布日期", 200);
            required(issues, "evidence.locator", e.locator(), "原文页码、章节或链接", 2000);
            required(issues, "evidence.excerpt", e.excerpt(), "支持该规则的原文片段", 8000);
            if (e.documentHash() == null || !e.documentHash().matches("(?i)[0-9a-f]{64}")) issue(issues, "evidence.documentHash", "SHA256", "需补充来源文件 SHA-256 指纹，以锁定具体证据版本");
            if (e.effectiveTo() != null && e.effectiveFrom() != null && e.effectiveTo().isBefore(e.effectiveFrom())) issue(issues, "evidence.effectiveTo", "RANGE", "来源有效期结束日不能早于开始日");
        }
        required(issues, "clinicalMeaning", body.clinicalMeaning(), "临床意义与处置说明", 4000);
        choice(issues, "severity", body.severity(), "建议风险等级", "LOW", "MEDIUM", "HIGH", "CRITICAL");
        choice(issues, "proposedAction", body.proposedAction(), "建议动作", "WARN", "REQUIRE_OVERRIDE", "BLOCK");
        String description = interaction ? "同一处方中，A 组与 B 组各有一条不同的有效医嘱，且分别满足人群及途径条件时，形成相互作用候选命中。"
                : universal ? "同一处方中，同一标准条目下的不同有效医嘱达到 " + body.minimumOrders() + " 条，且满足人群及途径条件时，形成重复开立候选命中。标准条目不等同于活性成分。"
                : "同一处方中，明确列出的 A 组药品合计达到 " + body.minimumOrders() + " 条不同有效医嘱，且满足人群及途径条件时，形成重复治疗候选命中。组内等效性须由证据审核确认。";
        return new Assessment(issues.isEmpty(), List.copyOf(issues), description, a, b, ar, br);
    }
    private List<ResolvedTarget> resolve(List<Issue> issues, String field, List<Target> targets, boolean required) {
        if (required && list(targets).isEmpty()) issue(issues, field, "REQUIRED", "请从标准目录选择 " + field + " 药品范围");
        var result = new ArrayList<ResolvedTarget>();
        for (var t : list(targets)) {
            if (t == null) {issue(issues, field, "INVALID", "药品范围不可为空"); continue;}
            choice(issues, field, t.level(), "范围层级", "ENTRY", "SPECIFICATION");
            if (blank(t.specificationId())) {issue(issues, field, "REQUIRED", "缺少标准规格标识"); continue;}
            try {
                var r = standards.requireSpecification(t.specificationId());
                if (!Objects.equals(t.catalogId(), r.catalogId()) || !Objects.equals(t.catalogVersion(), r.catalogVersion()) || !Objects.equals(t.contentHash(), r.contentHash()))
                    issue(issues, field, "STALE_STANDARD", "标准目录版本已变化，请重新核对药品范围");
                var resolved = new ResolvedTarget(t.level(), r);
                if (result.stream().anyMatch(x -> overlap(x, resolved))) issue(issues, field, "OVERLAPPING_TARGET", "同组药品范围重复或条目与规格重叠，请合并范围");
                result.add(resolved);
            } catch (BusinessException missing) {issue(issues, field, "UNKNOWN_STANDARD", "标准规格已不存在：" + t.specificationId());}
        }
        return List.copyOf(result);
    }
    private List<RouteSnapshot> route(Long tenant, List<Issue> issues, String field, RouteCondition condition) {
        if (condition == null) {issue(issues, field, "REQUIRED", "需明确给药途径范围"); return List.of();}
        choice(issues, field, condition.mode(), "途径范围", "ALL", "LIST");
        if ("ALL".equals(condition.mode()) && !list(condition.codes()).isEmpty()) issue(issues, field, "UNUSED", "不限途径时不能保留途径限制");
        if ("LIST".equals(condition.mode()) && list(condition.codes()).isEmpty()) issue(issues, field, "REQUIRED", "请选择标准给药途径");
        var result = new ArrayList<RouteSnapshot>();
        for (var code : list(condition.codes())) {
            if (blank(code)) {issue(issues, field, "UNKNOWN_ROUTE", "途径编码不能为空"); continue;}
            var resolved = routes.resolveActive(tenant, code, "MASTER_DATA", LocalDate.now());
            if (resolved.isEmpty() || !resolved.get().code().equals(code)) issue(issues, field, "UNKNOWN_ROUTE", "途径须采用当前有效的标准编码：" + code);
            else if (result.stream().noneMatch(r -> r.code().equals(code))) result.add(resolved.get());
        }
        return List.copyOf(result);
    }
    public static boolean overlap(ResolvedTarget a, ResolvedTarget b) {
        return a.reference().catalogId().equals(b.reference().catalogId()) && a.reference().entryId().equals(b.reference().entryId())
                && ("ENTRY".equals(a.level()) || "ENTRY".equals(b.level()) || a.reference().specificationId().equals(b.reference().specificationId()));
    }
    static boolean blank(String s) {return s == null || s.isBlank();}
    static <T> List<T> list(List<T> value) {return value == null ? List.of() : value;}
    static void issue(List<Issue> issues, String field, String code, String message) {issues.add(new Issue(field, code, message));}
    static void required(List<Issue> issues, String field, String value, String name, int max) {
        if (blank(value) || value.length() > max) issue(issues, field, "REQUIRED", name + "必填，最多 " + max + " 字");
    }
    static void choice(List<Issue> issues, String field, String value, String name, String... allowed) {
        if (!Arrays.asList(allowed).contains(value)) issue(issues, field, "UNSUPPORTED", name + "尚未明确或当前能力不支持");
    }
}
