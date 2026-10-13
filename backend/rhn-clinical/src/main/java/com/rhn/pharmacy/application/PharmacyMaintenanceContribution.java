package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionReleaseCommand;
import com.rhn.pharmacy.domain.InventoryTraceCodeStatus;
import com.rhn.pharmacy.infrastructure.InventoryPeriodRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceCodeRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceEventRepository;
import com.rhn.pharmacy.infrastructure.InventorySplitEventRepository;
import com.rhn.pharmacy.infrastructure.InventoryOpenPackageRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.maintenance.api.*;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.math.MathContext;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;
import static com.rhn.platform.maintenance.api.MaintenanceModels.*;
import static com.rhn.platform.maintenance.api.MaintenanceRelationalData.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Compensates stock through the established gateways and keeps immutable inventory/trace evidence. */
@Component
public class PharmacyMaintenanceContribution extends ClinicalMaintenanceSupport {
    private final MaintenanceRelationalData data;
    private final InventoryAvailabilityService availability;
    private final InventoryLedgerPostingService ledger;
    private final InventoryApplicationService inventory;
    private final OutpatientPrescriptionInventoryService freezes;
    private final InventoryTraceApplicationService trace;
    private final InventorySplitApplicationService split;
    private final InventoryTraceCodeRepository traceCodes;
    private final InventoryTraceEventRepository traceEvents;
    private final InventorySplitEventRepository splitEvents;
    private final InventoryOpenPackageRepository openPackages;
    private final StockSiteRepository sites;
    private final StockItemRepository items;
    private final InventoryPeriodRepository periods;
    private final WorkContextDirectory workContexts;
    public PharmacyMaintenanceContribution(MaintenanceRelationalData data, InventoryAvailabilityService availability,
            InventoryLedgerPostingService ledger, InventoryApplicationService inventory,
            OutpatientPrescriptionInventoryService freezes, InventoryTraceApplicationService trace,
            InventorySplitApplicationService split, InventoryTraceCodeRepository traceCodes,
            StockSiteRepository sites, StockItemRepository items, InventoryPeriodRepository periods,
            WorkContextDirectory workContexts, InventorySplitEventRepository splitEvents, InventoryOpenPackageRepository openPackages, InventoryTraceEventRepository traceEvents) {
        super("PHARMACY", PharmacyMaintenanceTables.all());
        this.data = data; this.availability = availability; this.ledger = ledger; this.inventory = inventory;
        this.freezes = freezes; this.trace = trace; this.split = split; this.traceCodes = traceCodes;
        this.sites = sites; this.items = items; this.periods = periods; this.workContexts = workContexts;
        this.splitEvents=splitEvents; this.openPackages=openPackages; this.traceEvents=traceEvents;
    }
    @Override public Map<String, Set<Long>> relatedIdentifiers(Capture snapshot) {
        Set<Long> headers = rows(snapshot,"RHN_SUP_MED_DISP").stream().map(Row::id).collect(java.util.stream.Collectors.toSet());
        Set<Long> lines = rows(snapshot,"RHN_SUP_MED_DISP_LINE").stream().map(Row::id).collect(java.util.stream.Collectors.toSet());
        return Map.of("ID_MED_DISP_ORIG",headers,"ID_MED_DISP_RETURN",headers,"ID_MED_DISP_LINE_ORIG",lines);
    }
    @Override public List<TableSnapshot> additionalSnapshots(ExecutionContext actor, Scope scope, Capture snapshot) {
        List<TableSnapshot> extra = new ArrayList<>();
        Set<Long> lineIds = rows(snapshot, "RHN_SUP_MED_DISP_LINE").stream().map(row -> id(row, "ID_INV_TXN_LINE"))
                .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
        var lines = capture(scope.tenantId(), "RHN_SUP_INV_TXN_LINE", lineIds);
        extra.add(lines);
        extra.add(capture(scope.tenantId(), "RHN_SUP_INV_TXN", lines.rows().stream().map(row -> id(row, "ID_INV_TXN"))
                .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet())));
        var enriched = enriched(snapshot, extra);
        var dimensions = dimensions(enriched);
        Set<Long> balanceIds = new TreeSet<>();
        Set<Long> siteIds = new TreeSet<>();
        for (var dimension : dimensions) siteIds.add(dimension.site());
        for (Long site : siteIds) {
            availability.findBySite(scope.tenantId(), site).stream().filter(balance -> dimensions.contains(
                    new Dimension(balance.stockSiteId(), balance.stockBinId(), balance.stockItemId(), balance.stockLotId(), balance.stockStatus())))
                    .forEach(balance -> balanceIds.add(balance.id()));
        }
        extra.add(capture(scope.tenantId(), "RHN_SUP_INV_BAL", balanceIds));
        extra.add(capture(scope.tenantId(), "RHN_SUP_STOCK_SITE", siteIds));
        Set<Long> itemIds = dimensions.stream().map(Dimension::item).collect(java.util.stream.Collectors.toSet());
        extra.add(capture(scope.tenantId(), "RHN_SUP_STOCK_ITEM", itemIds));
        extra.add(capture(scope.tenantId(),"RHN_SUP_STOCK_BIN",dimensions.stream().map(Dimension::bin).collect(java.util.stream.Collectors.toSet())));
        extra.add(capture(scope.tenantId(),"RHN_SUP_STOCK_LOT",dimensions.stream().map(Dimension::lot).collect(java.util.stream.Collectors.toSet())));
        Set<Long> codeIds = new TreeSet<>();
        for (var dispense : rows(snapshot, "RHN_SUP_MED_DISP")) {
            for (var line : rows(snapshot, "RHN_SUP_MED_DISP_LINE")) {
                if (!dispense.id().equals(id(line, "ID_MED_DISP"))) continue;
                traceCodes.lockIssuedDispenseCodes(scope.tenantId(), dispense.id(), id(line, "ID_STOCK_ITEM"),
                        id(line, "ID_STOCK_LOT")).forEach(code -> codeIds.add(code.id()));
            }
        }
        for (Row dispense : rows(snapshot,"RHN_SUP_MED_DISP"))
            traceEvents.findByTenantIdAndDocumentTypeAndDocumentId(scope.tenantId(),"MEDICATION_DISPENSE",dispense.id())
                    .stream().filter(event -> Set.of("ISSUED","PARTIAL_ISSUE").contains(event.eventType())).forEach(event -> codeIds.add(event.traceCodeId()));
        Set<Long> packageIds = new TreeSet<>();
        for (Row dispense : rows(snapshot,"RHN_SUP_MED_DISP"))
            packageIds.addAll(splitEvents.findConsumedPackageIds(scope.tenantId(),dispense.id()));
        var packages = capture(scope.tenantId(),"RHN_SUP_INV_OPEN_PKG",packageIds); extra.add(packages);
        Set<Long> splitIds = new TreeSet<>();
        for (Long packageId : packageIds)
            splitEvents.findByTenantIdAndOpenPackageIdOrderByOccurredAtAscIdAsc(scope.tenantId(),packageId)
                    .forEach(event -> splitIds.add(event.id()));
        extra.add(capture(scope.tenantId(),"RHN_SUP_INV_SPLIT_EVT",splitIds));
        packages.rows().stream().map(row -> id(row,"ID_INV_TRACE_CODE")).filter(Objects::nonNull).forEach(codeIds::add);
        extra.add(capture(scope.tenantId(), "RHN_SUP_INV_TRACE_CODE", codeIds));
        Set<Long> traceEventIds = new TreeSet<>();
        for (Long code : codeIds) traceEvents.findByTenantIdAndTraceCodeIdOrderByOccurredAtAsc(scope.tenantId(),code)
                .forEach(event -> traceEventIds.add(event.id()));
        extra.add(capture(scope.tenantId(),"RHN_SUP_INV_TRACE_EVT",traceEventIds));
        return extra;
    }
    @Override public List<Issue> inspect(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules, List<Root> roots) {
        if (!modules.contains("PHARMACY")) return List.of();
        List<Issue> issues = new ArrayList<>();
        var deltas = deltas(snapshot);
        Set<Long> selectedDispenses = rows(snapshot,"RHN_SUP_MED_DISP").stream().map(Row::id).collect(java.util.stream.Collectors.toSet());
        for (Row returned : rows(snapshot,"RHN_SUP_STOCK_RETURN")) {
            if (!"PATIENT".equals(text(returned,"SD_RETURN_TYPE")) || !selectedDispenses.contains(id(returned,"ID_MED_DISP_ORIG"))
                    || !selectedDispenses.contains(id(returned,"ID_MED_DISP_RETURN")))
                issues.add(new Issue("MAINTENANCE_RETURN_SCOPE_INVALID", "退药单引用未选业务或不属于患者退药，不能清理", "PHARMACY"));
        }
        for (var dimension : dimensions(snapshot)) {
            var site = sites.findByIdAndTenantId(dimension.site(), scope.tenantId()).orElse(null);
            if (site == null || !scope.organizationIds().contains(site.organizationId())) {
                issues.add(new Issue("MAINTENANCE_PHARMACY_ORGANIZATION_REQUIRED", "发药库房属于其他机构，需明确纳入维护范围", "PHARMACY"));
                continue;
            }
            try { scoped(actor, site.organizationId()); }
            catch (com.rhn.shared.api.BusinessException error) {
                issues.add(new Issue(error.code(), "无权使用目标药房机构的工作上下文", "PHARMACY"));
            }
            Row balance = balance(snapshot, dimension);
            if (balance == null) {
                issues.add(new Issue("MAINTENANCE_STOCK_BALANCE_MISSING", "待清理业务对应的库存余额缺失", "PHARMACY")); continue;
            }
            BigDecimal reserved = releaseReserved(snapshot, dimension), frozen = releaseFrozen(snapshot, dimension);
            if (amount(balance, "QTY_RESVD").compareTo(reserved) < 0 || amount(balance, "QTY_FROZEN").compareTo(frozen) < 0)
                issues.add(new Issue("MAINTENANCE_STOCK_OCCUPANCY_INVALID", "库存占用与待清理冻结/预留不一致", "PHARMACY"));
            var delta = deltas.getOrDefault(dimension, Delta.ZERO);
            if (!delta.unknownCost() && delta.quantity().signum() == 0 && delta.amount().signum() != 0)
                issues.add(new Issue("MAINTENANCE_STOCK_COST_INVALID", "净数量为零但存在成本差异，需先通过库存成本流程处理", "PHARMACY"));
            String currentCost = text(balance, "PRICE_AVERAGE_UNIT_COST");
            if (delta.quantity().signum() < 0 && amount(balance, "QTY_ON_HAND").add(delta.quantity()).signum() > 0
                    && !delta.unknownCost() && currentCost != null
                    && amount(balance, "QTY_ON_HAND").multiply(new BigDecimal(currentCost)).add(delta.amount()).signum() < 0)
                issues.add(new Issue("MAINTENANCE_STOCK_COST_INVALID", "按原流水扣除后剩余库存价值为负，需先核对库存成本", "PHARMACY"));
            if (amount(balance, "QTY_AVAIL").add(reserved).add(frozen).add(delta.quantity()).signum() < 0)
                issues.add(new Issue("MAINTENANCE_STOCK_COMPENSATION_INSUFFICIENT", "回补测试库存后可用数量将为负，需先核对库存账", "PHARMACY"));
            if (delta.quantity().signum() != 0 && !periods.findByTenantIdAndStockSiteIdOrderByPeriodFromDesc(
                    scope.tenantId(), site.id()).stream().anyMatch(period -> "OPEN".equals(period.status().name())
                    && !period.periodFrom().isAfter(LocalDate.now(ZoneOffset.UTC))
                    && !period.periodTo().isBefore(LocalDate.now(ZoneOffset.UTC))))
                issues.add(new Issue("MAINTENANCE_STOCK_PERIOD_REQUIRED", "库存回补需要当前开放的库存期间", "PHARMACY"));
        }
        for (Row packaging : rows(snapshot,"RHN_SUP_INV_OPEN_PKG")) {
            BigDecimal restore = packagingRestoration(snapshot,packaging.id());
            if (restore.signum() < 0 || amount(packaging,"QTY_REM_BASE").add(restore).compareTo(amount(packaging,"QTY_OPENED_BASE")) > 0
                    || !Set.of("OPEN","CONSUMED").contains(text(packaging,"SD_STATUS")))
                issues.add(new Issue("MAINTENANCE_PACKAGING_INCONSISTENT", "原开包消耗、可再销售退药与当前包装余量不一致，不能清理", "PHARMACY"));
        }
        issues.addAll(traceInspection(snapshot));
        if (snapshot.tables().stream().anyMatch(table -> "PHARMACY".equals(table.definition().module()) && !table.definition().retained() && !table.rows().isEmpty())
                && !modules.contains("OUTPATIENT"))
            issues.add(new Issue("MAINTENANCE_OUTPATIENT_RESET_REQUIRED", "已发药的测试处方还需清理对应门诊业务，避免履约状态残留", "OUTPATIENT"));
        return issues.stream().distinct().toList();
    }
    @Override public List<PreviewLine> compensationPreview(Capture snapshot, Set<String> modules) {
        if (!modules.contains("PHARMACY")) return List.of();
        List<PreviewLine> result = new ArrayList<>();
        for (var dimension : dimensions(snapshot)) {
            Row balance = balance(snapshot, dimension);
            if (balance == null) continue;
            BigDecimal delta = deltas(snapshot).getOrDefault(dimension, Delta.ZERO).quantity();
            Row site=rows(snapshot,"RHN_SUP_STOCK_SITE").stream().filter(row -> row.id().equals(dimension.site())).findFirst().orElse(null);
            Row bin=rows(snapshot,"RHN_SUP_STOCK_BIN").stream().filter(row -> row.id().equals(dimension.bin())).findFirst().orElse(null);
            Row lot=rows(snapshot,"RHN_SUP_STOCK_LOT").stream().filter(row -> row.id().equals(dimension.lot())).findFirst().orElse(null);
            Row line=rows(snapshot,"RHN_SUP_DISP_TASK_LINE").stream().filter(row -> dimension.item().equals(id(row,"ID_STOCK_ITEM"))).findFirst().orElse(null);
            String name=line == null ? "药品库存" : text(line,"NA_PRODUCT_SNAP");
            result.add(new PreviewLine("PHARMACY",site == null ? null : id(site,"ID_ORG"),dimension.item().toString(), name+" · 库存回补与占用释放", "COMPENSATE",
                    amount(balance, "QTY_ON_HAND").toPlainString(), amount(balance, "QTY_ON_HAND").add(delta).toPlainString(),
                    (site == null ? "" : text(site,"NA_STOCK_SITE")) + " / " + (bin == null ? "" : text(bin,"NA_STOCK_BIN"))
                            + " / 批号 " + (lot == null ? "" : text(lot,"CD_LOT_NO")) + " / "
                            + Map.of("AVAILABLE","可用库存","QUARANTINE","隔离库存","DAMAGED","损坏库存","PENDING","待检库存","EXPIRED","过期库存").getOrDefault(dimension.status(),dimension.status())
                            + "。在手数量；另释放本批次预留 " + releaseReserved(snapshot, dimension).toPlainString()
                            + "、冻结 " + releaseFrozen(snapshot, dimension).toPlainString() + "。原库存流水保留。", null));
        }
        return result;
    }
    @Override public void beforeDelete(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {
        if (!modules.contains("PHARMACY")) return;
        Long task = MaintenanceExecutionScope.currentTaskId().orElseThrow(() -> conflict("MAINTENANCE_TASK_BINDING_REQUIRED", "库存维护必须绑定执行任务"));
        Set<Long> prescriptions = rows(snapshot, "RHN_SUP_RX_INV_FREEZE").stream()
                .filter(row -> "ACTIVE".equals(text(row, "SD_STATUS"))).map(row -> id(row, "ID_RX"))
                .collect(java.util.stream.Collectors.toSet());
        for (Long prescription : prescriptions) freezes.releasePrescription(new PrescriptionReleaseCommand(
                scope.tenantId(), null, prescription, "测试业务清理释放冻结；维护任务 " + task, actor.subjectId()));
        Set<Long> lineIds = rows(snapshot, "RHN_SUP_INV_RESV").stream()
                .filter(row -> Set.of("ACTIVE", "PARTIAL").contains(text(row, "SD_STATUS"))
                        && amount(row, "QTY_RESVD").subtract(amount(row, "QTY_CNSMD")).signum() > 0)
                .map(row -> id(row, "ID_DISP_TASK_LINE")).collect(java.util.stream.Collectors.toSet());
        for (var line : rows(snapshot, "RHN_SUP_DISP_TASK_LINE")) {
            if (!lineIds.contains(line.id())) continue;
            Long taskId = id(line, "ID_DISP_TASK");
            var header = rows(snapshot, "RHN_SUP_DISP_TASK").stream().filter(row -> row.id().equals(taskId)).findFirst().orElseThrow();
            var site = sites.findByIdAndTenantId(id(header, "ID_STOCK_SITE"), scope.tenantId()).orElseThrow();
            try (var ignored = MaintenanceExecutionScope.bind(scoped(actor, site.organizationId()))) {
                inventory.releaseTask(taskId, new InventoryApplicationService.ReleaseCommand("测试清理释放预留；维护任务 " + task));
            }
        }
        Map<Long, List<InventoryApplicationService.DocumentPostingLineCommand>> bySite = new TreeMap<>();
        for (var entry : deltas(snapshot).entrySet()) {
            Delta delta = entry.getValue();
            if (delta.quantity().signum() == 0) {
                if (!delta.unknownCost() && delta.amount().signum() != 0)
                    throw conflict("MAINTENANCE_STOCK_COST_INVALID", "测试业务净数量为零但存在成本差异，需先通过库存成本流程处理");
                continue;
            }
            Dimension d = entry.getKey();
            BigDecimal cost = delta.unknownCost() ? null : delta.amount().divide(delta.quantity(), MathContext.DECIMAL64);
            if (cost != null && cost.signum() < 0) throw conflict("MAINTENANCE_STOCK_COST_INVALID", "测试库存回补成本不一致");
            bySite.computeIfAbsent(d.site(), key -> new ArrayList<>()).add(new InventoryApplicationService.DocumentPostingLineCommand(
                    d.bin(), d.item(), d.lot(), d.status(), delta.quantity(), cost, false, delta.unknownCost() ? null : delta.amount()));
        }
        for (var entry : bySite.entrySet()) {
            var site = sites.findByIdAndTenantId(entry.getKey(), scope.tenantId()).orElseThrow();
            try (var ignored = MaintenanceExecutionScope.bind(scoped(actor, site.organizationId()))) {
                ledger.postDocument(new InventoryApplicationService.DocumentPostingCommand(
                        "maint-task:" + task + ":" + site.id(), "RETURN", "MAINTENANCE_TASK", task.toString(),
                        site.id(), Instant.now(), "回补经核对的测试发药；保留原库存流水", entry.getValue()));
            }
        }
        restorePackaging(actor, scope, snapshot, task);
        trace.normalizeMaintenanceReferences(actor, ownedDocuments(snapshot), traceRestoreBins(snapshot), splitTraceCodes(snapshot), task);
        availability.flush();
    }
    private void restorePackaging(ExecutionContext actor, Scope scope, Capture snapshot, Long task) {
        Map<Long, Row> headers = new HashMap<>();
        rows(snapshot, "RHN_SUP_MED_DISP").forEach(row -> headers.put(row.id(), row));
        Map<Long, BigDecimal> returned = new HashMap<>();
        for (var line : rows(snapshot,"RHN_SUP_STOCK_RETURN_LINE")) {
            if ("RESTOCK".equals(text(line,"SD_DISPOS")))
                returned.merge(id(line,"ID_MED_DISP_LINE_ORIG"), amount(line,"QTY_ACPTD").multiply(amount(line,"BASE_QTY_FACTOR")),BigDecimal::add);
        }
        for (var line : rows(snapshot, "RHN_SUP_MED_DISP_LINE")) {
            Row header = headers.get(id(line, "ID_MED_DISP"));
            if (header == null || !"DISPENSE".equals(text(header, "SD_DISP_TYPE"))) continue;
            BigDecimal remaining = amount(line, "QTY_DSPNSD").multiply(amount(line, "BASE_QTY_FACTOR"))
                    .subtract(returned.getOrDefault(line.id(), BigDecimal.ZERO));
            if (remaining.signum() <= 0) continue;
            var site = sites.findByIdAndTenantId(id(header, "ID_STOCK_SITE"), scope.tenantId()).orElseThrow();
            var item = items.findByIdAndTenantId(id(line, "ID_STOCK_ITEM"), scope.tenantId()).orElseThrow();
            ExecutionContext current = scoped(actor, site.organizationId());
            var taskLine = rows(snapshot, "RHN_SUP_DISP_TASK_LINE").stream()
                    .filter(row -> row.id().equals(id(line, "ID_DISP_TASK_LINE"))).findFirst().orElseThrow();
            boolean splitLine = "true".equalsIgnoreCase(text(taskLine, "FG_SPLIT")) || "1".equals(text(taskLine, "FG_SPLIT"));
            if (splitLine) split.returnFromDispense(current, item, id(line, "ID_STOCK_BIN"), id(line, "ID_STOCK_LOT"),
                    remaining, header.id(), task, task.toString(), Instant.now(), "MAINTENANCE_TASK");

        }
    }
    @Override public void verify(ExecutionContext actor, Scope scope, Capture snapshot, Set<String> modules) {
        if (!modules.contains("PHARMACY")) return;
        verifyTrace(actor,scope,snapshot);
        for (Row packaging : rows(snapshot,"RHN_SUP_INV_OPEN_PKG")) {
            var actual = openPackages.findById(packaging.id()).filter(value -> scope.tenantId().equals(value.tenantId())).orElseThrow();
            BigDecimal expected = amount(packaging,"QTY_REM_BASE").add(packagingRestoration(snapshot,packaging.id()));
            if (actual.remainingBaseQuantity().compareTo(expected) != 0)
                throw conflict("MAINTENANCE_PACKAGING_VERIFY_FAILED", "拆零包装余量与原消耗及退药事实不一致");
        }
        var deltas = deltas(snapshot);
        for (var d : dimensions(snapshot)) {
            Row before = balance(snapshot, d);
            if (before == null) throw conflict("MAINTENANCE_STOCK_BALANCE_MISSING", "库存验证快照缺失");
            var actual = availability.lockDimension(scope.tenantId(), d.bin(), d.item(), d.lot(), d.status()).orElseThrow();
            BigDecimal expectedOnHand = amount(before, "QTY_ON_HAND").add(deltas.getOrDefault(d, Delta.ZERO).quantity());
            BigDecimal expectedReserved = amount(before, "QTY_RESVD").subtract(releaseReserved(snapshot, d));
            BigDecimal expectedFrozen = amount(before, "QTY_FROZEN").subtract(releaseFrozen(snapshot, d));
            Delta delta = deltas.getOrDefault(d, Delta.ZERO);
            String beforeCost = text(before, "PRICE_AVERAGE_UNIT_COST");
            if (delta.quantity().signum() != 0) {
                BigDecimal expectedCost = delta.unknownCost() || expectedOnHand.signum() == 0
                        || amount(before,"QTY_ON_HAND").signum() != 0 && beforeCost == null ? null
                        : amount(before,"QTY_ON_HAND").multiply(beforeCost == null ? BigDecimal.ZERO : new BigDecimal(beforeCost))
                            .add(delta.amount()).divide(expectedOnHand, 6, java.math.RoundingMode.HALF_UP);
                if (expectedCost == null ? actual.averageUnitCost() != null : actual.averageUnitCost() == null
                        || actual.averageUnitCost().compareTo(expectedCost) != 0)
                    throw conflict("MAINTENANCE_STOCK_COST_VERIFY_FAILED", "库存补偿的成本投影与原流水金额不一致");
            }
            if (actual.quantityOnHand().compareTo(expectedOnHand) != 0 || actual.quantityReserved().compareTo(expectedReserved) != 0
                    || actual.quantityFrozen().compareTo(expectedFrozen) != 0
                    || actual.quantityAvailable().compareTo(expectedOnHand.subtract(expectedReserved).subtract(expectedFrozen)) != 0)
                throw conflict("MAINTENANCE_STOCK_VERIFY_FAILED", "库存回补或占用释放与预览不一致");
        }
    }
    private Set<Long> ownedDocuments(Capture snapshot) {
        Set<Long> result = new HashSet<>();
        rows(snapshot,"RHN_SUP_MED_DISP").forEach(row -> result.add(row.id()));
        rows(snapshot,"RHN_SUP_STOCK_RETURN").forEach(row -> result.add(row.id())); return result;
    }
    private Set<Long> splitTraceCodes(Capture snapshot) {
        return rows(snapshot,"RHN_SUP_INV_OPEN_PKG").stream().map(row -> id(row,"ID_INV_TRACE_CODE"))
                .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
    }
    private Map<Long,Long> traceRestoreBins(Capture snapshot) {
        Map<Long,Long> result = new LinkedHashMap<>(); Set<Long> split = splitTraceCodes(snapshot), owned = ownedDocuments(snapshot);
        Map<Long,Row> codes = new HashMap<>(); rows(snapshot,"RHN_SUP_INV_TRACE_CODE").forEach(row -> codes.put(row.id(),row));
        for (Row event : rows(snapshot,"RHN_SUP_INV_TRACE_EVT")) {
            Long code = id(event,"ID_INV_TRACE_CODE"); Row before = codes.get(code);
            if ("ISSUED".equals(text(event,"SD_EVT_TYPE")) && "MEDICATION_DISPENSE".equals(text(event,"SD_DOC_TYPE"))
                    && owned.contains(id(event,"ID_DOC")) && before != null && owned.contains(id(before,"ID_CURRENT_DOC")) && !split.contains(code))
                result.putIfAbsent(code,id(event,"ID_STOCK_BIN_FROM"));
        }
        return result;
    }
    private List<Issue> traceInspection(Capture snapshot) {
        List<Issue> issues = new ArrayList<>(); Set<Long> owned = ownedDocuments(snapshot), split = splitTraceCodes(snapshot);
        Map<Long,Long> restore = traceRestoreBins(snapshot);
        Map<Long,Row> items = new HashMap<>(), headers = new HashMap<>(), codes = new HashMap<>();
        rows(snapshot,"RHN_SUP_STOCK_ITEM").forEach(row -> items.put(row.id(),row));
        rows(snapshot,"RHN_SUP_MED_DISP").forEach(row -> headers.put(row.id(),row));
        rows(snapshot,"RHN_SUP_INV_TRACE_CODE").forEach(row -> codes.put(row.id(),row));
        Map<TraceAllocation,BigDecimal> expected = new LinkedHashMap<>();
        for (Row line : rows(snapshot,"RHN_SUP_MED_DISP_LINE")) {
            Row header = headers.get(id(line,"ID_MED_DISP")), item = items.get(id(line,"ID_STOCK_ITEM"));
            if (header == null || item == null || !"DISPENSE".equals(text(header,"SD_DISP_TYPE"))
                    || !("true".equalsIgnoreCase(text(item,"FG_TRACE_RQD")) || "1".equals(text(item,"FG_TRACE_RQD")))) continue;
            expected.merge(new TraceAllocation(header.id(),id(line,"ID_STOCK_BIN"),item.id(),id(line,"ID_STOCK_LOT")),
                    amount(line,"QTY_DSPNSD").multiply(amount(line,"BASE_QTY_FACTOR")),BigDecimal::add);
        }
        for (var entry : expected.entrySet()) {
            TraceAllocation allocation = entry.getKey();
            BigDecimal recorded = rows(snapshot,"RHN_SUP_INV_TRACE_EVT").stream().filter(event -> {
                Row code = codes.get(id(event,"ID_INV_TRACE_CODE"));
                return code != null && allocation.dispense().equals(id(event,"ID_DOC"))
                        && "MEDICATION_DISPENSE".equals(text(event,"SD_DOC_TYPE")) && Set.of("ISSUED","PARTIAL_ISSUE").contains(text(event,"SD_EVT_TYPE"))
                        && allocation.bin().equals(id(event,"ID_STOCK_BIN_FROM")) && allocation.item().equals(id(code,"ID_STOCK_ITEM"))
                        && allocation.lot().equals(id(code,"ID_STOCK_LOT"));
            }).map(event -> amount(event,"QTY_DELTA").negate()).reduce(BigDecimal.ZERO,BigDecimal::add);
            if (recorded.compareTo(entry.getValue()) != 0)
                issues.add(new Issue("MAINTENANCE_TRACE_HISTORY_MISSING", "发药数量与可验证的追溯核销历史不一致，不能清理", "PHARMACY"));
        }
        for (Row code : rows(snapshot,"RHN_SUP_INV_TRACE_CODE")) {
            if (split.contains(code.id())) continue;
            var events = rows(snapshot,"RHN_SUP_INV_TRACE_EVT").stream().filter(event -> code.id().equals(id(event,"ID_INV_TRACE_CODE"))).toList();
            if (owned.contains(id(code,"ID_CURRENT_DOC"))) {
                if (restore.get(code.id()) == null || !Set.of("ISSUED","AVAILABLE","QUARANTINED").contains(text(code,"SD_STATUS"))
                        || events.stream().anyMatch(event -> !owned.contains(id(event,"ID_DOC"))
                            && !Set.of("REGISTERED","RECEIVED").contains(text(event,"SD_EVT_TYPE"))))
                    issues.add(new Issue("MAINTENANCE_TRACE_REFERENCE_UNSAFE", "追溯包装已关联其他库存或业务处理，需先核对完整归属", "PHARMACY"));
            } else {
                var selected = events.stream().filter(event -> owned.contains(id(event,"ID_DOC"))).toList();
                BigDecimal net = selected.stream().map(event -> amount(event,"QTY_DELTA")).reduce(BigDecimal.ZERO,BigDecimal::add);
                if (net.signum() != 0 || selected.stream().anyMatch(event -> "MEDICATION_RETURN".equals(text(event,"SD_DOC_TYPE"))
                        && !"AVAILABLE".equals(text(event,"SD_TO_STATUS"))))
                    issues.add(new Issue("MAINTENANCE_TRACE_REFERENCE_UNSAFE", "测试追溯流转未闭合且包装已被其他业务使用，不能清理", "PHARMACY"));
            }
        }
        return issues;
    }
    private record TraceAllocation(Long dispense,Long bin,Long item,Long lot) {}
    private void verifyTrace(ExecutionContext actor,Scope scope,Capture snapshot) {
        Map<Long,Long> restore = traceRestoreBins(snapshot); Set<Long> owned = ownedDocuments(snapshot);
        Long task = MaintenanceExecutionScope.currentTaskId().orElseThrow();
        for (Row before : rows(snapshot,"RHN_SUP_INV_TRACE_CODE")) {
            var actual = traceCodes.findById(before.id()).filter(code -> scope.tenantId().equals(code.tenantId())).orElseThrow();
            BigDecimal expected = amount(before,"QTY_REM_BASE"); boolean changed = restore.containsKey(before.id());
            String status = text(before,"SD_STATUS"); Long bin = id(before,"ID_STOCK_BIN");
            if (changed) { expected = amount(before,"QTY_BASE"); status = "AVAILABLE"; bin = restore.get(before.id()); }
            for (Row packaging : rows(snapshot,"RHN_SUP_INV_OPEN_PKG")) {
                if (before.id().equals(id(packaging,"ID_INV_TRACE_CODE"))) {
                    BigDecimal returned = packagingRestoration(snapshot,packaging.id()); expected = expected.add(returned);
                    if (returned.signum() > 0) { changed=true; bin=id(packaging,"ID_STOCK_BIN"); status=expected.compareTo(amount(before,"QTY_BASE")) == 0 ? "OPENED" : "PARTIALLY_ISSUED"; }
                }
            }
            if (actual.remainingBaseQuantity().compareTo(expected) != 0 || !actual.status().name().equals(status) || !Objects.equals(actual.stockBinId(),bin)
                    || (changed || owned.contains(id(before,"ID_CURRENT_DOC"))) && (!"MAINTENANCE_TASK".equals(actual.currentDocumentType()) || !task.equals(actual.currentDocumentId())))
                throw conflict("MAINTENANCE_TRACE_VERIFY_FAILED", "追溯余量、库存状态或维护任务引用与预览不一致");
        }
    }
    private BigDecimal packagingRestoration(Capture snapshot,Long packageId) {
        Set<Long> selected = rows(snapshot,"RHN_SUP_MED_DISP").stream().filter(row -> "DISPENSE".equals(text(row,"SD_DISP_TYPE")))
                .map(Row::id).collect(java.util.stream.Collectors.toSet());
        return rows(snapshot,"RHN_SUP_INV_SPLIT_EVT").stream().filter(row -> packageId.equals(id(row,"ID_INV_OPEN_PKG"))
                && selected.contains(id(row,"ID_SRC")) && ("CONSUME".equals(text(row,"SD_EVT_TYPE")) && "MEDICATION_DISPENSE".equals(text(row,"SD_SRC_TYPE"))
                || "RETURN".equals(text(row,"SD_EVT_TYPE")) && "MEDICATION_DISPENSE_RETURN".equals(text(row,"SD_SRC_TYPE"))))
                .map(row -> amount(row,"QTY_DELTA").negate()).reduce(BigDecimal.ZERO,BigDecimal::add);
    }
    private TableSnapshot capture(Long tenant, String table, Set<Long> ids) {
        var definition = tables().stream().filter(value -> value.name().equals(table)).findFirst().orElseThrow();
        if (ids.isEmpty()) return new TableSnapshot(definition, List.of());
        return data.capture(tenant, List.of(definition), Map.of(definition.key(), ids)).tables().getFirst();
    }
    private Capture enriched(Capture base, List<TableSnapshot> extra) {
        Map<String, TableSnapshot> all = new LinkedHashMap<>();
        base.tables().forEach(table -> all.put(table.definition().name(), table));
        extra.forEach(table -> all.put(table.definition().name(), table));
        return new Capture(List.copyOf(all.values()), base.identifiers());
    }
    private Set<Dimension> dimensions(Capture snapshot) {
        Set<Dimension> result = new LinkedHashSet<>();
        for (String table : List.of("RHN_SUP_INV_TXN_LINE", "RHN_SUP_RX_INV_FREEZE", "RHN_SUP_INV_RESV")) {
            for (Row row : rows(snapshot, table)) result.add(dimension(row, table.equals("RHN_SUP_INV_TXN_LINE") ? text(row, "SD_STOCK_STATUS") : "AVAILABLE"));
        }
        return result;
    }
    private Map<Dimension, Delta> deltas(Capture snapshot) {
        Map<Dimension, Delta> result = new LinkedHashMap<>();
        for (Row line : rows(snapshot, "RHN_SUP_INV_TXN_LINE")) {
            Dimension d = dimension(line, text(line, "SD_STOCK_STATUS"));
            Delta old = result.getOrDefault(d, Delta.ZERO);
            result.put(d, new Delta(old.quantity().subtract(amount(line, "QTY_DELTA")),
                    old.amount().subtract(amount(line, "AMT_DELTA")), old.unknownCost() || text(line, "AMT_DELTA") == null));
        }
        return result;
    }
    private BigDecimal releaseReserved(Capture snapshot, Dimension d) {
        return rows(snapshot, "RHN_SUP_INV_RESV").stream().filter(row ->
                        Set.of("ACTIVE", "PARTIAL").contains(text(row, "SD_STATUS")) && d.equals(dimension(row, "AVAILABLE")))
                .map(row -> amount(row, "QTY_RESVD").subtract(amount(row, "QTY_CNSMD"))).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    private BigDecimal releaseFrozen(Capture snapshot, Dimension d) {
        return rows(snapshot, "RHN_SUP_RX_INV_FREEZE").stream().filter(row ->
                        "ACTIVE".equals(text(row, "SD_STATUS")) && d.equals(dimension(row, "AVAILABLE")))
                .map(row -> amount(row, "QTY_FROZEN")).reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    private Row balance(Capture snapshot, Dimension d) {
        return rows(snapshot, "RHN_SUP_INV_BAL").stream().filter(row -> d.equals(dimension(row, text(row, "SD_STOCK_STATUS"))))
                .findFirst().orElse(null);
    }
    private Dimension dimension(Row row, String status) {
        return new Dimension(id(row, "ID_STOCK_SITE"), id(row, "ID_STOCK_BIN"), id(row, "ID_STOCK_ITEM"), id(row, "ID_STOCK_LOT"), status);
    }
    private ExecutionContext scoped(ExecutionContext actor, Long organization) {
        if (organization.equals(actor.organizationId())) return actor;
        var option = workContexts.requireAuthorized(actor.tenantId(), actor.subjectId(), organization, null);
        var permissions = workContexts.authoritiesFor(actor.tenantId(), actor.subjectId(), organization, option.departmentId());
        return new ExecutionContext(actor.tenantId(), actor.subjectId(), actor.actor(), actor.correlationId(), permissions,
                organization, option.departmentId(), option.dataScopeType(), Set.of(organization),
                option.departmentId() == null ? Set.of() : Set.of(option.departmentId()), actor.practitionerId());
    }
    private record Dimension(Long site, Long bin, Long item, Long lot, String status) {}
    private record Delta(BigDecimal quantity, BigDecimal amount, boolean unknownCost) {
        static final Delta ZERO = new Delta(BigDecimal.ZERO, BigDecimal.ZERO, false);
    }
}
