package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryAccuracyViews.InventoryPeriodView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.PeriodCloseDifferenceView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.PeriodCloseRunView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.PeriodCloseTotalView;
import com.rhn.pharmacy.domain.InventoryPeriod;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.InventoryPeriodRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryPeriodCloseApplicationService {
    private static final DateTimeFormatter RUN_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);
    private static final BigDecimal ZERO_QUANTITY = new BigDecimal("0.00000000");
    private static final BigDecimal ZERO_AMOUNT = new BigDecimal("0.000000");

    private final JdbcTemplate jdbc;
    private final InventoryPeriodRepository periods;
    private final InventoryAvailabilityService balances;
    private final StockSiteRepository sites;
    private final ExecutionContextProvider contexts;

    public InventoryPeriodCloseApplicationService(JdbcTemplate jdbc, InventoryPeriodRepository periods,
                                                  InventoryAvailabilityService balances, StockSiteRepository sites,
                                                  ExecutionContextProvider contexts) {
        this.jdbc = jdbc; this.periods = periods; this.balances = balances;
        this.sites = sites; this.contexts = contexts;
    }

    @Transactional
    public InventoryPeriodView createPeriod(Long siteId, YearMonth month) {
        ExecutionContext context = requireContext(); StockSite site = requireSite(context, siteId);
        if (month == null) throw badRequest("INVENTORY_PERIOD_MONTH_REQUIRED", "库存期间月份不能为空");
        String code = code(month);
        InventoryPeriod existing = periods.findByTenantIdAndStockSiteIdAndPeriodCode(
                context.tenantId(), site.id(), code).orElse(null);
        if (existing != null) return periodView(existing);
        List<InventoryPeriod> timeline = periods.findByTenantIdAndStockSiteIdOrderByPeriodFromDesc(
                context.tenantId(), site.id());
        InventoryPeriod previous = timeline.isEmpty() ? null : timeline.get(0);
        if (previous != null) {
            if (!"CLOSED".equals(previous.status())) {
                throw conflict("INVENTORY_PREVIOUS_PERIOD_NOT_CLOSED", "上一库存期间尚未月结，不能创建下一期间");
            }
            if (!previous.periodTo().plusDays(1).equals(month.atDay(1))) {
                throw conflict("INVENTORY_PERIOD_NOT_CONTIGUOUS", "新库存期间必须紧接已关闭期间，不能跳月或倒序创建");
            }
        }
        InventoryPeriod created = periods.saveAndFlush(new InventoryPeriod(context.tenantId(), site.id(),
                previous == null ? null : previous.id(), code, month.atDay(1), month.atEndOfMonth(),
                context.subjectId()));
        return periodView(created);
    }

    @Transactional(readOnly = true)
    public List<InventoryPeriodView> periods(Long siteId) {
        ExecutionContext context = requireContext(); StockSite site = requireSite(context, siteId);
        return periods.findByTenantIdAndStockSiteIdOrderByPeriodFromDesc(context.tenantId(), site.id())
                .stream().map(this::periodView).toList();
    }

    @Transactional
    public PeriodCloseRunView prepareClose(Long periodId, String requestCode, String currencyCode) {
        ExecutionContext context = requireContext(); InventoryPeriod period = requirePeriod(context, periodId);
        StockSite site = requireSite(context, period.stockSiteId());
        String request = required(requestCode, "INVENTORY_CLOSE_REQUEST_REQUIRED", "月结请求编码不能为空");
        String currency = upper(currencyCode == null ? "CNY" : currencyCode);
        RunIdentity repeated = jdbc.query("""
                select ID_INV_PERIOD_CLOSE_RUN as id, ID_INV_PERIOD as inventory_period_id from RHN_SUP_INV_PERIOD_CLOSE_RUN
                where ID_TNT = ? and CD_REQ = ?
                """, (rs, row) -> new RunIdentity(rs.getLong("id"), rs.getLong("inventory_period_id")),
                context.tenantId(), request).stream().findFirst().orElse(null);
        if (repeated != null) {
            if (!period.id().equals(repeated.periodId())) {
                throw conflict("INVENTORY_CLOSE_REQUEST_REUSED", "月结请求编码已用于其他库存期间");
            }
            return closeRun(context.tenantId(), repeated.id());
        }
        if (!"OPEN".equals(period.status())) {
            throw conflict("INVENTORY_PERIOD_NOT_OPEN", "仅开放期间可以执行月结预检");
        }
        Long previousCloseRunId = previousCloseRun(context, period);
        List<CloseDimension> dimensions = dimensions(context.tenantId(), site.id(), period.id(),
                previousCloseRunId);
        List<MissingDimension> missing = missingDimensions(context.tenantId(), site.id(), period.id(),
                previousCloseRunId);
        String stateHash = stateHash(period, currency, dimensions, missing);
        Instant now = Instant.now(); Long reconciliationId = GlobalIds.next(); Long closeRunId = GlobalIds.next();
        String runNo = "PC" + RUN_TIME.format(now) + GlobalIds.randomSuffix(6);
        String reconciliationNo = "REC" + RUN_TIME.format(now) + GlobalIds.randomSuffix(6);
        jdbc.update("""
                insert into RHN_SUP_INV_RECON_RUN
                (ID_INV_RECON_RUN, ID_TNT, ID_ORG, ID_STOCK_SITE, CD_RUN_NO, SD_RUN_TYPE, SD_STATUS, DA_BUSINESS,
                 DT_STARTED, ID_USER_RUN, QTY_DIMENSION, QTY_ISSUE)
                values (?, ?, ?, ?, ?, 'PERIOD_CLOSE', 'RUNNING', ?, ?, ?, 0, 0)
                """, reconciliationId, context.tenantId(), site.organizationId(), site.id(), reconciliationNo,
                sqlDate(period.periodTo()), sqlTimestamp(now), context.subjectId());
        jdbc.update("""
                insert into RHN_SUP_INV_PERIOD_CLOSE_RUN
                (ID_INV_PERIOD_CLOSE_RUN, ID_TNT, ID_ORG, ID_STOCK_SITE, ID_INV_PERIOD, ID_INV_PERIOD_PREVIOUS,
                 ID_INV_RECON_RUN, CD_RUN_NO, CD_REQ, HASH_REQ, SD_STATUS, QTY_DIMENSION,
                 QTY_DIFFERENCE, DT_STARTED, ID_USER_STARTED)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', 0, 0, ?, ?)
                """, closeRunId, context.tenantId(), site.organizationId(), site.id(), period.id(),
                period.previousPeriodId(), reconciliationId, runNo, request, stateHash, sqlTimestamp(now),
                context.subjectId());

        int issueCount = 0; int differenceCount = 0;
        BigDecimal openingTotal = ZERO_AMOUNT; BigDecimal movementTotal = ZERO_AMOUNT;
        BigDecimal valuationTotal = ZERO_AMOUNT; BigDecimal roundingTotal = ZERO_AMOUNT;
        BigDecimal closingTotal = ZERO_AMOUNT; BigDecimal balanceTotal = ZERO_AMOUNT;
        for (CloseDimension dimension : dimensions) {
            Long snapshotId = GlobalIds.next();
            boolean quantityIssue = dimension.quantityDifference().signum() != 0;
            boolean valueIssue = dimension.valueIssue() || dimension.valueDifference().signum() != 0;
            if (quantityIssue || valueIssue) differenceCount++;
            jdbc.update("""
                    insert into RHN_SUP_INV_PERIOD_BAL_SNAP
                    (ID_INV_PERIOD_BAL_SNAP, ID_TNT, ID_INV_PERIOD_CLOSE_RUN, ID_INV_PERIOD,
                     ID_INV_PERIOD_BAL_SNAP_OPENING, ID_INV_BAL, SN_INV_BAL_VER, ID_STOCK_SITE, ID_STOCK_BIN,
                     ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS, CD_BASE_UNIT, QTY_OPENING,
                     QTY_MOVEMENT, QTY_CLOSE, QTY_BAL, QTY_DIFFERENCE,
                     SD_SNAP_STATUS, DT_CREATED, ID_USER_CREATED)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, snapshotId, context.tenantId(), closeRunId, period.id(), dimension.openingSnapshotId(),
                    dimension.balanceId(), dimension.balanceRevision(), site.id(), dimension.binId(),
                    dimension.itemId(), dimension.lotId(), dimension.status(), dimension.baseUnitCode(),
                    dimension.openingQuantity(), dimension.movementQuantity(), dimension.closingQuantity(),
                    dimension.balanceQuantity(), dimension.quantityDifference(),
                    quantityIssue ? "DIFFERENCE" : "RECONCILED", sqlTimestamp(now), context.subjectId());
            jdbc.update("""
                    insert into RHN_SUP_INV_PERIOD_BAL_VAL
                    (ID_INV_PERIOD_BAL_VAL, ID_TNT, ID_INV_PERIOD_BAL_SNAP, SD_VALUAT_BASIS, CD_CURRENCY,
                     PRICE_OPENING, PRICE_CLOSE, AMT_OPENING, AMT_MOVEMENT,
                     AMT_VALUAT_ADJ, AMT_ROUNDING_ADJ, AMT_CLOSE,
                     AMT_BAL, AMT_VAL_DIFFERENCE, SD_VAL_STATUS, DT_CREATED)
                    values (?, ?, ?, 'COST', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, GlobalIds.next(), context.tenantId(), snapshotId, currency,
                    dimension.openingUnitValue(), dimension.closingUnitValue(), dimension.openingValue(),
                    dimension.movementAmount(), dimension.valuationAmount(), dimension.roundingAmount(),
                    dimension.closingValue(), dimension.balanceValue(), dimension.valueDifference(),
                    valueIssue ? "DIFFERENCE" : "RECONCILED", sqlTimestamp(now));
            if (quantityIssue) {
                insertQuantityIssue(context.tenantId(), reconciliationId, dimension.binId(), dimension.itemId(),
                        dimension.lotId(), dimension.status(), "PERIOD_QUANTITY", dimension.closingQuantity(),
                        dimension.balanceQuantity(), "期间期末账面数量与实时库存数量不一致");
                issueCount++;
            }
            if (valueIssue) {
                insertValueIssue(context.tenantId(), reconciliationId, dimension, currency);
                issueCount++;
            }
            openingTotal = openingTotal.add(dimension.openingValue());
            movementTotal = movementTotal.add(dimension.movementAmount());
            valuationTotal = valuationTotal.add(dimension.valuationAmount());
            roundingTotal = roundingTotal.add(dimension.roundingAmount());
            closingTotal = closingTotal.add(dimension.closingValue());
            balanceTotal = balanceTotal.add(dimension.balanceValue());
        }
        for (MissingDimension dimension : missing) {
            insertQuantityIssue(context.tenantId(), reconciliationId, dimension.binId(), dimension.itemId(),
                    dimension.lotId(), dimension.status(), "PERIOD_QUANTITY", dimension.expectedQuantity(),
                    ZERO_QUANTITY, "期间流水或上期期末存在维度，但当前库存余额缺失");
            issueCount++; differenceCount++;
        }
        BigDecimal totalDifference = amount(balanceTotal.subtract(closingTotal));
        jdbc.update("""
                insert into RHN_SUP_INV_PERIOD_CLOSE_TOTAL
                (ID_INV_PERIOD_CLOSE_TOTAL, ID_TNT, ID_INV_PERIOD_CLOSE_RUN, SD_VALUAT_BASIS, CD_CURRENCY, AMT_OPENING,
                 AMT_MOVEMENT, AMT_VALUAT_ADJ, AMT_ROUNDING_ADJ,
                 AMT_CLOSE, AMT_BAL, AMT_VAL_DIFFERENCE, DT_CREATED)
                values (?, ?, ?, 'COST', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), context.tenantId(), closeRunId, currency, amount(openingTotal),
                amount(movementTotal), amount(valuationTotal), amount(roundingTotal), amount(closingTotal),
                amount(balanceTotal), totalDifference, sqlTimestamp(now));
        String reconciliationStatus = issueCount == 0 ? "PASSED" : "ISSUES";
        jdbc.update("""
                update RHN_SUP_INV_RECON_RUN set SD_STATUS = ?, DT_COMPLETED = ?,
                       QTY_DIMENSION = ?, QTY_ISSUE = ? where ID_TNT = ? and ID_INV_RECON_RUN = ?
                """, reconciliationStatus, sqlTimestamp(now), dimensions.size() + missing.size(), issueCount,
                context.tenantId(), reconciliationId);
        jdbc.update("""
                update RHN_SUP_INV_PERIOD_CLOSE_RUN set SD_STATUS = 'VALIDATED', QTY_DIMENSION = ?,
                       QTY_DIFFERENCE = ?, DT_VALIDATED = ?, ID_USER_VALIDATED = ?, DT_COMPLETED = ?
                where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ?
                """, dimensions.size() + missing.size(), differenceCount, sqlTimestamp(now), context.subjectId(),
                sqlTimestamp(now), context.tenantId(), closeRunId);
        return closeRun(context.tenantId(), closeRunId);
    }

    @Transactional
    public PeriodCloseRunView postClose(Long closeRunId) {
        ExecutionContext context = requireContext(); RunRecord run = requireRun(context.tenantId(), closeRunId);
        InventoryPeriod period = periods.lockById(context.tenantId(), run.periodId())
                .orElseThrow(() -> notFound("INVENTORY_PERIOD_NOT_FOUND", "未找到库存期间"));
        StockSite site = requireSite(context, period.stockSiteId());
        if ("POSTED".equals(run.status())) return closeRun(context.tenantId(), closeRunId);
        if (!"VALIDATED".equals(run.status())) {
            throw conflict("INVENTORY_CLOSE_NOT_VALIDATED", "月结批次尚未完成预检");
        }
        if (run.differenceCount() != 0) {
            throw conflict("INVENTORY_CLOSE_HAS_DIFFERENCES", "月结仍有差异，不能正式关账");
        }
        if (!"OPEN".equals(period.status())) {
            throw conflict("INVENTORY_PERIOD_NOT_OPEN", "当前库存期间已不再开放");
        }
        String currency = closeTotals(context.tenantId(), closeRunId).stream()
                .filter(total -> "COST".equals(total.valuationBasis())).map(PeriodCloseTotalView::currencyCode)
                .findFirst().orElse("CNY");
        balances.lockSiteBalances(context.tenantId(), site.id());
        Long previousCloseRunId = previousCloseRun(context, period);
        List<CloseDimension> current = dimensions(context.tenantId(), site.id(), period.id(), previousCloseRunId);
        List<MissingDimension> missing = missingDimensions(context.tenantId(), site.id(), period.id(), previousCloseRunId);
        if (!run.requestHash().equals(stateHash(period, currency, current, missing))) {
            throw conflict("INVENTORY_CLOSE_STALE", "预检后库存账已变化，请重新执行月结预检");
        }
        period.beginClosing(); periods.saveAndFlush(period);
        Instant now = Instant.now();
        jdbc.update("""
                update RHN_SUP_INV_PERIOD_CLOSE_RUN set SD_STATUS = 'POSTED', DT_POSTED = ?, ID_USER_POSTED = ?,
                       DT_COMPLETED = ? where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ? and SD_STATUS = 'VALIDATED'
                """, sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.tenantId(), closeRunId);
        period.close(closeRunId, context.subjectId()); periods.saveAndFlush(period);
        createNextPeriodIfAbsent(context, period);
        return closeRun(context.tenantId(), closeRunId);
    }

    @Transactional(readOnly = true)
    public PeriodCloseRunView closeRun(Long closeRunId) {
        ExecutionContext context = requireContext(); PeriodCloseRunView view = closeRun(context.tenantId(), closeRunId);
        InventoryPeriod period = requirePeriod(context, view.inventoryPeriodId()); requireSite(context, period.stockSiteId());
        return view;
    }

    @Transactional(readOnly = true)
    public List<PeriodCloseRunView> closeRuns(Long periodId) {
        ExecutionContext context = requireContext(); InventoryPeriod period = requirePeriod(context, periodId);
        requireSite(context, period.stockSiteId());
        return jdbc.query("""
                select ID_INV_PERIOD_CLOSE_RUN as id from RHN_SUP_INV_PERIOD_CLOSE_RUN
                where ID_TNT = ? and ID_INV_PERIOD = ? order by DT_STARTED desc
                """, (rs, row) -> rs.getLong("id"), context.tenantId(), periodId)
                .stream().map(id -> closeRun(context.tenantId(), id)).toList();
    }

    @Transactional(readOnly = true)
    public List<PeriodCloseDifferenceView> differences(Long closeRunId) {
        ExecutionContext context = requireContext(); PeriodCloseRunView run = closeRun(context.tenantId(), closeRunId);
        requirePeriod(context, run.inventoryPeriodId());
        return jdbc.query("""
                select s.ID_INV_PERIOD_BAL_SNAP as id, s.ID_INV_BAL as inventory_balance_id,
                       s.SN_INV_BAL_VER as inventory_balance_revision, s.ID_STOCK_BIN as stock_bin_id,
                       s.ID_STOCK_ITEM as stock_item_id, s.ID_STOCK_LOT as stock_lot_id, l.CD_LOT_NO as lot_no, s.SD_STOCK_STATUS as stock_status, s.CD_BASE_UNIT as base_unit_code,
                       s.QTY_OPENING as opening_quantity, s.QTY_MOVEMENT as movement_quantity, s.QTY_CLOSE as closing_quantity,
                       s.QTY_BAL as balance_quantity, s.QTY_DIFFERENCE as quantity_difference,
                       v.SD_VALUAT_BASIS as valuation_basis, v.CD_CURRENCY as currency_code,
                       v.AMT_OPENING as opening_value, v.AMT_MOVEMENT as movement_amount,
                       v.AMT_VALUAT_ADJ as valuation_adjustment_amount,
                       v.AMT_ROUNDING_ADJ as rounding_adjustment_amount, v.AMT_CLOSE as closing_value,
                       v.AMT_BAL as balance_value, v.AMT_VAL_DIFFERENCE as value_difference
                  from RHN_SUP_INV_PERIOD_BAL_SNAP s
                join RHN_SUP_INV_PERIOD_BAL_VAL v
                  on v.ID_TNT = s.ID_TNT and v.ID_INV_PERIOD_BAL_SNAP = s.ID_INV_PERIOD_BAL_SNAP
                join RHN_SUP_STOCK_LOT l on l.ID_TNT = s.ID_TNT and l.ID_STOCK_LOT = s.ID_STOCK_LOT
                where s.ID_TNT = ? and s.ID_INV_PERIOD_CLOSE_RUN = ?
                  and (s.SD_SNAP_STATUS = 'DIFFERENCE' or v.SD_VAL_STATUS = 'DIFFERENCE')
                order by s.ID_STOCK_BIN, s.ID_STOCK_ITEM, s.ID_STOCK_LOT, s.SD_STOCK_STATUS, v.SD_VALUAT_BASIS
                """, (rs, row) -> new PeriodCloseDifferenceView(rs.getLong("id"),
                rs.getLong("inventory_balance_id"), rs.getLong("inventory_balance_revision"),
                rs.getLong("stock_bin_id"), rs.getLong("stock_item_id"), rs.getLong("stock_lot_id"),
                rs.getString("lot_no"), rs.getString("stock_status"), rs.getString("base_unit_code"),
                rs.getBigDecimal("opening_quantity"), rs.getBigDecimal("movement_quantity"),
                rs.getBigDecimal("closing_quantity"), rs.getBigDecimal("balance_quantity"),
                rs.getBigDecimal("quantity_difference"), rs.getString("valuation_basis"),
                rs.getString("currency_code"), rs.getBigDecimal("opening_value"),
                rs.getBigDecimal("movement_amount"), rs.getBigDecimal("valuation_adjustment_amount"),
                rs.getBigDecimal("rounding_adjustment_amount"), rs.getBigDecimal("closing_value"),
                rs.getBigDecimal("balance_value"), rs.getBigDecimal("value_difference")),
                context.tenantId(), closeRunId);
    }

    private List<CloseDimension> dimensions(Long tenantId, Long siteId, Long periodId, Long previousCloseRunId) {
        return jdbc.query("""
                with movement as (
                    select l.ID_STOCK_BIN as stock_bin_id, l.ID_STOCK_ITEM as stock_item_id, l.ID_STOCK_LOT as stock_lot_id, l.SD_STOCK_STATUS as stock_status,
                           sum(l.QTY_DELTA) as movement_quantity,
                           coalesce(sum(l.AMT_DELTA), 0) as movement_amount,
                           sum(case when l.AMT_DELTA is null then 1 else 0 end) as missing_cost_count from RHN_SUP_INV_TXN_LINE l
                    join RHN_SUP_INV_TXN t on t.ID_TNT = l.ID_TNT
                     and t.ID_INV_TXN = l.ID_INV_TXN
                    where l.ID_TNT = ? and l.ID_STOCK_SITE = ? and t.ID_INV_PERIOD = ?
                    group by l.ID_STOCK_BIN, l.ID_STOCK_ITEM, l.ID_STOCK_LOT, l.SD_STOCK_STATUS
                ), valuation as (
                    select ID_INV_BAL as inventory_balance_id,
                           coalesce(sum(case when SD_ENTRY_TYPE = 'ROUNDING' then 0 else AMT_DELTA end), 0) as valuation_amount,
                           coalesce(sum(case when SD_ENTRY_TYPE = 'ROUNDING' then AMT_DELTA else 0 end), 0) as rounding_amount from RHN_SUP_INV_VALUAT_ENTRY
                    where ID_TNT = ? and ID_STOCK_SITE = ? and ID_INV_PERIOD = ?
                      and SD_VALUAT_BASIS = 'COST'
                    group by ID_INV_BAL
                )
                select b.ID_INV_BAL as balance_id, b.REVISION as balance_revision, b.ID_STOCK_BIN as stock_bin_id, b.ID_STOCK_ITEM as stock_item_id,
                       b.ID_STOCK_LOT as stock_lot_id, b.SD_STOCK_STATUS as stock_status, b.CD_BASE_UNIT as base_unit_code, b.QTY_ON_HAND as quantity_on_hand,
                       b.PRICE_AVERAGE_UNIT_COST as average_unit_cost,
                       s.ID_INV_PERIOD_BAL_SNAP as opening_snapshot_id,
                       coalesce(s.QTY_CLOSE, 0) as opening_quantity,
                       coalesce(m.movement_quantity, 0) as movement_quantity,
                       v.ID_INV_PERIOD_BAL_VAL as opening_value_id, coalesce(v.AMT_CLOSE, 0) as opening_value,
                       coalesce(m.movement_amount, 0) as movement_amount,
                       coalesce(m.missing_cost_count, 0) as missing_cost_count,
                       coalesce(a.valuation_amount, 0) as valuation_amount,
                       coalesce(a.rounding_amount, 0) as rounding_amount from RHN_SUP_INV_BAL b
                left join RHN_SUP_INV_PERIOD_BAL_SNAP s
                  on s.ID_TNT = b.ID_TNT and s.ID_INV_PERIOD_CLOSE_RUN = ?
                 and s.ID_STOCK_BIN = b.ID_STOCK_BIN and s.ID_STOCK_ITEM = b.ID_STOCK_ITEM
                 and s.ID_STOCK_LOT = b.ID_STOCK_LOT and s.SD_STOCK_STATUS = b.SD_STOCK_STATUS
                left join RHN_SUP_INV_PERIOD_BAL_VAL v
                  on v.ID_TNT = s.ID_TNT and v.ID_INV_PERIOD_BAL_SNAP = s.ID_INV_PERIOD_BAL_SNAP
                 and v.SD_VALUAT_BASIS = 'COST'
                left join movement m on m.stock_bin_id = b.ID_STOCK_BIN and m.stock_item_id = b.ID_STOCK_ITEM
                 and m.stock_lot_id = b.ID_STOCK_LOT and m.stock_status = b.SD_STOCK_STATUS
                left join valuation a on a.inventory_balance_id = b.ID_INV_BAL
                where b.ID_TNT = ? and b.ID_STOCK_SITE = ?
                order by b.ID_STOCK_BIN, b.ID_STOCK_ITEM, b.ID_STOCK_LOT, b.SD_STOCK_STATUS
                """, (rs, row) -> dimension(rs, previousCloseRunId != null), tenantId, siteId, periodId,
                tenantId, siteId, periodId, previousCloseRunId == null ? -1L : previousCloseRunId,
                tenantId, siteId);
    }

    private CloseDimension dimension(ResultSet rs, boolean hasPrevious) throws SQLException {
        BigDecimal openingQuantity = quantity(rs.getBigDecimal("opening_quantity"));
        BigDecimal movementQuantity = quantity(rs.getBigDecimal("movement_quantity"));
        BigDecimal closingQuantity = quantity(openingQuantity.add(movementQuantity));
        BigDecimal balanceQuantity = quantity(rs.getBigDecimal("quantity_on_hand"));
        BigDecimal quantityDifference = quantity(balanceQuantity.subtract(closingQuantity));
        BigDecimal openingValue = amount(rs.getBigDecimal("opening_value"));
        BigDecimal movementAmount = amount(rs.getBigDecimal("movement_amount"));
        BigDecimal valuationAmount = amount(rs.getBigDecimal("valuation_amount"));
        BigDecimal roundingAmount = amount(rs.getBigDecimal("rounding_amount"));
        BigDecimal closingValue = amount(openingValue.add(movementAmount).add(valuationAmount).add(roundingAmount));
        BigDecimal averageCost = rs.getBigDecimal("average_unit_cost");
        BigDecimal balanceValue = averageCost == null ? ZERO_AMOUNT : amount(balanceQuantity.multiply(averageCost));
        boolean valueIssue = rs.getInt("missing_cost_count") > 0
                || (balanceQuantity.signum() != 0 && averageCost == null)
                || (hasPrevious && rs.getObject("opening_snapshot_id") != null && rs.getObject("opening_value_id") == null);
        return new CloseDimension(rs.getLong("balance_id"), rs.getLong("balance_revision"),
                nullableLong(rs, "opening_snapshot_id"), rs.getLong("stock_bin_id"), rs.getLong("stock_item_id"),
                rs.getLong("stock_lot_id"), rs.getString("stock_status"), rs.getString("base_unit_code"),
                openingQuantity, movementQuantity, closingQuantity, balanceQuantity, quantityDifference,
                averageCost, averageCost, openingValue, movementAmount, valuationAmount, roundingAmount,
                closingValue, balanceValue, amount(balanceValue.subtract(closingValue)), valueIssue);
    }

    private List<MissingDimension> missingDimensions(Long tenantId, Long siteId, Long periodId,
                                                     Long previousCloseRunId) {
        return jdbc.query("""
                with opening as (
                    select ID_STOCK_BIN as stock_bin_id, ID_STOCK_ITEM as stock_item_id,
                           ID_STOCK_LOT as stock_lot_id, SD_STOCK_STATUS as stock_status,
                           QTY_CLOSE as quantity from RHN_SUP_INV_PERIOD_BAL_SNAP
                    where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ?
                ), movement as (
                    select l.ID_STOCK_BIN as stock_bin_id, l.ID_STOCK_ITEM as stock_item_id, l.ID_STOCK_LOT as stock_lot_id, l.SD_STOCK_STATUS as stock_status,
                           sum(l.QTY_DELTA) as quantity from RHN_SUP_INV_TXN_LINE l
                    join RHN_SUP_INV_TXN t on t.ID_TNT = l.ID_TNT
                     and t.ID_INV_TXN = l.ID_INV_TXN
                    where l.ID_TNT = ? and l.ID_STOCK_SITE = ? and t.ID_INV_PERIOD = ?
                    group by l.ID_STOCK_BIN, l.ID_STOCK_ITEM, l.ID_STOCK_LOT, l.SD_STOCK_STATUS
                ), dimension_keys as (
                    select stock_bin_id, stock_item_id, stock_lot_id, stock_status from opening
                    union
                    select stock_bin_id, stock_item_id, stock_lot_id, stock_status from movement
                )
                select k.stock_bin_id, k.stock_item_id, k.stock_lot_id, k.stock_status,
                       coalesce(o.quantity, 0) + coalesce(m.quantity, 0) as expected_quantity from dimension_keys k
                left join opening o on o.stock_bin_id = k.stock_bin_id and o.stock_item_id = k.stock_item_id
                 and o.stock_lot_id = k.stock_lot_id and o.stock_status = k.stock_status
                left join movement m on m.stock_bin_id = k.stock_bin_id and m.stock_item_id = k.stock_item_id
                 and m.stock_lot_id = k.stock_lot_id and m.stock_status = k.stock_status
                where not exists (
                    select 1 from RHN_SUP_INV_BAL b where b.ID_TNT = ? and b.ID_STOCK_SITE = ?
                      and b.ID_STOCK_BIN = k.stock_bin_id and b.ID_STOCK_ITEM = k.stock_item_id
                      and b.ID_STOCK_LOT = k.stock_lot_id and b.SD_STOCK_STATUS = k.stock_status)
                order by k.stock_bin_id, k.stock_item_id, k.stock_lot_id, k.stock_status
                """, (rs, row) -> new MissingDimension(rs.getLong("stock_bin_id"), rs.getLong("stock_item_id"),
                rs.getLong("stock_lot_id"), rs.getString("stock_status"),
                quantity(rs.getBigDecimal("expected_quantity"))), tenantId,
                previousCloseRunId == null ? -1L : previousCloseRunId, tenantId, siteId, periodId,
                tenantId, siteId);
    }

    private void insertQuantityIssue(Long tenantId, Long reconciliationId, Long binId, Long itemId,
                                     Long lotId, String status, String type, BigDecimal expected,
                                     BigDecimal actual, String description) {
        jdbc.update("""
                insert into RHN_SUP_INV_RECON_LINE
                (ID_INV_RECON_LINE, ID_TNT, ID_INV_RECON_RUN, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT,
                 SD_STOCK_STATUS, SD_ISSUE_TYPE, QTY_EXPECTED, QTY_ACTUAL, QTY_DIFFERENCE,
                 SD_SEVERITY, DES_INV_RECON_LINE)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ERROR', ?)
                """, GlobalIds.next(), tenantId, reconciliationId, binId, itemId, lotId, status, type,
                expected, actual, quantity(actual.subtract(expected)), description);
    }

    private void insertValueIssue(Long tenantId, Long reconciliationId, CloseDimension d, String currency) {
        String description = d.valueIssue()
                ? "库存成本信息不完整，无法可靠计算期末价值"
                : "期间期末账面价值与实时库存成本价值不一致";
        jdbc.update("""
                insert into RHN_SUP_INV_RECON_LINE
                (ID_INV_RECON_LINE, ID_TNT, ID_INV_RECON_RUN, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT,
                 SD_STOCK_STATUS, SD_ISSUE_TYPE, QTY_EXPECTED, QTY_ACTUAL, QTY_DIFFERENCE,
                 SD_VALUAT_BASIS, CD_CURRENCY, AMT_EXPECTED, AMT_ACTUAL, AMT_DIFFERENCE,
                 SD_SEVERITY, DES_INV_RECON_LINE)
                values (?, ?, ?, ?, ?, ?, ?, 'PERIOD_VALUE', 0, 0, 0,
                        'COST', ?, ?, ?, ?, 'ERROR', ?)
                """, GlobalIds.next(), tenantId, reconciliationId, d.binId(), d.itemId(), d.lotId(), d.status(),
                currency, d.closingValue(), d.balanceValue(), d.valueDifference(), description);
    }

    private Long previousCloseRun(ExecutionContext context, InventoryPeriod period) {
        if (period.previousPeriodId() == null) return null;
        InventoryPeriod previous = periods.findById(period.previousPeriodId())
                .filter(value -> context.tenantId().equals(value.tenantId())
                        && period.stockSiteId().equals(value.stockSiteId()))
                .orElseThrow(() -> conflict("INVENTORY_PERIOD_CHAIN_INVALID", "上一库存期间不存在或不属于当前库房"));
        if (!"CLOSED".equals(previous.status()) || previous.closingRunId() == null) {
            throw conflict("INVENTORY_PREVIOUS_PERIOD_NOT_CLOSED", "上一库存期间尚未完成正式月结");
        }
        return previous.closingRunId();
    }

    private void createNextPeriodIfAbsent(ExecutionContext context, InventoryPeriod current) {
        YearMonth next = YearMonth.from(current.periodTo()).plusMonths(1); String nextCode = code(next);
        if (periods.findByTenantIdAndStockSiteIdAndPeriodCode(context.tenantId(), current.stockSiteId(), nextCode)
                .isPresent()) return;
        periods.saveAndFlush(new InventoryPeriod(context.tenantId(), current.stockSiteId(), current.id(),
                nextCode, next.atDay(1), next.atEndOfMonth(), context.subjectId()));
    }

    private PeriodCloseRunView closeRun(Long tenantId, Long id) {
        List<PeriodCloseRunView> values = jdbc.query("""
                select ID_INV_PERIOD_CLOSE_RUN as id, REVISION,
                       ID_STOCK_SITE as stock_site_id, ID_INV_PERIOD as inventory_period_id,
                       ID_INV_PERIOD_PREVIOUS as previous_period_id,
                       ID_INV_RECON_RUN as reconciliation_run_id, CD_RUN_NO as run_no,
                       CD_REQ as request_code, SD_STATUS as status, QTY_DIMENSION as dimension_count,
                       QTY_DIFFERENCE as difference_count, DT_STARTED as started_at,
                       ID_USER_STARTED as started_by, DT_VALIDATED as validated_at, ID_USER_VALIDATED as validated_by,
                       DT_POSTED as posted_at, ID_USER_POSTED as posted_by, DT_COMPLETED as completed_at, CD_FAILURE as failure_code, DES_FAILURE_MSG as failure_message from RHN_SUP_INV_PERIOD_CLOSE_RUN where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ?
                """, (rs, row) -> new PeriodCloseRunView(rs.getLong("id"), rs.getLong("revision"),
                rs.getLong("stock_site_id"), rs.getLong("inventory_period_id"),
                nullableLong(rs, "previous_period_id"), nullableLong(rs, "reconciliation_run_id"),
                rs.getString("run_no"), rs.getString("request_code"), rs.getString("status"),
                rs.getInt("dimension_count"), rs.getInt("difference_count"), instant(rs, "started_at"),
                rs.getLong("started_by"), nullableInstant(rs, "validated_at"), nullableLong(rs, "validated_by"),
                nullableInstant(rs, "posted_at"), nullableLong(rs, "posted_by"),
                nullableInstant(rs, "completed_at"), rs.getString("failure_code"),
                rs.getString("failure_message"), closeTotals(tenantId, id)), tenantId, id);
        if (values.isEmpty()) throw notFound("INVENTORY_CLOSE_RUN_NOT_FOUND", "未找到库存月结批次");
        return values.get(0);
    }

    private List<PeriodCloseTotalView> closeTotals(Long tenantId, Long closeRunId) {
        return jdbc.query("""
                select SD_VALUAT_BASIS as valuation_basis, CD_CURRENCY as currency_code,
                       AMT_OPENING as opening_value, AMT_MOVEMENT as movement_amount,
                       AMT_VALUAT_ADJ as valuation_adjustment_amount,
                       AMT_ROUNDING_ADJ as rounding_adjustment_amount, AMT_CLOSE as closing_value,
                       AMT_BAL as balance_value, AMT_VAL_DIFFERENCE as value_difference
                  from RHN_SUP_INV_PERIOD_CLOSE_TOTAL
                 where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ?
                order by SD_VALUAT_BASIS, CD_CURRENCY
                """, (rs, row) -> new PeriodCloseTotalView(rs.getString("valuation_basis"),
                rs.getString("currency_code"), rs.getBigDecimal("opening_value"),
                rs.getBigDecimal("movement_amount"), rs.getBigDecimal("valuation_adjustment_amount"),
                rs.getBigDecimal("rounding_adjustment_amount"), rs.getBigDecimal("closing_value"),
                rs.getBigDecimal("balance_value"), rs.getBigDecimal("value_difference")), tenantId, closeRunId);
    }

    private RunRecord requireRun(Long tenantId, Long id) {
        return jdbc.query("""
                select ID_INV_PERIOD_CLOSE_RUN as id, ID_INV_PERIOD as inventory_period_id,
                       HASH_REQ as request_hash, SD_STATUS as status, QTY_DIFFERENCE as difference_count
                  from RHN_SUP_INV_PERIOD_CLOSE_RUN
                 where ID_TNT = ? and ID_INV_PERIOD_CLOSE_RUN = ?
                """, (rs, row) -> new RunRecord(rs.getLong("id"), rs.getLong("inventory_period_id"),
                rs.getString("request_hash"), rs.getString("status"), rs.getInt("difference_count")),
                tenantId, id).stream().findFirst()
                .orElseThrow(() -> notFound("INVENTORY_CLOSE_RUN_NOT_FOUND", "未找到库存月结批次"));
    }

    private String stateHash(InventoryPeriod period, String currency, List<CloseDimension> dimensions,
                             List<MissingDimension> missing) {
        StringBuilder source = new StringBuilder().append(period.id()).append('|').append(period.revision())
                .append('|').append(currency).append('|');
        dimensions.forEach(d -> source.append(d.balanceId()).append(':').append(d.balanceRevision()).append(':')
                .append(d.openingSnapshotId()).append(':').append(d.openingQuantity()).append(':')
                .append(d.movementQuantity()).append(':').append(d.balanceQuantity()).append(':')
                .append(d.openingValue()).append(':').append(d.movementAmount()).append(':')
                .append(d.valuationAmount()).append(':').append(d.roundingAmount()).append(':')
                .append(d.balanceValue()).append(';'));
        missing.forEach(d -> source.append("M:").append(d.binId()).append(':').append(d.itemId()).append(':')
                .append(d.lotId()).append(':').append(d.status()).append(':').append(d.expectedQuantity()).append(';'));
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(source.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private InventoryPeriod requirePeriod(ExecutionContext context, Long id) {
        InventoryPeriod period = periods.findById(id)
                .filter(value -> context.tenantId().equals(value.tenantId()))
                .orElseThrow(() -> notFound("INVENTORY_PERIOD_NOT_FOUND", "未找到库存期间"));
        requireSite(context, period.stockSiteId()); return period;
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite site = sites.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        if (!context.canAccessOrganization(site.organizationId())) {
            throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "无权访问当前库存站点");
        }
        if (site.departmentId() != null && !site.departmentId().equals(context.departmentId())) {
            throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点不一致");
        }
        return site;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contexts.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存月结必须选择工作机构和科室");
        return context;
    }

    private InventoryPeriodView periodView(InventoryPeriod value) {
        return new InventoryPeriodView(value.id(), value.revision(), value.stockSiteId(), value.previousPeriodId(),
                value.closingRunId(), value.periodCode(), value.periodFrom(), value.periodTo(), value.status(),
                value.closedAt(), value.closedBy(), value.description(), value.createdAt(), value.createdBy());
    }

    private static BigDecimal quantity(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(8, RoundingMode.HALF_UP);
    }
    private static BigDecimal amount(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(6, RoundingMode.HALF_UP);
    }
    private static String code(YearMonth month) { return month.toString().replace("-", ""); }
    private static String upper(String value) { return required(value, "INVENTORY_CURRENCY_REQUIRED", "币种不能为空").toUpperCase(); }
    private static String required(String value, String code, String message) {
        String cleaned = value == null ? null : value.trim();
        if (cleaned == null || cleaned.isEmpty()) throw badRequest(code, message);
        return cleaned;
    }
    private static SqlParameterValue sqlDate(LocalDate value) {
        return new SqlParameterValue(Types.DATE, java.sql.Date.valueOf(value));
    }
    private static SqlParameterValue sqlTimestamp(Instant value) {
        return new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(value));
    }
    private static Long nullableLong(ResultSet rs, String name) throws SQLException {
        long value = rs.getLong(name); return rs.wasNull() ? null : value;
    }
    private static Instant instant(ResultSet rs, String name) throws SQLException {
        return rs.getObject(name, OffsetDateTime.class).toInstant();
    }
    private static Instant nullableInstant(ResultSet rs, String name) throws SQLException {
        OffsetDateTime value = rs.getObject(name, OffsetDateTime.class); return value == null ? null : value.toInstant();
    }

    private record RunIdentity(Long id, Long periodId) {}
    private record RunRecord(Long id, Long periodId, String requestHash, String status, int differenceCount) {}
    private record MissingDimension(Long binId, Long itemId, Long lotId, String status,
                                    BigDecimal expectedQuantity) {}
    private record CloseDimension(Long balanceId, long balanceRevision, Long openingSnapshotId,
                                  Long binId, Long itemId, Long lotId, String status, String baseUnitCode,
                                  BigDecimal openingQuantity, BigDecimal movementQuantity,
                                  BigDecimal closingQuantity, BigDecimal balanceQuantity,
                                  BigDecimal quantityDifference, BigDecimal openingUnitValue,
                                  BigDecimal closingUnitValue, BigDecimal openingValue,
                                  BigDecimal movementAmount, BigDecimal valuationAmount,
                                  BigDecimal roundingAmount, BigDecimal closingValue,
                                  BigDecimal balanceValue, BigDecimal valueDifference, boolean valueIssue) {}
}
