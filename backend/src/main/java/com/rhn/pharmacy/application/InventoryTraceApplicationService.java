package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.InventoryTraceViews.ReceiptTraceLineView;
import com.rhn.pharmacy.api.InventoryTraceViews.ReceiptTraceSummaryView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceCodeView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceDetailView;
import com.rhn.pharmacy.api.InventoryTraceViews.TraceEventView;
import com.rhn.pharmacy.domain.GoodsReceipt;
import com.rhn.pharmacy.domain.GoodsReceiptLine;
import com.rhn.pharmacy.domain.InventoryTraceCode;
import com.rhn.pharmacy.domain.InventoryTraceEvent;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.infrastructure.GoodsReceiptLineRepository;
import com.rhn.pharmacy.infrastructure.GoodsReceiptRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceCodeRepository;
import com.rhn.pharmacy.infrastructure.InventoryTraceEventRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InventoryTraceApplicationService {
    private final InventoryTraceCodeRepository codeRepository;
    private final InventoryTraceEventRepository eventRepository;
    private final GoodsReceiptRepository receiptRepository;
    private final GoodsReceiptLineRepository receiptLineRepository;
    private final StockSiteRepository siteRepository;
    private final StockItemRepository itemRepository;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final ExecutionContextProvider contextProvider;

    public InventoryTraceApplicationService(InventoryTraceCodeRepository codeRepository,
            InventoryTraceEventRepository eventRepository, GoodsReceiptRepository receiptRepository,
            GoodsReceiptLineRepository receiptLineRepository, StockSiteRepository siteRepository,
            StockItemRepository itemRepository, CatalogLifecycleDirectory catalogDirectory,
            ExecutionContextProvider contextProvider) {
        this.codeRepository = codeRepository; this.eventRepository = eventRepository;
        this.receiptRepository = receiptRepository; this.receiptLineRepository = receiptLineRepository;
        this.siteRepository = siteRepository; this.itemRepository = itemRepository;
        this.catalogDirectory = catalogDirectory; this.contextProvider = contextProvider;
    }

    @Transactional
    public ReceiptTraceSummaryView registerReceiptCodes(Long receiptId, RegisterReceiptCodesCommand input) {
        ExecutionContext context = requireContext(); GoodsReceipt receipt = lockReceipt(context, receiptId);
        if (!Set.of("ACCEPTED", "PARTIALLY_ACCEPTED").contains(receipt.status())) {
            throw conflict("TRACE_RECEIPT_STATE_INVALID", "只有完成验收且尚未入库的到货单可以登记追溯码");
        }
        List<GoodsReceiptLine> receiptLines = receiptLineRepository.lockByReceipt(context.tenantId(), receiptId);
        Map<Long, GoodsReceiptLine> lineMap = new HashMap<>(); receiptLines.forEach(line -> lineMap.put(line.id(), line));
        if (input.lines() == null || input.lines().isEmpty()) throw badRequest("TRACE_CODES_REQUIRED", "请登记追溯码");
        Set<Long> inputLineIds = new HashSet<>(); Set<String> requestCodes = new HashSet<>();
        List<InventoryTraceCode> staged = new ArrayList<>();
        for (RegisterReceiptLineCommand command : input.lines()) {
            if (!inputLineIds.add(command.goodsReceiptLineId())) throw badRequest("TRACE_LINE_DUPLICATE", "追溯码登记明细不能重复");
            GoodsReceiptLine line = lineMap.get(command.goodsReceiptLineId());
            if (line == null) throw badRequest("TRACE_RECEIPT_LINE_INVALID", "追溯码明细不属于当前到货单");
            StockItem item = requireItem(context, line.stockItemId(), receipt.stockSiteId());
            if (!item.traceRequired()) throw badRequest("TRACE_ITEM_NOT_REQUIRED", "未启用追溯的经营项目无需登记追溯码");
            int expected = integerPackages(line.acceptedQuantity());
            List<String> codes = normalizeInput(command.traceCodes());
            if (codes.size() != expected) throw badRequest("TRACE_CODE_COUNT_MISMATCH",
                    "追溯码数量必须与验收合格包装数一致，明细需要 " + expected + " 个，实际 " + codes.size() + " 个");
            var catalog = catalogDirectory.resolve(context.tenantId(), item.catalogItemId(), receipt.organizationId(),
                    item.basePackageId(), "SALE", LocalDate.now());
            for (String value : codes) {
                String normalized = normalize(value);
                if (!requestCodes.add(normalized)) throw conflict("TRACE_CODE_DUPLICATE", "本次登记存在重复追溯码：" + value);
                staged.add(new InventoryTraceCode(context.tenantId(), receipt.organizationId(), receipt.stockSiteId(),
                        item.id(), line.id(), value.trim(), normalized, catalog.item().code(), catalog.item().name(),
                        line.lotNo(), BigDecimal.ONE, catalog.itemPackage().quantityFactor(), context.subjectId()));
            }
        }
        for (GoodsReceiptLine line : receiptLines) {
            StockItem item = requireItem(context, line.stockItemId(), receipt.stockSiteId());
            if (item.traceRequired() && line.acceptedQuantity() != null && line.acceptedQuantity().signum() > 0
                    && !inputLineIds.contains(line.id())) {
                throw badRequest("TRACE_REGISTRATION_INCOMPLETE", "必须一次登记全部需追溯的验收合格明细");
            }
        }
        List<InventoryTraceCode> existing = receiptLines.stream()
                .flatMap(line -> codeRepository.findByTenantIdAndGoodsReceiptLineIdOrderById(context.tenantId(), line.id()).stream())
                .toList();
        if (existing.stream().anyMatch(code -> !"PENDING_RECEIPT".equals(code.status()))) {
            throw conflict("TRACE_CODES_ALREADY_POSTED", "已入库的追溯码不能覆盖登记");
        }
        codeRepository.deleteAll(existing); codeRepository.flush();
        for (InventoryTraceCode code : staged) {
            if (codeRepository.findByTenantIdAndNormalizedCode(context.tenantId(), code.normalizedCode()).isPresent()) {
                throw conflict("TRACE_CODE_DUPLICATE", "追溯码已存在：" + code.traceCode());
            }
        }
        try { codeRepository.saveAll(staged); codeRepository.flush(); }
        catch (DataIntegrityViolationException exception) { throw conflict("TRACE_CODE_DUPLICATE", "追溯码发生并发重复，请重新核对"); }
        return receiptSummary(context, receipt, receiptLines);
    }

    @Transactional(readOnly = true)
    public ReceiptTraceSummaryView receiptSummary(Long receiptId) {
        ExecutionContext context = requireContext(); GoodsReceipt receipt = requireReceipt(context, receiptId);
        return receiptSummary(context, receipt,
                receiptLineRepository.findByTenantIdAndGoodsReceiptIdOrderBySortOrder(context.tenantId(), receiptId));
    }

    public void validateReceiptPosting(ExecutionContext context, GoodsReceipt receipt, List<GoodsReceiptLine> lines) {
        for (GoodsReceiptLine line : lines) {
            StockItem item = requireItem(context, line.stockItemId(), receipt.stockSiteId());
            if (!item.traceRequired() || line.acceptedQuantity() == null || line.acceptedQuantity().signum() == 0) continue;
            int expected = integerPackages(line.acceptedQuantity());
            List<InventoryTraceCode> codes = codeRepository.findByTenantIdAndGoodsReceiptLineIdOrderById(context.tenantId(), line.id());
            if (codes.size() != expected || codes.stream().anyMatch(code -> !"PENDING_RECEIPT".equals(code.status()))) {
                throw conflict("TRACE_REGISTRATION_INCOMPLETE", "追溯码登记未完成，不能批量入库");
            }
        }
    }

    public void activateReceiptCodes(ExecutionContext context, GoodsReceipt receipt, List<GoodsReceiptLine> lines,
                                     Map<Long, Long> lotIds) {
        for (GoodsReceiptLine line : lines) {
            for (InventoryTraceCode code : codeRepository.findByTenantIdAndGoodsReceiptLineIdOrderById(context.tenantId(), line.id())) {
                String from = code.status(); code.receive(line.destinationBinId(), lotIds.get(line.id()), receipt.id(),
                        receipt.receiptNo(), receipt.receivedAt(), context.subjectId());
                eventRepository.save(event(context, code, "RECEIVED", from, code.status(), null, receipt.stockSiteId(),
                        null, line.destinationBinId(), "GOODS_RECEIPT", receipt.id(), receipt.receiptNo(), null,
                        code.baseQuantity(), code.remainingBaseQuantity()));
            }
        }
    }

    public void issue(ExecutionContext context, Long siteId, String documentType, Long documentId, String documentNo,
                      List<TraceMovementLine> lines) {
        for (TraceMovementLine line : lines) {
            StockItem item = requireItem(context, line.stockItemId(), siteId); if (!item.traceRequired()) continue;
            List<InventoryTraceCode> selected = selectExact(codeRepository.lockAvailable(context.tenantId(), siteId,
                    line.stockItemId(), line.stockLotId()), line.baseQuantity(), "TRACE_CODE_STOCK_INSUFFICIENT");
            for (InventoryTraceCode code : selected) {
                String from = code.status(); Long fromBin = code.stockBinId(); BigDecimal before = code.remainingBaseQuantity();
                code.issue(documentType, documentId, documentNo, context.subjectId());
                eventRepository.save(event(context, code, "ISSUED", from, code.status(), siteId, siteId, fromBin, null,
                        documentType, documentId, documentNo, null, before.negate(), code.remainingBaseQuantity()));
            }
        }
    }

    public void dispatchTransfer(ExecutionContext context, Long siteId, Long transferId, String transferNo,
                                 List<TraceMovementLine> lines) {
        for (TraceMovementLine line : lines) {
            StockItem item = requireItem(context, line.stockItemId(), siteId); if (!item.traceRequired()) continue;
            List<InventoryTraceCode> selected = selectExact(codeRepository.lockAvailable(context.tenantId(), siteId,
                    line.stockItemId(), line.stockLotId()), line.baseQuantity(), "TRACE_CODE_STOCK_INSUFFICIENT");
            for (InventoryTraceCode code : selected) {
                String from = code.status(); Long fromBin = code.stockBinId(); code.dispatch(transferId, transferNo, context.subjectId());
                eventRepository.save(event(context, code, "TRANSFER_OUT", from, code.status(), siteId, null, fromBin,
                        null, "STOCK_TRANSFER", transferId, transferNo, null, BigDecimal.ZERO,
                        code.remainingBaseQuantity()));
            }
        }
    }

    public void receiveTransfer(ExecutionContext context, Long sourceSiteId, Long destinationSiteId,
                                Long transferId, String transferNo, List<TraceTransferReceiptLine> lines) {
        for (TraceTransferReceiptLine line : lines) {
            StockItem item = requireItem(context, line.destinationStockItemId(), destinationSiteId);
            if (!item.traceRequired()) continue;
            List<InventoryTraceCode> codes = codeRepository.lockTransferCodes(context.tenantId(), transferId, line.stockLotId());
            List<InventoryTraceCode> received = selectExact(codes, line.receivedBaseQuantity(), "TRACE_TRANSFER_QUANTITY_MISMATCH");
            Set<Long> used = received.stream().map(InventoryTraceCode::id).collect(java.util.stream.Collectors.toSet());
            List<InventoryTraceCode> remaining = codes.stream().filter(code -> !used.contains(code.id())).toList();
            List<InventoryTraceCode> damaged = selectExact(remaining, line.damagedBaseQuantity(), "TRACE_TRANSFER_QUANTITY_MISMATCH");
            for (InventoryTraceCode code : received) transferReceiveEvent(context, code, sourceSiteId,
                    destinationSiteId, line.destinationBinId(), item.id(), "AVAILABLE", transferId, transferNo);
            for (InventoryTraceCode code : damaged) transferReceiveEvent(context, code, sourceSiteId,
                    destinationSiteId, line.destinationBinId(), item.id(), "DAMAGED", transferId, transferNo);
        }
    }

    public void returnMedication(ExecutionContext context, Long siteId, Long originalDispenseId,
                                 Long returnId, String returnNo, List<TraceReturnLine> lines) {
        for (TraceReturnLine line : lines) {
            StockItem item = requireItem(context, line.stockItemId(), siteId); if (!item.traceRequired()) continue;
            List<InventoryTraceCode> selected = selectExact(codeRepository.lockIssuedDispenseCodes(context.tenantId(),
                    originalDispenseId, line.stockItemId(), line.stockLotId()), line.baseQuantity(),
                    "TRACE_RETURN_QUANTITY_MISMATCH");
            for (InventoryTraceCode code : selected) {
                String from = code.status(); BigDecimal before = code.remainingBaseQuantity();
                code.returnFromDispense(line.stockBinId(), line.targetStatus(),
                        returnId, returnNo, context.subjectId());
                eventRepository.save(event(context, code, "MEDICATION_RETURN", from, code.status(), siteId, siteId,
                        null, line.stockBinId(), "MEDICATION_RETURN", returnId, returnNo, null,
                        code.remainingBaseQuantity().subtract(before), code.remainingBaseQuantity()));
            }
        }
    }

    public Long openForSplit(ExecutionContext context, Long siteId, Long binId, Long itemId, Long lotId,
                             BigDecimal packageFactor, String documentType, Long documentId,
                             String documentNo, Instant occurredAt) {
        List<InventoryTraceCode> available = codeRepository.lockAvailableAtBin(
                context.tenantId(), siteId, binId, itemId, lotId);
        InventoryTraceCode code = available.stream()
                .filter(value -> value.remainingBaseQuantity().compareTo(packageFactor) == 0)
                .findFirst().orElseThrow(() -> conflict("TRACE_SEALED_PACKAGE_INSUFFICIENT",
                        "没有可与本次开包绑定的完整追溯码，请核对追溯码与包装换算"));
        String from = code.status();
        code.openForSplit(documentType, documentId == null ? code.id() : documentId, documentNo, context.subjectId());
        codeRepository.save(code);
        eventRepository.save(event(context, code, "SPLIT_OPEN", from, code.status(), siteId, siteId,
                binId, binId, documentType, documentId == null ? code.id() : documentId, documentNo,
                "追溯包装开包并绑定拆零台账", BigDecimal.ZERO, code.remainingBaseQuantity(), occurredAt));
        return code.id();
    }

    public void consumePartial(ExecutionContext context, Long traceCodeId, BigDecimal quantity,
                               Long documentId, String documentNo, Instant occurredAt) {
        InventoryTraceCode code = lockTrace(context, traceCodeId); String from = code.status();
        Long fromBin = code.stockBinId(); code.consumePartial(quantity, "MEDICATION_DISPENSE",
                documentId, documentNo, occurredAt, context.subjectId()); codeRepository.save(code);
        eventRepository.save(event(context, code, "PARTIAL_ISSUE", from, code.status(), code.stockSiteId(),
                code.stockSiteId(), fromBin, code.stockBinId(), "MEDICATION_DISPENSE", documentId, documentNo,
                "拆零发药按基本单位核销追溯码余量", quantity.negate(), code.remainingBaseQuantity(), occurredAt));
    }

    public void restorePartial(ExecutionContext context, Long traceCodeId, Long binId, BigDecimal quantity,
                               Long documentId, String documentNo, Instant occurredAt) {
        InventoryTraceCode code = lockTrace(context, traceCodeId); String from = code.status();
        Long fromBin = code.stockBinId(); code.restorePartial(binId, quantity, "MEDICATION_RETURN",
                documentId, documentNo, context.subjectId()); codeRepository.save(code);
        eventRepository.save(event(context, code, "PARTIAL_RETURN", from, code.status(), code.stockSiteId(),
                code.stockSiteId(), fromBin, binId, "MEDICATION_RETURN", documentId, documentNo,
                "可再销售拆零退药恢复追溯码余量", quantity, code.remainingBaseQuantity(), occurredAt));
    }

    @Transactional(readOnly = true)
    public List<TraceCodeView> search(Long siteId, String status, String query) {
        ExecutionContext context = requireContext(); requireSite(context, siteId);
        String state = clean(status); if (state != null) state = state.toUpperCase(Locale.ROOT);
        String term = clean(query);
        return codeRepository.search(context.tenantId(), siteId, state, term).stream().limit(500).map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public TraceDetailView detail(Long id) {
        ExecutionContext context = requireContext(); InventoryTraceCode code = codeRepository.findById(id)
                .filter(value -> value.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> notFound("TRACE_CODE_NOT_FOUND", "未找到追溯码"));
        requireSite(context, code.stockSiteId());
        return new TraceDetailView(view(code), eventRepository.findByTenantIdAndTraceCodeIdOrderByOccurredAtAsc(
                context.tenantId(), code.id()).stream().map(this::eventView).toList());
    }

    private void transferReceiveEvent(ExecutionContext c, InventoryTraceCode code, Long sourceSiteId,
                                      Long destinationSiteId, Long destinationBinId, Long destinationItemId,
                                      String targetStatus, Long transferId, String transferNo) {
        String from = code.status(); code.transferReceive(destinationSiteId, destinationBinId, destinationItemId,
                targetStatus, transferId, transferNo, c.subjectId());
        eventRepository.save(event(c, code, "DAMAGED".equals(targetStatus) ? "TRANSFER_DAMAGED" : "TRANSFER_IN",
                from, code.status(), sourceSiteId, destinationSiteId, null, destinationBinId,
                "STOCK_TRANSFER", transferId, transferNo, null, BigDecimal.ZERO, code.remainingBaseQuantity()));
    }

    private List<InventoryTraceCode> selectExact(List<InventoryTraceCode> candidates, BigDecimal required, String errorCode) {
        if (required == null || required.signum() == 0) return List.of();
        List<InventoryTraceCode> selected = new ArrayList<>(); BigDecimal total = BigDecimal.ZERO;
        for (InventoryTraceCode code : candidates) {
            if (total.compareTo(required) >= 0) break; selected.add(code); total = total.add(code.baseQuantity());
        }
        if (total.compareTo(required) != 0) throw conflict(errorCode,
                "追溯码对应数量与业务数量不一致，请核对是否整包装操作及追溯码是否完整");
        return selected;
    }

    private ReceiptTraceSummaryView receiptSummary(ExecutionContext c, GoodsReceipt receipt, List<GoodsReceiptLine> lines) {
        List<ReceiptTraceLineView> result = new ArrayList<>(); int required = 0; int registered = 0;
        for (GoodsReceiptLine line : lines) {
            StockItem item = requireItem(c, line.stockItemId(), receipt.stockSiteId());
            int count = codeRepository.findByTenantIdAndGoodsReceiptLineIdOrderById(c.tenantId(), line.id()).size();
            int expected = item.traceRequired() && line.acceptedQuantity() != null && line.acceptedQuantity().signum() > 0
                    ? integerPackages(line.acceptedQuantity()) : 0;
            required += expected; registered += count;
            result.add(new ReceiptTraceLineView(line.id(), line.stockItemId(), item.traceRequired(),
                    line.acceptedQuantity(), count, count == expected));
        }
        return new ReceiptTraceSummaryView(receipt.id(), required, registered, required == registered, result);
    }

    private InventoryTraceEvent event(ExecutionContext c, InventoryTraceCode code, String type, String from, String to,
                                      Long fromSite, Long toSite, Long fromBin, Long toBin, String documentType,
                                      Long documentId, String documentNo, String reason, BigDecimal quantityDelta,
                                      BigDecimal balanceAfter) {
        return event(c, code, type, from, to, fromSite, toSite, fromBin, toBin, documentType, documentId,
                documentNo, reason, quantityDelta, balanceAfter, java.time.Instant.now());
    }
    private InventoryTraceEvent event(ExecutionContext c, InventoryTraceCode code, String type, String from, String to,
                                      Long fromSite, Long toSite, Long fromBin, Long toBin, String documentType,
                                      Long documentId, String documentNo, String reason, BigDecimal quantityDelta,
                                      BigDecimal balanceAfter, java.time.Instant occurredAt) {
        return new InventoryTraceEvent(c.tenantId(), code.organizationId(), code.id(), type, from, to,
                fromSite, toSite, fromBin, toBin, documentType, documentId, documentNo, reason,
                quantityDelta, balanceAfter, occurredAt, c.subjectId());
    }
    private TraceCodeView view(InventoryTraceCode v) { return new TraceCodeView(v.id(), v.revision(), v.stockSiteId(),
            v.stockBinId(), v.stockItemId(), v.stockLotId(), v.goodsReceiptLineId(), v.traceCode(),
            v.productCodeSnapshot(), v.productNameSnapshot(), v.lotNoSnapshot(), v.packageQuantity(), v.baseQuantity(),
            v.remainingBaseQuantity(),
            v.status(), v.currentDocumentType(), v.currentDocumentId(), v.currentDocumentNo(), v.receivedAt(),
            v.issuedAt(), v.updatedAt()); }
    private TraceEventView eventView(InventoryTraceEvent v) { return new TraceEventView(v.id(), v.eventType(),
            v.fromStatus(), v.toStatus(), v.fromSiteId(), v.toSiteId(), v.fromBinId(), v.toBinId(),
            v.documentType(), v.documentId(), v.documentNo(), v.reason(), v.quantityDelta(), v.balanceAfter(),
            v.occurredAt(), v.occurredBy()); }
    private InventoryTraceCode lockTrace(ExecutionContext c, Long id) {
        return codeRepository.lockByTenantIdAndId(c.tenantId(), id)
                .orElseThrow(() -> notFound("TRACE_CODE_NOT_FOUND", "未找到追溯码"));
    }
    private GoodsReceipt lockReceipt(ExecutionContext c, Long id) { GoodsReceipt value = receiptRepository.lockByIdAndTenantId(id, c.tenantId())
            .orElseThrow(() -> notFound("GOODS_RECEIPT_NOT_FOUND", "未找到到货单")); requireSite(c, value.stockSiteId()); return value; }
    private GoodsReceipt requireReceipt(ExecutionContext c, Long id) { GoodsReceipt value = receiptRepository.findById(id)
            .filter(v -> v.tenantId().equals(c.tenantId())).orElseThrow(() -> notFound("GOODS_RECEIPT_NOT_FOUND", "未找到到货单")); requireSite(c, value.stockSiteId()); return value; }
    private StockSite requireSite(ExecutionContext c, Long id) { StockSite value = siteRepository.findByIdAndTenantId(id, c.tenantId())
            .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
        if (!c.canAccessOrganization(value.organizationId())) throw badRequest("PHARMACY_ORGANIZATION_SCOPE_INVALID", "当前上下文不能访问该机构库存"); return value; }
    private StockItem requireItem(ExecutionContext c, Long id, Long siteId) { StockItem value = itemRepository.findByIdAndTenantId(id, c.tenantId())
            .orElseThrow(() -> notFound("STOCK_ITEM_NOT_FOUND", "未找到库房经营项目"));
        if (!siteId.equals(value.stockSiteId())) throw badRequest("STOCK_ITEM_SITE_MISMATCH", "经营项目不属于当前库存站点"); return value; }
    private int integerPackages(BigDecimal quantity) { if (quantity == null || quantity.signum() <= 0) return 0;
        try { return quantity.intValueExact(); } catch (ArithmeticException exception) {
            throw badRequest("TRACE_PACKAGE_QUANTITY_INVALID", "启用追溯的入库明细必须按完整包装验收"); } }
    private List<String> normalizeInput(List<String> values) { if (values == null) return List.of();
        return values.stream().map(this::clean).filter(java.util.Objects::nonNull).toList(); }
    private String normalize(String value) { String result = clean(value); if (result == null) throw badRequest("TRACE_CODE_EMPTY", "追溯码不能为空");
        if (result.length() > 256) throw badRequest("TRACE_CODE_TOO_LONG", "追溯码不能超过256个字符");
        return result.replaceAll("\\s+", "").toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private ExecutionContext requireContext() { ExecutionContext c = contextProvider.requireCurrent();
        if (!c.hasWorkContext()) throw badRequest("PHARMACY_WORK_CONTEXT_REQUIRED", "库存操作必须选择工作机构和科室"); return c; }

    public record RegisterReceiptLineCommand(Long goodsReceiptLineId, List<String> traceCodes) {}
    public record RegisterReceiptCodesCommand(List<RegisterReceiptLineCommand> lines) {}
    public record TraceMovementLine(Long stockItemId, Long stockLotId, BigDecimal baseQuantity) {}
    public record TraceTransferReceiptLine(Long destinationStockItemId, Long stockLotId, Long destinationBinId,
                                           BigDecimal receivedBaseQuantity, BigDecimal damagedBaseQuantity) {}
    public record TraceReturnLine(Long stockItemId, Long stockLotId, Long stockBinId,
                                  BigDecimal baseQuantity, String targetStatus) {}
}
