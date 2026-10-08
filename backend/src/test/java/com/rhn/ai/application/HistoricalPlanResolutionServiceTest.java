package com.rhn.ai.application;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class HistoricalPlanResolutionServiceTest {
    private final EncounterDirectory encounters = mock(EncounterDirectory.class);
    private final OutpatientClinicalHistoryDirectory history = mock(OutpatientClinicalHistoryDirectory.class);
    private final OutpatientPrescriptionInventoryDirectory inventory = mock(OutpatientPrescriptionInventoryDirectory.class);
    private final ExecutionContextProvider contexts = mock(ExecutionContextProvider.class);
    private final com.rhn.platform.masterdata.api.MedicationRouteDirectory routes = mock(com.rhn.platform.masterdata.api.MedicationRouteDirectory.class);
    private final com.rhn.platform.masterdata.api.OrderFrequencyDirectory frequencies = mock(com.rhn.platform.masterdata.api.OrderFrequencyDirectory.class);
    private final com.rhn.shared.json.JsonCodec json = mock(com.rhn.shared.json.JsonCodec.class);
    private static final tools.jackson.databind.json.JsonMapper MAPPER = tools.jackson.databind.json.JsonMapper.builder().build();
    private HistoricalPlanResolutionService service;

    @BeforeEach
    void setUp() {
        service = new HistoricalPlanResolutionService(encounters, history, inventory, contexts, routes, frequencies, json);
        when(json.write(any())).thenAnswer(invocation -> MAPPER.writeValueAsString(invocation.getArgument(0)));
        when(routes.requireActive(eq(1L), eq("ORAL"), eq("OUTPATIENT"), any())).thenReturn(
                new com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot(400L, "ORAL", "口服", "ROUTE", "1", "ADMINISTRATION"));
        when(frequencies.requireActive(eq(1L), eq("QD"), eq(10L), eq(20L), eq("OUTPATIENT"), eq("MEDICATION"), any()))
                .thenReturn(frequency());
        when(encounters.requireAccessible(99L)).thenReturn(new EncounterDirectory.EncounterSnapshot(
                99L, 1L, 7L, 10L, 20L, "E99", "30", "IN_PROGRESS", 0,
                "全科", Instant.parse("2026-09-28T01:00:00Z")));
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(1L, 2L, "doctor", "corr", Set.of(),
                10L, 20L, "ASSIGNED", Set.of(10L), Set.of(20L), 30L));
    }

    @Test void unavailableHistoryIsNotReportedAsNoRepeatedPlan() {
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(null);
        org.junit.jupiter.api.Assertions.assertThrows(NullPointerException.class,
                () -> service.resolveHistoricalStablePlan(99L));
        verifyNoInteractions(inventory);
    }

    @Test
    void doesNotInventDiagnosisOrMedicationFieldsWhenHistoryIsIncomplete() {
        var incomplete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", null, null);
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, incomplete), encounter(70L, incomplete)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verify(inventory, never()).findOrderableMedicationCandidates(any(), any(), any(), any());
    }

    @Test
    void requiresTheSameCompleteRegimenInAtLeastTwoCompletedEncounters() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, complete)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
    }

    @Test
    void ignoresCancelledHistoricalOrders() {
        var cancelled = medication(1L, "CANCELLED", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, cancelled), encounter(70L, cancelled)));

        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verify(inventory, never()).findOrderableMedicationCandidates(any(), any(), any(), any());
    }

    @Test
    void preservesTheOriginalProductWhenOtherProductsAreAlsoAvailable() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var candidate = candidate(100L, "MED-1", "氨氯地平片", product(200L), product(201L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(candidate));
        when(inventory.inspectMedicationAvailabilityForExactPackage(eq(1L), eq(10L), eq(20L), any(), eq(300L)))
                .thenReturn(availability(300L));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertTrue(result.diagnoses().isEmpty(), "无历史诊断时不得默认生成高血压");
        assertEquals(1, result.medications().size());
        assertEquals(200L, result.medications().getFirst().catalogItemId());
        verify(inventory, never()).inspectMedicationAvailabilityForExactPackage(any(), any(), any(), eq(201L), any());
    }

    @Test
    void doesNotUseAPlaceholderPackageWhenCurrentInventoryCannotResolveOne() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var exactCandidate = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(exactCandidate));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(
                        true, 1L, "门诊药房", true, 2L, null, null,
                        null, BigDecimal.valueOf(300), BigDecimal.ZERO));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertTrue(result.medications().isEmpty());
        assertTrue(result.guidanceNotes().stream().anyMatch(value -> value.contains("未带入草稿")));
    }

    @Test
    void reusesOnlyOneExactFullyVerifiedMedicationWithoutDefaults() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(
                encounter(80L, complete), encounter(70L, complete)));
        var exactCandidate = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, ""))
                .thenReturn(List.of(exactCandidate));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L))
                .thenReturn(availability(300L));

        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();

        assertEquals(1, result.medications().size());
        var medication = result.medications().getFirst();
        assertEquals(100L, medication.medicationId());
        assertEquals(200L, medication.catalogItemId());
        assertEquals(300L, medication.packageId());
        assertEquals(new BigDecimal("5"), medication.doseValue());
        assertEquals("ORAL", medication.routeCode());
        assertEquals("QD", medication.frequencyCode());
        assertEquals(new BigDecimal("30"), medication.durationValue());
        assertEquals(false, medication.substitutionAllowed());
        assertEquals("BOX", medication.quantityUnit());
        assertEquals("早餐后服用", medication.medicationInstruction());
    }

    @Test
    void missingUsageSnapshotsMustNotBecomeVerifiedMedicationInputs() {
        var fact = withUsage(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"), null);
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var current = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(availability(300L));
        assertTrue(service.resolveHistoricalStablePlan(99L).orElseThrow().medications().isEmpty());
    }

    @Test void unverifiedHistoricalMedicationIsNotReportedAsMissingInComparison() {
        var fact = withUsage(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"), null);
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var templates = mock(com.rhn.outpatient.api.OutpatientPlanTemplateDirectory.class);
        var standardMedication = new com.rhn.outpatient.api.OutpatientPlanTemplateDirectory.MedicationSnapshot(1L, 100L, 200L, 300L,
                "WESTERN", "MED-1", "氨氯地平片", "5mg", "原产品", BigDecimal.valueOf(5), "mg", "ORAL", "QD",
                BigDecimal.valueOf(30), "d", BigDecimal.ONE, "盒", null, false, false, "SALE", true, null);
        when(templates.visibleForCurrentContext()).thenReturn(List.of(new com.rhn.outpatient.api.OutpatientPlanTemplateDirectory.PlanTemplateSnapshot(
                7L, 0, "HOSPITAL", "MANUAL", null, "标准方案", null, 1, List.of(), List.of(standardMedication), List.of(), List.of())));
        var comparison = new HistoricalPlanComparisonService(service, templates,
                mock(com.rhn.platform.masterdata.api.MedicationSemanticDirectory.class), contexts).compare(99L, 7L);
        assertTrue(comparison.historicalPlan().medications().isEmpty());
        assertEquals(1, comparison.historicalPlan().reviewItems().size());
        assertEquals(1L, comparison.historicalPlan().reviewItems().getFirst().sourceId());
        assertEquals("氨氯地平片", comparison.historicalPlan().reviewItems().getFirst().display());
        assertEquals(Set.of("DIAGNOSIS", "MEDICATION"), comparison.historicalPlan().assessedCategories());
        assertTrue(comparison.differences().stream().noneMatch(row -> "MISSING_IN_HISTORY".equals(row.status())));
    }

    @Test
    void historicalBoxQuantityDoesNotBecomeACurrentBagOrder() {
        var complete = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, complete), encounter(70L, complete)));
        var current = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房", true,
                        2L, 300L, "袋", BigDecimal.TEN, new BigDecimal("300"), new BigDecimal("30")));

        assertTrue(service.resolveHistoricalStablePlan(99L).orElseThrow().medications().isEmpty());
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"medication", "product", "specification", "preparation-unit", "base-unit",
            "package", "package-factor", "stock-package", "stock-unit", "stock-factor", "insufficient-stock", "adoption", "chargeability"})
    void changedCatalogOrStockFactsNeverSilentlyReplaceTheHistoricalOrder(String defect) {
        var fact = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var product = product("product".equals(defect) ? 201L : 200L);
        var current = candidate("medication".equals(defect) ? 101L : 100L, "MED-1", "氨氯地平片", product);
        if ("specification".equals(defect)) when(current.preparationSpec()).thenReturn("10mg");
        if ("preparation-unit".equals(defect)) when(current.preparationUnit()).thenReturn("粒");
        if ("base-unit".equals(defect)) when(product.unitCode()).thenReturn("粒");
        if ("package".equals(defect)) when(product.packages()).thenReturn(List.of());
        if ("package-factor".equals(defect)) when(product.packages()).thenReturn(List.of(
                new com.rhn.platform.masterdata.api.MasterDataViews.PackageView(300L, null, "BOX", "盒", "30片/盒",
                        BigDecimal.TEN, "SALE", null, false, false, true, "ACTIVE", java.time.LocalDate.now().minusYears(1), null)));
        if ("adoption".equals(defect)) when(product.organizationAdoption().organizationId()).thenReturn(99L);
        if ("chargeability".equals(defect)) when(product.chargeable()).thenReturn(false);
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "门诊药房", true,
                        2L, "stock-package".equals(defect) ? 301L : 300L, "stock-unit".equals(defect) ? "袋" : "BOX",
                        "stock-factor".equals(defect) ? BigDecimal.TEN : new BigDecimal("30"),
                        "insufficient-stock".equals(defect) ? BigDecimal.TEN : new BigDecimal("300"), BigDecimal.TEN));
        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();
        assertTrue(result.medications().isEmpty(), defect);
        assertEquals(1, result.reviewItems().size(), defect);
        assertEquals(1L, result.reviewItems().getFirst().sourceId());
        assertTrue(result.guidanceNotes().stream().anyMatch(note -> note.contains("未带入草稿")));
        verify(inventory, never()).inspectMedicationAvailability(any(), any(), any(), any(), any());
    }

    @Test void missingOriginalCatalogFactsAreReportedWithoutInventingMappings() {
        var fact = withCatalog(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"), null, "盒");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();
        assertTrue(result.medications().isEmpty());
        assertTrue(result.guidanceNotes().stream().anyMatch(note -> note.contains("不完整")));
        verifyNoInteractions(inventory);
    }

    @Test void differentHistoricalPackagesAreNotTheSameRepeatedRegimen() {
        var first = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        var second = withCatalog(first, originalCatalog(301L, new BigDecimal("30")), "盒");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, first), encounter(70L, second)));
        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verifyNoInteractions(inventory);
    }

    @Test void multipleRepeatedRegimensOfOneMedicationAreNotCombined() {
        var first = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        var second = medication(2L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.TEN, "mg");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, first), encounter(70L, first), encounter(60L, second), encounter(50L, second)));
        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();
        assertTrue(result.medications().isEmpty());
        assertTrue(result.guidanceNotes().stream().anyMatch(note -> note.contains("多套")));
        verifyNoInteractions(inventory);
    }

    @Test void explicitHistoricalBaseUnitsDoNotPickTheCurrentStockPackage() {
        var fact = withCatalog(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"),
                originalCatalog(null, BigDecimal.ONE), "片");
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var current = candidate(100L, "RENAMED", "同一药品更名", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, null)).thenReturn(
                new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(true, 1L, "药房", true,
                        2L, null, "片", BigDecimal.ONE, new BigDecimal("300"), new BigDecimal("300")));
        var line = service.resolveHistoricalStablePlan(99L).orElseThrow().medications().getFirst();
        assertNull(line.packageId()); assertEquals("片", line.quantityUnit()); assertEquals(BigDecimal.ONE, line.quantity());
        verify(inventory, never()).inspectMedicationAvailability(any(), any(), any(), any(), any());
    }

    @Test void missingHistoricalDiagnosisTypeDoesNotBecomePrimary() {
        var fact = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        var latest = new OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot(80L, 0, Instant.now(),
                List.of(new OutpatientClinicalHistoryDirectory.DiagnosisFact(9L, "I10", "高血压", null)), List.of(fact), List.of());
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10))).thenReturn(List.of(latest, encounter(70L, fact)));
        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();
        assertTrue(result.diagnoses().isEmpty());
        assertTrue(result.reviewItems().stream().anyMatch(item -> "DIAGNOSIS".equals(item.category()) && item.sourceId().equals(9L)));
        assertTrue(result.guidanceNotes().stream().anyMatch(note -> note.contains("未自动补为主诊断")));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"route-id", "route-execution", "route-unmapped", "frequency-id",
            "frequency-count", "period", "period-unit", "anchor", "times", "first-day", "automatic", "invalid-json",
            "missing-boolean", "duplicate-key", "missing-period", "wrong-id-type", "unknown-field", "inactive-route", "inactive-frequency", "directory-error"})
    void changedOrUnconfirmedAdministrationRulesCannotBeReused(String changed) {
        var original = originalUsage();
        String rule = original.frequencyRuleSnapshot();
        switch (changed) {
            case "frequency-count" -> rule = rule.replace("\"frequencyCount\":1", "\"frequencyCount\":2");
            case "period" -> rule = rule.replace("\"periodValue\":1", "\"periodValue\":2");
            case "period-unit" -> rule = rule.replace("\"periodUnit\":\"D\"", "\"periodUnit\":\"H\"");
            case "anchor" -> rule = rule.replace("STANDARD_TIME", "ORDER_START");
            case "times" -> rule = rule.replace("08:00", "20:00");
            case "first-day" -> rule = rule.replace("REMAINING_SLOTS", "FULL_SCHEDULE");
            case "automatic" -> rule = rule.replace("\"automaticTaskGeneration\":true", "\"automaticTaskGeneration\":false");
            case "invalid-json" -> rule = "{broken}";
            case "missing-boolean" -> rule = rule.replace(",\"automaticTaskGeneration\":true", "");
            case "duplicate-key" -> rule = rule.replace("\"frequencyCount\":1", "\"frequencyCount\":1,\"frequencyCount\":1");
            case "missing-period" -> rule = rule.replace("\"periodValue\":1,", "");
            case "wrong-id-type" -> rule = rule.replace("\"id\":500", "\"id\":\"500\"");
            case "unknown-field" -> rule = rule.replaceFirst("\\{", "{\"newTimingRule\":\"unconfirmed\",");
            case "inactive-route" -> when(routes.requireActive(any(), any(), any(), any())).thenReturn(null);
            case "inactive-frequency" -> when(frequencies.requireActive(any(), any(), any(), any(), any(), any(), any())).thenReturn(null);
            case "directory-error" -> when(frequencies.requireActive(any(), any(), any(), any(), any(), any(), any()))
                    .thenThrow(new IllegalStateException("频次目录不可用"));
        }
        var usage = new OutpatientClinicalHistoryDirectory.MedicationUsageFact("route-id".equals(changed) ? 401L : 400L,
                "route-execution".equals(changed) ? "INFUSION" : "ADMINISTRATION",
                "route-unmapped".equals(changed) ? "UNMAPPED" : "RESOLVED", "frequency-id".equals(changed) ? 501L : 500L, rule);
        var fact = withUsage(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"), usage);
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var result = service.resolveHistoricalStablePlan(99L).orElseThrow();
        assertTrue(result.medications().isEmpty());
        assertTrue(result.guidanceNotes().stream().anyMatch(note -> note.contains("未带入草稿")));
        verifyNoInteractions(inventory);
    }

    @Test void differentHistoricalFrequencyRulesAreNotARepeatedRegimen() {
        var first = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        var original = originalUsage();
        var second = withUsage(first, new OutpatientClinicalHistoryDirectory.MedicationUsageFact(400L, "ADMINISTRATION", "RESOLVED",
                500L, original.frequencyRuleSnapshot().replace("\"frequencyCount\":1", "\"frequencyCount\":2")));
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, first), encounter(70L, second)));
        assertTrue(service.resolveHistoricalStablePlan(99L).isEmpty());
        verifyNoInteractions(inventory, routes, frequencies);
    }

    @Test void displayOnlyChangesAndDecimalFormattingPreserveEquivalentHistoricalRules() {
        var first = medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg");
        String reformatted = originalUsage().frequencyRuleSnapshot().replace("\"revision\":1", "\"revision\":2")
                .replace("每日一次", "本地名称").replace("\"periodValue\":1", "\"periodValue\":1.000");
        var second = withUsage(first, new OutpatientClinicalHistoryDirectory.MedicationUsageFact(400L, "ADMINISTRATION", "RESOLVED", 500L, reformatted));
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, first), encounter(70L, second)));
        var current = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(availability(300L));
        assertEquals(1, service.resolveHistoricalStablePlan(99L).orElseThrow().medications().size());
        verify(frequencies).requireActive(eq(1L), eq("QD"), eq(10L), eq(20L), eq("OUTPATIENT"), eq("MEDICATION"), any());
    }

    @Test void explicitAsNeededRulePreservesNullPeriodicFieldsWithoutDefaults() {
        var prn = new com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot(500L, 1, "QD", "需要时", null, null,
                "PRN", null, null, null, "EVENT", List.of(), "FROM_ORDER_TIME", false);
        when(frequencies.requireActive(eq(1L), eq("QD"), eq(10L), eq(20L), eq("OUTPATIENT"), eq("MEDICATION"), any())).thenReturn(prn);
        var fact = withUsage(medication(1L, "ACTIVE", "MED-1", "氨氯地平片", BigDecimal.valueOf(5), "mg"),
                new OutpatientClinicalHistoryDirectory.MedicationUsageFact(400L, "ADMINISTRATION", "RESOLVED", 500L, MAPPER.writeValueAsString(prn)));
        when(history.recentForResident(eq(7L), eq(99L), any(), eq(10)))
                .thenReturn(List.of(encounter(80L, fact), encounter(70L, fact)));
        var current = candidate(100L, "MED-1", "氨氯地平片", product(200L));
        when(inventory.findOrderableMedicationCandidates(1L, 10L, 20L, "")).thenReturn(List.of(current));
        when(inventory.inspectMedicationAvailabilityForExactPackage(1L, 10L, 20L, 200L, 300L)).thenReturn(availability(300L));
        assertEquals(1, service.resolveHistoricalStablePlan(99L).orElseThrow().medications().size());
    }

    private com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot frequency() {
        return new com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot(500L, 1, "QD", "每日一次", "QD", null,
                "TIMES_PER_PERIOD", 1, BigDecimal.ONE, "D", "STANDARD_TIME", List.of("08:00"), "REMAINING_SLOTS", true);
    }

    private OutpatientClinicalHistoryDirectory.MedicationUsageFact originalUsage() {
        return new OutpatientClinicalHistoryDirectory.MedicationUsageFact(400L, "ADMINISTRATION", "RESOLVED", 500L,
                MAPPER.writeValueAsString(frequency()));
    }

    private OutpatientClinicalHistoryDirectory.MedicationFact withUsage(OutpatientClinicalHistoryDirectory.MedicationFact fact,
            OutpatientClinicalHistoryDirectory.MedicationUsageFact usage) {
        return new OutpatientClinicalHistoryDirectory.MedicationFact(fact.id(), fact.revision(), fact.status(), fact.code(), fact.name(),
                fact.doseValue(), fact.doseUnit(), fact.routeCode(), fact.frequencyCode(), fact.durationValue(), fact.durationUnit(),
                fact.quantity(), fact.quantityUnit(), fact.authoredAt(), fact.catalog(), usage);
    }

    private OutpatientClinicalHistoryDirectory.MedicationFact withCatalog(OutpatientClinicalHistoryDirectory.MedicationFact fact,
            OutpatientClinicalHistoryDirectory.MedicationCatalogFact catalog, String quantityUnit) {
        return new OutpatientClinicalHistoryDirectory.MedicationFact(fact.id(), fact.revision(), fact.status(), fact.code(), fact.name(),
                fact.doseValue(), fact.doseUnit(), fact.routeCode(), fact.frequencyCode(), fact.durationValue(), fact.durationUnit(),
                fact.quantity(), quantityUnit, fact.authoredAt(), catalog, fact.usage());
    }

    private OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot encounter(
            Long encounterId, OutpatientClinicalHistoryDirectory.MedicationFact medication) {
        return new OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot(encounterId, 0,
                Instant.parse("2026-08-01T01:00:00Z"), List.of(), List.of(medication), List.of());
    }

    private OutpatientClinicalHistoryDirectory.MedicationFact medication(
            Long id, String status, String code, String name, BigDecimal dose, String doseUnit) {
        return new OutpatientClinicalHistoryDirectory.MedicationFact(id, 0, status, code, name,
                dose, doseUnit, "ORAL", "QD", BigDecimal.valueOf(30), "d",
                BigDecimal.ONE, "盒", Instant.parse("2026-08-01T01:00:00Z"), originalCatalog(300L, new BigDecimal("30")), originalUsage());
    }

    private OutpatientClinicalHistoryDirectory.MedicationCatalogFact originalCatalog(Long packageId, BigDecimal factor) {
        return new OutpatientClinicalHistoryDirectory.MedicationCatalogFact(100L, 200L, packageId, "5mg", "片",
                factor, "片", factor, packageId == null ? "片" : "盒", packageId == null ? null : "30片/盒",
                false, false, "SALE", "早餐后服用");
    }

    private OutpatientPrescriptionInventoryDirectory.OrderableMedicationView candidate(
            Long id, String code, String name, MedicationProductView... products) {
        var value = mock(OutpatientPrescriptionInventoryDirectory.OrderableMedicationView.class);
        when(value.id()).thenReturn(id);
        when(value.code()).thenReturn(code);
        when(value.name()).thenReturn(name);
        when(value.preparationSpec()).thenReturn("5mg");
        when(value.preparationUnit()).thenReturn("片");
        when(value.sdStatus()).thenReturn("ACTIVE");
        when(value.products()).thenReturn(List.of(products));
        return value;
    }

    private MedicationProductView product(Long id) {
        var adoption = mock(OrganizationAdoptionView.class);
        when(adoption.orderable()).thenReturn(true);
        when(adoption.dispensable()).thenReturn(true);
        when(adoption.chargeable()).thenReturn(true);
        when(adoption.organizationId()).thenReturn(10L);
        when(adoption.catalogItemId()).thenReturn(id);
        when(adoption.sdStatus()).thenReturn("ACTIVE");
        when(adoption.validFrom()).thenReturn(java.time.LocalDate.now().minusYears(1));
        var value = mock(MedicationProductView.class);
        when(value.id()).thenReturn(id);
        when(value.medicationId()).thenReturn(100L);
        when(value.unitCode()).thenReturn("片");
        when(value.stocked()).thenReturn(true);
        when(value.chargeable()).thenReturn(true);
        when(value.validFrom()).thenReturn(java.time.LocalDate.now().minusYears(1));
        when(value.packages()).thenReturn(List.of(new com.rhn.platform.masterdata.api.MasterDataViews.PackageView(300L, null, "BOX", "盒", "30片/盒", new BigDecimal("30"), "SALE", null, false, false, true, "ACTIVE", java.time.LocalDate.now().minusYears(1), null)));
        when(value.sdStatus()).thenReturn("ACTIVE");
        when(value.orderable()).thenReturn(true);
        when(value.organizationAdoption()).thenReturn(adoption);
        return value;
    }

    private OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView availability(Long packageId) {
        return new OutpatientPrescriptionInventoryDirectory.MedicationAvailabilityView(
                true, 1L, "门诊药房", true, 2L, packageId, "BOX",
                BigDecimal.valueOf(30), BigDecimal.valueOf(300), BigDecimal.TEN);
    }
}
