package com.rhn.analytics.web.v2;

import com.rhn.analytics.semantic.model.*;
import com.rhn.analytics.semantic.registry.OutpatientSemanticCatalogProvider;
import io.swagger.v3.oas.annotations.Operation;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 业务实体数据关系网（Ontology）元数据与人机共建控制器。
 * 提供实体拓扑图数据、维度属性网络、规则字典与 AI 标注辅助能力。
 */
@RestController
@RequestMapping("/api/analytics/v2/ontology")
@PreAuthorize("hasAuthority('PORTAL.ACCESS')")
public class SemanticOntologyController {

    private final OutpatientSemanticCatalogProvider catalogProvider;

    public SemanticOntologyController(OutpatientSemanticCatalogProvider catalogProvider) {
        this.catalogProvider = catalogProvider;
    }

    @Operation(operationId = "analyticsV2OntologyGraph", summary = "获取数据关系网全量拓扑节点与连线元数据")
    @GetMapping("/graph")
    public OntologyGraphDto getGraph() {
        SemanticCatalog catalog = catalogProvider.getCatalog();

        // 1. 构建节点列表 (Nodes)
        List<OntologyGraphDto.OntologyNodeDto> nodes = new ArrayList<>();
        for (EntityDefinition entity : catalog.entities()) {
            int metricCount = (int) catalog.metrics().stream()
                .filter(m -> entity.code().equalsIgnoreCase(m.source()))
                .count();

            List<DimensionDefinition> entityDims = catalog.dimensions().stream()
                .filter(d -> entity.code().equalsIgnoreCase(d.entity()) || 
                             entity.code().equalsIgnoreCase(d.grain()) || 
                             d.code().endsWith("_" + entity.code().toUpperCase(Locale.ROOT)))
                .toList();

            List<String> attributeCodes = entityDims.stream()
                .flatMap(d -> d.attributes().stream())
                .map(DimensionAttribute::code)
                .distinct()
                .toList();

            String nodeType = switch (entity.code().toUpperCase(Locale.ROOT)) {
                case "DEPARTMENT", "PATIENT", "CATALOG_ITEM" -> "DIMENSION";
                case "CHARGE", "ORDER", "ENCOUNTER", "DIAGNOSIS" -> "FACT";
                default -> "FACT";
            };

            nodes.add(new OntologyGraphDto.OntologyNodeDto(
                entity.code(),
                entity.name(),
                entity.code(),
                entity.table(),
                entity.primaryKey(),
                entity.grain(),
                entity.description(),
                nodeType,
                metricCount,
                entityDims.size(),
                attributeCodes
            ));
        }

        // 2. 构建连线列表 (Edges)
        List<OntologyGraphDto.OntologyEdgeDto> edges = new ArrayList<>();
        for (RelationshipDefinition rel : catalog.relationships()) {
            String edgeId = rel.from() + "->" + rel.to();
            String label = rel.cardinality().name();

            edges.add(new OntologyGraphDto.OntologyEdgeDto(
                edgeId,
                rel.from(),
                rel.to(),
                rel.cardinality().name(),
                rel.conditions(),
                rel.aggregationSafe(),
                rel.fanoutRisk(),
                label
            ));
        }

        // 3. 统计汇总 (Statistics)
        long fanoutRiskCount = catalog.relationships().stream().filter(RelationshipDefinition::fanoutRisk).count();
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("entityCount", catalog.entities().size());
        stats.put("relationshipCount", catalog.relationships().size());
        stats.put("dimensionCount", catalog.dimensions().size());
        stats.put("metricCount", catalog.metrics().size());
        stats.put("fanoutRiskCount", fanoutRiskCount);
        stats.put("assetPath", "semantic/outpatient-ontology.v1.yaml");

        return new OntologyGraphDto(
            catalog.version(),
            catalog.domain(),
            nodes,
            edges,
            catalog.dimensions(),
            catalog.metrics(),
            stats
        );
    }

    @Operation(operationId = "analyticsV2OntologyCopilotSuggest", summary = "人机共建：AI 辅助逆向推断属性规则建议")
    @PostMapping("/copilot/suggest")
    public OntologyGraphDto.CopilotSuggestResponse suggestRules(@RequestBody OntologyGraphDto.CopilotSuggestRequest request) {
        String prompt = request.prompt() != null ? request.prompt().trim() : "";
        String target = request.targetEntity() != null ? request.targetEntity().trim() : "DEPARTMENT";

        if (prompt.isBlank()) {
            return new OntologyGraphDto.CopilotSuggestResponse(
                "EMPTY",
                "请输入具体的业务规则反馈或属性扩展需求",
                null,
                Map.of()
            );
        }

        // 启发式智能规则逆向推断引擎
        if (prompt.contains("检验") || prompt.contains("医技") || prompt.contains("检查")) {
            String yamlDiff = """
                # 拟增加医技科室识别字典项:
                attributes:
                  - code: "dept_type"
                    valueAliases:
                      MEDICAL_TECH:
                        - "检验科"
                        - "放射科"
                        - "超声科"
                        - "病理科"
                """;
            return new OntologyGraphDto.CopilotSuggestResponse(
                "SUGGESTED",
                "推断检测到您希望扩展【医技科室 (MEDICAL_TECH)】的属性识别词库，已自动生成候选映射。",
                yamlDiff,
                Map.of(
                    "targetAttribute", "dept_type",
                    "mappedValue", "MEDICAL_TECH",
                    "suggestedAliases", List.of("检验科", "放射科", "超声科", "病理科")
                )
            );
        } else if (prompt.contains("急诊") || prompt.contains("发热门诊")) {
            String yamlDiff = """
                # 拟在科室属性中增加急诊性质分类:
                attributes:
                  - code: "is_emergency"
                    name: "是否急诊科室"
                    physicalColumn: "FG_EMERGENCY"
                    valueAliases:
                      TRUE: ["急诊", "发热门诊", "急救"]
                      FALSE: ["普通门诊", "专家门诊"]
                """;
            return new OntologyGraphDto.CopilotSuggestResponse(
                "SUGGESTED",
                "推断检测到您希望增加【急诊科室标识 (is_emergency)】维度属性，已生成拟持久化的模型片段。",
                yamlDiff,
                Map.of(
                    "suggestedAttributeCode", "is_emergency",
                    "suggestedColumn", "FG_EMERGENCY",
                    "suggestedAliases", List.of("急诊", "发热门诊", "急救")
                )
            );
        } else {
            String yamlDiff = """
                # 拟在目标实体 [%s] 扩展业务规则:
                # 需求摘要: %s
                comments: "人机共建待人工审核确认项"
                """.formatted(target, prompt);
            return new OntologyGraphDto.CopilotSuggestResponse(
                "PENDING_REVIEW",
                "已解析业务反馈，生成候选规则待专家点选确认。",
                yamlDiff,
                Map.of("prompt", prompt, "targetEntity", target)
            );
        }
    }
}
