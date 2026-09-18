package com.rhn.analytics.web.v2;

import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class SemanticOntologyControllerTest {

    private SemanticOntologyController controller;

    @BeforeEach
    void setUp() {
        OutpatientSemanticCatalogProvider provider = new OutpatientSemanticCatalogProvider();
        controller = new SemanticOntologyController(provider);
    }

    @Test
    @DisplayName("验证拓扑图 API 输出完整节点、边与统计信息")
    void getGraph_returns_full_topology() {
        OntologyGraphDto graph = controller.getGraph();

        assertNotNull(graph);
        assertEquals("1.0.0", graph.version());
        assertEquals("OUTPATIENT", graph.domain());

        // 验证节点完整性 (7 个实体)
        assertEquals(7, graph.nodes().size());
        assertTrue(graph.nodes().stream().anyMatch(n -> n.id().equals("DEPARTMENT") && "DIMENSION".equals(n.nodeType())));
        assertTrue(graph.nodes().stream().anyMatch(n -> n.id().equals("CHARGE") && "FACT".equals(n.nodeType())));

        // 验证 DEPARTMENT 实体包含属性 dept_type
        OntologyGraphDto.OntologyNodeDto deptNode = graph.nodes().stream()
            .filter(n -> n.id().equals("DEPARTMENT")).findFirst().orElse(null);
        assertNotNull(deptNode);
        assertTrue(deptNode.attributes().contains("dept_type"));

        // 验证拓扑边 (9 条关系)
        assertEquals(9, graph.edges().size());
        assertTrue(graph.edges().stream().anyMatch(e -> e.source().equals("CHARGE") && e.target().equals("DEPARTMENT")));

        // 验证风控标记
        assertTrue(graph.edges().stream().anyMatch(e -> e.fanoutRisk()));

        // 验证元数据统计
        assertEquals(7, graph.statistics().get("entityCount"));
        assertEquals(9, graph.statistics().get("relationshipCount"));
        assertTrue((Long) graph.statistics().get("fanoutRiskCount") > 0);
    }

    @Test
    @DisplayName("验证人机共建 Copilot 规则建议推断引擎")
    void suggestRules_returns_structured_recommendation() {
        OntologyGraphDto.CopilotSuggestRequest request = new OntologyGraphDto.CopilotSuggestRequest(
            "建议将检验科、放射科也纳入医技科室识别",
            "DEPARTMENT"
        );

        OntologyGraphDto.CopilotSuggestResponse response = controller.suggestRules(request);

        assertNotNull(response);
        assertEquals("SUGGESTED", response.status());
        assertTrue(response.rationale().contains("医技科室"));
        assertNotNull(response.suggestedYamlDiff());
        assertTrue(response.suggestedYamlDiff().contains("MEDICAL_TECH"));
    }
}
