package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryEventView;
import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryLineView;
import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryView;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.domain.WardDelivery;
import com.rhn.pharmacy.domain.WardDeliveryEvent;
import com.rhn.pharmacy.domain.WardDeliveryLine;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryEventRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryLineRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class WardDeliveryApplicationService {
    private static final Set<String> OPEN_STATUSES = Set.of("PENDING_DISPATCH", "IN_TRANSIT", "DISCREPANCY");
    private static final Set<String> STATUSES = Set.of(
            "PENDING_DISPATCH", "IN_TRANSIT", "RECEIVED", "DISCREPANCY", "RESOLVED");
    private static final Set<String> RESOLUTION_CODES = Set.of(
            "SUPPLEMENTED", "RETURNED_TO_PHARMACY", "ACCEPTED_VARIANCE");

    private final WardDeliveryRepository deliveries;
    private final WardDeliveryLineRepository lines;
    private final WardDeliveryEventRepository events;
    private final MedicationDispenseRepository dispenses;
    private final DispenseTaskRepository tasks;
    private final StockSiteRepository sites;
    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contextProvider;

    public WardDeliveryApplicationService(WardDeliveryRepository deliveries,
                                          WardDeliveryLineRepository lines,
                                          WardDeliveryEventRepository events,
                                          MedicationDispenseRepository dispenses,
                                          DispenseTaskRepository tasks,
                                          StockSiteRepository sites,
                                          JdbcTemplate jdbc,
                                          ExecutionContextProvider contextProvider) {
        this.deliveries = deliveries; this.lines = lines; this.events = events;
        this.dispenses = dispenses; this.tasks = tasks; this.sites = sites;
        this.jdbc = jdbc; this.contextProvider = contextProvider;
    }

    @Transactional
    public WardDeliveryView create(CreateWardDeliveryCommand input) {
        ExecutionContext context = requireContext();
        String deliveryNo = required(input.deliveryNo(), "WARD_DELIVERY_NO_REQUIRED", "配送交接单号不能为空", 64);
        List<Long> dispenseIds = normalizedIds(input.dispenseIds());
        WardDelivery existing = deliveries.findByTenantIdAndDeliveryNo(context.tenantId(), deliveryNo).orElse(null);
        if (existing != null) {
            Set<Long> existingIds = lines.findByTenantIdAndDeliveryIdOrderById(context.tenantId(), existing.id())
                    .stream().map(WardDeliveryLine::dispenseId).collect(java.util.stream.Collectors.toSet());
            if (!existingIds.equals(new HashSet<>(dispenseIds))) {
                throw conflict("WARD_DELIVERY_NO_REUSED", "配送交接单号已用于其他发药记录");
            }
            return view(existing);
        }

        List<DeliveryCandidate> candidates = new ArrayList<>();
        for (Long dispenseId : dispenseIds) candidates.add(candidate(context, dispenseId));
        DeliveryCandidate first = candidates.getFirst();
        if (candidates.stream().anyMatch(value -> !value.stockSite().id().equals(first.stockSite().id())
                || !value.destination().organizationId().equals(first.destination().organizationId())
                || !value.destination().nursingUnitDepartmentId()
                .equals(first.destination().nursingUnitDepartmentId()))) {
            throw badRequest("WARD_DELIVERY_SCOPE_MIXED", "同一配送交接单只能包含同一药房送往同一病区的药品");
        }
        WardDelivery delivery = deliveries.save(new WardDelivery(context.tenantId(), first.destination().organizationId(),
                first.stockSite().id(), first.destination().nursingUnitDepartmentId(), deliveryNo,
                first.stockSite().name(), first.destination().nursingUnitName(), context.subjectId(), Instant.now()));
        for (DeliveryCandidate value : candidates) {
            lines.save(new WardDeliveryLine(context.tenantId(), delivery.id(), value.dispense().id(),
                    value.dispense().residentId(), value.dispense().encounterId(), value.destination().residentName(),
                    value.destination().medicationName(), value.dispense().operationQuantity(),
                    value.dispense().operationUnitCode()));
        }
        events.save(new WardDeliveryEvent(context.tenantId(), delivery.id(), "CREATED", null,
                delivery.status(), "CREATE:" + deliveryNo, delivery.createdAt(), context.subjectId(), clean(input.note(), 1000)));
        deliveries.flush(); lines.flush(); events.flush();
        return view(delivery);
    }

    @Transactional(readOnly = true)
    public List<WardDeliveryView> list(String status, Long nursingUnitDepartmentId, Long encounterId) {
        ExecutionContext context = requireContext();
        Collection<String> statuses = statuses(status);
        List<WardDelivery> values = statuses.isEmpty()
                ? deliveries.findByTenantIdAndOrganizationIdOrderByCreatedAtDesc(context.tenantId(), context.organizationId())
                : deliveries.findByTenantIdAndOrganizationIdAndStatusInOrderByCreatedAtDesc(
                        context.tenantId(), context.organizationId(), statuses);
        if (nursingUnitDepartmentId != null) values = values.stream()
                .filter(value -> nursingUnitDepartmentId.equals(value.nursingUnitDepartmentId())).toList();
        if (encounterId != null) {
            if (values.isEmpty()) return List.of();
            Set<Long> deliveryIds = lines.findByTenantIdAndDeliveryIdInOrderByDeliveryIdAscIdAsc(
                            context.tenantId(), values.stream().map(WardDelivery::id).toList()).stream()
                    .filter(value -> encounterId.equals(value.encounterId())).map(WardDeliveryLine::deliveryId)
                    .collect(java.util.stream.Collectors.toSet());
            values = values.stream().filter(value -> deliveryIds.contains(value.id())).toList();
        }
        return views(values);
    }

    @Transactional(readOnly = true)
    public WardDeliveryView get(Long deliveryId) {
        ExecutionContext context = requireContext();
        return view(requireDelivery(context, deliveryId));
    }

    @Transactional
    public WardDeliveryView dispatch(Long deliveryId, TransitionCommand input) {
        ExecutionContext context = requireContext();
        String command = required(input.commandCode(), "WARD_DELIVERY_COMMAND_REQUIRED", "送出请求号不能为空", 128);
        WardDeliveryEvent existing = events.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (existing != null) return replay(context, deliveryId, existing, "DISPATCHED");
        WardDelivery delivery = lockDelivery(context, deliveryId);
        Instant now = Instant.now(); String previous = delivery.dispatch(input.expectedRevision(), context.subjectId(), now,
                clean(input.note(), 1000));
        events.save(new WardDeliveryEvent(context.tenantId(), delivery.id(), "DISPATCHED", previous,
                delivery.status(), command, now, context.subjectId(), clean(input.note(), 1000)));
        deliveries.flush(); events.flush(); return view(delivery);
    }

    @Transactional
    public WardDeliveryView receive(Long deliveryId, ReceiveWardDeliveryCommand input) {
        ExecutionContext context = requireContext();
        String command = required(input.commandCode(), "WARD_DELIVERY_COMMAND_REQUIRED", "签收请求号不能为空", 128);
        WardDeliveryEvent existing = events.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (existing != null) {
            if (!Set.of("RECEIVED", "DISCREPANCY_RECORDED").contains(existing.eventType())) {
                throw conflict("WARD_DELIVERY_COMMAND_REUSED", "签收请求号已用于其他交接操作");
            }
            return replay(context, deliveryId, existing, existing.eventType());
        }
        WardDelivery delivery = lockDelivery(context, deliveryId);
        List<WardDeliveryLine> deliveryLines = lines.findByTenantIdAndDeliveryIdOrderById(context.tenantId(), delivery.id());
        Map<Long, ReceiptLineCommand> inputs = new HashMap<>();
        if (input.lines() != null) for (ReceiptLineCommand value : input.lines()) {
            if (value == null || value.lineId() == null || inputs.put(value.lineId(), value) != null) {
                throw badRequest("WARD_DELIVERY_RECEIPT_LINE_DUPLICATE", "签收明细不能为空或重复");
            }
        }
        if (inputs.size() != deliveryLines.size()
                || deliveryLines.stream().anyMatch(value -> !inputs.containsKey(value.id()))) {
            throw badRequest("WARD_DELIVERY_RECEIPT_INCOMPLETE", "签收必须逐项核对本交接单全部药品");
        }
        boolean discrepancy = false; List<String> discrepancyDescriptions = new ArrayList<>();
        for (WardDeliveryLine line : deliveryLines) {
            ReceiptLineCommand value = inputs.get(line.id());
            boolean lineDiscrepancy = line.receive(value.receivedQuantity(), clean(value.discrepancyCode(), 32),
                    clean(value.discrepancyNote(), 1000));
            if (lineDiscrepancy) {
                discrepancy = true;
                discrepancyDescriptions.add(line.residentNameSnapshot() + " / " + line.medicationNameSnapshot()
                        + "：" + line.discrepancyNote());
            }
        }
        Instant now = Instant.now(); String discrepancyNote = discrepancy
                ? String.join("；", discrepancyDescriptions) : null;
        String previous = delivery.receive(input.expectedRevision(), context.subjectId(), now, discrepancy,
                clean(input.note(), 1000), discrepancyNote);
        String eventType = discrepancy ? "DISCREPANCY_RECORDED" : "RECEIVED";
        events.save(new WardDeliveryEvent(context.tenantId(), delivery.id(), eventType, previous,
                delivery.status(), command, now, context.subjectId(), discrepancy ? discrepancyNote : clean(input.note(), 1000)));
        lines.flush(); deliveries.flush(); events.flush(); return view(delivery);
    }

    @Transactional
    public WardDeliveryView resolve(Long deliveryId, ResolveWardDeliveryCommand input) {
        ExecutionContext context = requireContext();
        String command = required(input.commandCode(), "WARD_DELIVERY_COMMAND_REQUIRED", "差异处置请求号不能为空", 128);
        WardDeliveryEvent existing = events.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (existing != null) return replay(context, deliveryId, existing, "RESOLVED");
        String code = required(input.resolutionCode(), "WARD_DELIVERY_RESOLUTION_REQUIRED", "差异处置方式不能为空", 32)
                .toUpperCase(Locale.ROOT);
        if (!RESOLUTION_CODES.contains(code)) {
            throw badRequest("WARD_DELIVERY_RESOLUTION_INVALID", "差异处置方式不合法");
        }
        String note = required(input.note(), "WARD_DELIVERY_RESOLUTION_NOTE_REQUIRED", "差异处置说明不能为空", 1000);
        WardDelivery delivery = lockDelivery(context, deliveryId); Instant now = Instant.now();
        String previous = delivery.resolve(input.expectedRevision(), context.subjectId(), now, code, note);
        events.save(new WardDeliveryEvent(context.tenantId(), delivery.id(), "RESOLVED", previous,
                delivery.status(), command, now, context.subjectId(), note));
        deliveries.flush(); events.flush(); return view(delivery);
    }

    private DeliveryCandidate candidate(ExecutionContext context, Long dispenseId) {
        MedicationDispense dispense = dispenses.lockByIdAndTenantId(dispenseId, context.tenantId())
                .orElseThrow(() -> notFound("WARD_DELIVERY_DISPENSE_NOT_FOUND", "待配送发药记录不存在"));
        if (!Set.of("DISPENSE", "REDISPENSE").contains(dispense.dispenseType())) {
            throw badRequest("WARD_DELIVERY_DISPENSE_INVALID", "退药记录不能创建病区配送交接");
        }
        if (lines.existsByTenantIdAndDispenseId(context.tenantId(), dispense.id())) {
            throw conflict("WARD_DELIVERY_DISPENSE_DUPLICATE", "该发药记录已进入病区配送交接");
        }
        DispenseTask task = tasks.findByIdAndTenantId(dispense.taskId(), context.tenantId())
                .orElseThrow(() -> notFound("WARD_DELIVERY_TASK_NOT_FOUND", "发药任务不存在"));
        if (!"INPATIENT".equals(task.taskType())) {
            throw badRequest("WARD_DELIVERY_TASK_NOT_INPATIENT", "只有住院发药可以创建病区配送交接");
        }
        StockSite site = sites.findByIdAndTenantId(dispense.stockSiteId(), context.tenantId())
                .orElseThrow(() -> notFound("WARD_DELIVERY_SITE_NOT_FOUND", "发药药房不存在"));
        if (!context.canAccessOrganization(site.organizationId())) {
            throw forbidden("WARD_DELIVERY_SCOPE_DENIED", "发药记录不属于当前机构");
        }
        Destination destination = destination(context.tenantId(), dispense.id());
        if (!site.organizationId().equals(destination.organizationId())) {
            throw conflict("WARD_DELIVERY_ORGANIZATION_MISMATCH", "发药药房与住院病区不属于同一机构");
        }
        return new DeliveryCandidate(dispense, site, destination);
    }

    private Destination destination(Long tenantId, Long dispenseId) {
        List<Destination> values = jdbc.query("""
                select e.ID_ORG as organization_id, sl.ID_DEPT as department_id, d.NA_DEPT as nursing_unit_name,
                       r.NA_FULL as resident_name, dtl.NA_PRODUCT_SNAP as medication_name from RHN_SUP_MED_DISP md
                  join RHN_VIS_ENC e on e.ID_TNT = md.ID_TNT and e.ID_ENC = md.ID_ENC
                  join RHN_VIS_SVC_LOC sl on sl.ID_TNT = e.ID_TNT and sl.ID_SVC_LOC = e.ID_SVC_LOC
                  join RHN_SYS_DEPT d on d.ID_TNT = e.ID_TNT and d.ID_ORG = e.ID_ORG
                       and d.ID_DEPT = sl.ID_DEPT
                  join RHN_PI_PAT r on r.ID_TNT = md.ID_TNT and r.ID_PAT = md.ID_PAT
                  join RHN_SUP_MED_DISP_LINE mdl on mdl.ID_TNT = md.ID_TNT
                       and mdl.ID_MED_DISP = md.ID_MED_DISP
                  join RHN_SUP_DISP_TASK_LINE dtl on dtl.ID_TNT = mdl.ID_TNT and dtl.ID_DISP_TASK_LINE = mdl.ID_DISP_TASK_LINE
                 where md.ID_TNT = ? and md.ID_MED_DISP = ?
                 order by mdl.SN_SORT
                """, (rs, rowNum) -> new Destination(rs.getLong("organization_id"),
                rs.getLong("department_id"), rs.getString("nursing_unit_name"),
                rs.getString("resident_name"), rs.getString("medication_name")), tenantId, dispenseId);
        if (values.isEmpty() || values.getFirst().nursingUnitDepartmentId() == 0) {
            throw conflict("WARD_DELIVERY_DESTINATION_MISSING", "住院患者当前病区不完整，不能创建配送交接");
        }
        Destination first = values.getFirst();
        if (values.stream().anyMatch(value -> !value.medicationName().equals(first.medicationName()))) {
            throw conflict("WARD_DELIVERY_MULTI_MEDICATION_UNSUPPORTED", "单次发药包含多个药品，请拆分配送交接");
        }
        return first;
    }

    private WardDeliveryView replay(ExecutionContext context, Long deliveryId, WardDeliveryEvent event,
                                    String expectedType) {
        if (!deliveryId.equals(event.deliveryId()) || !expectedType.equals(event.eventType())) {
            throw conflict("WARD_DELIVERY_COMMAND_REUSED", "业务请求号已用于其他交接操作");
        }
        return view(requireDelivery(context, deliveryId));
    }

    private WardDelivery lockDelivery(ExecutionContext context, Long deliveryId) {
        WardDelivery delivery = deliveries.lockByIdAndTenantId(deliveryId, context.tenantId())
                .orElseThrow(() -> notFound("WARD_DELIVERY_NOT_FOUND", "病区配送交接单不存在"));
        requireScope(context, delivery); return delivery;
    }

    private WardDelivery requireDelivery(ExecutionContext context, Long deliveryId) {
        WardDelivery delivery = deliveries.findByIdAndTenantId(deliveryId, context.tenantId())
                .orElseThrow(() -> notFound("WARD_DELIVERY_NOT_FOUND", "病区配送交接单不存在"));
        requireScope(context, delivery); return delivery;
    }

    private void requireScope(ExecutionContext context, WardDelivery delivery) {
        if (!context.canAccessOrganization(delivery.organizationId())) {
            throw forbidden("WARD_DELIVERY_SCOPE_DENIED", "病区配送交接单不属于当前机构");
        }
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) {
            throw badRequest("WARD_DELIVERY_WORK_CONTEXT_REQUIRED", "病区配送交接必须选择工作机构");
        }
        return context;
    }

    private List<WardDeliveryView> views(List<WardDelivery> values) {
        if (values.isEmpty()) return List.of();
        ExecutionContext context = contextProvider.requireCurrent();
        List<Long> ids = values.stream().map(WardDelivery::id).toList();
        Map<Long, List<WardDeliveryLine>> lineMap = lines
                .findByTenantIdAndDeliveryIdInOrderByDeliveryIdAscIdAsc(context.tenantId(), ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(WardDeliveryLine::deliveryId));
        Map<Long, List<WardDeliveryEvent>> eventMap = events
                .findByTenantIdAndDeliveryIdInOrderByOccurredAtAscIdAsc(context.tenantId(), ids).stream()
                .collect(java.util.stream.Collectors.groupingBy(WardDeliveryEvent::deliveryId));
        return values.stream().map(value -> view(value,
                lineMap.getOrDefault(value.id(), List.of()), eventMap.getOrDefault(value.id(), List.of()))).toList();
    }

    private WardDeliveryView view(WardDelivery delivery) {
        return view(delivery, lines.findByTenantIdAndDeliveryIdOrderById(delivery.tenantId(), delivery.id()),
                events.findByTenantIdAndDeliveryIdInOrderByOccurredAtAscIdAsc(
                        delivery.tenantId(), List.of(delivery.id())));
    }

    private WardDeliveryView view(WardDelivery delivery, List<WardDeliveryLine> deliveryLines,
                                  List<WardDeliveryEvent> deliveryEvents) {
        return new WardDeliveryView(delivery.id(), delivery.revision(), delivery.organizationId(),
                delivery.stockSiteId(), delivery.nursingUnitDepartmentId(), delivery.deliveryNo(), delivery.status(),
                delivery.stockSiteNameSnapshot(), delivery.nursingUnitNameSnapshot(), delivery.createdAt(),
                delivery.createdBy(), delivery.dispatchedAt(), delivery.dispatchedBy(), delivery.dispatchNote(),
                delivery.receivedAt(), delivery.receivedBy(), delivery.receiptNote(), delivery.discrepancyNote(),
                delivery.resolvedAt(), delivery.resolvedBy(), delivery.resolutionCode(), delivery.resolutionNote(),
                deliveryLines.stream().sorted(Comparator.comparing(WardDeliveryLine::id)).map(value ->
                        new WardDeliveryLineView(value.id(), value.dispenseId(), value.residentId(), value.encounterId(),
                                value.residentNameSnapshot(), value.medicationNameSnapshot(), value.expectedQuantity(),
                                value.receivedQuantity(), value.unitCode(), value.status(), value.discrepancyCode(),
                                value.discrepancyNote())).toList(),
                deliveryEvents.stream().map(value -> new WardDeliveryEventView(value.id(), value.eventType(),
                        value.fromStatus(), value.toStatus(), value.commandCode(), value.occurredAt(),
                        value.occurredBy(), value.note())).toList());
    }

    private static List<Long> normalizedIds(List<Long> values) {
        if (values == null || values.isEmpty() || values.size() > 100 || values.stream().anyMatch(value -> value == null)) {
            throw badRequest("WARD_DELIVERY_DISPENSES_REQUIRED", "请选择 1 至 100 条住院发药记录");
        }
        List<Long> result = values.stream().distinct().sorted().toList();
        if (result.size() != values.size()) throw badRequest("WARD_DELIVERY_DISPENSE_DUPLICATE", "发药记录不能重复");
        return result;
    }

    private static Collection<String> statuses(String value) {
        if (value == null || value.isBlank() || "ALL".equalsIgnoreCase(value)) return List.of();
        if ("OPEN".equalsIgnoreCase(value)) return OPEN_STATUSES;
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(normalized)) throw badRequest("WARD_DELIVERY_STATUS_INVALID", "配送交接状态不合法");
        return List.of(normalized);
    }

    private static String required(String value, String code, String message, int max) {
        String result = clean(value, max);
        if (result == null) throw badRequest(code, message);
        return result;
    }

    private static String clean(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw badRequest("WARD_DELIVERY_TEXT_TOO_LONG", "交接信息长度超过限制");
        return result;
    }

    public record CreateWardDeliveryCommand(String deliveryNo, List<Long> dispenseIds, String note) {}
    public record TransitionCommand(long expectedRevision, String commandCode, String note) {}
    public record ReceiptLineCommand(Long lineId, BigDecimal receivedQuantity,
                                     String discrepancyCode, String discrepancyNote) {}
    public record ReceiveWardDeliveryCommand(long expectedRevision, String commandCode,
                                             String note, List<ReceiptLineCommand> lines) {}
    public record ResolveWardDeliveryCommand(long expectedRevision, String commandCode,
                                             String resolutionCode, String note) {}
    private record DeliveryCandidate(MedicationDispense dispense, StockSite stockSite, Destination destination) {}
    private record Destination(Long organizationId, Long nursingUnitDepartmentId, String nursingUnitName,
                               String residentName, String medicationName) {}
}
