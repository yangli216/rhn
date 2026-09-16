package com.rhn.platform.masterdata.api;

import java.math.BigDecimal;
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

    record Ingredient(String id, String code, String display, String system, String systemVersion, String source) {}
    record Component(String ingredientId, BigDecimal numeratorValue, String numeratorUnit,
                     BigDecimal denominatorValue, String denominatorUnit) {}
    record Composition(Long revision, String source, List<Component> components) {
        public Composition { components = List.copyOf(components); }
    }
}
