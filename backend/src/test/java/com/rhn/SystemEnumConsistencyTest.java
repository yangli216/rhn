package com.rhn;

import com.rhn.platform.dictionary.api.SystemEnumDirectory;
import com.rhn.platform.dictionary.api.SystemEnumItem;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * System enums are the single definition of closed value sets that the database also constrains. An enum without a
 * Java class must list exactly the check-constraint values; one checked against a Java enum may be narrower than a
 * constraint that still admits legacy values, never wider. System-managed dictionaries that code relies on are held to
 * the same rule.
 */
class SystemEnumConsistencyTest extends RhnIntegrationTestSupport {
    private record Column(String enumCode, String table, String column, boolean exact) {}

    private static final List<Column> COLUMNS = List.of(
            new Column("BIL_SETTLEMENT_SCENE", "RHN_BIL_STL", "SD_STL_SCENE", true),
            new Column("BIL_SETTLEMENT_TYPE", "RHN_BIL_STL", "SD_STL_TYPE", true),
            new Column("BIL_RECEIPT_TYPE", "RHN_BIL_RCPT", "SD_RCPT_TYPE", true),
            new Column("BIL_CHARGE_SOURCE_TYPE", "RHN_BIL_CHARGE_ITEM", "SD_SRC_TYPE", true),
            new Column("BIL_PAYMENT_TYPE", "RHN_BIL_PAY", "SD_PAY_TYPE", true),
            new Column("BIL_PAYMENT_TYPE", "RHN_BIL_CASHIER_CLOSE_LINE", "SD_CLOSE_LINE_TYPE", true),
            new Column("BIL_SETTLEMENT_EVENT_TYPE", "RHN_BIL_STL_EVT", "SD_EVT_TYPE", true),
            new Column("BIL_PAYMENT_EVENT_TYPE", "RHN_BIL_PAY_EVT", "SD_EVT_TYPE", true),
            new Column("BIL_RECEIPT_EVENT_TYPE", "RHN_BIL_RCPT_EVT", "SD_EVT_TYPE", true),
            new Column("SUP_SPLIT_EVENT_TYPE", "RHN_SUP_INV_SPLIT_EVT", "SD_EVT_TYPE", true),
            new Column("SUP_WARD_DELIVERY_EVENT_TYPE", "RHN_SUP_WARD_DELIV_EVT", "SD_EVT_TYPE", true),
            new Column("SUP_WARD_RETURN_EVENT_TYPE", "RHN_SUP_WARD_MED_RETURN_EVT", "SD_EVT_TYPE", true),
            new Column("SUP_LOT_QUALITY_STATUS", "RHN_SUP_STOCK_LOT", "SD_QUALITY_STATUS", true),
            new Column("BIL_SETTLEMENT_STATUS", "RHN_BIL_STL", "SD_STATUS", false),
            new Column("BIL_TENDER_TYPE", "RHN_BIL_STL_TENDER", "SD_TENDER_TYPE", true),
            new Column("BIL_RECEIPT_STATUS", "RHN_BIL_RCPT", "SD_STATUS", true),
            new Column("BIL_PAYMENT_ORDER_STATUS", "RHN_BIL_PAY_ORDER", "SD_STATUS", true),
            new Column("BIL_CASHIER_CLOSE_STATUS", "RHN_BIL_CASHIER_CLOSE", "SD_STATUS", true),
            new Column("SUP_STOCK_STATUS", "RHN_SUP_INV_BAL", "SD_STOCK_STATUS", true),
            new Column("SUP_STOCK_STATUS", "RHN_SUP_STOCK_BIN", "SD_STOCK_DEFAULT", true),
            new Column("SUP_BIN_TYPE", "RHN_SUP_STOCK_BIN", "SD_BIN_TYPE", true),
            new Column("SUP_ISSUE_POLICY", "RHN_SUP_STOCK_ITEM", "SD_ISSUE_POLICY", true),
            new Column("SUP_TRANSACTION_TYPE", "RHN_SUP_INV_TXN", "SD_TXN_TYPE", true),
            new Column("SUP_PRICE_ADJUSTMENT_TYPE", "RHN_SUP_INV_PRICE_ADJ", "SD_ADJ_TYPE", true),
            new Column("SUP_PHARMACIST_REVIEW_RESULT", "RHN_SUP_PHARM_REVIEW", "SD_RESULT", true),
            new Column("SUP_RECEIPT_QUALITY_STATUS", "RHN_SUP_GOOD_RCPT_LINE", "SD_QUALITY_STATUS", true),
            new Column("SUP_OPEN_PACKAGE_STATUS", "RHN_SUP_INV_OPEN_PKG", "SD_STATUS", false),
            new Column("SUP_INVENTORY_PERIOD_STATUS", "RHN_SUP_INV_PERIOD", "SD_STATUS", false),
            new Column("SUP_PURCHASE_ORDER_STATUS", "RHN_SUP_PURCH_ORDER", "SD_STATUS", false),
            new Column("SUP_GOODS_RECEIPT_STATUS", "RHN_SUP_GOOD_RCPT", "SD_STATUS", false),
            new Column("SUP_REQUISITION_STATUS", "RHN_SUP_STOCK_REQ", "SD_STATUS", false),
            new Column("SUP_TRANSFER_STATUS", "RHN_SUP_STOCK_XFER", "SD_STATUS", false),
            new Column("SUP_COUNT_STATUS", "RHN_SUP_STOCK_COUNT", "SD_STATUS", false),
            new Column("SUP_WARD_DELIVERY_STATUS", "RHN_SUP_WARD_DELIV", "SD_STATUS", false),
            new Column("SUP_WARD_RETURN_STATUS", "RHN_SUP_WARD_MED_RETURN_REQ", "SD_STATUS", false),
            new Column("SC_RECEPTION_STATUS", "RHN_SC_QUEUE_TICKET", "SD_STATUS", true),
            new Column("MASTER_DATA_ATTR_DATA_TYPE", "RHN_BD_ITEM_ATTR_DEF", "SD_DATA_TYPE", true),
            new Column("MASTER_DATA_ATTR_OVERRIDE_POLICY", "RHN_BD_ITEM_ATTR_DEF", "SD_OVRD_POLICY", true));
    /** Receipts are not issued at the doctor station, so that constraint is a subset of the dictionary. */
    private static final List<Column> DICTIONARY_COLUMNS = List.of(
            new Column("PAY_USE_SCENE", "RHN_BIL_STL", "SD_TRMNL_SCENE", true),
            new Column("PAY_USE_SCENE", "RHN_BIL_RCPT", "SD_ISSUE_CHANNEL", false));

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    SystemEnumDirectory systemEnums;

