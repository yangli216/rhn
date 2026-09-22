package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import java.util.*;

public final class MedicationKnowledgeRuleCompiler {
    public static final String VERSION="qmed-knowledge-program-v1";
    private MedicationKnowledgeRuleCompiler() {}
    public static Program compile(Body body,Assessment a) {
        if(body==null || a==null || !a.structureComplete() || !"SAME_PRESCRIPTION".equals(body.exposureScope()))
            throw new IllegalArgumentException("知识结构不完整或检查范围尚未支持");
        var c=body.conditions();var e=body.evidence();
        if(c==null || e==null || c.additionalConditions()!=null&&!c.additionalConditions().isBlank()) throw new IllegalArgumentException("存在尚未结构化的条件");
        var operator=Operator.valueOf(body.matchMode());
        if((operator==Operator.GROUP_PAIR)!= "DRUG_INTERACTION".equals(body.kind())) throw new IllegalArgumentException("知识类型与匹配操作不一致");
        var first=new Group(a.groupA(),RangeMode.valueOf(c.groupARoutes().mode()),a.groupARoutes());
        var second=operator==Operator.GROUP_PAIR?new Group(a.groupB(),RangeMode.valueOf(c.groupBRoutes().mode()),a.groupBRoutes()):new Group(List.of(),RangeMode.ALL,List.of());
        var age=new Age(AgeMode.valueOf(c.ageMode()),c.ageUnit(),c.minimumAgeInclusive(),c.maximumAgeExclusive());
        var facts=new ArrayList<>(List.of("同一处方的医嘱标识与状态","冻结药品的标准目录、版次、内容指纹、条目和规格身份"));
        if(age.mode()==AgeMode.RANGE) facts.add("与知识单位一致的年龄事实（"+Objects.toString(age.unit(),"未明确")+"）");
        if(first.routeMode()==RangeMode.LIST || operator==Operator.GROUP_PAIR&&second.routeMode()==RangeMode.LIST) facts.add("范围内医嘱的冻结途径概念、编码、来源与版次");
        if(e.effectiveFrom()!=null || e.effectiveTo()!=null) facts.add("原评价冻结业务日期及其时区依据");
        return new Program(VERSION,operator,body.exposureScope(),first,second,body.minimumOrders(),age,e.effectiveFrom(),e.effectiveTo(),body.proposedAction(),facts);
    }
}
