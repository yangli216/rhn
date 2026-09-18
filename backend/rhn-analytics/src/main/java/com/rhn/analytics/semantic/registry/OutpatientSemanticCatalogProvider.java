package com.rhn.analytics.semantic.registry;

import com.rhn.analytics.semantic.model.SemanticCatalog;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 门诊业务语义目录 Provider。
 * 默认直接加载类路径下的声明式数据资产包 `semantic/outpatient-ontology.v1.yaml`，
 * 随程序包一同发布，开箱即用，免除物理代码硬编码。
 */
@Configuration
public class OutpatientSemanticCatalogProvider {
    public static final String DEFAULT_ASSET_PATH = "semantic/outpatient-ontology.v1.yaml";

    private final SemanticCatalog catalog;
    private final MetricRegistry metricRegistry;
    private final DimensionRegistry dimensionRegistry;
    private final RelationshipRegistry relationshipRegistry;

    public OutpatientSemanticCatalogProvider() {
        this(DEFAULT_ASSET_PATH);
    }

    public OutpatientSemanticCatalogProvider(String assetPath) {
        this.catalog = YamlSemanticCatalogLoader.load(assetPath);
        this.metricRegistry = new MetricRegistry(catalog.metrics());
        this.dimensionRegistry = new DimensionRegistry(catalog.dimensions());
        this.relationshipRegistry = new RelationshipRegistry(catalog.relationships());
    }

    public SemanticCatalog getCatalog() {
        return catalog;
    }

    @Bean
    public MetricRegistry metricRegistry() {
        return metricRegistry;
    }

    public MetricRegistry getMetricRegistry() {
        return metricRegistry;
    }

    @Bean
    public DimensionRegistry dimensionRegistry() {
        return dimensionRegistry;
    }

    public DimensionRegistry getDimensionRegistry() {
        return dimensionRegistry;
    }

    @Bean
    public RelationshipRegistry relationshipRegistry() {
        return relationshipRegistry;
    }

    public RelationshipRegistry getRelationshipRegistry() {
        return relationshipRegistry;
    }
}
