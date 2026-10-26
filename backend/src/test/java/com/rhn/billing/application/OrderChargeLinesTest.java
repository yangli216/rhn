package com.rhn.billing.application;

import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class OrderChargeLinesTest {
    record Line(long id, String sourceType, Long sourceId) {}

    private static final Line BASE = new Line(1, "SERVICE_REQUEST", 900L);
    private static final Line SURCHARGE = new Line(2, "SERVICE_REQUEST", 900L);
    private static final Line OTHER_ORDER = new Line(3, "SERVICE_REQUEST", 901L);
    private static final Line MEDICATION = new Line(4, "MEDICATION_REQUEST", 900L);
    private static final List<Line> CANDIDATES = List.of(BASE, SURCHARGE, OTHER_ORDER, MEDICATION);

    @Test
    void rejects_selecting_only_part_of_an_examination_order() {
        BusinessException error = assertThrows(BusinessException.class, () -> check(List.of(BASE, OTHER_ORDER)));
        assertEquals("ORDER_LINES_INCOMPLETE", error.code());
    }

    @Test
    void accepts_whole_orders_and_other_sources() {
        assertDoesNotThrow(() -> check(List.of(BASE, SURCHARGE)));
        assertDoesNotThrow(() -> check(List.of(OTHER_ORDER, MEDICATION)));
    }

    private static void check(List<Line> selected) {
        OrderChargeLines.requireWholeOrders(selected, CANDIDATES, Line::sourceType, Line::sourceId,
                "ORDER_LINES_INCOMPLETE", "同一检查申请的收费明细须一并处理");
    }
}
