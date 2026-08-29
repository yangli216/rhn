package com.rhn;

import com.rhn.pharmacy.domain.InventoryTraceCode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    private InventoryTraceCode traceCode(BigDecimal factor) {
        return new InventoryTraceCode(1L, 2L, 3L, 4L, 5L, "TRACE-001", "TRACE001",
                "DRUG-001", "测试药品", "LOT-001", BigDecimal.ONE, factor, 7L);
    }
}
