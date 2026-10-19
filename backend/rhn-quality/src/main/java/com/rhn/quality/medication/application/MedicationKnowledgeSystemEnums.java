package com.rhn.quality.medication.application;

import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/** Rational-medication knowledge value sets; the draft validator accepts exactly these codes. */
@Component
class MedicationKnowledgeSystemEnums implements SystemEnumContribution {
    static final SystemEnumDefinition SOURCE_TYPE = of("MED_KNOWLEDGE_SOURCE_TYPE", "用药知识来源类型", "合理用药知识引用的证据来源类别", items(
            "LABEL", "药品说明书", "药品说明书或标签",
            "GUIDELINE", "指南 / 共识", "临床指南或专家共识",
            "LITERATURE", "研究文献", "公开发表的研究文献",
            "INSTITUTION_POLICY", "机构管理规范", "本机构制定的用药管理规范",
            "REGULATION", "法规 / 规章", "法律法规或部门规章"));
    static final SystemEnumDefinition ACTION = of("MED_KNOWLEDGE_ACTION", "用药知识处置方式", "合理用药知识命中后建议的处置方式", items(
            "WARN", "警告提示", "提示风险，医生核对后可继续",
            "REQUIRE_OVERRIDE", "需理由后继续", "医生须说明理由才能继续",
            "BLOCK", "阻断", "必须修改医嘱后才能继续"));

    static String[] codes(SystemEnumDefinition definition) {
        return definition.items().stream().map(SystemEnumItem::code).toArray(String[]::new);
    }

    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(SOURCE_TYPE, ACTION);
    }
}
