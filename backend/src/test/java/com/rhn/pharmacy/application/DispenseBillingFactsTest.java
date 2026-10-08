package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.*;
import com.rhn.pharmacy.infrastructure.*;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DispenseBillingFactsTest {
    final MedicationDispenseRepository dispenses = mock(MedicationDispenseRepository.class);
    final DispenseTaskLineRepository tasks = mock(DispenseTaskLineRepository.class);
    final StockItemRepository items = mock(StockItemRepository.class);
    final StockSiteRepository sites = mock(StockSiteRepository.class);
    final MedicationDispenseLineRepository lines = mock(MedicationDispenseLineRepository.class);
    final DispenseTaskLine task = mock(DispenseTaskLine.class);
    final StockSite site = mock(StockSite.class);
    final JpaDispenseBillingDirectory directory = new JpaDispenseBillingDirectory(dispenses, tasks, items, sites, lines);
    final MedicationDispense dispense = new MedicationDispense(1L,2L,3L,4L,5L,6L,7L,null,"ACTUAL-DISPENSE","DISPENSE",
            Instant.parse("2026-10-03T08:00:00Z"),8L,9L,10L,null,null,null,new BigDecimal("2"),"EA",null);
    DispenseBillingFactsTest() {
        when(dispenses.findByIdAndTenantId(dispense.id(),1L)).thenReturn(Optional.of(dispense));
        when(tasks.findByTenantIdAndTaskId(1L,4L)).thenReturn(Optional.of(task));
        when(task.id()).thenReturn(11L); when(task.stockItemId()).thenReturn(12L); when(task.requestId()).thenReturn(13L);
        when(task.productCodeSnapshot()).thenReturn("PRODUCT"); when(task.productNameSnapshot()).thenReturn("真实产品");
        when(task.baseQuantityFactor()).thenReturn(new BigDecimal("99"));
        var item = mock(StockItem.class); when(item.id()).thenReturn(12L); when(item.catalogItemId()).thenReturn(14L);
        when(items.findByIdAndTenantId(12L,1L)).thenReturn(Optional.of(item));
        when(site.organizationId()).thenReturn(2L); when(sites.findByIdAndTenantId(7L,1L)).thenReturn(Optional.of(site));
    }
    @Test void uses_actual_line_factor_even_when_task_factor_differs() {
        actual(List.of(line("1","EA","1"),line("1","EA","1")));
        var fact = directory.requireById(1L,dispense.id());
        assertEquals(0,BigDecimal.ONE.compareTo(fact.baseQuantityFactor())); assertEquals(9L,fact.processedBy()); assertEquals(4L,fact.taskId());
    }
    @Test void absent_lines_cannot_use_task_quantity_or_factor() { actual(List.of()); rejected(); }
    @Test void inconsistent_line_units_are_rejected() { actual(List.of(line("2","BOX","1"))); rejected(); }
    @Test void inconsistent_line_factors_are_rejected() { actual(List.of(line("1","EA","1"),line("1","EA","10"))); rejected(); }
    @Test void header_quantity_must_equal_actual_lines() { actual(List.of(line("1","EA","1"))); rejected(); }
    @Test void changed_site_organization_cannot_rewrite_historical_execution_identity() {
        actual(List.of(line("2","EA","1"))); when(site.organizationId()).thenReturn(99L); rejected();
    }
    private MedicationDispenseLine line(String qty,String unit,String factor) {
        return new MedicationDispenseLine(1L,dispense.id(),11L,null,1,15L,12L,16L,17L,new BigDecimal(qty),unit,new BigDecimal(factor));
    }
    private void actual(List<MedicationDispenseLine> actual) { when(lines.findByTenantIdAndMedicationDispenseIdOrderBySortOrder(1L,dispense.id())).thenReturn(actual); }
    private void rejected() { assertEquals("DISPENSE_BILLING_FACT_UNVERIFIED",assertThrows(BusinessException.class,()->directory.requireById(1L,dispense.id())).code()); }
}
