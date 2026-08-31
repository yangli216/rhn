package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryPriceAdjustmentViews.PriceAdjustmentDetailView;
import com.rhn.pharmacy.api.InventoryPriceAdjustmentViews.PriceAdjustmentLineView;
import com.rhn.pharmacy.api.InventoryPriceAdjustmentViews.PriceAdjustmentView;
import com.rhn.pharmacy.domain.InventoryBalance;
import com.rhn.pharmacy.domain.InventoryPeriod;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.InventoryPeriodRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.CatalogOperationalSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PriceReplacement;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.SqlParameterValue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
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
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryPriceAdjustmentApplicationService {
    private static final Set<String> TYPES = Set.of("SALE_PRICE", "COST_REVALUE");
    private static final DateTimeFormatter DOCUMENT_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
            .withZone(ZoneOffset.UTC);

    private final JdbcTemplate jdbc;
    private final StockSiteRepository sites;
    private final StockItemRepository items;
    private final InventoryPeriodRepository periods;
    private final InventoryAvailabilityService availability;
    private final CatalogLifecycleDirectory catalog;
    private final ExecutionContextProvider contexts;

    public InventoryPriceAdjustmentApplicationService(JdbcTemplate jdbc, StockSiteRepository sites,
                                                       StockItemRepository items, InventoryPeriodRepository periods,
                                                       InventoryAvailabilityService availability,
                                                       CatalogLifecycleDirectory catalog,
                                                       ExecutionContextProvider contexts) {
        this.jdbc = jdbc; this.sites = sites; this.items = items; this.periods = periods;
        this.availability = availability; this.catalog = catalog; this.contexts = contexts;
    }

    @Transactional
    public PriceAdjustmentView create(CreateCommand command) {
        ExecutionContext context = context(); StockSite site = requireSite(context, command.stockSiteId());
        String type = upper(command.adjustmentType());
        if (!TYPES.contains(type)) throw badRequest("PRICE_ADJUSTMENT_TYPE_INVALID", "当前仅支持售价调价或成本重估");
        String requestCode = required(command.requestCode(), "PRICE_ADJUSTMENT_REQUEST_REQUIRED", "调价请求编码不能为空");
        String currency = upper(command.currencyCode() == null ? "CNY" : command.currencyCode());
        String priceType = "SALE_PRICE".equals(type)
                ? required(command.priceType(), "PRICE_TYPE_REQUIRED", "售价调价必须指定价格类型") : null;
        LocalDate date = command.businessDate() == null ? LocalDate.now(ZoneOffset.UTC) : command.businessDate();
        String reason = required(command.reason(), "PRICE_ADJUSTMENT_REASON_REQUIRED", "调价原因不能为空");
        if (command.lines() == null || command.lines().isEmpty()) {
            throw badRequest("PRICE_ADJUSTMENT_LINES_REQUIRED", "调价单至少包含一个经营项目");
        }
        if (command.lines().stream().map(AdjustmentLineCommand::stockItemId).distinct().count() != command.lines().size()) {
            throw badRequest("PRICE_ADJUSTMENT_ITEM_DUPLICATED", "同一调价单不能重复选择经营项目");
        }
        String hash = requestHash(command, type, priceType, currency, date, reason);
        Repeated repeated = jdbc.query("""
                select id, request_hash from inventory_price_adjustments where tenant_id = ? and request_code = ?
                """, (rs, row) -> new Repeated(rs.getLong("id"), rs.getString("request_hash")),
                context.tenantId(), requestCode).stream().findFirst().orElse(null);
        if (repeated != null) {
            if (!repeated.requestHash().equals(hash)) throw conflict(
                    "PRICE_ADJUSTMENT_REQUEST_REUSED", "相同调价请求编码不能用于不同内容");
            return get(context, repeated.id());
        }
        Instant now = Instant.now(); Long id = GlobalIds.next();
        String adjustmentNo = "PA" + DOCUMENT_TIME.format(now) + GlobalIds.randomSuffix(6);
        jdbc.update("""
                insert into inventory_price_adjustments
                (id, tenant_id, organization_id, stock_site_id, adjustment_no, request_code, request_hash,
                 adjustment_type, price_type, business_date, currency_code, price_document_code, reason,
                 status, line_count, total_value_before, total_value_after, total_adjustment_amount,
                 created_at, created_by, updated_at, updated_by)
                values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, 0, 0, 0, ?, ?, ?, ?)
                """, id, context.tenantId(), site.organizationId(), site.id(), adjustmentNo, requestCode, hash,
                type, priceType, sqlDate(date), currency, clean(command.priceDocumentCode()), reason,
                command.lines().size(), sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.subjectId());
        int lineNo = 0;
        for (AdjustmentLineCommand input : command.lines()) {
            StockItem item = requireItem(context, site.id(), input.stockItemId()); lineNo++;
            validateTarget(type, input);
            jdbc.update("""
                    insert into inventory_price_adjustment_lines
                    (id, tenant_id, adjustment_id, line_no, stock_item_id, catalog_item_id, package_id,
                     new_sale_price, new_unit_cost, quantity_snapshot, value_before, value_after,
                     adjustment_amount, rounding_amount, line_status)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'PENDING')
                    """, GlobalIds.next(), context.tenantId(), id, lineNo, item.id(), item.catalogItemId(),
                    item.basePackageId(), money(input.newSalePrice()), money(input.newUnitCost()));
        }
        return get(context, id);
    }

    @Transactional(readOnly = true)
    public List<PriceAdjustmentView> list(Long siteId) {
        ExecutionContext context = context(); StockSite site = requireSite(context, siteId);
        return jdbc.query("""
                select id from inventory_price_adjustments
                where tenant_id = ? and stock_site_id = ? order by business_date desc, created_at desc
                """, (rs, row) -> rs.getLong("id"), context.tenantId(), site.id())
                .stream().map(id -> get(context, id)).toList();
    }

    @Transactional(readOnly = true)
    public PriceAdjustmentView get(Long id) { return get(context(), id); }

    @Transactional
    public PriceAdjustmentView submit(Long id) {
        ExecutionContext context = context(); Header header = requireHeader(context, id); requireSite(context, header.siteId());
        if ("SUBMITTED".equals(header.status())) return get(context, id);
        if (!"DRAFT".equals(header.status())) throw conflict("PRICE_ADJUSTMENT_STATE_INVALID", "只有草稿调价单可以提交预检");
        jdbc.update("delete from inventory_price_adjustment_details where tenant_id = ? and adjustment_line_id in " +
                "(select id from inventory_price_adjustment_lines where tenant_id = ? and adjustment_id = ?)",
                context.tenantId(), context.tenantId(), id);
        BigDecimal totalBefore = zeroAmount(); BigDecimal totalAfter = zeroAmount();
        for (LineRecord line : lineRecords(context.tenantId(), id)) {
            StockItem item = requireItem(context, header.siteId(), line.itemId());
            Preview preview = preview(context, header, line, item);
            totalBefore = totalBefore.add(preview.valueBefore()); totalAfter = totalAfter.add(preview.valueAfter());
            jdbc.update("""
                    update inventory_price_adjustment_lines set old_catalog_price_id = ?, old_catalog_price_revision = ?,
                           old_sale_price = ?, old_unit_cost = ?, quantity_snapshot = ?, value_before = ?,
                           value_after = ?, adjustment_amount = ?, rounding_amount = ?, line_status = 'READY',
                           revision = revision + 1,
                           error_code = null, error_message = null
                    where tenant_id = ? and id = ? and line_status = 'PENDING'
                    """, preview.oldPriceId(), preview.oldPriceRevision(), preview.oldSalePrice(),
                    preview.oldUnitCost(), preview.quantity(), preview.valueBefore(), preview.valueAfter(),
                    preview.adjustmentAmount(), preview.roundingAmount(), context.tenantId(), line.id());
        }
        Instant now = Instant.now();
        int updated = jdbc.update("""
                update inventory_price_adjustments set status = 'SUBMITTED', revision = revision + 1, total_value_before = ?,
                       total_value_after = ?, total_adjustment_amount = ?, submitted_at = ?, submitted_by = ?,
                       updated_at = ?, updated_by = ? where tenant_id = ? and id = ? and status = 'DRAFT'
                """, amount(totalBefore), amount(totalAfter), amount(totalAfter.subtract(totalBefore)),
                sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.subjectId(), context.tenantId(), id);
        if (updated != 1) throw conflict("PRICE_ADJUSTMENT_CONCURRENT_CHANGE", "调价单已被其他用户修改");
        return get(context, id);
    }

    @Transactional
    public PriceAdjustmentView approve(Long id) {
        ExecutionContext context = context(); Header header = requireHeader(context, id); requireSite(context, header.siteId());
        if ("APPROVED".equals(header.status())) return get(context, id);
        if (!"SUBMITTED".equals(header.status())) throw conflict("PRICE_ADJUSTMENT_STATE_INVALID", "只有已提交调价单可以审核");
        Instant now = Instant.now();
        int updated = jdbc.update("""
                update inventory_price_adjustments set status = 'APPROVED', revision = revision + 1, approved_at = ?, approved_by = ?,
                       updated_at = ?, updated_by = ? where tenant_id = ? and id = ? and status = 'SUBMITTED'
                """, sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.subjectId(), context.tenantId(), id);
        if (updated != 1) throw conflict("PRICE_ADJUSTMENT_CONCURRENT_CHANGE", "调价单已被其他用户审核");
        return get(context, id);
    }

    @Transactional
    public PriceAdjustmentView post(Long id) {
        ExecutionContext context = context(); Header header = requireHeader(context, id); StockSite site = requireSite(context, header.siteId());
        if ("POSTED".equals(header.status())) return get(context, id);
        if (!"APPROVED".equals(header.status())) throw conflict("PRICE_ADJUSTMENT_STATE_INVALID", "只有审核通过的调价单可以记账");
        InventoryPeriod period = periods.lockForPosting(context.tenantId(), site.id(), periodCode(header.businessDate()))
                .orElseThrow(() -> conflict("INVENTORY_PERIOD_MISSING", "调价业务日期所属库存期间不存在"));
        if (!period.accepts(header.businessDate())) throw conflict("INVENTORY_PERIOD_NOT_OPEN", "调价业务日期所属库存期间未开放");
        List<InventoryBalance> locked = availability.lockSiteBalances(context.tenantId(), site.id());
        List<DetailRecord> details = detailRecords(context.tenantId(), id);
        for (DetailRecord detail : details) {
            InventoryBalance balance = locked.stream().filter(value -> value.id().equals(detail.balanceId())).findFirst()
                    .orElseThrow(() -> conflict("PRICE_ADJUSTMENT_BALANCE_MISSING", "调价预检对应库存余额已不存在"));
            if (balance.revision() != detail.balanceRevision()
                    || balance.quantityOnHand().compareTo(detail.quantity()) != 0) {
                throw conflict("PRICE_ADJUSTMENT_PREVIEW_STALE", "调价预检后库存已变化，请重新建立调价单");
            }
        }
        Instant now = Instant.now();
        int posting = jdbc.update("""
                update inventory_price_adjustments set status = 'POSTING', revision = revision + 1, updated_at = ?, updated_by = ?
                where tenant_id = ? and id = ? and status = 'APPROVED'
                """, sqlTimestamp(now), context.subjectId(), context.tenantId(), id);
        if (posting != 1) throw conflict("PRICE_ADJUSTMENT_CONCURRENT_CHANGE", "调价单正在被其他用户处理");
        for (LineRecord line : lineRecords(context.tenantId(), id)) {
            Long newPriceId = null; Long newPriceRevision = null;
            if ("SALE_PRICE".equals(header.type())) {
                CatalogOperationalSnapshot resolved = catalog.resolve(context.tenantId(), line.catalogItemId(),
                        site.organizationId(), line.packageId(), header.priceType(), header.businessDate());
                PriceView current = resolved.price();
                if (current == null || !current.id().equals(line.oldPriceId()) || current.revision() != line.oldPriceRevision()) {
                    throw conflict("PRICE_ADJUSTMENT_CATALOG_PRICE_STALE", "售价预检后目录价格已变化，请重新建立调价单");
                }
                PriceView created = catalog.replacePriceVersion(new PriceReplacement(context.tenantId(), current.id(),
                        current.revision(), line.catalogItemId(), current.organizationId(), current.packageId(),
                        header.priceType(), line.newSalePrice(), header.currency(), header.documentCode(),
                        header.reason(), header.businessDate()));
                newPriceId = created.id(); newPriceRevision = created.revision();
            }
            for (DetailRecord detail : details.stream().filter(value -> value.lineId().equals(line.id())).toList()) {
                InventoryBalance balance = locked.stream().filter(value -> value.id().equals(detail.balanceId())).findFirst().orElseThrow();
                if ("COST_REVALUE".equals(header.type())) {
                    balance.revalueCost(line.newUnitCost()); availability.save(balance);
                }
                Long entryId = GlobalIds.next();
                jdbc.update("""
                        insert into inventory_valuation_entries
                        (id, tenant_id, inventory_period_id, inventory_balance_id, stock_site_id,
                         stock_bin_id, stock_item_id, stock_lot_id, stock_status, valuation_basis,
                         entry_type, source_type, source_id, source_no, request_code, quantity_snapshot,
                         unit_price_before, unit_price_after, value_before, value_after, amount_delta,
                         currency_code, occurred_at, posted_at, posted_by, description)
                        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVENTORY_PRICE_ADJUSTMENT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, entryId, context.tenantId(), period.id(), detail.balanceId(), site.id(), detail.binId(),
                        line.itemId(), detail.lotId(), detail.stockStatus(),
                        "COST_REVALUE".equals(header.type()) ? "COST" : "RETAIL",
                        "COST_REVALUE".equals(header.type()) ? "COST_REVALUE" : "PRICE_ADJUSTMENT",
                        id, header.adjustmentNo(), header.requestCode() + ":" + detail.id(), detail.quantity(),
                        detail.unitBefore(), detail.unitAfter(), detail.valueBefore(), detail.valueAfter(),
                        detail.adjustmentAmount(), header.currency(), sqlTimestamp(header.businessDate().atStartOfDay(ZoneOffset.UTC).toInstant()),
                        sqlTimestamp(now), context.subjectId(), header.reason());
                jdbc.update("""
                        update inventory_price_adjustment_details set valuation_entry_id = ?
                        where tenant_id = ? and id = ? and valuation_entry_id is null
                        """, entryId, context.tenantId(), detail.id());
            }
            jdbc.update("""
                    update inventory_price_adjustment_lines set new_catalog_price_id = ?, revision = revision + 1,
                           new_catalog_price_revision = ?, line_status = 'POSTED'
                    where tenant_id = ? and id = ? and line_status = 'READY'
                    """, newPriceId, newPriceRevision, context.tenantId(), line.id());
        }
        availability.flush();
        int posted = jdbc.update("""
                update inventory_price_adjustments set status = 'POSTED', revision = revision + 1, inventory_period_id = ?,
                       posted_at = ?, posted_by = ?, updated_at = ?, updated_by = ?
                where tenant_id = ? and id = ? and status = 'POSTING'
                """, period.id(), sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.subjectId(),
                context.tenantId(), id);
        if (posted != 1) throw conflict("PRICE_ADJUSTMENT_POST_FAILED", "调价记账状态更新失败");
        return get(context, id);
    }

    @Transactional
    public PriceAdjustmentView cancel(Long id) {
        ExecutionContext context = context(); Header header = requireHeader(context, id); requireSite(context, header.siteId());
        if ("CANCELLED".equals(header.status())) return get(context, id);
        if (!Set.of("DRAFT", "SUBMITTED").contains(header.status())) {
            throw conflict("PRICE_ADJUSTMENT_STATE_INVALID", "仅草稿或待审核调价单可以取消");
        }
        Instant now = Instant.now();
        jdbc.update("""
                update inventory_price_adjustments set status = 'CANCELLED', revision = revision + 1, cancelled_at = ?, cancelled_by = ?,
                       updated_at = ?, updated_by = ? where tenant_id = ? and id = ? and status in ('DRAFT','SUBMITTED')
                """, sqlTimestamp(now), context.subjectId(), sqlTimestamp(now), context.subjectId(), context.tenantId(), id);
        return get(context, id);
    }

    private Preview preview(ExecutionContext context, Header header, LineRecord line, StockItem item) {
        List<InventoryBalance> balances = availability.findByItem(context.tenantId(), header.siteId(), item.id()).stream()
                .filter(value -> value.quantityOnHand().signum() > 0).sorted(Comparator
                        .comparing(InventoryBalance::stockBinId).thenComparing(InventoryBalance::stockLotId)
                        .thenComparing(InventoryBalance::stockStatus)).toList();
        if ("COST_REVALUE".equals(header.type()) && balances.isEmpty()) {
            throw conflict("PRICE_ADJUSTMENT_NO_STOCK", "成本重估项目当前没有在手库存");
        }
        CatalogOperationalSnapshot snapshot = null; PriceView oldPrice = null;
        BigDecimal saleBefore = null; BigDecimal unitAfter;
        BigDecimal factor = BigDecimal.ONE;
        if ("SALE_PRICE".equals(header.type())) {
            snapshot = catalog.resolve(context.tenantId(), item.catalogItemId(), header.organizationId(),
                    item.basePackageId(), header.priceType(), header.businessDate());
            oldPrice = snapshot.price();
            if (oldPrice == null) throw conflict("PRICE_ADJUSTMENT_CURRENT_PRICE_MISSING", "经营项目缺少当前有效售价");
            factor = snapshot.itemPackage() == null || snapshot.itemPackage().quantityFactor() == null
                    ? BigDecimal.ONE : snapshot.itemPackage().quantityFactor();
            saleBefore = oldPrice.price();
            unitAfter = line.newSalePrice().divide(factor, 8, RoundingMode.HALF_UP);
        } else {
            unitAfter = line.newUnitCost();
        }
        BigDecimal quantity = balances.stream().map(InventoryBalance::quantityOnHand).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal before = zeroAmount(); BigDecimal after = zeroAmount(); BigDecimal weightedCost = BigDecimal.ZERO;
        for (InventoryBalance balance : balances) {
            BigDecimal unitBefore;
            if ("COST_REVALUE".equals(header.type())) {
                if (balance.averageUnitCost() == null) throw conflict(
                        "PRICE_ADJUSTMENT_COST_MISSING", "库存余额缺少平均成本，不能执行成本重估");
                unitBefore = balance.averageUnitCost(); weightedCost = weightedCost.add(unitBefore.multiply(balance.quantityOnHand()));
            } else {
                unitBefore = saleBefore.divide(factor, 8, RoundingMode.HALF_UP);
            }
            BigDecimal valueBefore = amount(balance.quantityOnHand().multiply(unitBefore));
            BigDecimal valueAfter = amount(balance.quantityOnHand().multiply(unitAfter));
            before = before.add(valueBefore); after = after.add(valueAfter);
            jdbc.update("""
                    insert into inventory_price_adjustment_details
                    (id, tenant_id, adjustment_line_id, inventory_balance_id, inventory_balance_revision,
                     stock_bin_id, stock_lot_id, stock_status, quantity_snapshot, unit_price_before,
                     unit_price_after, value_before, value_after, adjustment_amount, rounding_amount, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
                    """, GlobalIds.next(), context.tenantId(), line.id(), balance.id(), balance.revision(),
                    balance.stockBinId(), balance.stockLotId(), balance.stockStatus(), quantity(balance.quantityOnHand()),
                    price(unitBefore), price(unitAfter), valueBefore, valueAfter, amount(valueAfter.subtract(valueBefore)),
                    sqlTimestamp(Instant.now()));
        }
        BigDecimal oldCost = "COST_REVALUE".equals(header.type()) && quantity.signum() > 0
                ? price(weightedCost.divide(quantity, 8, RoundingMode.HALF_UP)) : null;
        return new Preview(oldPrice == null ? null : oldPrice.id(), oldPrice == null ? null : oldPrice.revision(),
                saleBefore, oldCost, quantity(quantity), amount(before), amount(after), amount(after.subtract(before)),
                zeroAmount());
    }

    private PriceAdjustmentView get(ExecutionContext context, Long id) {
        PriceAdjustmentView value = jdbc.query("""
                select id, revision, stock_site_id, inventory_period_id, adjustment_no, request_code,
                       adjustment_type, price_type, business_date, currency_code, price_document_code,
                       reason, status, line_count, total_value_before, total_value_after,
                       total_adjustment_amount, created_at, created_by, submitted_at, submitted_by,
                       approved_at, approved_by, posted_at, posted_by
                from inventory_price_adjustments where tenant_id = ? and id = ?
                """, (rs, row) -> new PriceAdjustmentView(rs.getLong("id"), rs.getLong("revision"),
                rs.getLong("stock_site_id"), nullableLong(rs, "inventory_period_id"),
                rs.getString("adjustment_no"), rs.getString("request_code"), rs.getString("adjustment_type"),
                rs.getString("price_type"), rs.getObject("business_date", LocalDate.class),
                rs.getString("currency_code"), rs.getString("price_document_code"), rs.getString("reason"),
                rs.getString("status"), rs.getInt("line_count"), rs.getBigDecimal("total_value_before"),
                rs.getBigDecimal("total_value_after"), rs.getBigDecimal("total_adjustment_amount"),
                instant(rs, "created_at"), rs.getLong("created_by"), nullableInstant(rs, "submitted_at"),
                nullableLong(rs, "submitted_by"), nullableInstant(rs, "approved_at"), nullableLong(rs, "approved_by"),
                nullableInstant(rs, "posted_at"), nullableLong(rs, "posted_by"), lines(context.tenantId(), id)),
                context.tenantId(), id).stream().findFirst()
                .orElseThrow(() -> notFound("PRICE_ADJUSTMENT_NOT_FOUND", "未找到库存调价单"));
        requireSite(context, value.stockSiteId()); return value;
    }

    private List<PriceAdjustmentLineView> lines(Long tenantId, Long id) {
        return jdbc.query("""
                select id, revision, line_no, stock_item_id, catalog_item_id, package_id,
                       old_catalog_price_id, new_catalog_price_id, old_sale_price, new_sale_price,
                       old_unit_cost, new_unit_cost, quantity_snapshot, value_before, value_after,
                       adjustment_amount, rounding_amount, line_status, error_code, error_message
                from inventory_price_adjustment_lines where tenant_id = ? and adjustment_id = ? order by line_no
                """, (rs, row) -> new PriceAdjustmentLineView(rs.getLong("id"), rs.getLong("revision"),
                rs.getInt("line_no"), rs.getLong("stock_item_id"), rs.getLong("catalog_item_id"),
                rs.getLong("package_id"), nullableLong(rs, "old_catalog_price_id"), nullableLong(rs, "new_catalog_price_id"),
                rs.getBigDecimal("old_sale_price"), rs.getBigDecimal("new_sale_price"), rs.getBigDecimal("old_unit_cost"),
                rs.getBigDecimal("new_unit_cost"), rs.getBigDecimal("quantity_snapshot"), rs.getBigDecimal("value_before"),
                rs.getBigDecimal("value_after"), rs.getBigDecimal("adjustment_amount"), rs.getBigDecimal("rounding_amount"),
                rs.getString("line_status"), rs.getString("error_code"), rs.getString("error_message"),
                details(tenantId, rs.getLong("id"))), tenantId, id);
    }

    private List<PriceAdjustmentDetailView> details(Long tenantId, Long lineId) {
        return jdbc.query("""
                select d.id, d.inventory_balance_id, d.inventory_balance_revision, d.stock_bin_id,
                       d.stock_lot_id, l.lot_no, d.stock_status, d.quantity_snapshot, d.unit_price_before,
                       d.unit_price_after, d.value_before, d.value_after, d.adjustment_amount,
                       d.rounding_amount, d.valuation_entry_id
                from inventory_price_adjustment_details d join stock_lots l
                  on l.tenant_id = d.tenant_id and l.id = d.stock_lot_id
                where d.tenant_id = ? and d.adjustment_line_id = ? order by d.stock_bin_id, d.stock_lot_id, d.stock_status
                """, (rs, row) -> new PriceAdjustmentDetailView(rs.getLong("id"), rs.getLong("inventory_balance_id"),
                rs.getLong("inventory_balance_revision"), rs.getLong("stock_bin_id"), rs.getLong("stock_lot_id"),
                rs.getString("lot_no"), rs.getString("stock_status"), rs.getBigDecimal("quantity_snapshot"),
                rs.getBigDecimal("unit_price_before"), rs.getBigDecimal("unit_price_after"), rs.getBigDecimal("value_before"),
                rs.getBigDecimal("value_after"), rs.getBigDecimal("adjustment_amount"), rs.getBigDecimal("rounding_amount"),
                nullableLong(rs, "valuation_entry_id")), tenantId, lineId);
    }

    private Header requireHeader(ExecutionContext context, Long id) {
        Header value = jdbc.query("""
                select id, organization_id, stock_site_id, adjustment_no, request_code, adjustment_type,
                       price_type, business_date, currency_code, price_document_code, reason, status
                from inventory_price_adjustments where tenant_id = ? and id = ?
                """, (rs, row) -> new Header(rs.getLong("id"), rs.getLong("organization_id"),
                rs.getLong("stock_site_id"), rs.getString("adjustment_no"), rs.getString("request_code"),
                rs.getString("adjustment_type"), rs.getString("price_type"), rs.getObject("business_date", LocalDate.class),
                rs.getString("currency_code"), rs.getString("price_document_code"), rs.getString("reason"),
                rs.getString("status")), context.tenantId(), id).stream().findFirst()
                .orElseThrow(() -> notFound("PRICE_ADJUSTMENT_NOT_FOUND", "未找到库存调价单"));
        requireSite(context, value.siteId()); return value;
    }

    private List<LineRecord> lineRecords(Long tenantId, Long adjustmentId) {
        return jdbc.query("""
                select id, stock_item_id, catalog_item_id, package_id, old_catalog_price_id,
                       old_catalog_price_revision, new_sale_price, new_unit_cost
                from inventory_price_adjustment_lines where tenant_id = ? and adjustment_id = ? order by line_no
                """, (rs, row) -> new LineRecord(rs.getLong("id"), rs.getLong("stock_item_id"),
                rs.getLong("catalog_item_id"), rs.getLong("package_id"), nullableLong(rs, "old_catalog_price_id"),
                nullableLongValue(rs, "old_catalog_price_revision"), rs.getBigDecimal("new_sale_price"),
                rs.getBigDecimal("new_unit_cost")), tenantId, adjustmentId);
    }

    private List<DetailRecord> detailRecords(Long tenantId, Long adjustmentId) {
        return jdbc.query("""
                select d.id, d.adjustment_line_id, d.inventory_balance_id, d.inventory_balance_revision,
                       d.stock_bin_id, d.stock_lot_id, d.stock_status, d.quantity_snapshot,
                       d.unit_price_before, d.unit_price_after, d.value_before, d.value_after, d.adjustment_amount
                from inventory_price_adjustment_details d join inventory_price_adjustment_lines l
                  on l.tenant_id = d.tenant_id and l.id = d.adjustment_line_id
                where d.tenant_id = ? and l.adjustment_id = ? order by d.stock_bin_id, l.stock_item_id, d.stock_lot_id, d.stock_status
                """, (rs, row) -> new DetailRecord(rs.getLong("id"), rs.getLong("adjustment_line_id"),
                rs.getLong("inventory_balance_id"), rs.getLong("inventory_balance_revision"), rs.getLong("stock_bin_id"),
                rs.getLong("stock_lot_id"), rs.getString("stock_status"), rs.getBigDecimal("quantity_snapshot"),
                rs.getBigDecimal("unit_price_before"), rs.getBigDecimal("unit_price_after"), rs.getBigDecimal("value_before"),
                rs.getBigDecimal("value_after"), rs.getBigDecimal("adjustment_amount")), tenantId, adjustmentId);
    }

    private StockSite requireSite(ExecutionContext context, Long id) {
        StockSite site = sites.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        if (!context.canAccessOrganization(site.organizationId())) throw badRequest(
                "PHARMACY_ORGANIZATION_SCOPE_INVALID", "无权访问当前库存站点");
        if (site.departmentId() != null && !site.departmentId().equals(context.departmentId())) throw badRequest(
                "PHARMACY_SITE_CONTEXT_MISMATCH", "当前工作科室与库存站点不一致");
        return site;
    }

    private StockItem requireItem(ExecutionContext context, Long siteId, Long id) {
        StockItem item = items.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库存经营项目"));
        if (!item.stockSiteId().equals(siteId)) throw badRequest("PRICE_ADJUSTMENT_ITEM_SITE_MISMATCH", "经营项目不属于当前库房");
        return item;
    }

    private ExecutionContext context() {
        ExecutionContext value = contexts.requireCurrent();
        if (!value.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存调价必须选择工作机构和科室");
        return value;
    }

    private static void validateTarget(String type, AdjustmentLineCommand line) {
        if ("SALE_PRICE".equals(type) && (line.newSalePrice() == null || line.newSalePrice().signum() < 0)) {
            throw badRequest("PRICE_ADJUSTMENT_SALE_PRICE_INVALID", "新售价不能为空且不能小于零");
        }
        if ("COST_REVALUE".equals(type) && (line.newUnitCost() == null || line.newUnitCost().signum() < 0)) {
            throw badRequest("PRICE_ADJUSTMENT_UNIT_COST_INVALID", "新单位成本不能为空且不能小于零");
        }
    }

    private static String requestHash(CreateCommand command, String type, String priceType, String currency,
                                      LocalDate date, String reason) {
        StringBuilder value = new StringBuilder().append(command.stockSiteId()).append('|').append(type).append('|')
                .append(priceType).append('|').append(currency).append('|').append(date).append('|').append(reason).append('|');
        command.lines().stream().sorted(Comparator.comparing(AdjustmentLineCommand::stockItemId)).forEach(line ->
                value.append(line.stockItemId()).append(':').append(line.newSalePrice()).append(':')
                        .append(line.newUnitCost()).append(';'));
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.toString().getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }

    private static String periodCode(LocalDate date) { return YearMonth.from(date).toString().replace("-", ""); }
    private static BigDecimal price(BigDecimal value) { return value == null ? null : value.setScale(6, RoundingMode.HALF_UP); }
    private static BigDecimal money(BigDecimal value) { return value == null ? null : value.setScale(6, RoundingMode.HALF_UP); }
    private static BigDecimal quantity(BigDecimal value) { return value.setScale(8, RoundingMode.HALF_UP); }
    private static BigDecimal amount(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private static BigDecimal zeroAmount() { return BigDecimal.ZERO.setScale(6, RoundingMode.HALF_UP); }
    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String upper(String value) { return required(value, "VALUE_REQUIRED", "必填值不能为空").toUpperCase(); }
    private static String required(String value, String code, String message) {
        String cleaned = clean(value); if (cleaned == null) throw badRequest(code, message); return cleaned;
    }
    private static SqlParameterValue sqlDate(LocalDate value) { return new SqlParameterValue(Types.DATE, java.sql.Date.valueOf(value)); }
    private static SqlParameterValue sqlTimestamp(Instant value) { return new SqlParameterValue(Types.TIMESTAMP, Timestamp.from(value)); }
    private static Long nullableLong(ResultSet rs, String name) throws SQLException { long value = rs.getLong(name); return rs.wasNull() ? null : value; }
    private static long nullableLongValue(ResultSet rs, String name) throws SQLException { long value = rs.getLong(name); return rs.wasNull() ? -1 : value; }
    private static Instant instant(ResultSet rs, String name) throws SQLException { return rs.getObject(name, OffsetDateTime.class).toInstant(); }
    private static Instant nullableInstant(ResultSet rs, String name) throws SQLException {
        OffsetDateTime value = rs.getObject(name, OffsetDateTime.class); return value == null ? null : value.toInstant();
    }

    public record CreateCommand(Long stockSiteId, String requestCode, String adjustmentType, String priceType,
                                LocalDate businessDate, String currencyCode, String priceDocumentCode,
                                String reason, List<AdjustmentLineCommand> lines) {}
    public record AdjustmentLineCommand(Long stockItemId, BigDecimal newSalePrice, BigDecimal newUnitCost) {}
    private record Header(Long id, Long organizationId, Long siteId, String adjustmentNo, String requestCode,
                          String type, String priceType, LocalDate businessDate, String currency,
                          String documentCode, String reason, String status) {}
    private record LineRecord(Long id, Long itemId, Long catalogItemId, Long packageId, Long oldPriceId,
                              long oldPriceRevision, BigDecimal newSalePrice, BigDecimal newUnitCost) {}
    private record DetailRecord(Long id, Long lineId, Long balanceId, long balanceRevision, Long binId,
                                Long lotId, String stockStatus, BigDecimal quantity, BigDecimal unitBefore,
                                BigDecimal unitAfter, BigDecimal valueBefore, BigDecimal valueAfter,
                                BigDecimal adjustmentAmount) {}
    private record Preview(Long oldPriceId, Long oldPriceRevision, BigDecimal oldSalePrice,
                           BigDecimal oldUnitCost, BigDecimal quantity, BigDecimal valueBefore,
                           BigDecimal valueAfter, BigDecimal adjustmentAmount, BigDecimal roundingAmount) {}
    private record Repeated(Long id, String requestHash) {}
}