    @Test
    void enums_match_the_check_constraints_of_the_columns_they_describe() {
        List<String> mismatches = new ArrayList<>();
        for (Column column : COLUMNS) {
            Set<String> allowed = checkValues(column.table(), column.column());
            Set<String> items = systemEnums.findSystemEnum(column.enumCode()).orElseThrow().items().stream()
                    .map(SystemEnumItem::code).collect(Collectors.toCollection(TreeSet::new));
            boolean consistent = column.exact() ? allowed.equals(items) : allowed.containsAll(items);
            if (!consistent) mismatches.add(column + " enum=" + items + " check=" + allowed);
        }
        assertThat(mismatches).isEmpty();
    }

    @Test
    void system_managed_dictionaries_match_the_check_constraints_of_the_columns_they_describe() {
        List<String> mismatches = new ArrayList<>();
        for (Column column : DICTIONARY_COLUMNS) {
            Set<String> allowed = checkValues(column.table(), column.column());
            Set<String> items = new TreeSet<>(jdbc.queryForList("""
                    select i.CD_DICT_ITEM from RHN_BD_DICT_ITEM i
                    join RHN_BD_DICT_DEF d on d.ID_DICT_DEF = i.ID_DICT_DEF_DICT
                    where d.SD_SCOPE_TYPE = 'PLATFORM' and d.CD_DICT_DEF = ? and d.FG_SYS_MANAGED = true
                      and i.SD_STATUS = 'ACTIVE'
                    """, String.class, column.enumCode()));
            boolean consistent = column.exact() ? allowed.equals(items) : items.containsAll(allowed);
            if (!consistent) mismatches.add(column + " dictionary=" + items + " check=" + allowed);
        }
        assertThat(mismatches).isEmpty();
    }

    private Set<String> checkValues(String table, String column) {
        // Conditional constraints may list a subset of the values; the full value set is the largest IN list.
        Pattern in = Pattern.compile("\"?" + column + "\"?\\s+IN\\s*\\(([^)]*)\\)", Pattern.CASE_INSENSITIVE);
        Set<String> largest = Set.of();
        for (Map<String, Object> row : jdbc.queryForList("""
                select cc.CHECK_CLAUSE from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                join INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc on cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                  and cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                where tc.CONSTRAINT_TYPE = 'CHECK' and upper(tc.TABLE_NAME) = upper(?)
                """, table)) {
            Matcher matcher = in.matcher(String.valueOf(row.get("CHECK_CLAUSE")));
            while (matcher.find()) {
                Set<String> values = new TreeSet<>();
                Matcher literal = Pattern.compile("'([^']*)'").matcher(matcher.group(1));
                while (literal.find()) values.add(literal.group(1));
                if (values.size() > largest.size()) largest = values;
            }
        }
        if (!largest.isEmpty()) return largest;
        throw new AssertionError("未找到 " + table + "." + column + " 的取值检查约束：" + jdbc.queryForList("""
                select tc.TABLE_NAME, cc.CHECK_CLAUSE from INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                join INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc on cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                where upper(tc.TABLE_NAME) = upper(?)
                """, table));
    }
}
