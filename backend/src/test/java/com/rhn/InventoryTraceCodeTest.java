package com.rhn;

import com.rhn.pharmacy.application.InventoryTraceApplicationService;
import com.rhn.pharmacy.application.InventoryTraceApplicationService.TraceMovementLine;
import com.rhn.pharmacy.domain.InventoryTraceCode;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.infrastructure.GoodsReceiptLineRepository;
import com.rhn.pharmacy.infrastructure.GoodsReceiptRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceCodeRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceEventRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InventoryTraceCodeTest {
    @Test
    void tracks_partial_issue_and_restock_in_base_units() {
        InventoryTraceCode code = traceCode(new BigDecimal("24"));
        code.receive(21L, 31L, 41L, "GR-001", Instant.parse("2026-08-29T00:00:00Z"), 7L);
        code.openForSplit("MANUAL_SPLIT", 51L, "OPEN-001", 7L);

        code.consumePartial(new BigDecimal("5"), "MEDICATION_DISPENSE", 61L, "DSP-001",
                Instant.parse("2026-08-29T01:00:00Z"), 7L);
        assertThat(code.status()).isEqualTo("PARTIALLY_ISSUED");
        assertThat(code.remainingBaseQuantity()).isEqualByComparingTo("19");

        code.restorePartial(21L, new BigDecimal("2"), "MEDICATION_RETURN", 71L, "RET-001", 7L);
        assertThat(code.status()).isEqualTo("PARTIALLY_ISSUED");
        assertThat(code.remainingBaseQuantity()).isEqualByComparingTo("21");

        code.consumePartial(new BigDecimal("21"), "MEDICATION_DISPENSE", 62L, "DSP-002",
                Instant.parse("2026-08-29T02:00:00Z"), 7L);
        assertThat(code.status()).isEqualTo("ISSUED");
        assertThat(code.remainingBaseQuantity()).isZero();
        assertThat(code.stockBinId()).isNull();

        code.restorePartial(21L, new BigDecimal("24"), "MEDICATION_RETURN", 72L, "RET-002", 7L);
        assertThat(code.status()).isEqualTo("OPENED");
        assertThat(code.remainingBaseQuantity()).isEqualByComparingTo("24");
    }

    @Test
    void rejects_whole_issue_after_package_has_been_opened() {
        InventoryTraceCode code = traceCode(new BigDecimal("10"));
        code.receive(21L, 31L, 41L, "GR-001", Instant.now(), 7L);
        code.openForSplit("MANUAL_SPLIT", 51L, "OPEN-001", 7L);

        assertThatThrownBy(() -> code.issue("MEDICATION_DISPENSE", 61L, "DSP-001", 7L))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void issues_the_exact_trace_code_selected_during_dispensing() {
        long tenantId = 1L; long siteId = 3L; long binId = 21L; long lotId = 31L; long actorId = 7L;
        StockItem item = new StockItem(tenantId, siteId, 41L, 51L, "TAB", "FEFO",
                false, true, true, false, false, false, null, false, actorId);
        InventoryTraceCode code = new InventoryTraceCode(tenantId, 2L, siteId, item.id(), 5L,
                "TRACE-SELECTED", "TRACE-SELECTED", "DRUG-001", "测试药品", "LOT-001",
                BigDecimal.ONE, new BigDecimal("24"), actorId);
        code.receive(binId, lotId, 61L, "GR-001", Instant.parse("2026-08-29T00:00:00Z"), actorId);

        InventoryTraceCodeRepository codes = mock(InventoryTraceCodeRepository.class);
        StockItemRepository items = mock(StockItemRepository.class);
        when(items.findByIdAndTenantId(item.id(), tenantId)).thenReturn(Optional.of(item));
        when(codes.lockByTenantIdAndId(tenantId, code.id())).thenReturn(Optional.of(code));

        traceService(codes, items).issue(context(tenantId, actorId), siteId, "MEDICATION_DISPENSE",
                71L, "DSP-001", List.of(new TraceMovementLine(binId, item.id(), lotId,
                        new BigDecimal("24"))), List.of(code.id()));

        assertThat(code.status()).isEqualTo("ISSUED");
        assertThat(code.currentDocumentId()).isEqualTo(71L);
    }

    @Test
    void rejects_a_scanned_trace_code_outside_the_reserved_stock_dimension() {
        long tenantId = 1L; long siteId = 3L; long binId = 21L; long lotId = 31L; long actorId = 7L;
        StockItem item = new StockItem(tenantId, siteId, 41L, 51L, "TAB", "FEFO",
                false, true, true, false, false, false, null, false, actorId);
        InventoryTraceCode code = new InventoryTraceCode(tenantId, 2L, siteId, item.id(), 5L,
                "TRACE-WRONG-BIN", "TRACE-WRONG-BIN", "DRUG-001", "测试药品", "LOT-001",
                BigDecimal.ONE, new BigDecimal("24"), actorId);
        code.receive(99L, lotId, 61L, "GR-001", Instant.parse("2026-08-29T00:00:00Z"), actorId);

        InventoryTraceCodeRepository codes = mock(InventoryTraceCodeRepository.class);
        StockItemRepository items = mock(StockItemRepository.class);
        when(items.findByIdAndTenantId(item.id(), tenantId)).thenReturn(Optional.of(item));
        when(codes.lockByTenantIdAndId(tenantId, code.id())).thenReturn(Optional.of(code));

        assertThatThrownBy(() -> traceService(codes, items).issue(context(tenantId, actorId), siteId,
                "MEDICATION_DISPENSE", 71L, "DSP-001", List.of(new TraceMovementLine(binId,
                        item.id(), lotId, new BigDecimal("24"))), List.of(code.id())))
                .hasMessageContaining("追溯码与本次发药的药品、批次或货位不一致");
        assertThat(code.status()).isEqualTo("AVAILABLE");
    }

    private InventoryTraceApplicationService traceService(InventoryTraceCodeRepository codes,
                                                            StockItemRepository items) {
        return new InventoryTraceApplicationService(codes, mock(InventoryTraceEventRepository.class),
                mock(GoodsReceiptRepository.class), mock(GoodsReceiptLineRepository.class),
                mock(StockSiteRepository.class), items, mock(CatalogLifecycleDirectory.class),
                mock(ExecutionContextProvider.class));
    }

    private ExecutionContext context(long tenantId, long actorId) {
        return new ExecutionContext(tenantId, actorId, "pharmacist", "correlation", Set.of(),
                2L, null, "ORGANIZATION", Set.of(2L), Set.of());
    }

    private InventoryTraceCode traceCode(BigDecimal factor) {
        return new InventoryTraceCode(1L, 2L, 3L, 4L, 5L, "TRACE-001", "TRACE001",
                "DRUG-001", "测试药品", "LOT-001", BigDecimal.ONE, factor, 7L);
    }
}
