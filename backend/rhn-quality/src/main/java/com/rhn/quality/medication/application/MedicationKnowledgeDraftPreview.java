package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import java.time.LocalDate;
import java.util.*;
import static com.rhn.quality.medication.application.MedicationKnowledgeDraftValidator.*;

/** Deterministic draft-model demonstration. Never registered as a prescribing rule. */
public final class MedicationKnowledgeDraftPreview {
    private MedicationKnowledgeDraftPreview() {}
    public static Result evaluate(Body body, Assessment assessment, Facts facts) {
        if (assessment == null || !assessment.structureComplete()) return new Result("UNAVAILABLE", List.of("知识结构存在缺口，不能预演"), List.of());
        return MedicationKnowledgeRuleEngine.evaluate(MedicationKnowledgeRuleCompiler.compile(body,assessment),facts);
    }

    public static List<TestCase> cases(Body body, Assessment a) {
        if (!a.structureComplete()) return List.of();
        var result = new ArrayList<TestCase>(); var c = body.conditions();
        int age = "RANGE".equals(c.ageMode()) ? Objects.requireNonNullElse(c.minimumAgeInclusive(), 0) : 30;
        LocalDate date = body.evidence().effectiveFrom() != null ? body.evidence().effectiveFrom()
                : body.evidence().effectiveTo() != null ? body.evidence().effectiveTo() : LocalDate.of(2026, 1, 1);
        boolean interaction = "DRUG_INTERACTION".equals(body.kind());
        Row first = row("A-1", a.groupA(), c.groupARoutes());
        Row second = interaction ? row("B-1", a.groupB(), c.groupBRoutes()) : copy(first, "A-2", "ACTIVE");
        var positive = new ArrayList<Row>(); positive.add(first); positive.add(second);
        if (!interaction) for (int i = 3; i <= body.minimumOrders(); i++) positive.add(copy(first, "A-" + i, "ACTIVE"));
        add(result, "正例：达到匹配条件（合成事实）", body, a, new Facts(age, c.ageUnit(), date, positive), "MATCH");
        var reverse = new ArrayList<>(positive); Collections.reverse(reverse);
        add(result, "顺序无关：反向排列仍命中", body, a, new Facts(age, c.ageUnit(), date, reverse), "MATCH");
        var fewer = new ArrayList<>(positive); fewer.removeLast();
        add(result, interaction ? "反例：仅有 A 组" : "边界：少于触发条数一条", body, a, new Facts(age, c.ageUnit(), date, fewer), "NO_MATCH");
        if (interaction) add(result, "反例：仅有 B 组", body, a, new Facts(age, c.ageUnit(), date, List.of(second)), "NO_MATCH");
        add(result, "反例：同一医嘱重复传入不能凑数", body, a, new Facts(age, c.ageUnit(), date, List.of(first, first)), "NO_MATCH");
        var stopped = new ArrayList<>(fewer); stopped.add(copy(positive.getLast(), positive.getLast().orderId(), "STOPPED"));
        add(result, "反例：已停用医嘱不参与", body, a, new Facts(age, c.ageUnit(), date, stopped), "NO_MATCH");
        add(result, "缺失：标准身份不足", body, a, new Facts(age, c.ageUnit(), date,
                List.of(new Row("X", null, null, null, null, null, null, "ACTIVE"))), "UNAVAILABLE");
        var stale = new ArrayList<>(positive); stale.set(1, new Row(second.orderId(), second.catalogId(), "OLD", second.contentHash(), second.entryId(), second.specificationId(), second.routeCode(), second.status()));
        add(result, "缺失：标准版本混用", body, a, new Facts(age, c.ageUnit(), date, stale), "UNAVAILABLE");
        if ("SAME_STANDARD_ENTRY".equals(body.matchMode())) {
            var different = new ArrayList<>(positive); different.set(1, new Row(second.orderId(), second.catalogId(), second.catalogVersion(), second.contentHash(), "SYNTHETIC-OTHER-ENTRY", "SYNTHETIC-OTHER-SPEC", second.routeCode(), "ACTIVE"));
            add(result, "反例：不同标准条目不自动合并", body, a, new Facts(age, c.ageUnit(), date, different), "NO_MATCH");
        }
        if (interaction && "LIST".equals(c.groupBRoutes().mode())) {
            var missing = new ArrayList<>(positive); missing.set(1, new Row(second.orderId(), second.catalogId(), second.catalogVersion(), second.contentHash(), second.entryId(), second.specificationId(), null, "ACTIVE"));
            add(result, "缺失：B 组受限途径未知", body, a, new Facts(age, c.ageUnit(), date, missing), "UNAVAILABLE");
        }
        if ("RANGE".equals(c.ageMode())) {
            add(result, "缺失：年龄未知", body, a, new Facts(null, c.ageUnit(), date, positive), "UNAVAILABLE");
            if (c.maximumAgeExclusive() != null) add(result, "年龄上限不包含", body, a, new Facts(c.maximumAgeExclusive(), c.ageUnit(), date, positive), "NOT_APPLICABLE");
            if (c.minimumAgeInclusive() != null && c.minimumAgeInclusive() > 0) add(result, "年龄下限以下", body, a, new Facts(c.minimumAgeInclusive() - 1, c.ageUnit(), date, positive), "NOT_APPLICABLE");
        }
        if ("LIST".equals(c.groupARoutes().mode())) {
            var missing = new ArrayList<>(positive); missing.set(0, new Row(first.orderId(), first.catalogId(), first.catalogVersion(), first.contentHash(), first.entryId(), first.specificationId(), null, "ACTIVE"));
            add(result, "缺失：A 组受限途径未知", body, a, new Facts(age, c.ageUnit(), date, missing), "UNAVAILABLE");
        }
        return List.copyOf(result);
    }
    private static Row row(String order, List<ResolvedTarget> targets, RouteCondition route) {
        String code = "LIST".equals(route.mode()) ? route.codes().getFirst() : "SYNTHETIC-ROUTE";
        if (targets.isEmpty()) return new Row(order, "SYNTHETIC-CATALOG", "1", "SYNTHETIC-HASH", "SYNTHETIC-ENTRY-A", "SYNTHETIC-SPEC-A", code, "ACTIVE");
        var r = targets.getFirst().reference();
        return new Row(order, r.catalogId(), r.catalogVersion(), r.contentHash(), r.entryId(), r.specificationId(), code, "ACTIVE");
    }
    private static Row copy(Row r, String id, String status) {return new Row(id, r.catalogId(), r.catalogVersion(), r.contentHash(), r.entryId(), r.specificationId(), r.routeCode(), status);}
    private static void add(List<TestCase> cases, String name, Body body, Assessment a, Facts facts, String expected) {
        var actual = evaluate(body, a, facts); cases.add(new TestCase(name, facts, expected, actual, expected.equals(actual.outcome())));
    }
}
