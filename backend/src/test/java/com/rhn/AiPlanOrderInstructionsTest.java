package com.rhn;

import com.rhn.outpatient.api.AiPlanOrderInstructions;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class AiPlanOrderInstructionsTest {
    @Test
    void extracts_execution_instruction_without_dose_or_rationale() {
        String details = "常规用法：每次0.5g 口服 tid 疗程3天；适用条件：细菌感染；目的：抗感染；嘱托：饭后服用；整粒吞服；规格：0.25g/粒";
        assertEquals("饭后服用；整粒吞服", AiPlanOrderInstructions.medication(details));
        assertEquals("饭后服用；整粒吞服", AiPlanOrderInstructions.medication(details + "；" + details));
        assertNull(AiPlanOrderInstructions.medication("常规用法：每次0.5g 口服；嘱托：无"));
    }

    @Test
    void extracts_fields_without_judging_or_rewriting_their_wording() {
        assertEquals("任意待审核原文", AiPlanOrderInstructions.medication("嘱托：任意待审核原文"));
        assertNull(AiPlanOrderInstructions.medication("适用条件：细菌感染；目的：治疗"));
        assertNull(AiPlanOrderInstructions.medication("未按结构输出的文本"));
        assertNull(AiPlanOrderInstructions.medication(null));
        assertEquals("判断感染情况", AiPlanOrderInstructions.service("适用条件：发热；目的：判断感染情况；不建议常规使用：普通感冒可不查"));
    }
}
