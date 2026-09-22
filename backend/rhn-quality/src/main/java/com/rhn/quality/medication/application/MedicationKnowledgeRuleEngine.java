package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import java.util.*;

/** Evaluates the typed program after the caller verifies frozen fact identities at its data boundary. */
public final class MedicationKnowledgeRuleEngine {
    private MedicationKnowledgeRuleEngine() {}
    public static Result evaluate(Program p,Facts facts) {
        if(p==null || !MedicationKnowledgeRuleCompiler.VERSION.equals(p.schemaVersion()) || !"SAME_PRESCRIPTION".equals(p.exposureScope())) return result("UNAVAILABLE","规则表达版本或检查范围不支持");
        if(facts==null || facts.medications()==null) return result("UNAVAILABLE","缺少处方事实");
        if(p.effectiveFrom()!=null || p.effectiveTo()!=null) {
            if(facts.date()==null) return result("UNAVAILABLE","缺少评价日期");
            if(p.effectiveFrom()!=null&&facts.date().isBefore(p.effectiveFrom()) || p.effectiveTo()!=null&&facts.date().isAfter(p.effectiveTo())) return result("NOT_APPLICABLE","超出来源有效期");
        }
        if(p.age().mode()==AgeMode.RANGE) {
            if(facts.age()==null || facts.age()<0 || !Objects.equals(facts.ageUnit(),p.age().unit())) return result("UNAVAILABLE","年龄缺失或年龄单位不一致，不进行隐式换算");
            if(p.age().minimumInclusive()!=null&&facts.age()<p.age().minimumInclusive() || p.age().maximumExclusive()!=null&&facts.age()>=p.age().maximumExclusive()) return result("NOT_APPLICABLE","不属于规则适用年龄范围");
        }
        var distinct=new LinkedHashMap<String,Row>();
        for(var r:facts.medications()) {
            if(r==null) return result("UNAVAILABLE","存在空医嘱事实");
            if(Set.of("STOPPED","CANCELLED").contains(Objects.toString(r.status(),""))) continue;
            if(!"ACTIVE".equals(r.status()) || blank(r.orderId()) || blank(r.catalogId()) || blank(r.catalogVersion()) || blank(r.contentHash()) || blank(r.entryId()) || blank(r.specificationId())) return result("UNAVAILABLE","有效医嘱缺少状态或完整标准身份");
            var previous=distinct.putIfAbsent(r.orderId(),r);if(previous!=null&&!previous.equals(r)) return result("UNAVAILABLE","同一医嘱标识存在冲突事实");
        }
        var rows=new ArrayList<>(distinct.values());
        if(rows.stream().map(r->List.of(r.catalogId(),r.catalogVersion(),r.contentHash())).distinct().count()>1) return result("UNAVAILABLE","医嘱使用的标准目录版本不一致，需先完成标准化");
        var targets=new ArrayList<>(p.groupA().targets());targets.addAll(p.groupB().targets());
        if(!targets.isEmpty() && rows.stream().anyMatch(r->targets.stream().noneMatch(t->sameEdition(r,t)))) return result("UNAVAILABLE","医嘱与知识引用的标准目录版本不一致");
        boolean all=p.operator()==Operator.SAME_STANDARD_ENTRY,interaction=p.operator()==Operator.GROUP_PAIR;
        if(rows.stream().anyMatch(r->inGroup(r,p.groupA(),all)&&missingRoute(r,p.groupA()) || interaction&&inGroup(r,p.groupB(),false)&&missingRoute(r,p.groupB()))) return result("UNAVAILABLE","范围内医嘱缺少受限途径事实");
        var a=rows.stream().filter(r->inGroup(r,p.groupA(),all)&&routeMatches(r,p.groupA())).toList();
        if(interaction) {
            var b=rows.stream().filter(r->inGroup(r,p.groupB(),false)&&routeMatches(r,p.groupB())).toList();var matched=new LinkedHashSet<String>();
            for(var left:a) for(var right:b) if(!left.orderId().equals(right.orderId())) {matched.add(left.orderId());matched.add(right.orderId());}
            if(!matched.isEmpty()) return new Result("MATCH",List.of("A、B 组由不同医嘱同时满足；列出所有参与配对的医嘱，仅表示该规则逻辑命中"),List.copyOf(matched));
        } else {
            var groups=new LinkedHashMap<String,List<Row>>();for(var r:a) groups.computeIfAbsent(all?r.entryId():"GROUP",unused->new ArrayList<>()).add(r);
            var matched=groups.values().stream().filter(g->g.size()>=p.minimumOrders()).flatMap(Collection::stream).map(Row::orderId).toList();
            if(!matched.isEmpty()) return new Result("MATCH",List.of("满足重复用药条数条件；列出所有达到阈值的组内医嘱，仅表示该规则逻辑命中"),matched);
        }
        return result("NO_MATCH","未满足该规则匹配条件，不代表用药安全");
    }
    private static boolean blank(String s) {return s==null||s.isBlank();}
    private static boolean sameEdition(Row r,ResolvedTarget t) {var s=t.reference();return r.catalogId().equals(s.catalogId())&&r.catalogVersion().equals(s.catalogVersion())&&r.contentHash().equals(s.contentHash());}
    private static boolean inGroup(Row r,Group g,boolean all) {return all||g.targets().stream().anyMatch(t->sameEdition(r,t)&&r.entryId().equals(t.reference().entryId())&&("ENTRY".equals(t.level())||r.specificationId().equals(t.reference().specificationId())));}
    private static boolean missingRoute(Row r,Group g) {return g.routeMode()==RangeMode.LIST&&blank(r.routeCode());}
    private static boolean routeMatches(Row r,Group g) {return g.routeMode()==RangeMode.ALL||g.routes().stream().anyMatch(route->route.code().equals(r.routeCode()));}
    private static Result result(String outcome,String reason) {return new Result(outcome,List.of(reason),List.of());}
}
