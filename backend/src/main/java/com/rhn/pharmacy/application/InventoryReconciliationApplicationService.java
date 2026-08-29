package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryAccuracyViews.ReconciliationLineView;
import com.rhn.pharmacy.api.InventoryAccuracyViews.ReconciliationRunView;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
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
                select id from inventory_reconciliation_runs
                where tenant_id = ? and stock_site_id = ? order by started_at desc
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
                insert into inventory_reconciliation_runs
                (id, tenant_id, organization_id, stock_site_id, run_no, run_type, status, business_date,
                 started_at, run_by, dimension_count, issue_count)
                values (?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?, ?, 0, 0)
                """, runId, tenantId, organizationId, siteId, runNo, runType, businessDate, started, actorId);

        List<Issue> issues = new ArrayList<>();
        List<Dimension> balances = jdbc.query("""
                select b.stock_bin_id, b.stock_item_id, b.stock_lot_id, b.stock_status,
                       b.quantity_on_hand,
                       coalesce(sum(l.quantity_delta), 0) as ledger_quantity,
                       b.quantity_reserved,
                       coalesce((select sum(r.quantity_reserved - r.quantity_consumed)
                                 from inventory_reservations r
                                 where r.tenant_id = b.tenant_id and r.stock_bin_id = b.stock_bin_id
                                   and r.stock_item_id = b.stock_item_id and r.stock_lot_id = b.stock_lot_id
                                   and r.status in ('ACTIVE', 'PARTIAL')), 0) as reservation_quantity,
                       coalesce((select sum(p.remaining_base_quantity)
                                 from inventory_open_packages p
                                 where p.tenant_id = b.tenant_id and p.stock_bin_id = b.stock_bin_id
                                   and p.stock_item_id = b.stock_item_id and p.stock_lot_id = b.stock_lot_id
                                   and p.status = 'OPEN'), 0) as open_quantity,
                       i.trace_required,
                       coalesce((select sum(t.remaining_base_quantity)
                                 from inventory_trace_codes t
                                 where t.tenant_id = b.tenant_id and t.stock_site_id = b.stock_site_id
                                   and t.stock_bin_id = b.stock_bin_id and t.stock_item_id = b.stock_item_id
                                   and t.stock_lot_id = b.stock_lot_id
                                   and t.status in ('AVAILABLE', 'OPENED', 'PARTIALLY_ISSUED')), 0) as trace_quantity
                from inventory_balances b
                join stock_items i on i.tenant_id = b.tenant_id and i.id = b.stock_item_id
                left join inventory_transaction_lines l
                  on l.tenant_id = b.tenant_id and l.stock_site_id = b.stock_site_id
                 and l.stock_bin_id = b.stock_bin_id and l.stock_item_id = b.stock_item_id
                 and l.stock_lot_id = b.stock_lot_id and l.stock_status = b.stock_status
                where b.tenant_id = ? and b.stock_site_id = ?
                group by b.tenant_id, b.stock_site_id, b.stock_bin_id, b.stock_item_id, b.stock_lot_id,
                         b.stock_status, b.quantity_on_hand, b.quantity_reserved, i.trace_required
                """, (rs, row) -> dimension(rs), tenantId, siteId);

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
                update inventory_reconciliation_runs set status = ?, completed_at = ?,
                       dimension_count = ?, issue_count = ? where tenant_id = ? and id = ?
                """, status, completed, balances.size(), issues.size(), tenantId, runId);
        return load(tenantId, runId);
    }

    private void addDifference(List<Issue> issues, Dimension d, String type, BigDecimal expected,
                               BigDecimal actual, String description, String severity) {
        if (expected.compareTo(actual) != 0) issues.add(new Issue(d, type, expected, actual, description, severity));
    }

    private void insertLine(Long tenantId, Long runId, Issue issue) {
        jdbc.update("""
                insert into inventory_reconciliation_lines
                (id, tenant_id, reconciliation_run_id, stock_bin_id, stock_item_id, stock_lot_id,
                 stock_status, issue_type, expected_quantity, actual_quantity, difference_quantity,
                 severity, description)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, GlobalIds.next(), tenantId, runId, issue.dimension().binId(), issue.dimension().itemId(),
                issue.dimension().lotId(), issue.dimension().status(), issue.type(), issue.expected(), issue.actual(),
                issue.actual().subtract(issue.expected()), issue.severity(), issue.description());
    }

    private ReconciliationRunView load(Long tenantId, Long id) {
        List<ReconciliationRunView> runs = jdbc.query("""
                select id, stock_site_id, run_no, run_type, status, business_date, started_at,
                       completed_at, run_by, dimension_count, issue_count
                from inventory_reconciliation_runs where tenant_id = ? and id = ?
                """, (rs, row) -> new ReconciliationRunView(rs.getLong("id"), rs.getLong("stock_site_id"),
                rs.getString("run_no"), rs.getString("run_type"), rs.getString("status"),
                rs.getObject("business_date", LocalDate.class), instant(rs, "started_at"),
                nullableInstant(rs, "completed_at"), nullableLong(rs, "run_by"), rs.getInt("dimension_count"),
                rs.getInt("issue_count"), lines(tenantId, id)), tenantId, id);
        return runs.isEmpty() ? null : runs.get(0);
    }

    private List<ReconciliationLineView> lines(Long tenantId, Long runId) {
        return jdbc.query("""
                select id, stock_bin_id, stock_item_id, stock_lot_id, stock_status, issue_type,
                       expected_quantity, actual_quantity, difference_quantity, severity, description
                from inventory_reconciliation_lines where tenant_id = ? and reconciliation_run_id = ?
                order by case severity when 'ERROR' then 0 else 1 end, issue_type, id
                """, (rs, row) -> new ReconciliationLineView(rs.getLong("id"), nullableLong(rs, "stock_bin_id"),
                nullableLong(rs, "stock_item_id"), nullableLong(rs, "stock_lot_id"), rs.getString("stock_status"),
                rs.getString("issue_type"), rs.getBigDecimal("expected_quantity"), rs.getBigDecimal("actual_quantity"),
                rs.getBigDecimal("difference_quantity"), rs.getString("severity"), rs.getString("description")),
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
