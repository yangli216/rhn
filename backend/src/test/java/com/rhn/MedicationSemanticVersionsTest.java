package com.rhn;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory.*;
import com.rhn.platform.masterdata.application.MedicationSemanticsService;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;

class MedicationSemanticVersionsTest extends RhnIntegrationTestSupport {
    @MockitoBean ExecutionContextProvider contexts;
    @Autowired MedicationSemanticsService semantics;
    @Autowired CatalogLifecycleDirectory catalog;
    @Autowired ClinicalSemanticHistory history;
    @Autowired JsonCodec codec;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    private final Long tenant = Long.valueOf(TENANT);
    private Long medicationId;

    @BeforeEach void context() {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(tenant, 7L, "test", "qmed-test",
                Set.of(), Long.valueOf(ORGANIZATION), Long.valueOf(DEPARTMENT), "DEPARTMENT", Set.of(), Set.of()));
        medicationId = jdbc.queryForObject("select min(ID_MED) from RHN_BD_MED where ID_TNT = ?", Long.class, tenant);
    }

    @Test void saved_versions_survive_display_and_clinical_changes_and_numeric_scale_is_stable() {
        var med = catalog.requireMedication(tenant, medicationId);
        var first = freeze(med, frequency("每日两次", "08:00", "20:00"));
        var data = codec.readObject(codec.write(med));
        data.put("name", "新的本院显示名称"); data.put("aliasName", "别名"); data.put("code", "本院新码");
        var renamed = freeze(codec.read(codec.write(data), CatalogLifecycleDirectory.MedicationSnapshot.class), frequency("别名BID", "08:00", "20:00"));
        assertThat(renamed.at("/clinicalSemantics/medicationSemanticVersion")).isEqualTo(first.at("/clinicalSemantics/medicationSemanticVersion"));
        assertThat(renamed.at("/clinicalSemantics/frequency/semanticVersion")).isEqualTo(first.at("/clinicalSemantics/frequency/semanticVersion"));
        data.put("strengthValue", new BigDecimal("123.000"));
        var changed = freeze(codec.read(codec.write(data), CatalogLifecycleDirectory.MedicationSnapshot.class), frequency("BID", "09:00", "21:00"));
        data.put("strengthValue", new BigDecimal("123"));
        var rescaled = freeze(codec.read(codec.write(data), CatalogLifecycleDirectory.MedicationSnapshot.class), frequency("BID", "09:00", "21:00"));
        assertThat(changed.at("/clinicalSemantics/medicationSemanticVersion")).isNotEqualTo(first.at("/clinicalSemantics/medicationSemanticVersion"));
        assertThat(changed.at("/clinicalSemantics/medicationSemanticVersion")).isEqualTo(rescaled.at("/clinicalSemantics/medicationSemanticVersion"));
        assertThat(changed.at("/clinicalSemantics/frequency/semanticVersion")).isNotEqualTo(first.at("/clinicalSemantics/frequency/semanticVersion"));
        assertThat(history.history(tenant, "MEDICATION", medicationId.toString(), 100))
                .anyMatch(v -> v.semanticVersion().equals(first.at("/clinicalSemantics/medicationSemanticVersion").asString())
                        && codec.readTree(v.snapshot()).path("name").asString().equals(med.name()));
        assertThat(first.at("/clinicalSemantics/dose/clinicalUnit/id").asString()).isEqualTo("UCUM:mg");
    }

    @Test void compound_composition_is_explicit_versioned_and_rejects_stale_updates() {
        var med = catalog.requireMedication(tenant, medicationId);
        var first = semantics.createIngredient("ING-A-" + UUID.randomUUID(), "成分甲", "LOCAL", "1", "联调资料");
        var second = semantics.createIngredient("ING-B-" + UUID.randomUUID(), "成分乙", "LOCAL", "1", "联调资料");
        var old = semantics.composition(medicationId);
        var saved = semantics.saveComposition(medicationId, new Composition(old.revision(), "复方说明书", List.of(
                new Component(first.id(), new BigDecimal("100"), "mg", new BigDecimal("2"), "mL"),
                new Component(second.id(), new BigDecimal("20"), "mg", new BigDecimal("2"), "mL"))));
        var frozen = freeze(med, frequency("BID", "08:00", "20:00"));
        assertThat(frozen.at("/clinicalSemantics/ingredientIds").size()).isEqualTo(2);
        assertThat(frozen.at("/clinicalSemantics/strengths/0/denominator/clinicalUnit/dimension").asString()).isEqualTo("VOLUME");
        assertThat(frozen.at("/clinicalSemantics/status").asString()).isEqualTo("VERSIONED_PARTIAL");
        assertThat(frozen.at("/clinicalSemantics/unknownReasons").toString()).contains("STANDARD_REFERENCE_MISSING");
        assertThatThrownBy(() -> semantics.saveComposition(medicationId, new Composition(old.revision(), "旧页面", List.of())))
                .hasMessageContaining("刷新");
        semantics.saveComposition(medicationId, new Composition(saved.revision(), "修订资料", List.of()));
        assertThat(frozen.at("/clinicalSemantics/ingredientIds").size()).isEqualTo(2);
        assertThat(freeze(med, frequency("BID", "08:00", "20:00")).at("/clinicalSemantics/status").asString()).isEqualTo("VERSIONED_PARTIAL");
    }

    @Test void unknown_units_stay_unknown_and_cross_tenant_ingredients_cannot_be_mapped() {
        var ingredient = semantics.createIngredient("U-"+UUID.randomUUID(), "待补资料", "LOCAL", "1", "联调");
        var old = semantics.composition(medicationId);
        semantics.saveComposition(medicationId, new Composition(old.revision(), "联调", List.of(new Component(
                ingredient.id(), BigDecimal.TEN, "IU", BigDecimal.ONE, "mL"))));
        var frozen = freeze(catalog.requireMedication(tenant, medicationId), frequency("BID", "08:00", "20:00"));
        assertThat(frozen.at("/clinicalSemantics/unknownReasons").toString()).contains("STRENGTH_UNIT_UNKNOWN");
        assertThatThrownBy(() -> semantics.saveComposition(medicationId, new Composition(
                semantics.composition(medicationId).revision(), "联调", List.of(new Component("ING:FOREIGN", null, null, null, null)))))
                .hasMessageContaining("租户");
        assertThat(history.history(999999L, "MEDICATION", medicationId.toString(), 100)).isEmpty();
    }

    @Test void semantic_publication_rolls_back_with_the_business_transaction() {
        var med = catalog.requireMedication(tenant, medicationId);
        Integer before = jdbc.queryForObject("select count(*) from RHN_BD_CLIN_SEM_VER", Integer.class);
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            var data = codec.readObject(codec.write(med)); data.put("preparationSpec", UUID.randomUUID().toString());
            freeze(codec.read(codec.write(data), CatalogLifecycleDirectory.MedicationSnapshot.class), frequency("BID", "08:00", "20:00"));
            status.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("select count(*) from RHN_BD_CLIN_SEM_VER", Integer.class)).isEqualTo(before);
    }

    private tools.jackson.databind.JsonNode freeze(CatalogLifecycleDirectory.MedicationSnapshot med, OrderFrequencyDirectory.FrequencySnapshot frequency) {
        return semantics.freeze(tenant, med, null, new MedicationRouteDirectory.RouteSnapshot(51L, "ORAL", "口服", "RHN.ROUTE", "1", "NONE"),
                frequency, BigDecimal.TEN, "mg", BigDecimal.valueOf(3), "D", LocalDate.now());
    }
    private OrderFrequencyDirectory.FrequencySnapshot frequency(String name, String... times) {
        return new OrderFrequencyDirectory.FrequencySnapshot(52L, 0, "BID", name, null, null,
                "TIMES_PER_PERIOD", 2, BigDecimal.ONE, "D", "STANDARD_TIME", List.of(times), "REMAINING_SLOTS", true);
    }
}
