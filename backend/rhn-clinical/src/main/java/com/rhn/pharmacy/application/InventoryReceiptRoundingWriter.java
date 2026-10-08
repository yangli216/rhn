package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryTransaction;
import com.rhn.pharmacy.domain.InventoryTransactionLine;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.sql.Types;
import java.util.List;

/** Records the difference between the document amount and persisted six-decimal inventory cost. */
@Component
public class InventoryReceiptRoundingWriter {
    private final JdbcTemplate jdbc;

    public InventoryReceiptRoundingWriter(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static BigDecimal balanceValue(InventoryBalance balance) {
        if (balance.quantityOnHand().signum() == 0) return amount(BigDecimal.ZERO);
        return balance.averageUnitCost() == null ? null
                : amount(balance.quantityOnHand().multiply(balance.averageUnitCost()));
    }

    public static Adjustment capture(InventoryBalance balance, InventoryTransactionLine line, BigDecimal previousValue) {
        BigDecimal after = balanceValue(balance);
        if (previousValue == null || line.amountDelta() == null || after == null) return null;
        BigDecimal before = amount(previousValue.add(line.amountDelta()));
        if (after.compareTo(before) == 0) return null;
        return new Adjustment(balance.id(), balance.stockSiteId(), balance.stockBinId(), balance.stockItemId(), balance.stockLotId(),
                balance.stockStatus(), balance.quantityOnHand(), balance.averageUnitCost(), line.id(), before, after);
    }

    public void write(ExecutionContext context, InventoryTransaction transaction, String currency, List<Adjustment> adjustments) {
        for (Adjustment adjustment : adjustments) {
            jdbc.update("""
                    insert into RHN_SUP_INV_VALUAT_ENTRY
                    (ID_INV_VALUAT_ENTRY, ID_TNT, ID_INV_PERIOD, ID_INV_BAL, ID_STOCK_SITE,
                     ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS, SD_VALUAT_BASIS,
                     SD_ENTRY_TYPE, SD_SRC_TYPE, ID_SRC, CD_SRC_NO, CD_REQ, QTY_SNAP,
                     PRICE_UNIT_PRICE_BEFORE, PRICE_UNIT_PRICE_AFTER, AMT_VAL_BEFORE, AMT_VAL_AFTER, AMT_DELTA,
                     CD_CCY, DT_OCCRD, DT_POSTED, ID_USER_POSTED, DES_INV_VALUAT_ENTRY)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COST', 'ROUNDING', 'INVENTORY_TRANSACTION', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, GlobalIds.next(), context.tenantId(), transaction.inventoryPeriodId(), adjustment.balanceId(),
                    adjustment.siteId(), adjustment.binId(), adjustment.itemId(), adjustment.lotId(), adjustment.stockStatus(),
                    transaction.id(), transaction.transactionNo(), "RECEIPT-ROUNDING:" + adjustment.lineId(), adjustment.quantity(),
                    adjustment.unitCost(), adjustment.unitCost(), adjustment.before(), adjustment.after(),
                    amount(adjustment.after().subtract(adjustment.before())), currency,
                    new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(transaction.occurredAt())),
                    new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(transaction.postedAt())), context.subjectId(),
                    "采购入库金额与基本单位加权成本六位精度的舍入差额");
        }
    }

    private static BigDecimal amount(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }

    public record Adjustment(Long balanceId, Long siteId, Long binId, Long itemId, Long lotId, String stockStatus,
                             BigDecimal quantity, BigDecimal unitCost, Long lineId, BigDecimal before, BigDecimal after) {}
}
