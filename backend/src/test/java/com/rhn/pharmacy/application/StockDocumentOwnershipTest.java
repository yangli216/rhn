package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.*;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StockDocumentOwnershipTest {
    @Mock ExecutionContextProvider contexts;
    @Mock StockSiteRepository sites;
    @Mock StockCountRepository counts;
    @Mock StockCountLineRepository countLines;
    @Mock StockTransferRepository transfers;
    @Mock StockTransferLineRepository transferLines;
    @Mock DispenseTaskRepository tasks;
    @Mock MedicationDispenseRepository dispenses;
    @Mock InventoryDocumentEventRepository events;
    @InjectMocks StockCountApplicationService countService;
    @InjectMocks StockTransferApplicationService transferService;
    @InjectMocks DispenseApplicationService dispenseService;

    private void context(Long department) {
        when(contexts.requireCurrent()).thenReturn(new ExecutionContext(10L, 11L, "test", "test", Set.of(),
                20L, department, "ORGANIZATION", Set.of(20L), Set.of()));
    }
    private StockSite site(Long department) {
        StockSite value = new StockSite(10L, 20L, department, "SITE", "实际站点", "VIRTUAL", "MIXED",
                LocalDate.of(2026, 1, 1), null, 11L);
        when(sites.findByIdAndTenantId(value.id(), 10L)).thenReturn(Optional.of(value));
        return value;
    }
    private void rejectsMissingOwnership(Runnable action) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(BusinessException.class,
                error -> assertThat(error.code()).isEqualTo("STOCK_SITE_DEPARTMENT_REQUIRED"));
        verify(counts, never()).save(any());
        verify(transfers, never()).save(any());
        verify(dispenses, never()).save(any());
        verifyNoInteractions(countLines, transferLines, events);
    }
    @ParameterizedTest @NullSource @ValueSource(longs = {23L})
    void count_never_substitutes_seed_or_operator_department(Long operatorDepartment) {
        context(operatorDepartment);
        StockSite unassigned = site(null);
        rejectsMissingOwnership(() -> countService.create(new StockCountApplicationService.CreateCountCommand(
                unassigned.id(), null, null, "COUNT-1", "FULL", List.of(), null, null)));
    }
    @Test void transfer_does_not_assign_the_operators_department_to_an_unassigned_destination() {
        context(23L);
        StockSite source = site(23L), destination = site(null);
        rejectsMissingOwnership(() -> transferService.create(transfer(source, destination)));
    }
    @Test void transfer_requires_the_actual_source_department() {
        context(23L);
        StockSite source = site(null), destination = site(24L);
        rejectsMissingOwnership(() -> transferService.create(transfer(source, destination)));
    }
    private StockTransferApplicationService.CreateTransferCommand transfer(StockSite source, StockSite destination) {
        return new StockTransferApplicationService.CreateTransferCommand(source.id(), destination.id(), null,
                "TRANSFER-1", null, null, null, List.of(new StockTransferApplicationService.TransferLineCommand(
                    100L, 101L, BigDecimal.ONE, "BOX", BigDecimal.ONE)));
    }
    @ParameterizedTest @NullSource @ValueSource(longs = {23L})
    void dispense_requires_site_ownership_before_saving_an_event(Long operatorDepartment) {
        context(operatorDepartment);
        StockSite unassigned = site(null);
        DispenseTask task = mock(DispenseTask.class);
        when(task.stockSiteId()).thenReturn(unassigned.id());
        when(tasks.lockByIdAndTenantId(50L, 10L)).thenReturn(Optional.of(task));
        rejectsMissingOwnership(() -> dispenseService.dispense(50L, new DispenseApplicationService.DispenseCommand(
                "DISPENSE-1", BigDecimal.ONE, null, 60L, 61L, null, null, null)));
    }
}
