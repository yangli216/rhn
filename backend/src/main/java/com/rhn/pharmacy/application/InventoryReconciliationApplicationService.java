package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryAccuracyViews.ReconciliationLineView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.ReconciliationRunView;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryReconciliationApplicationService {
    private static final DateTimeFormatter RUN_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss").withZone(ZoneOffset.UTC);
    private final JdbcTemplate jdbc;
    private final StockSiteRepository siteRepository;
    private final ExecutionContextProvider contextProvider;
    private final TransactionTemplate transactions;

    public InventoryReconciliationApplicationService(JdbcTemplate jdbc, StockSiteRepository siteRepository,
                                                     ExecutionContextProvider contextProvider,
                                                     TransactionTemplate transactions) {
        this.jdbc = jdbc; this.siteRepository = siteRepository; this.contextProvider = contextProvider;
        this.transactions = transactions;
    }

    @Transactional
    public ReconciliationRunView run(Long siteId, LocalDate businessDate) {
        ExecutionContext context = requireContext(); StockSite site = requireSite(context, siteId);
        return runInternal(context.tenantId(), site.organizationId(), site.id(), context.subjectId(),
                businessDate == null ? LocalDate.now(ZoneOffset.UTC) : businessDate, "MANUAL");
    }

    @Transactional(readOnly = true)
    public ReconciliationRunView latest(Long siteId) {
        ExecutionContext context = requireContext(); requireSite(context, siteId);
        List<Long> ids = jdbc.query("""
                select ID_INV_RECON_RUN as id from RHN_SUP_INV_RECON_RUN
                where ID_TNT = ? and ID_STOCK_SITE = ? order by DT_STARTED desc
                """, (rs, row) -> rs.getLong(1), context.tenantId(), siteId);
        return ids.isEmpty() ? null : load(context.tenantId(), ids.get(0));
    }

    @Scheduled(cron = "${rhn.pharmacy.inventory-reconciliation-cron:0 20 2 * * *}")
    public void scheduledReconciliation() {
        for (StockSite site : siteRepository.findAll()) {
            if (!site.active()) continue;
            try { transactions.executeWithoutResult(status -> runScheduled(site)); }
            catch (RuntimeException ignored) { /* next site must still reconcile */ }
        }
    }

    private void runScheduled(StockSite site) {
        runInternal(site.tenantId(), site.organizationId(), site.id(), null,
                LocalDate.now(ZoneOffset.UTC), "SCHEDULED");
    }

    private ReconciliationRunView runInternal(Long tenantId, Long organizationId, Long siteId, Long actorId,
                                              LocalDate businessDate, String runType) {
        Long runId = GlobalIds.next(); Instant started = Instant.now();
        String runNo = "REC" + RUN_TIME.format(started) + GlobalIds.randomSuffix(6);
        jdbc.update("""
                insert into RHN_SUP_INV_RECON_RUN
                (ID_INV_RECON_RUN, ID_TNT, ID_ORG, ID_STOCK_SITE, CD_RUN_NO, SD_RUN_TYPE, SD_STATUS, DA_BUSINESS,
                 DT_STARTED, ID_USER_RUN, QTY_DIMENSION, QTY_ISSUE)
                values (?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?, ?, 0, 0)
                """, runId, tenantId, organizationId, siteId, runNo, runType,
                new SqlParameterValue(Types.DATE, java.sql.Date.valueOf(businessDate)),
                new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(started)),
                new SqlParameterValue(Types.BIGINT, actorId));

        List<Issue> issues = new ArrayList<>();
        List<Dimension> balances = jdbc.query("""
                with ledger_totals as (
                    select ID_TNT as tenant_id, ID_STOCK_SITE as stock_site_id, ID_STOCK_BIN as stock_bin_id,
                           ID_STOCK_ITEM as stock_item_id, ID_STOCK_LOT as stock_lot_id, SD_STOCK_STATUS as stock_status,
                           sum(QTY_DELTA) as quantity from RHN_SUP_INV_TXN_LINE
                    where ID_TNT = ? and ID_STOCK_SITE = ?
                    group by ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT, SD_STOCK_STATUS
                ), reservation_totals as (
                    select ID_TNT as tenant_id, ID_STOCK_SITE as stock_site_id, ID_STOCK_BIN as stock_bin_id,
                           ID_STOCK_ITEM as stock_item_id, ID_STOCK_LOT as stock_lot_id,
                           sum(QTY_RESERVED - QTY_CONSUMED) as quantity from RHN_SUP_INV_RESV
                    where ID_TNT = ? and ID_STOCK_SITE = ? and SD_STATUS in ('ACTIVE', 'PARTIAL')
                    group by ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT
                ), open_package_totals as (
                    select ID_TNT as tenant_id, ID_STOCK_SITE as stock_site_id, ID_STOCK_BIN as stock_bin_id,
                           ID_STOCK_ITEM as stock_item_id, ID_STOCK_LOT as stock_lot_id,
                           sum(QTY_REMAINING_BASE) as quantity from RHN_SUP_INV_OPEN_PKG
                    where ID_TNT = ? and ID_STOCK_SITE = ? and SD_STATUS = 'OPEN'
                    group by ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT
                ), trace_totals as (
                    select ID_TNT as tenant_id, ID_STOCK_SITE as stock_site_id, ID_STOCK_BIN as stock_bin_id,
                           ID_STOCK_ITEM as stock_item_id, ID_STOCK_LOT as stock_lot_id,
                           sum(QTY_REMAINING_BASE) as quantity from RHN_SUP_INV_TRACE_CODE
                    where ID_TNT = ? and ID_STOCK_SITE = ?
                      and SD_STATUS in ('AVAILABLE', 'OPENED', 'PARTIALLY_ISSUED')
                    group by ID_TNT, ID_STOCK_SITE, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT
                )
                select b.ID_STOCK_BIN as stock_bin_id, b.ID_STOCK_ITEM as stock_item_id, b.ID_STOCK_LOT as stock_lot_id, b.SD_STOCK_STATUS as stock_status,
                       b.QTY_ON_HAND as quantity_on_hand, coalesce(l.quantity, 0) as ledger_quantity,
                       b.QTY_RESERVED as quantity_reserved, coalesce(r.quantity, 0) as reservation_quantity,
                       coalesce(p.quantity, 0) as open_quantity, i.FG_TRACE_REQUIRED as trace_required,
                       coalesce(t.quantity, 0) as trace_quantity from RHN_SUP_INV_BAL b
                join RHN_SUP_STOCK_ITEM i on i.ID_TNT = b.ID_TNT and i.ID_STOCK_ITEM = b.ID_STOCK_ITEM
                left join ledger_totals l
                  on l.tenant_id = b.ID_TNT and l.stock_site_id = b.ID_STOCK_SITE
                 and l.stock_bin_id = b.ID_STOCK_BIN and l.stock_item_id = b.ID_STOCK_ITEM
                 and l.stock_lot_id = b.ID_STOCK_LOT and l.stock_status = b.SD_STOCK_STATUS
                left join reservation_totals r
                  on r.tenant_id = b.ID_TNT and r.stock_site_id = b.ID_STOCK_SITE
                 and r.stock_bin_id = b.ID_STOCK_BIN and r.stock_item_id = b.ID_STOCK_ITEM
                 and r.stock_lot_id = b.ID_STOCK_LOT
                left join open_package_totals p
                  on p.tenant_id = b.ID_TNT and p.stock_site_id = b.ID_STOCK_SITE
                 and p.stock_bin_id = b.ID_STOCK_BIN and p.stock_item_id = b.ID_STOCK_ITEM
                 and p.stock_lot_id = b.ID_STOCK_LOT
                left join trace_totals t
                  on t.tenant_id = b.ID_TNT and t.stock_site_id = b.ID_STOCK_SITE
                 and t.stock_bin_id = b.ID_STOCK_BIN and t.stock_item_id = b.ID_STOCK_ITEM
                 and t.stock_lot_id = b.ID_STOCK_LOT
                where b.ID_TNT = ? and b.ID_STOCK_SITE = ?
                """, (rs, row) -> dimension(rs), tenantId, siteId, tenantId, siteId,
                tenantId, siteId, tenantId, siteId, tenantId, siteId);

        for (Dimension d : balances) {
            addDifference(issues, d, "LEDGER_BALANCE", d.ledger(), d.onHand(), "流水累计与库存余额不一致", "ERROR");
            addDifference(issues, d, "RESERVATION_BALANCE", d.reservationLedger(), d.reserved(), "有效预留与余额预留量不一致", "ERROR");
            if (d.open().compareTo(d.onHand()) > 0) {
                issues.add(new Issue(d, "OPEN_PACKAGE_BALANCE", d.onHand(), d.open(),
                        "拆零包装剩余量超过当前在手库存", "ERROR"));
            }
            if (d.traceRequired() && "AVAILABLE".equals(d.status())) {
                addDifference(issues, d, "TRACE_BALANCE", d.onHand(), d.trace(), "追溯码数量与可用库存不一致", "WARNING");
            }
        }
        for (Issue issue : issues) insertLine(tenantId, runId, issue);
        String status = issues.isEmpty() ? "PASSED" : "ISSUES"; Instant completed = Instant.now();
        jdbc.update("""
                update RHN_SUP_INV_RECON_RUN set SD_STATUS = ?, DT_COMPLETED = ?,
                       QTY_DIMENSION = ?, QTY_ISSUE = ? where ID_TNT = ? and ID_INV_RECON_RUN = ?
                """, status, new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(completed)),
                balances.size(), issues.size(), tenantId, runId);
        return load(tenantId, runId);
    }

    private void addDifference(List<Issue> issues, Dimension d, String type, BigDecimal expected,
                               BigDecimal actual, String description, String severity) {
        if (expected.compareTo(actual) != 0) issues.add(new Issue(d, type, expected, actual, description, severity));
    }

    private void insertLine(Long tenantId, Long runId, Issue issue) {
        jdbc.update("""
                insert into RHN_SUP_INV_RECON_LINE
                (ID_INV_RECON_LINE, ID_TNT, ID_INV_RECON_RUN, ID_STOCK_BIN, ID_STOCK_ITEM, ID_STOCK_LOT,
                 SD_STOCK_STATUS, SD_ISSUE_TYPE, QTY_EXPECTED, QTY_ACTUAL, QTY_DIFFERENCE,
                 SD_SEVERITY, DES_INV_RECON_LINE)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), tenantId, runId, issue.dimension().binId(), issue.dimension().itemId(),
                issue.dimension().lotId(), issue.dimension().status(), issue.type(), issue.expected(), issue.actual(),
                issue.actual().subtract(issue.expected()), issue.severity(), issue.description());
    }

    private ReconciliationRunView load(Long tenantId, Long id) {
        List<ReconciliationRunView> runs = jdbc.query("""
                select ID_INV_RECON_RUN as id, ID_STOCK_SITE as stock_site_id, CD_RUN_NO as run_no, SD_RUN_TYPE as run_type, SD_STATUS as status, DA_BUSINESS as business_date, DT_STARTED as started_at,
                       DT_COMPLETED as completed_at, ID_USER_RUN as run_by,
                       QTY_DIMENSION as dimension_count, QTY_ISSUE as issue_count
                  from RHN_SUP_INV_RECON_RUN where ID_TNT = ? and ID_INV_RECON_RUN = ?
                """, (rs, row) -> new ReconciliationRunView(rs.getLong("id"), rs.getLong("stock_site_id"),
                rs.getString("run_no"), rs.getString("run_type"), rs.getString("status"),
                rs.getObject("business_date", LocalDate.class), instant(rs, "started_at"),
                nullableInstant(rs, "completed_at"), nullableLong(rs, "run_by"), rs.getInt("dimension_count"),
                rs.getInt("issue_count"), lines(tenantId, id)), tenantId, id);
        return runs.isEmpty() ? null : runs.get(0);
    }

    private List<ReconciliationLineView> lines(Long tenantId, Long runId) {
        return jdbc.query("""
                select ID_INV_RECON_LINE as id, ID_STOCK_BIN as stock_bin_id, ID_STOCK_ITEM as stock_item_id, ID_STOCK_LOT as stock_lot_id, SD_STOCK_STATUS as stock_status, SD_ISSUE_TYPE as issue_type,
                       QTY_EXPECTED as expected_quantity, QTY_ACTUAL as actual_quantity, QTY_DIFFERENCE as difference_quantity,
                       SD_VALUAT_BASIS as valuation_basis, CD_CURRENCY as currency_code,
                       AMT_EXPECTED as expected_amount, AMT_ACTUAL as actual_amount,
                       AMT_DIFFERENCE as difference_amount,
                       SD_SEVERITY as severity, DES_INV_RECON_LINE as description
                  from RHN_SUP_INV_RECON_LINE where ID_TNT = ? and ID_INV_RECON_RUN = ?
                order by case SD_SEVERITY when 'ERROR' then 0 else 1 end, SD_ISSUE_TYPE, ID_INV_RECON_LINE
                """, (rs, row) -> new ReconciliationLineView(rs.getLong("id"), nullableLong(rs, "stock_bin_id"),
                nullableLong(rs, "stock_item_id"), nullableLong(rs, "stock_lot_id"), rs.getString("stock_status"),
                rs.getString("issue_type"), rs.getBigDecimal("expected_quantity"), rs.getBigDecimal("actual_quantity"),
                rs.getBigDecimal("difference_quantity"), rs.getString("valuation_basis"), rs.getString("currency_code"),
                rs.getBigDecimal("expected_amount"), rs.getBigDecimal("actual_amount"), rs.getBigDecimal("difference_amount"),
                rs.getString("severity"), rs.getString("description")),
                tenantId, runId);
    }

    private Dimension dimension(ResultSet rs) throws SQLException {
        return new Dimension(rs.getLong("stock_bin_id"), rs.getLong("stock_item_id"), rs.getLong("stock_lot_id"),
                rs.getString("stock_status"), rs.getBigDecimal("quantity_on_hand"), rs.getBigDecimal("ledger_quantity"),
                rs.getBigDecimal("quantity_reserved"), rs.getBigDecimal("reservation_quantity"),
                rs.getBigDecimal("open_quantity"), rs.getBoolean("trace_required"), rs.getBigDecimal("trace_quantity"));
    }
    private StockSite requireSite(ExecutionContext c, Long id) { StockSite s = siteRepository.findByIdAndTenantId(id, c.tenantId()).orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点")); if (!c.canAccessOrganization(s.organizationId())) throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "无权访问当前库存站点"); if (s.departmentId() != null && !s.departmentId().equals(c.departmentId())) throw badRequest("PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点不一致"); return s; }
    private ExecutionContext requireContext() { ExecutionContext c = contextProvider.requireCurrent(); if (!c.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存对账必须选择工作机构和科室"); return c; }
    private Instant instant(ResultSet rs, String name) throws SQLException { return rs.getObject(name, OffsetDateTime.class).toInstant(); }
    private Instant nullableInstant(ResultSet rs, String name) throws SQLException { OffsetDateTime value = rs.getObject(name, OffsetDateTime.class); return value == null ? null : value.toInstant(); }
    private Long nullableLong(ResultSet rs, String name) throws SQLException { long value = rs.getLong(name); return rs.wasNull() ? null : value; }

    private record Dimension(Long binId, Long itemId, Long lotId, String status, BigDecimal onHand,
                             BigDecimal ledger, BigDecimal reserved, BigDecimal reservationLedger,
                             BigDecimal open, boolean traceRequired, BigDecimal trace) {}
    private record Issue(Dimension dimension, String type, BigDecimal expected, BigDecimal actual,
                         String description, String severity) {}
}
