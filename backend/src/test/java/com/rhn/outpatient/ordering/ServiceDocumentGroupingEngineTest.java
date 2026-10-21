package com.rhn.outpatient.ordering;

import com.rhn.outpatient.ordering.ServiceDocumentGroupingEngine.Fact;
import com.rhn.outpatient.ordering.ServiceDocumentGroupingPolicy.Rule;
import com.rhn.outpatient.ordering.ServiceDocumentGroupingPolicy.Settings;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ServiceDocumentGroupingEngineTest {
    private static Fact lab(int index, long dept, String specimen) {
        return new Fact(index, "LABORATORY", 1L, dept, specimen, null);
    }

    private static Fact exam(int index, long dept, String examType) {
        return new Fact(index, "EXAMINATION", 1L, dept, null, examType);
    }

    @Test
    @DisplayName("默认规则：检验同科室同标本合单，检查按检查类型，服务类型与执行科室始终隔离")
    void groupsByDefaultRules() {
        var plans = ServiceDocumentGroupingEngine.plan(List.of(
                lab(0, 10, "BLOOD"), lab(1, 10, "URINE"), lab(2, 10, "BLOOD"), lab(3, 11, "BLOOD"),
                exam(4, 20, "CT"), exam(5, 20, "CT"), exam(6, 20, "DR"),
                new Fact(7, "TREATMENT", 1L, 30L, null, null), new Fact(8, "TREATMENT", 1L, 30L, null, null)),
                ServiceDocumentGroupingPolicy.DEFAULT_SETTINGS);

        assertThat(plans).extracting(ServiceDocumentPlan::itemIndexes).containsExactly(
                List.of(0, 2), List.of(1), List.of(3), List.of(4, 5), List.of(6), List.of(7, 8));
        assertThat(plans.getFirst().groupingRule()).isEqualTo("BY_DEPT_SPECIMEN");
        assertThat(plans.getFirst().groupingValue()).isEqualTo("BLOOD");
        assertThat(plans.getFirst().title()).isEqualTo("检验申请单");
        assertThat(plans.getLast().ruleReasons()).containsExactly("同执行科室合单");
    }

    @Test
    @DisplayName("合单依据未维护时不猜测，单独成单")
    void missingBasisStaysSeparate() {
        var plans = ServiceDocumentGroupingEngine.plan(List.of(lab(0, 10, null), lab(1, 10, null)),
                ServiceDocumentGroupingPolicy.DEFAULT_SETTINGS);
        assertThat(plans).extracting(ServiceDocumentPlan::itemIndexes).containsExactly(List.of(0), List.of(1));
        assertThat(plans.getFirst().groupingRule()).isEqualTo("PER_ITEM");
        assertThat(plans.getFirst().ruleReasons()).containsExactly("标本类型未维护，单独成单");
    }

    @Test
    @DisplayName("逐项模式与项目数上限")
    void perItemAndCapacity() {
        var perItem = ServiceDocumentGroupingEngine.plan(List.of(lab(0, 10, "BLOOD"), lab(1, 10, "BLOOD")),
                new Settings(Rule.PER_ITEM, Rule.PER_ITEM, Rule.PER_ITEM, 10));
        assertThat(perItem).hasSize(2);

        var capped = ServiceDocumentGroupingEngine.plan(List.of(
                lab(0, 10, "BLOOD"), lab(1, 10, "BLOOD"), lab(2, 10, "BLOOD")),
                new Settings(Rule.BY_DEPT, Rule.BY_DEPT, Rule.BY_DEPT, 2));
        assertThat(capped).extracting(ServiceDocumentPlan::itemIndexes).containsExactly(List.of(0, 1), List.of(2));
        assertThat(capped.getLast().ruleReasons()).contains("单张申请单2项上限（第 2 张）");
    }

    @Test
    @DisplayName("参数解析：不适用于该服务类型的规则回落默认值")
    void parsesPolicy() {
        var mapper = new ObjectMapper();
        assertThat(ServiceDocumentGroupingPolicy.parse(null)).isEqualTo(ServiceDocumentGroupingPolicy.DEFAULT_SETTINGS);
        assertThat(ServiceDocumentGroupingPolicy.parse(mapper.readTree(
                "{\"laboratory\":\"BY_DEPT_EXAM_TYPE\",\"examination\":\"per_item\",\"treatment\":\"BY_DEPT\",\"maxItemsPerDocument\":99}")))
                .isEqualTo(new Settings(Rule.BY_DEPT_SPECIMEN, Rule.PER_ITEM, Rule.BY_DEPT, 10));
    }
}
