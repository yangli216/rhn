package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.*;
import org.yaml.snakeyaml.Yaml;

import java.io.InputStream;
import java.util.*;

/**
 * 声明式语义资产包 YAML 加载器。
 * 从类路径资源中加载声明式本体数据资产包（如 outpatient-ontology.v1.yaml），
 * 组装为不可变、类型安全的 SemanticCatalog 领域对象。
 */
public final class YamlSemanticCatalogLoader {

    private YamlSemanticCatalogLoader() {}

    public static SemanticCatalog load(String resourcePath) {
        Yaml yaml = new Yaml();
        try (InputStream in = YamlSemanticCatalogLoader.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException("Semantic ontology asset not found: " + resourcePath);
            }
            Map<String, Object> root = yaml.load(in);
            return parseCatalog(root);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load semantic ontology from asset: " + resourcePath, e);
        }
    }

    @SuppressWarnings("unchecked")
    private static SemanticCatalog parseCatalog(Map<String, Object> root) {
        String version = Objects.toString(root.get("version"), "1.0.0");
        String domain = Objects.toString(root.get("domain"), "DEFAULT");

        // 1. 实体列表
        List<EntityDefinition> entities = new ArrayList<>();
        List<Map<String, Object>> rawEntities = (List<Map<String, Object>>) root.get("entities");
        if (rawEntities != null) {
            for (Map<String, Object> e : rawEntities) {
                String table = e.get("table") != null ? Objects.toString(e.get("table")) : null;
                entities.add(new EntityDefinition(
                    Objects.toString(e.get("code")),
                    Objects.toString(e.get("name")),
                    Objects.toString(e.get("description")),
                    Objects.toString(e.get("primaryKey")),
                    Objects.toString(e.get("grain")),
                    table
                ));
            }
        }

        // 2. 关系列表
        List<RelationshipDefinition> relationships = new ArrayList<>();
        List<Map<String, Object>> rawRelationships = (List<Map<String, Object>>) root.get("relationships");
        if (rawRelationships != null) {
            for (Map<String, Object> r : rawRelationships) {
                String from = Objects.toString(r.get("from"));
                String to = Objects.toString(r.get("to"));
                Cardinality cardinality = Cardinality.valueOf(Objects.toString(r.get("cardinality")));
                boolean aggregationSafe = Boolean.TRUE.equals(r.get("aggregationSafe"));
                boolean fanoutRisk = Boolean.TRUE.equals(r.get("fanoutRisk"));

                List<JoinCondition> conditions = new ArrayList<>();
                List<Map<String, Object>> rawConds = (List<Map<String, Object>>) r.get("conditions");
                if (rawConds != null) {
                    for (Map<String, Object> c : rawConds) {
                        conditions.add(JoinCondition.on(
                            Objects.toString(c.get("from")),
                            Objects.toString(c.get("to"))
                        ));
                    }
                }
                relationships.add(new RelationshipDefinition(from, to, cardinality, conditions, aggregationSafe, fanoutRisk));
            }
        }

        // 3. 维度列表与属性网络
        List<DimensionDefinition> dimensions = new ArrayList<>();
        List<Map<String, Object>> rawDimensions = (List<Map<String, Object>>) root.get("dimensions");
        if (rawDimensions != null) {
            for (Map<String, Object> d : rawDimensions) {
                String code = Objects.toString(d.get("code"));
                String name = Objects.toString(d.get("name"));
                List<String> aliases = (List<String>) d.getOrDefault("aliases", List.of());
                String entity = Objects.toString(d.get("entity"));
                String field = Objects.toString(d.get("field"));
                String grain = Objects.toString(d.get("grain"));
                List<String> compatibleMetrics = (List<String>) d.getOrDefault("compatibleMetrics", List.of());

                // 维度属性
                List<DimensionAttribute> attributes = new ArrayList<>();
                List<Map<String, Object>> rawAttrs = (List<Map<String, Object>>) d.get("attributes");
                if (rawAttrs != null) {
                    for (Map<String, Object> a : rawAttrs) {
                        String attrCode = Objects.toString(a.get("code"));
                        String attrName = Objects.toString(a.get("name"));
                        List<String> attrAliases = (List<String>) a.getOrDefault("aliases", List.of());
                        String physicalColumn = Objects.toString(a.get("physicalColumn"));
                        Map<String, List<String>> valueAliases = (Map<String, List<String>>) a.getOrDefault("valueAliases", Map.of());
                        attributes.add(new DimensionAttribute(attrCode, attrName, attrAliases, physicalColumn, valueAliases));
                    }
                }

                dimensions.add(new DimensionDefinition(code, name, aliases, entity, field, grain, compatibleMetrics, attributes));
            }
        }

        // 4. 指标列表
        List<MetricDefinition> metrics = new ArrayList<>();
        List<Map<String, Object>> rawMetrics = (List<Map<String, Object>>) root.get("metrics");
        if (rawMetrics != null) {
            for (Map<String, Object> m : rawMetrics) {
                String code = Objects.toString(m.get("code"));
                String name = Objects.toString(m.get("name"));
                List<String> aliases = (List<String>) m.getOrDefault("aliases", List.of());
                String description = Objects.toString(m.get("description"));
                String metricDomain = Objects.toString(m.get("domain"));
                String source = Objects.toString(m.get("source"));
                String field = Objects.toString(m.get("field"));
                Aggregate aggregate = Aggregate.valueOf(Objects.toString(m.get("aggregate")));
                String grain = Objects.toString(m.get("grain"));

                List<DefaultFilter> defaultFilters = new ArrayList<>();
                List<Map<String, Object>> rawFilters = (List<Map<String, Object>>) m.get("defaultFilters");
                if (rawFilters != null) {
                    for (Map<String, Object> f : rawFilters) {
                        String filterField = Objects.toString(f.get("field"));
                        Operator op = Operator.valueOf(Objects.toString(f.get("op")));
                        List<String> values = (List<String>) f.getOrDefault("values", List.of());
                        defaultFilters.add(new DefaultFilter(filterField, op, values));
                    }
                }

                String timeDimension = (String) m.get("timeDimension");
                List<String> supportedDimensions = (List<String>) m.getOrDefault("supportedDimensions", List.of());
                List<String> forbiddenMeanings = (List<String>) m.getOrDefault("forbiddenMeanings", List.of());

                metrics.add(new MetricDefinition(
                    code, name, aliases, description, metricDomain, source, field,
                    aggregate, grain, defaultFilters, timeDimension, supportedDimensions, forbiddenMeanings
                ));
            }
        }

        return new SemanticCatalog(version, domain, entities, relationships, metrics, dimensions);
    }
}
