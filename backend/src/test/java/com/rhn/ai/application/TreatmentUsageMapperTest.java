package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.TreatmentUsageSuggestion;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.OrderableMedicationView;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory.FrequencySnapshot;
import com.rhn.shared.context.ExecutionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TreatmentUsageMapperTest {
    final MedicationRouteDirectory routes = mock(MedicationRouteDirectory.class);
    final OrderFrequencyDirectory frequencies = mock(OrderFrequencyDirectory.class);
    final ExecutionContext context = new ExecutionContext(1L, 2L, "doctor", "test", Set.of(), 3L, 4L, "DEPARTMENT", Set.of(), Set.of());
    final LocalDate date = LocalDate.of(2026, 10, 20);
    TreatmentUsageMapper.Session session;

    static RouteSnapshot route(long id, String code, String name, String executionType) {
        return new RouteSnapshot(id, code, name, "RHN", "1", executionType);
    }

    static FrequencySnapshot frequency(long id, String code, String name, String rule, Integer count, String period, String unit) {
        return new FrequencySnapshot(id, 1, code, name, name, null, rule, count, period == null ? null : new BigDecimal(period),
                unit, null, List.of(), null, true);
    }

    static OrderableMedicationView drug(String type, String doseUnit, String preparationUnit, String strengthUnit,
                                        boolean antimicrobial, boolean skinTest) {
        var value = mock(OrderableMedicationView.class);
        when(value.sdMedicationType()).thenReturn(type);
        when(value.defaultDoseUnit()).thenReturn(doseUnit);
        when(value.preparationUnit()).thenReturn(preparationUnit);
        when(value.strengthUnit()).thenReturn(strengthUnit);
        when(value.antimicrobial()).thenReturn(antimicrobial);
        when(value.skinTestRequired()).thenReturn(skinTest);
        return value;
    }

    static OrderableMedicationView tablet() { return drug("WESTERN", null, "片", "mg", false, false); }

    static TreatmentUsageSuggestion raw(String dose, String unit, String route, String frequency, Integer days) {
        return new TreatmentUsageSuggestion(dose == null ? null : new BigDecimal(dose), unit, route, frequency, days);
    }

    @BeforeEach void setup() {
        when(routes.active(eq(1L), eq("OUTPATIENT"), any())).thenReturn(List.of(
                route(10, "PO", "口服", "NONE"), route(11, "IM", "肌内注射", "TREATMENT"),
                route(12, "IVGTT", "静脉滴注", "INFUSION"), route(13, "EXT", "外用", "NONE")));
        when(routes.resolveActive(any(), any(), any(), any())).thenReturn(Optional.empty());
        when(frequencies.active(eq(1L), eq(3L), eq(4L), eq("OUTPATIENT"), eq("MEDICATION"), any())).thenReturn(List.of(
                frequency(20, "QD", "每日一次", "TIMES_PER_PERIOD", 1, "1", "D"),
                frequency(21, "BID", "每日两次", "TIMES_PER_PERIOD", 2, "1", "D"),
                frequency(22, "TID", "每日三次", "TIMES_PER_PERIOD", 3, "1", "D"),
                frequency(23, "Q8H", "每8小时一次", "FIXED_INTERVAL", 1, "8", "H"),
                frequency(24, "PRN", "必要时", "PRN", null, null, null)));
        session = new TreatmentUsageMapper(routes, frequencies).session(context, date);
    }

    @Test void everyFieldMapsOntoCurrentCatalogCodesAndUnits() {
        var result = session.map(raw("1", "片", "口服", "每日3次", 5), tablet());
        assertEquals(new TreatmentUsageSuggestion(BigDecimal.ONE, "片", "PO", "TID", 5), result);
    }

    @Test void fieldsAreValidatedIndependentlyAndPartialSuccessIsKept() {
        // Unknown route, out-of-range duration and a unit the drug does not use are dropped; the frequency survives.
        var result = session.map(raw("500", "单位未知", "鼻饲", "BID", 45), tablet());
        assertNull(result.doseValue());
        assertNull(result.doseUnit());
        assertNull(result.routeCode());
        assertEquals("BID", result.frequencyCode());
        assertNull(result.durationDays());
    }

    @Test void nothingMappableYieldsNull() {
        assertNull(session.map(raw("1", "盒", "鼻饲", "每周两次", 0), tablet()));
        assertNull(session.map(raw("0", "片", null, null, 31), tablet()));
        assertNull(session.map(null, tablet()));
    }

    @Test void doseWithoutMatchingOrPairedUnitDropsBothDoseFields() {
        var onlyValue = session.map(new TreatmentUsageSuggestion(BigDecimal.ONE, null, "PO", null, null), tablet());
        assertNull(onlyValue.doseValue());
        assertNull(onlyValue.doseUnit());
        assertEquals("PO", onlyValue.routeCode());
        // 0.5 g is not converted into the catalog's mg or tablet units.
        assertNull(session.map(raw("0.5", "g", null, null, 3), tablet()).doseValue());
        assertEquals(new BigDecimal("0.5"), session.map(raw("0.5", "毫克", null, null, 3), tablet()).doseValue());
        assertEquals("mg", session.map(raw("0.5", "毫克", null, null, 3), tablet()).doseUnit());
        // A catalog default dose unit counts as the drug's own unit.
        var syrup = drug("WESTERN", "mL", "瓶", null, false, false);
        assertEquals("mL", session.map(raw("10", "ml", null, null, null), syrup).doseUnit());
        assertNull(session.map(raw("10", "片", null, null, null), syrup));
        assertNull(session.map(raw("1.00001", "片", null, null, null), tablet()));
    }

    @ParameterizedTest
    @CsvSource({"QD,QD", "qd,QD", "每日1次,QD", "每天一次,QD", "一日一次,QD", "BID,BID", "b.i.d,BID", "每日2次,BID", "一日两次,BID",
            "TID,TID", "每日三次,TID", "每天3次,TID", "Q8H,Q8H", "q8h,Q8H", "每8小时一次,Q8H", "每隔8小时,Q8H", "PRN,PRN",
            "必要时,PRN"})
    void frequencyWordingNormalizesToActiveCode(String wording, String code) {
        assertEquals(code, session.map(raw(null, null, null, wording, null), tablet()).frequencyCode());
    }

    @ParameterizedTest
    @CsvSource({"QID", "每日4次", "Q6H", "每周一次", "隔日一次", "随便"})
    void frequencyWithoutAnActiveEquivalentIsNotInvented(String wording) {
        assertNull(session.map(raw("1", "片", null, wording, null), tablet()).frequencyCode());
    }

    @ParameterizedTest
    @CsvSource({"口服,PO", "PO,PO", "po,PO", "内服,PO", "肌注,IM", "IM,IM", "肌肉注射,IM", "外用,EXT", "涂抹,EXT"})
    void routeWordingNormalizesToActiveCode(String wording, String code) {
        assertEquals(code, session.map(raw("1", "片", wording, null, null), tablet()).routeCode());
    }

    @Test void inactiveRouteWordingIsNotMapped() {
        assertNull(session.map(raw("1", "片", "吸入", "BID", null), tablet()).routeCode());
        assertNull(session.map(raw(null, null, "舌下含服", null, null), tablet()));
        verify(routes, atLeastOnce()).resolveActive(eq(1L), eq("吸入"), eq("OUTPATIENT"), any());
    }

    @Test void hospitalDirectoryAliasIsHonouredWhenTheWordingIsNotInTheBuiltInTable() {
        when(routes.resolveActive(eq(1L), eq("口含"), eq("OUTPATIENT"), any())).thenReturn(Optional.of(route(10, "PO", "口服", "NONE")));
        assertEquals("PO", session.map(raw(null, null, "口含", null, 1), tablet()).routeCode());
        when(routes.resolveActive(eq(1L), eq("坏"), eq("OUTPATIENT"), any())).thenThrow(new IllegalStateException("boom"));
        assertNull(session.map(raw(null, null, "坏", "QD", null), tablet()).routeCode());
    }

    @Test void herbalAntimicrobialSkinTestAndInfusionNeverGetUsage() {
        var full = raw("1", "片", "口服", "BID", 3);
        assertNull(session.map(full, drug("HERBAL", null, "片", null, false, false)));
        assertNull(session.map(full, drug("WESTERN", null, "片", null, true, false)));
        assertNull(session.map(full, drug("WESTERN", null, "片", null, false, true)));
        assertNull(session.map(raw("1", "片", "静脉滴注", "BID", 3), tablet()));
        assertNull(session.map(raw("1", "片", "静滴", "BID", 3), tablet()));
        assertNotNull(session.map(full, drug("CHINESE_PATENT", null, "片", null, false, false)));
    }

    @Test void directoryReadsAreSharedAcrossCandidates() {
        session.map(raw("1", "片", "口服", "BID", 3), tablet());
        session.map(raw("1", "片", "口服", "BID", 3), tablet());
        verify(routes, times(1)).active(any(), any(), any());
        verify(frequencies, times(1)).active(any(), any(), any(), any(), any(), any());
    }
}
