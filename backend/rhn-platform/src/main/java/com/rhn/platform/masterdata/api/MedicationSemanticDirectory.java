package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import tools.jackson.databind.JsonNode;

/** Freezes the resolved input; readers of saved orders must never re-resolve current master data. */
public interface MedicationSemanticDirectory {
    JsonNode freeze(Long tenantId, CatalogLifecycleDirectory.MedicationSnapshot medication, Long productId,
                    MedicationRouteDirectory.RouteSnapshot route,
                    OrderFrequencyDirectory.FrequencySnapshot frequency,
                    BigDecimal dose, String doseUnit, BigDecimal duration, String durationUnit,
                    LocalDate businessDate);

    /** Current authoritative ingredient identities for deterministic medication comparison. */
    List<String> ingredientIds(Long tenantId, Long medicationId);

    record Ingredient(String id, String code, String display, String system, String systemVersion, String source) {}
    record Component(String ingredientId, BigDecimal numeratorValue, String numeratorUnit,
                     BigDecimal denominatorValue, String denominatorUnit) {}
    record Composition(Long revision, String source, List<Component> components) {
        public Composition { components = List.copyOf(components); }
    }

    /** 药品语义历史条目（对外视图，屏蔽底层语义历史存储实现）。 */
    record SemanticVersionView(Long revision, String kind, String conceptId, String semanticVersion,
                               String changeType, String source, String snapshot, Instant recordedAt) {}
}
