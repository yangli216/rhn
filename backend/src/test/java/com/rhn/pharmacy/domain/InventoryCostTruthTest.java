package com.rhn.pharmacy.domain;

import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;

class InventoryCostTruthTest {
    private InventoryBalance balance() { return new InventoryBalance(1L, 2L, 3L, 4L, 5L, "AVAILABLE", "TAB"); }
    private BigDecimal n(int value) { return BigDecimal.valueOf(value); }

    @Test void unknown_existing_cost_cannot_be_treated_as_free_stock() {
        var balance = balance();
        balance.receive(n(10), null);
        balance.receive(n(10), n(4));
        assertNull(balance.averageUnitCost());
        assertEquals(n(20), balance.quantityOnHand());
    }

    @Test void an_unpriced_receipt_cannot_inherit_existing_cost() {
        var balance = balance();
        balance.receive(n(10), n(4));
        balance.receive(n(10), null);
        assertNull(balance.averageUnitCost());
        balance.receive(n(10), n(8));
        assertNull(balance.averageUnitCost());
    }

    @Test void actual_zero_cost_participates_in_weighted_cost() {
        var balance = balance();
        balance.receive(n(10), n(0));
        balance.receive(n(10), n(4));
        assertEquals(0, n(2).compareTo(balance.averageUnitCost()));
    }

    @Test void new_stock_after_an_empty_position_uses_only_its_own_cost() {
        var balance = balance();
        balance.receive(n(10), n(4));
        balance.issueAvailable(n(10));
        balance.receive(n(10), null);
        assertNull(balance.averageUnitCost());
        balance.issueAvailable(n(10));
        balance.receive(n(10), n(8));
        assertEquals(n(8), balance.averageUnitCost());
    }

    @Test void explicit_revaluation_can_restore_a_known_cost() {
        var balance = balance();
        balance.receive(n(10), null);
        balance.revalueCost(n(4));
        balance.receive(n(10), n(8));
        assertEquals(0, n(6).compareTo(balance.averageUnitCost()));
    }

    @Test void negative_cost_is_rejected_without_mutating_quantity() {
        var balance = balance();
        assertThrows(com.rhn.shared.api.BusinessException.class, () -> balance.receive(n(10), n(-1)));
        assertEquals(BigDecimal.ZERO, balance.quantityOnHand());
        assertNull(balance.averageUnitCost());
    }
    @Test void document_value_is_preserved_until_weighted_cost_is_rounded() {
        var balance = balance();
        balance.receiveValue(n(24), new BigDecimal("12.8"));
        assertEquals(new BigDecimal("0.533333"), balance.averageUnitCost());
        balance.receiveValue(n(24), new BigDecimal("12.800008"));
        assertEquals(new BigDecimal("0.533333"), balance.averageUnitCost());
        assertEquals(n(48), balance.quantityOnHand());
    }

    @Test void document_value_does_not_replace_unknown_existing_cost_with_zero() {
        var balance = balance();
        balance.receive(n(10), null);
        balance.receiveValue(n(10), n(40));
        assertNull(balance.averageUnitCost());
    }

    @Test void unknown_document_value_does_not_inherit_known_cost() {
        var balance = balance();
        balance.receive(n(10), n(4));
        balance.receiveValue(n(10), null);
        assertNull(balance.averageUnitCost());
    }

    @Test void zero_document_value_is_valid_but_negative_value_does_not_mutate_stock() {
        var balance = balance();
        assertThrows(com.rhn.shared.api.BusinessException.class, () -> balance.receiveValue(n(24), n(-1)));
        assertEquals(BigDecimal.ZERO, balance.quantityOnHand());
        balance.receiveValue(n(24), BigDecimal.ZERO);
        assertEquals(0, balance.averageUnitCost().signum());
    }

}
