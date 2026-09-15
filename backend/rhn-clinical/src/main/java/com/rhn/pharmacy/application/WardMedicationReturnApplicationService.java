package com.rhn.pharmacy.application;

import com.rhn.pharmacy.api.PharmacyViews.StockReturnView;
import com.rhn.pharmacy.api.WardMedicationReturnViews.ReturnableMedicationLineView;
import com.rhn.pharmacy.api.WardMedicationReturnViews.WardMedicationReturnEventView;
import com.rhn.pharmacy.api.WardMedicationReturnViews.WardMedicationReturnLineView;
import com.rhn.pharmacy.api.WardMedicationReturnViews.WardMedicationReturnRequestView;
import com.rhn.pharmacy.domain.DispenseTask;
import com.rhn.pharmacy.domain.DispenseTaskLine;
import com.rhn.pharmacy.domain.MedicationDispense;
import com.rhn.pharmacy.domain.MedicationDispenseLine;
import com.rhn.pharmacy.domain.StockItem;
import com.rhn.pharmacy.domain.StockSite;
import com.rhn.pharmacy.domain.WardDelivery;
import com.rhn.pharmacy.domain.WardDeliveryLine;
import com.rhn.pharmacy.domain.WardMedicationReturnEvent;
import com.rhn.pharmacy.domain.WardMedicationReturnLine;
import com.rhn.pharmacy.domain.WardMedicationReturnRequest;
import com.rhn.pharmacy.infrastructure.DispenseTaskLineRepository;
import com.rhn.pharmacy.infrastructure.DispenseTaskRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseConsumptionRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseLineRepository;
import com.rhn.pharmacy.infrastructure.MedicationDispenseRepository;
import com.rhn.pharmacy.infrastructure.StockItemRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryLineRepository;
import com.rhn.pharmacy.infrastructure.WardDeliveryRepository;
import com.rhn.pharmacy.infrastructure.WardMedicationReturnEventRepository;
import com.rhn.pharmacy.infrastructure.WardMedicationReturnLineRepository;
import com.rhn.pharmacy.infrastructure.WardMedicationReturnRequestRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.pharmacy.application.DispenseApplicationService.ReturnCommand;
import static com.rhn.pharmacy.application.DispenseApplicationService.ReturnLineCommand;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class WardMedicationReturnApplicationService {
    private static final Set<String> RECEIVED_DELIVERY_STATUSES = Set.of("RECEIVED", "RESOLVED");
    private static final Set<String> REQUEST_STATUSES = Set.of("REQUESTED", "IN_TRANSIT", "RECEIVED");
    private static final Set<String> DISPOSITIONS = Set.of("RESTOCK", "QUARANTINE", "DESTROY");

    private final WardMedicationReturnRequestRepository requests;
    private final WardMedicationReturnLineRepository requestLines;
    private final WardMedicationReturnEventRepository requestEvents;
    private final MedicationDispenseRepository dispenses;
    private final MedicationDispenseLineRepository dispenseLines;
    private final MedicationDispenseConsumptionRepository consumptions;
    private final DispenseTaskRepository dispenseTasks;
    private final DispenseTaskLineRepository dispenseTaskLines;
    private final WardDeliveryRepository deliveries;
    private final WardDeliveryLineRepository deliveryLines;
    private final StockSiteRepository stockSites;
    private final StockItemRepository stockItems;
    private final DispenseApplicationService dispenseService;
    private final ExecutionContextProvider contextProvider;
    private final EntityManager entityManager;

    public WardMedicationReturnApplicationService(
            WardMedicationReturnRequestRepository requests,
            WardMedicationReturnLineRepository requestLines,
            WardMedicationReturnEventRepository requestEvents,
            MedicationDispenseRepository dispenses,
            MedicationDispenseLineRepository dispenseLines,
            MedicationDispenseConsumptionRepository consumptions,
            DispenseTaskRepository dispenseTasks,
            DispenseTaskLineRepository dispenseTaskLines,
            WardDeliveryRepository deliveries,
            WardDeliveryLineRepository deliveryLines,
            StockSiteRepository stockSites,
            StockItemRepository stockItems,
            DispenseApplicationService dispenseService,
            ExecutionContextProvider contextProvider,
            EntityManager entityManager) {
        this.requests = requests;
        this.requestLines = requestLines;
        this.requestEvents = requestEvents;
        this.dispenses = dispenses;
        this.dispenseLines = dispenseLines;
        this.consumptions = consumptions;
        this.dispenseTasks = dispenseTasks;
        this.dispenseTaskLines = dispenseTaskLines;
        this.deliveries = deliveries;
        this.deliveryLines = deliveryLines;
        this.stockSites = stockSites;
        this.stockItems = stockItems;
        this.dispenseService = dispenseService;
        this.contextProvider = contextProvider;
        this.entityManager = entityManager;
    }

    @Transactional(readOnly = true)
    public List<ReturnableMedicationLineView> returnable(Long encounterId) {
        ExecutionContext context = requireWardContext();
        if (encounterId == null) throw badRequest("WARD_MED_RETURN_ENCOUNTER_REQUIRED", "住院接触不能为空");
        List<ReturnableMedicationLineView> result = new ArrayList<>();
        for (MedicationDispense dispense : dispenses.findByTenantIdAndEncounterIdOrderByOccurredAtAscIdAsc(
                context.tenantId(), encounterId)) {
            if (!Set.of("DISPENSE", "REDISPENSE").contains(dispense.dispenseType())) continue;
            for (MedicationDispenseLine line : dispenseLines
                    .findByTenantIdAndMedicationDispenseIdOrderBySortOrder(context.tenantId(), dispense.id())) {
                ReturnableDetail detail = detail(context, line, false);
                if (detail == null || detail.availableBase().signum() <= 0) continue;
                result.add(detail.view());
            }
        }
        return List.copyOf(result);
    }

    @Transactional
    public WardMedicationReturnRequestView create(CreateReturnRequestCommand input) {
        ExecutionContext context = requireWardContext();
        String command = required(input.commandCode(), "WARD_MED_RETURN_COMMAND_REQUIRED", "退药申请请求号不能为空");
        if (input.encounterId() == null) throw badRequest("WARD_MED_RETURN_ENCOUNTER_REQUIRED", "住院接触不能为空");
        if (input.lines() == null || input.lines().isEmpty()) {
            throw badRequest("WARD_MED_RETURN_LINES_REQUIRED", "退药申请至少需要一条药品明细");
        }
        List<CreateReturnLineCommand> normalized = input.lines().stream()
                .sorted(Comparator.comparing(CreateReturnLineCommand::originalDispenseLineId)).toList();
        if (normalized.stream().map(CreateReturnLineCommand::originalDispenseLineId).anyMatch(java.util.Objects::isNull)
                || normalized.stream().map(CreateReturnLineCommand::originalDispenseLineId).distinct().count()
                != normalized.size()) {
            throw badRequest("WARD_MED_RETURN_LINE_DUPLICATE", "退药申请明细不能为空或重复");
        }
        String hash = hash("CREATE", input.encounterId(), normalized.stream()
                .map(value -> value.originalDispenseLineId() + ":" + decimal(value.quantity())).toList(), clean(input.note()));
        WardMedicationReturnRequestView replay = replay(context, null, command, "CREATED", hash);
        if (replay != null) return replay;

        List<RequestedDetail> details = new ArrayList<>();
        for (CreateReturnLineCommand value : normalized) {
            MedicationDispenseLine locked = entityManager.find(MedicationDispenseLine.class,
                    value.originalDispenseLineId(), LockModeType.PESSIMISTIC_WRITE);
            if (locked == null || !context.tenantId().equals(locked.tenantId())) {
                throw notFound("WARD_MED_RETURN_DISPENSE_LINE_NOT_FOUND", "原发药批次明细不存在");
            }
            ReturnableDetail detail = detail(context, locked, true);
            if (!input.encounterId().equals(detail.dispense().encounterId())) {
                throw badRequest("WARD_MED_RETURN_ENCOUNTER_MISMATCH", "退药明细不属于当前住院接触");
            }
            BigDecimal quantity = positive(value.quantity(), "WARD_MED_RETURN_QUANTITY_INVALID", "退药申请数量必须大于零");
            BigDecimal requestedBase = quantity.multiply(locked.baseQuantityFactor());
            if (requestedBase.compareTo(detail.availableBase()) > 0) {
                throw conflict("WARD_MED_RETURN_EXCEEDS_AVAILABLE",
                        "退药申请数量超过病区当前可退余量；可退 %s %s".formatted(
                                decimal(detail.availableQuantity()), locked.dispenseUnitCode()));
            }
            details.add(new RequestedDetail(detail, quantity, requestedBase));
        }
        ReturnableDetail first = details.getFirst().detail();
        boolean mixed = details.stream().map(RequestedDetail::detail).anyMatch(value ->
                !value.dispense().residentId().equals(first.dispense().residentId())
                        || !value.dispense().encounterId().equals(first.dispense().encounterId())
                        || !value.dispense().stockSiteId().equals(first.dispense().stockSiteId())
                        || !value.delivery().nursingUnitDepartmentId()
                        .equals(first.delivery().nursingUnitDepartmentId()));
        if (mixed) throw badRequest("WARD_MED_RETURN_SCOPE_MIXED", "同一退药申请只能包含同一患者、病区和药房的药品");

        WardMedicationReturnRequest request = requests.save(new WardMedicationReturnRequest(
                context.tenantId(), first.delivery().organizationId(), first.dispense().stockSiteId(),
                first.delivery().nursingUnitDepartmentId(), first.dispense().residentId(),
                first.dispense().encounterId(), context.subjectId(), clean(input.note())));
        for (RequestedDetail value : details) {
            ReturnableDetail detail = value.detail();
            requestLines.save(new WardMedicationReturnLine(request, detail.taskLine().requestId(),
                    detail.dispense().id(), detail.line().id(), detail.line().taskLineId(),
                    detail.taskLine().productNameSnapshot(), value.quantity(), detail.line().dispenseUnitCode(),
                    value.baseQuantity(), detail.stockItem().baseUnitCode()));
        }
        requestEvents.save(new WardMedicationReturnEvent(request, "CREATED", null, command, hash,
                context.subjectId(), clean(input.note())));
        requests.flush();
        requestLines.flush();
        requestEvents.flush();
        return view(request);
    }

    @Transactional
    public WardMedicationReturnRequestView handOver(Long requestId, TransitionCommand input) {
        ExecutionContext context = requireWardContext();
        String command = required(input.commandCode(), "WARD_MED_RETURN_COMMAND_REQUIRED", "交出请求号不能为空");
        String hash = hash("HANDOVER", requestId, clean(input.note()));
        WardMedicationReturnRequestView replay = replay(context, requestId, command, "HANDED_OVER", hash);
        if (replay != null) return replay;
        WardMedicationReturnRequest request = lockRequest(context, requestId);
        requireWardScope(context, request);
        request.requireRevision(input.expectedRevision());
        for (WardMedicationReturnLine line : lines(context, request.id())) {
            MedicationDispenseLine original = entityManager.find(MedicationDispenseLine.class,
                    line.originalDispenseLineId(), LockModeType.PESSIMISTIC_WRITE);
            ReturnableDetail detail = detail(context, original, true);
            BigDecimal physicalRemaining = detail.signedBase().subtract(detail.returnedBase())
                    .subtract(detail.consumedBase()).max(BigDecimal.ZERO);
            if (physicalRemaining.compareTo(line.requestedBaseQuantity()) < 0) {
                throw conflict("WARD_MED_RETURN_HANDOVER_QUANTITY_CHANGED",
                        "退药申请后原药品可退数量已变化，请重新核对");
            }
        }
        String previous = request.handOver(input.expectedRevision(), context.subjectId(), clean(input.note()));
        requestEvents.save(new WardMedicationReturnEvent(request, "HANDED_OVER", previous, command, hash,
                context.subjectId(), clean(input.note())));
        requests.flush();
        requestEvents.flush();
        return view(request);
    }

    @Transactional
    public WardMedicationReturnRequestView receive(Long requestId, ReceiveCommand input) {
        ExecutionContext context = requirePharmacyContext();
        String command = required(input.commandCode(), "WARD_MED_RETURN_COMMAND_REQUIRED", "药房接收请求号不能为空");
        if (input.lines() == null || input.lines().isEmpty()) {
            throw badRequest("WARD_MED_RETURN_RECEIPT_LINES_REQUIRED", "药房接收必须逐项登记处置方式");
        }
        List<ReceiveLineCommand> normalized = input.lines().stream()
                .sorted(Comparator.comparing(ReceiveLineCommand::returnRequestLineId)).toList();
        String hash = hash("RECEIVE", requestId, input.processorPractitionerId(), input.processorAssignmentId(),
                normalized.stream().map(value -> value.returnRequestLineId() + ":" + upper(value.disposition())).toList(),
                clean(input.note()));
        WardMedicationReturnRequestView replay = replay(context, requestId, command, "RECEIVED", hash);
        if (replay != null) return replay;
        WardMedicationReturnRequest request = lockRequest(context, requestId);
        requirePharmacyScope(context, request);
        request.requireRevision(input.expectedRevision());

        List<WardMedicationReturnLine> lines = lines(context, request.id());
        Map<Long, ReceiveLineCommand> inputs = new HashMap<>();
        for (ReceiveLineCommand value : normalized) {
            if (value.returnRequestLineId() == null || inputs.put(value.returnRequestLineId(), value) != null) {
                throw badRequest("WARD_MED_RETURN_RECEIPT_LINE_DUPLICATE", "药房接收明细不能为空或重复");
            }
            String disposition = upper(value.disposition());
            if (!DISPOSITIONS.contains(disposition)) {
                throw badRequest("WARD_MED_RETURN_DISPOSITION_INVALID", "退药处置只支持重新入库、隔离或待销毁");
            }
        }
        if (inputs.size() != lines.size() || lines.stream().anyMatch(value -> !inputs.containsKey(value.id()))) {
            throw badRequest("WARD_MED_RETURN_RECEIPT_INCOMPLETE", "药房接收必须逐项处理退药申请全部明细");
        }

        Map<Long, List<WardMedicationReturnLine>> grouped = new LinkedHashMap<>();
        lines.stream().sorted(Comparator.comparing(WardMedicationReturnLine::originalDispenseId)
                        .thenComparing(WardMedicationReturnLine::id))
                .forEach(value -> grouped.computeIfAbsent(value.originalDispenseId(), ignored -> new ArrayList<>())
                        .add(value));
        int groupNo = 0;
        for (Map.Entry<Long, List<WardMedicationReturnLine>> entry : grouped.entrySet()) {
            String returnNo = request.requestNo() + "-" + (++groupNo);
            List<ReturnLineCommand> formalLines = entry.getValue().stream().map(value -> {
                ReceiveLineCommand received = inputs.get(value.id());
                return new ReturnLineCommand(value.originalDispenseLineId(), value.requestedQuantity(),
                        upper(received.disposition()), clean(received.exceptionDescription()));
            }).toList();
            StockReturnView formal = dispenseService.returnMedication(entry.getKey(), new ReturnCommand(
                    returnNo, "WARD_RETURN", Instant.now(), input.processorPractitionerId(),
                    input.processorAssignmentId(), clean(input.note()), formalLines));
            for (WardMedicationReturnLine value : entry.getValue()) {
                value.complete(upper(inputs.get(value.id()).disposition()), formal.id(), formal.returnDispenseId());
            }
        }
        String previous = request.receive(input.expectedRevision(), context.subjectId(),
                input.processorPractitionerId(), input.processorAssignmentId(), clean(input.note()));
        requestEvents.save(new WardMedicationReturnEvent(request, "RECEIVED", previous, command, hash,
                context.subjectId(), clean(input.note())));
        requestLines.flush();
        requests.flush();
        requestEvents.flush();
        return view(request);
    }

    @Transactional(readOnly = true)
    public List<WardMedicationReturnRequestView> list(String status, Long encounterId) {
        ExecutionContext context = requireContext();
        String normalizedStatus = upper(status);
        if (normalizedStatus != null && !"ALL".equals(normalizedStatus)
                && !REQUEST_STATUSES.contains(normalizedStatus)) {
            throw badRequest("WARD_MED_RETURN_STATUS_INVALID", "病区退药申请状态不合法");
        }
        return requests.findByTenantIdAndOrganizationIdOrderByRequestedAtDesc(
                        context.tenantId(), context.organizationId()).stream()
                .filter(value -> normalizedStatus == null || "ALL".equals(normalizedStatus)
                        || normalizedStatus.equals(value.status()))
                .filter(value -> encounterId == null || encounterId.equals(value.encounterId()))
                .filter(value -> inScope(context, value))
                .map(this::view).toList();
    }

    @Transactional(readOnly = true)
    public WardMedicationReturnRequestView get(Long requestId) {
        ExecutionContext context = requireContext();
        WardMedicationReturnRequest request = requests.findByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("WARD_MED_RETURN_NOT_FOUND", "病区退药申请不存在"));
        if (!inScope(context, request)) throw forbidden("WARD_MED_RETURN_SCOPE_DENIED", "无权查看该病区退药申请");
        return view(request);
    }

    private ReturnableDetail detail(ExecutionContext context, MedicationDispenseLine line, boolean strict) {
        if (line == null || !context.tenantId().equals(line.tenantId())) {
            if (strict) throw notFound("WARD_MED_RETURN_DISPENSE_LINE_NOT_FOUND", "原发药批次明细不存在");
            return null;
        }
        MedicationDispense dispense = dispenses.findByIdAndTenantId(line.medicationDispenseId(), context.tenantId())
                .orElse(null);
        if (dispense == null || !Set.of("DISPENSE", "REDISPENSE").contains(dispense.dispenseType())) {
            if (strict) throw badRequest("WARD_MED_RETURN_ORIGINAL_INVALID", "退药必须关联原始发药或补发批次");
            return null;
        }
        DispenseTask task = dispenseTasks.findByIdAndTenantId(dispense.taskId(), context.tenantId()).orElse(null);
        if (task == null || !"INPATIENT".equals(task.taskType())) {
            if (strict) throw badRequest("WARD_MED_RETURN_NOT_INPATIENT", "只有住院发药可以发起病区退药");
            return null;
        }
        DispenseTaskLine taskLine = dispenseTaskLines.findByTenantIdAndTaskId(context.tenantId(), task.id())
                .orElseThrow(() -> conflict("WARD_MED_RETURN_TASK_LINE_MISSING", "住院发药任务缺少药品明细"));
        WardDeliveryLine deliveryLine = deliveryLines.findByTenantIdAndDispenseId(context.tenantId(), dispense.id())
                .orElse(null);
        WardDelivery delivery = deliveryLine == null ? null
                : deliveries.findByIdAndTenantId(deliveryLine.deliveryId(), context.tenantId()).orElse(null);
        if (delivery == null || !RECEIVED_DELIVERY_STATUSES.contains(delivery.status())
                || deliveryLine.receivedQuantity().signum() <= 0) {
            if (strict) throw conflict("WARD_MED_RETURN_DELIVERY_NOT_RECEIVED",
                    "原发药尚未完成病区签收，不能虚构病区退药");
            return null;
        }
        if (!context.organizationId().equals(delivery.organizationId())
                || !context.departmentId().equals(delivery.nursingUnitDepartmentId())) {
            if (strict) throw forbidden("WARD_MED_RETURN_WARD_SCOPE_DENIED", "原发药不属于当前病区");
            return null;
        }
        StockSite stockSite = stockSites.findByIdAndTenantId(dispense.stockSiteId(), context.tenantId())
                .orElseThrow(() -> conflict("WARD_MED_RETURN_STOCK_SITE_MISSING", "原发药药房不存在"));
        StockItem stockItem = stockItems.findByIdAndTenantId(line.stockItemId(), context.tenantId())
                .orElseThrow(() -> conflict("WARD_MED_RETURN_STOCK_ITEM_MISSING", "原发药库存项目不存在"));
        BigDecimal signedQuantity = signedQuantity(context.tenantId(), deliveryLine, line);
        BigDecimal signedBase = signedQuantity.multiply(line.baseQuantityFactor());
        BigDecimal returnedBase = dispenseLines.returnedQuantity(context.tenantId(), line.id())
                .multiply(line.baseQuantityFactor());
        BigDecimal consumedBase = consumptions.consumedBaseQuantity(context.tenantId(), line.id());
        BigDecimal pendingBase = requestLines.pendingBaseQuantity(context.tenantId(), line.id());
        BigDecimal availableBase = signedBase.subtract(returnedBase).subtract(consumedBase)
                .subtract(pendingBase).max(BigDecimal.ZERO);
        return new ReturnableDetail(line, dispense, taskLine, delivery, stockSite, stockItem,
                signedQuantity, signedBase, returnedBase, consumedBase, pendingBase, availableBase);
    }

    private BigDecimal signedQuantity(Long tenantId, WardDeliveryLine deliveryLine, MedicationDispenseLine target) {
        BigDecimal remaining = deliveryLine.receivedQuantity();
        for (MedicationDispenseLine line : dispenseLines
                .findByTenantIdAndMedicationDispenseIdOrderBySortOrder(tenantId, target.medicationDispenseId())) {
            BigDecimal share = remaining.min(line.quantityDispensed()).max(BigDecimal.ZERO);
            if (line.id().equals(target.id())) return share;
            remaining = remaining.subtract(share).max(BigDecimal.ZERO);
        }
        return BigDecimal.ZERO;
    }

    private WardMedicationReturnRequestView replay(ExecutionContext context, Long requestId, String command,
                                                    String eventType, String hash) {
        WardMedicationReturnEvent event = requestEvents.findByTenantIdAndCommandCode(context.tenantId(), command)
                .orElse(null);
        if (event == null) return null;
        if (!eventType.equals(event.eventType()) || !hash.equals(event.payloadHash())
                || requestId != null && !requestId.equals(event.returnRequestId())) {
            throw conflict("WARD_MED_RETURN_COMMAND_REUSED", "业务请求号已用于其他病区退药操作");
        }
        WardMedicationReturnRequest request = requests.findByIdAndTenantId(event.returnRequestId(), context.tenantId())
                .orElseThrow(() -> conflict("WARD_MED_RETURN_REPLAY_MISSING", "幂等记录对应的退药申请不存在"));
        if (!inScope(context, request)) throw forbidden("WARD_MED_RETURN_SCOPE_DENIED", "无权访问该病区退药申请");
        return view(request);
    }

    private WardMedicationReturnRequest lockRequest(ExecutionContext context, Long requestId) {
        return requests.lockByIdAndTenantId(requestId, context.tenantId())
                .orElseThrow(() -> notFound("WARD_MED_RETURN_NOT_FOUND", "病区退药申请不存在"));
    }

    private List<WardMedicationReturnLine> lines(ExecutionContext context, Long requestId) {
        return requestLines.findByTenantIdAndReturnRequestIdOrderById(context.tenantId(), requestId);
    }

    private WardMedicationReturnRequestView view(WardMedicationReturnRequest request) {
        List<WardMedicationReturnLineView> lines = requestLines
                .findByTenantIdAndReturnRequestIdOrderById(request.tenantId(), request.id()).stream()
                .map(value -> new WardMedicationReturnLineView(value.id(), value.requestId(),
                        value.originalDispenseId(), value.originalDispenseLineId(), value.dispenseTaskLineId(),
                        value.medicationNameSnapshot(), value.requestedQuantity(), value.unitCode(),
                        value.requestedBaseQuantity(), value.baseUnitCode(), value.disposition(),
                        value.stockReturnId(), value.returnDispenseId()))
                .toList();
        List<WardMedicationReturnEventView> events = requestEvents
                .findByTenantIdAndReturnRequestIdOrderByOccurredAtAscIdAsc(request.tenantId(), request.id()).stream()
                .map(value -> new WardMedicationReturnEventView(value.id(), value.eventType(), value.fromStatus(),
                        value.toStatus(), value.commandCode(), value.occurredAt(), value.occurredBy(), value.note()))
                .toList();
        return new WardMedicationReturnRequestView(request.id(), request.revision(), request.requestNo(), request.status(),
                request.organizationId(), request.stockSiteId(), request.nursingUnitDepartmentId(), request.residentId(),
                request.encounterId(), request.requestedAt(), request.requestedBy(), request.requestNote(),
                request.handedOverAt(), request.handedOverBy(), request.handoverNote(), request.receivedAt(),
                request.receivedBy(), request.processorPractitionerId(), request.processorAssignmentId(),
                request.receiptNote(), lines, events);
    }

    private boolean inScope(ExecutionContext context, WardMedicationReturnRequest request) {
        if (!context.organizationId().equals(request.organizationId()) || context.departmentId() == null) return false;
        if (context.departmentId().equals(request.nursingUnitDepartmentId())) return true;
        return stockSites.findByIdAndTenantId(request.stockSiteId(), context.tenantId())
                .map(value -> context.departmentId().equals(value.departmentId())).orElse(false);
    }

    private void requireWardScope(ExecutionContext context, WardMedicationReturnRequest request) {
        if (!context.organizationId().equals(request.organizationId())
                || !context.departmentId().equals(request.nursingUnitDepartmentId())) {
            throw forbidden("WARD_MED_RETURN_WARD_SCOPE_DENIED", "退药申请不属于当前病区");
        }
    }

    private void requirePharmacyScope(ExecutionContext context, WardMedicationReturnRequest request) {
        StockSite site = stockSites.findByIdAndTenantId(request.stockSiteId(), context.tenantId())
                .orElseThrow(() -> conflict("WARD_MED_RETURN_STOCK_SITE_MISSING", "退药申请对应药房不存在"));
        if (!context.organizationId().equals(request.organizationId()) || site.departmentId() == null
                || !context.departmentId().equals(site.departmentId()) || !"PHARMACY".equals(site.siteType())) {
            throw forbidden("WARD_MED_RETURN_PHARMACY_SCOPE_DENIED", "退药申请不属于当前药房");
        }
    }

    private ExecutionContext requireWardContext() {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority("INPATIENT.ACCESS") && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("WARD_MED_RETURN_WARD_PERMISSION_REQUIRED", "当前账号没有病区退药权限");
        }
        return context;
    }

    private ExecutionContext requirePharmacyContext() {
        ExecutionContext context = requireContext();
        if (!context.hasAuthority("PHARMACY.DISPENSE") && !context.hasAuthority("ROLE_ADMIN")) {
            throw forbidden("WARD_MED_RETURN_PHARMACY_PERMISSION_REQUIRED", "当前账号没有药房退药权限");
        }
        return context;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null
                || context.subjectId() == null) {
            throw badRequest("WARD_MED_RETURN_WORK_CONTEXT_REQUIRED", "病区退药必须选择工作机构和科室");
        }
        return context;
    }

    private static String hash(Object... values) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Object value : values) {
                digest.update(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
                digest.update((byte) 0);
            }
            return java.util.HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static BigDecimal positive(BigDecimal value, String code, String message) {
        if (value == null || value.signum() <= 0) throw badRequest(code, message);
        return value;
    }

    private static String required(String value, String code, String message) {
        String result = clean(value);
        if (result == null) throw badRequest(code, message);
        return result;
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String upper(String value) {
        String result = clean(value);
        return result == null ? null : result.toUpperCase(Locale.ROOT);
    }

    private static String decimal(BigDecimal value) {
        return value == null ? "null" : value.stripTrailingZeros().toPlainString();
    }

    public record CreateReturnLineCommand(Long originalDispenseLineId, BigDecimal quantity) {
    }

    public record CreateReturnRequestCommand(Long encounterId, String commandCode, String note,
                                             List<CreateReturnLineCommand> lines) {
    }

    public record TransitionCommand(long expectedRevision, String commandCode, String note) {
    }

    public record ReceiveLineCommand(Long returnRequestLineId, String disposition, String exceptionDescription) {
    }

    public record ReceiveCommand(long expectedRevision, String commandCode, Long processorPractitionerId,
                                 Long processorAssignmentId, String note, List<ReceiveLineCommand> lines) {
    }

    private record RequestedDetail(ReturnableDetail detail, BigDecimal quantity, BigDecimal baseQuantity) {
    }

    private record ReturnableDetail(MedicationDispenseLine line, MedicationDispense dispense,
                                    DispenseTaskLine taskLine, WardDelivery delivery,
                                    StockSite stockSite, StockItem stockItem,
                                    BigDecimal signedQuantity, BigDecimal signedBase,
                                    BigDecimal returnedBase, BigDecimal consumedBase,
                                    BigDecimal pendingBase, BigDecimal availableBase) {
        BigDecimal availableQuantity() {
            return availableBase.divide(line.baseQuantityFactor(), 8, RoundingMode.DOWN).stripTrailingZeros();
        }

        ReturnableMedicationLineView view() {
            BigDecimal factor = line.baseQuantityFactor();
            return new ReturnableMedicationLineView(dispense.id(), line.id(), taskLine.requestId(),
                    dispense.residentId(), dispense.encounterId(), dispense.stockSiteId(),
                    delivery.nursingUnitDepartmentId(), taskLine.productNameSnapshot(), signedQuantity,
                    returnedBase.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros(),
                    consumedBase.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros(),
                    pendingBase.divide(factor, 8, RoundingMode.DOWN).stripTrailingZeros(),
                    availableQuantity(), line.dispenseUnitCode(), factor, stockItem.baseUnitCode());
        }
    }
}
