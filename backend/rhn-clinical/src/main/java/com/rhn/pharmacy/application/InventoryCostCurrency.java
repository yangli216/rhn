package com.rhn.pharmacy.application;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Cost balances and quantity movements currently use the CNY procurement contract, without FX conversion. */
final class InventoryCostCurrency {
    private InventoryCostCurrency() {}

    static void requireSupported(String currency) {
        if (!"CNY".equals(currency)) {
            throw conflict("INVENTORY_COST_CURRENCY_UNSUPPORTED",
                    "当前库存成本仅支持人民币核算，不能将其他币种金额直接计入成本账");
        }
    }
}
