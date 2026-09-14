package com.rhn.platform.printing.application;

import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.printing.domain.ClinicalPrintBatch;
import com.rhn.platform.printing.domain.ClinicalPrintBatchItem;
import com.rhn.platform.printing.domain.PrintDelivery;
import com.rhn.platform.printing.domain.PrintDevice;
import com.rhn.platform.printing.domain.PrintDeviceBinding;
import com.rhn.platform.printing.domain.PrintJob;
import com.rhn.platform.printing.domain.PrintMediaProfile;
import com.rhn.platform.printing.domain.PrintOutput;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.domain.PrintTemplateVersion;
import com.rhn.platform.printing.infrastructure.ClinicalPrintBatchItemRepository;
import com.rhn.platform.printing.infrastructure.ClinicalPrintBatchRepository;
import com.rhn.platform.printing.infrastructure.PrintDeliveryRepository;
import com.rhn.platform.printing.infrastructure.PrintDeviceBindingRepository;
import com.rhn.platform.printing.infrastructure.PrintDeviceRepository;
import com.rhn.platform.printing.infrastructure.PrintJobRepository;
import com.rhn.platform.printing.infrastructure.PrintMediaProfileRepository;
import com.rhn.platform.printing.infrastructure.PrintOutputRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateVersionRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.treatment.api.TreatmentExecutionTaskView;
import com.rhn.treatment.api.TreatmentExecutionTaskView.TreatmentExecutionItemView;
import com.rhn.treatment.application.TreatmentExecutionService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ClinicalPrintBatchService {
    private static final Set<String> BATCH_DOCUMENT_TYPES = Set.of(
            "ORAL_MEDICATION_CARD", "INFUSION_LABEL", "INFUSION_PATROL_CARD");
    private static final Set<String> PRINTABLE_STATUSES = Set.of("READY", "IN_PROGRESS", "COMPLETED");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm")
            .withZone(ZoneId.of("Asia/Shanghai"));
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");

    private final TreatmentExecutionService treatmentService;
    private final PrintTemplateRepository templates;
    private final PrintTemplateVersionRepository versions;
    private final PrintMediaProfileRepository mediaProfiles;
    private final PrintDeviceRepository devices;
    private final PrintDeviceBindingRepository bindings;
    private final ClinicalPrintBatchRepository batches;
    private final ClinicalPrintBatchItemRepository batchItems;
    private final PrintOutputRepository outputs;
    private final PrintJobRepository jobs;
    private final PrintDeliveryRepository deliveries;
    private final ClinicalPdfRenderer renderer;
    private final BatchPdfComposer composer;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;
    private final PrintTaskResolutionService taskResolutionService;

    public ClinicalPrintBatchService(TreatmentExecutionService treatmentService,
            PrintTemplateRepository templates, PrintTemplateVersionRepository versions,
            PrintMediaProfileRepository mediaProfiles, PrintDeviceRepository devices,
            PrintDeviceBindingRepository bindings, ClinicalPrintBatchRepository batches,
            ClinicalPrintBatchItemRepository batchItems, PrintOutputRepository outputs,
            PrintJobRepository jobs, PrintDeliveryRepository deliveries, ClinicalPdfRenderer renderer,
            BatchPdfComposer composer, JsonCodec jsonCodec, ExecutionContextProvider contextProvider,
            PrintTaskResolutionService taskResolutionService) {
        this.treatmentService = treatmentService; this.templates = templates; this.versions = versions;
        this.mediaProfiles = mediaProfiles; this.devices = devices; this.bindings = bindings;
        this.batches = batches; this.batchItems = batchItems; this.outputs = outputs; this.jobs = jobs;
        this.deliveries = deliveries; this.renderer = renderer; this.composer = composer;
        this.jsonCodec = jsonCodec; this.contextProvider = contextProvider;
        this.taskResolutionService = taskResolutionService;
    }

    @Transactional
    public PreparationView candidates(String documentType, String keyword, Long mediaProfileId) {
        ExecutionContext context = context();
        ResolvedTemplate resolved = resolveTemplate(context, normalizeDocumentType(documentType));
        List<PrintMediaProfile> compatibleMedia = compatibleMedia(context, resolved);
        PrintMediaProfile outputMedia = selectOutputMedia(mediaProfileId, resolved, compatibleMedia);
        List<CandidateView> values = treatmentService.worklist("MEDICATION", null, keyword).stream()
                .map(task -> candidate(task, resolved, outputMedia, context.tenantId())).toList();
        List<DeviceView> availableDevices = availableDevices(context, resolved.template.documentType(),
                outputMedia.id());
        Long defaultDeviceId = resolveDefaultDevice(context, resolved.template.documentType(),
                outputMedia.id(), availableDevices);
        return new PreparationView(templateView(resolved), mediaView(outputMedia),
                compatibleMedia.stream().map(this::mediaView).toList(), availableDevices, defaultDeviceId, values);
    }

    @Transactional
    public BatchView create(CreateBatchCommand command) {
        ExecutionContext context = context();
        validateCreate(command);
        ClinicalPrintBatch existing = batches.findByTenantIdAndIdempotencyKey(
                context.tenantId(), command.idempotencyKey().trim()).orElse(null);
        if (existing != null) return view(existing, context);

        String documentType = normalizeDocumentType(command.documentType());
        ResolvedTemplate resolved = resolveTemplate(context, documentType);
        List<PrintMediaProfile> compatibleMedia = compatibleMedia(context, resolved);
        PrintMediaProfile outputMedia = selectOutputMedia(command.mediaProfileId(), resolved, compatibleMedia);
        String layoutStrategy = normalizeLayout(command.layoutStrategy());
        int startSlot = command.startSlot() == null ? 1 : command.startSlot();
        validateLayout(layoutStrategy, outputMedia, startSlot, resolved);
        List<TreatmentExecutionTaskView> worklist = treatmentService.worklist("MEDICATION", null, null);
        Map<Long, TreatmentExecutionTaskView> byId = new HashMap<>();
        worklist.forEach(value -> byId.put(value.id(), value));
        List<TreatmentExecutionTaskView> selected = command.sourceIds().stream().distinct().map(id -> {
            TreatmentExecutionTaskView task = byId.get(id);
            if (task == null) throw notFound("PRINT_SOURCE_NOT_FOUND", "未找到所选用药执行任务");
            return task;
        }).toList();

        List<DeviceView> available = availableDevices(context, documentType, outputMedia.id());
        Long deviceId = command.deviceId() == null
                ? resolveDefaultDevice(context, documentType, outputMedia.id(), available) : command.deviceId();
        if (deviceId != null && available.stream().noneMatch(value -> value.id().equals(deviceId))) {
            throw badRequest("PRINT_DEVICE_NOT_AVAILABLE", "所选打印设备不支持当前工作科室或介质");
        }

        LinkedHashMap<String, Object> selection = new LinkedHashMap<>();
        selection.put("sourceIds", selected.stream().map(TreatmentExecutionTaskView::id).toList());
        selection.put("documentType", documentType);
        selection.put("templateVersionId", resolved.version.id());
        selection.put("mediaProfileId", outputMedia.id());
        selection.put("deviceId", deviceId);
        selection.put("layoutStrategy", layoutStrategy);
        selection.put("startSlot", startSlot);
        selection.put("reprintReason", clean(command.reprintReason()));
        ClinicalPrintBatch batch = batches.saveAndFlush(new ClinicalPrintBatch(context.tenantId(),
                context.organizationId(), context.departmentId(), documentType, resolved.template.id(),
                resolved.version.id(), outputMedia.id(), deviceId, LocalDate.now(BUSINESS_ZONE),
                jsonCodec.write(selection), layoutStrategy, startSlot, command.idempotencyKey().trim(),
                selected.size(), context.subjectId()));

        List<byte[]> cards = new ArrayList<>();
        List<Map<String, Object>> frozenSnapshots = new ArrayList<>();
        List<PendingBatchItem> pendingItems = new ArrayList<>();
        int included = 0; int excluded = 0; Long originalJobId = null;
        for (TreatmentExecutionTaskView task : selected) {
            CandidateView candidate = candidate(task, resolved, outputMedia, context.tenantId());
            String reprintReason = clean(command.reprintReason());
            boolean duplicateBlocked = candidate.printedBefore() && reprintReason == null;
            boolean include = candidate.eligible() && !duplicateBlocked;
            String exclusionCode = include ? null : duplicateBlocked ? "ALREADY_PRINTED" : candidate.exclusionCode();
            String exclusionReason = include ? null : duplicateBlocked
                    ? "该任务已按当前版本打印；补打时必须填写原因" : candidate.exclusionReason();
            Map<String, Object> snapshot = include ? snapshot(task, documentType) : null;
            if (include) {
                byte[] card = renderer.render(documentType, resolved.version.layoutSchema(),
                        resolved.version.configJson(), snapshot);
                cards.add(card); frozenSnapshots.add(snapshot); included++;
                if (candidate.printedBefore() && originalJobId == null) {
                    originalJobId = originalJob(candidate.itemKey(), context.tenantId());
                }
            } else excluded++;
            pendingItems.add(new PendingBatchItem(task, candidate, snapshot, include, exclusionCode,
                    exclusionReason, include && candidate.printedBefore() ? reprintReason : null));
        }
        if (cards.isEmpty()) throw badRequest("PRINT_BATCH_EMPTY", "所选任务均不满足打印条件，请处理排除原因后重试");

        BatchPdfComposer.Result pdf = composer.compose(cards, layoutStrategy, outputMedia, startSlot);
        int includedIndex = 0;
        for (PendingBatchItem pending : pendingItems) {
            BatchPdfComposer.Placement placement = pending.include() ? pdf.placements().get(includedIndex++) : null;
            TreatmentExecutionTaskView task = pending.task();
            batchItems.save(new ClinicalPrintBatchItem(context.tenantId(), batch.id(), task.id(),
                    Math.max(1, task.revision()), task.residentId(), task.encounterId(),
                    task.sourceGroupId() == null ? task.id().toString() : task.sourceGroupId().toString(),
                    pending.candidate().itemKey(), pending.snapshot() == null ? null : jsonCodec.write(pending.snapshot()),
                    pending.include() ? "INCLUDED" : "EXCLUDED", pending.exclusionCode(), pending.exclusionReason(),
                    placement == null ? null : placement.pageNo(), placement == null ? null : placement.slotNo(),
                    pending.reprintReason()));
        }
        LinkedHashMap<String, Object> outputSnapshot = new LinkedHashMap<>();
        outputSnapshot.put("selection", selection); outputSnapshot.put("cards", frozenSnapshots);
        String fileName = documentName(documentType) + "-" + LocalDate.now(BUSINESS_ZONE) + "-" + batch.id() + ".pdf";
        PrintOutput output = outputs.saveAndFlush(new PrintOutput(context.tenantId(), resolved.template,
                resolved.version, resolved.task.task(), resolved.task.implementation(), resolved.task.binding(),
                "CLINICAL_PRINT_BATCH", batch.id(), 1, documentType, null, null,
                context.organizationId(), context.departmentId(), "CLINICAL_USE", jsonCodec.write(outputSnapshot),
                fileName, pdf.content(), "SHA-256", sha256(pdf.content()), context.subjectId()));
        boolean reprint = originalJobId != null;
        PrintJob job = jobs.saveAndFlush(new PrintJob(context.tenantId(), output.id(), originalJobId,
                reprint ? "REPRINT" : "ORIGINAL", 1, context.subjectId(), context.correlationId()));
        batch.generated(output.id(), job.id(), included, excluded, pdf.pageCount(), context.subjectId());
        deliveries.save(new PrintDelivery(context.tenantId(), batch.id(), job.id(), deviceId,
                deviceId == null ? "BROWSER_PDF" : requireDevice(deviceId, context).channel()));
        return view(batches.saveAndFlush(batch), context);
    }

    @Transactional(readOnly = true)
    public List<BatchView> list() {
        ExecutionContext context = context();
        return batches.findTop50ByTenantIdAndOrganizationIdAndDepartmentIdOrderByCreatedAtDesc(
                context.tenantId(), context.organizationId(), context.departmentId()).stream()
                .map(value -> view(value, context)).toList();
    }

    @Transactional(readOnly = true)
    public BatchView detail(Long id) { ExecutionContext context = context(); return view(requireBatch(id, context), context); }

    @Transactional
    public BatchView dispatch(Long id, Long requestedDeviceId) {
        ExecutionContext context = context();
        ClinicalPrintBatch batch = requireBatchLocked(id, context);
        PrintDelivery delivery = deliveries.findByTenantIdAndBatchId(context.tenantId(), id)
                .orElseThrow(() -> notFound("PRINT_DELIVERY_NOT_FOUND", "打印批次没有投递记录"));
        Long deviceId = requestedDeviceId == null ? batch.deviceId() : requestedDeviceId;
        if (deviceId == null) {
            delivery.sent(delivery.revision()); batch.sent(context.subjectId());
        } else {
            PrintDevice device = requireDevice(deviceId, context);
            if (!device.id().equals(delivery.deviceId())) {
                throw conflict("PRINT_DEVICE_CHANGE_REQUIRES_REBUILD", "打印批次已冻结目标设备，如需更换请重新生成批次");
            }
            if ("LOCAL_BRIDGE".equals(device.channel())) {
                delivery.queue(delivery.revision()); batch.queued(context.subjectId());
            } else {
                delivery.sent(delivery.revision()); batch.sent(context.subjectId());
            }
        }
        deliveries.saveAndFlush(delivery); batches.saveAndFlush(batch);
        return view(batch, context);
    }

    @Transactional
    public BridgeJobView claim(String deviceCode) {
        ExecutionContext context = context();
        PrintDevice device = requireBridgeDevice(deviceCode, context);
        device.heartbeat(context.subjectId()); devices.save(device);
        PrintDelivery delivery = deliveries
                .findTop20ByTenantIdAndDeviceIdAndChannelAndStatusOrderByUpdatedAt(
                        context.tenantId(), device.id(), "LOCAL_BRIDGE", "QUEUED")
                .stream().findFirst().orElse(null);
        if (delivery == null) return null;
        ClinicalPrintBatch batch = delivery.batchId() == null ? null : requireBatchLocked(delivery.batchId(), context);
        delivery.sent(delivery.revision());
        if (batch != null) batch.sent(context.subjectId());
        deliveries.saveAndFlush(delivery);
        if (batch != null) batches.saveAndFlush(batch);
        PrintJob job = jobs.findByIdAndTenantId(delivery.jobId(), context.tenantId()).orElseThrow();
        PrintOutput output = outputs.findByIdAndTenantId(job.outputId(), context.tenantId()).orElseThrow();
        return new BridgeJobView(delivery.id(), delivery.revision(), batch == null ? null : batch.id(), output.fileName(),
                output.mediaType(), "/api/platform/printing/outputs/" + output.id() + "/content",
                device.outputLanguage(), device.queueName(), output.contentDigestAlgorithm(), output.contentDigest());
    }

    @Transactional
    public void heartbeat(String deviceCode) {
        ExecutionContext context = context();
        PrintDevice device = requireBridgeDevice(deviceCode, context);
        device.heartbeat(context.subjectId()); devices.saveAndFlush(device);
    }

    @Transactional
    public AcknowledgementView acknowledge(Long deliveryId, long expectedRevision, String status,
                                 String errorCode, String errorMessage) {
        ExecutionContext context = context();
        PrintDelivery delivery = deliveries.lockByIdAndTenantId(deliveryId, context.tenantId())
                .orElseThrow(() -> notFound("PRINT_DELIVERY_NOT_FOUND", "未找到打印投递记录"));
        ClinicalPrintBatch batch = delivery.batchId() == null ? null : requireBatchLocked(delivery.batchId(), context);
        if ("DEVICE_CONFIRMED".equals(status)) {
            delivery.confirm(expectedRevision);
            if (batch != null) batch.confirmed(context.subjectId());
        } else if ("FAILED".equals(status)) {
            if (clean(errorMessage) == null) throw badRequest("PRINT_DELIVERY_ERROR_REQUIRED", "打印失败时必须填写错误说明");
            delivery.fail(expectedRevision, clean(errorCode), clean(errorMessage));
            if (batch != null) batch.failed(context.subjectId());
        } else throw badRequest("PRINT_DELIVERY_STATUS_INVALID", "本地打印桥回执状态仅支持 DEVICE_CONFIRMED 或 FAILED");
        deliveries.saveAndFlush(delivery);
        if (batch != null) batches.saveAndFlush(batch);
        DeliveryView deliveryView = new DeliveryView(delivery.id(), delivery.revision(), delivery.channel(),
                delivery.status(), delivery.attemptCount(), delivery.errorCode(), delivery.errorMessage(),
                delivery.queuedAt(), delivery.sentAt(), delivery.confirmedAt());
        return new AcknowledgementView(delivery.status(), deliveryView, batch == null ? null : view(batch, context));
    }

    @Transactional(readOnly = true)
    public List<DeviceView> devices() {
        ExecutionContext context = context();
        return devices.findByTenantIdAndStatusOrderByDeviceName(context.tenantId(), "ACTIVE").stream()
                .filter(value -> inScope(value, context)).map(value -> deviceView(value, false)).toList();
    }

    @Transactional(readOnly = true)
    public DeviceManagementView deviceManagement() {
        ExecutionContext context = context();
        List<DeviceView> scopedDevices = devices.findByTenantIdOrderByDeviceName(context.tenantId()).stream()
                .filter(value -> inScope(value, context)).map(value -> deviceView(value, false)).toList();
        List<BindingView> scopedBindings = bindings.findByTenantIdAndOrganizationIdAndDepartmentIdAndStatus(
                        context.tenantId(), context.organizationId(), context.departmentId(), "ACTIVE")
                .stream().map(this::bindingView).toList();
        return new DeviceManagementView(scopedDevices, scopedBindings);
    }

    @Transactional
    public DeviceView createDevice(DeviceCommand command) {
        ExecutionContext context = context(); validateDevice(command);
        String code = normalizeCode(command.deviceCode());
        if (devices.findByTenantIdAndDeviceCode(context.tenantId(), code).isPresent()) {
            throw conflict("PRINT_DEVICE_CODE_EXISTS", "打印设备编码已存在");
        }
        PrintDevice device = new PrintDevice(context.tenantId(), context.organizationId(), context.departmentId(),
                code, command.deviceName().trim(), command.channel(), command.outputLanguage(),
                clean(command.queueName()), defaultJson(command.capabilitiesJson()), context.subjectId());
        return deviceView(devices.saveAndFlush(device), false);
    }

    @Transactional
    public DeviceView updateDevice(Long id, DeviceCommand command) {
        ExecutionContext context = context(); validateDevice(command);
        PrintDevice device = requireDevice(id, context);
        device.update(command.expectedRevision(), context.organizationId(), context.departmentId(),
                command.deviceName().trim(), command.channel(), command.outputLanguage(), clean(command.queueName()),
                defaultJson(command.capabilitiesJson()), command.status() == null ? "ACTIVE" : command.status(),
                context.subjectId());
        return deviceView(devices.saveAndFlush(device), false);
    }

    @Transactional
    public BindingView bind(BindingCommand command) {
        ExecutionContext context = context();
        String documentType = normalizeRoutableDocumentType(command.documentType(), context);
        PrintMediaProfile media = requireMedia(command.mediaProfileId(), context.tenantId());
        PrintDevice device = requireDevice(command.deviceId(), context);
        if (!supportsMedia(device, media.mediaCode())) {
            throw badRequest("PRINT_DEVICE_MEDIA_UNSUPPORTED", "所选打印设备不支持当前打印介质");
        }
        PrintDeviceBinding binding = bindings.findByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileId(
                context.tenantId(), context.organizationId(), context.departmentId(), documentType, media.id())
                .orElse(null);
        if (binding == null) binding = new PrintDeviceBinding(context.tenantId(), context.organizationId(),
                context.departmentId(), documentType, media.id(), device.id(), true, context.subjectId());
        else binding.update(command.expectedRevision(), device.id(), true, "ACTIVE", context.subjectId());
        return bindingView(bindings.saveAndFlush(binding));
    }

    private CandidateView candidate(TreatmentExecutionTaskView task, ResolvedTemplate resolved,
                                    PrintMediaProfile outputMedia, Long tenantId) {
        boolean typeMatch = matchesDocumentType(task, resolved.template.documentType());
        String exclusionCode = typeMatch ? exclusionCode(task.status()) : "DOCUMENT_TYPE_MISMATCH";
        String exclusionReason = typeMatch ? exclusionReason(task.status()) : "给药途径与当前卡片类型不匹配";
        boolean eligible = typeMatch && PRINTABLE_STATUSES.contains(task.status());
        String key = itemKey(tenantId, resolved.template.documentType(), task.id(), Math.max(1, task.revision()),
                resolved.version.id(), outputMedia.id(), LocalDate.now(BUSINESS_ZONE));
        boolean printed = batchItems.existsByTenantIdAndItemKeyAndStatus(tenantId, key, "INCLUDED");
        String medicationSummary = task.items().stream().filter(value -> !value.cancelled())
                .map(TreatmentExecutionItemView::itemName).reduce((a, b) -> a + "、" + b).orElse("-");
        String routeSummary = task.items().stream().filter(value -> !value.cancelled())
                .map(TreatmentExecutionItemView::routeCode).filter(value -> value != null && !value.isBlank())
                .distinct().reduce((a, b) -> a + " / " + b).orElse("-");
        return new CandidateView(task.id(), task.revision(), task.taskNo(), task.status(), task.residentId(),
                task.residentName(), task.healthRecordNo(), task.encounterId(), task.createdAt(), medicationSummary,
                routeSummary, task.items().size(), eligible, exclusionCode, exclusionReason, printed, key);
    }

    private Map<String, Object> snapshot(TreatmentExecutionTaskView task, String documentType) {
        List<TreatmentExecutionItemView> active = task.items().stream().filter(value -> !value.cancelled()).toList();
        LinkedHashMap<String, Object> value = new LinkedHashMap<>();
        value.put("patientName", task.residentName()); value.put("healthRecordNo", task.healthRecordNo());
        value.put("gender", ""); value.put("ageText", ""); value.put("bedNo", "门诊");
        value.put("taskNo", task.taskNo()); value.put("barcode", task.taskNo());
        value.put("medicationName", active.stream().map(TreatmentExecutionItemView::itemName)
                .reduce((a, b) -> a + "、" + b).orElse("-"));
        value.put("doseText", active.stream().map(this::doseText).reduce((a, b) -> a + "；" + b).orElse("按医嘱"));
        value.put("routeName", active.stream().map(TreatmentExecutionItemView::routeCode)
                .filter(v -> v != null && !v.isBlank()).distinct().reduce((a, b) -> a + "/" + b).orElse("按医嘱"));
        value.put("frequencyName", active.stream().map(v -> first(v.frequencyName(), v.frequencyCode()))
                .filter(v -> v != null).distinct().reduce((a, b) -> a + "/" + b).orElse(""));
        value.put("scheduledAtText", TIME.format(task.createdAt())); value.put("instruction", "执行前核对患者与医嘱");
        value.put("infusionGroupText", active.stream().map(v -> v.itemName() + " " + doseText(v))
                .reduce((a, b) -> a + "\n" + b).orElse("-"));
        value.put("rateText", "遵医嘱");
        value.put("safetyFlagsText", active.stream().anyMatch(TreatmentExecutionItemView::skinTestRequired)
                ? "皮试结果已放行" : "常规核对");
        value.put("startedAtText", task.startedAt() == null ? "" : TIME.format(task.startedAt()));
        value.put("siteText", first(task.executionSite(), "")); value.put("patrolRows", List.of());
        value.put("endedAtText", task.completedAt() == null ? "" : TIME.format(task.completedAt()));
        value.put("checkerName", ""); value.put("sourceType", "TREATMENT_EXECUTION_TASK");
        value.put("sourceId", task.id()); value.put("sourceVersion", Math.max(1, task.revision()));
        value.put("documentType", documentType); value.put("generatedAt", Instant.now().toString());
        return value;
    }

    private BatchView view(ClinicalPrintBatch batch, ExecutionContext context) {
        requireScope(batch, context);
        PrintTemplate template = templates.findById(batch.templateId()).orElseThrow();
        PrintMediaProfile media = mediaProfiles.findById(batch.mediaProfileId()).orElseThrow();
        PrintDevice device = batch.deviceId() == null ? null : devices.findById(batch.deviceId()).orElse(null);
        PrintDelivery delivery = deliveries.findByTenantIdAndBatchId(context.tenantId(), batch.id()).orElse(null);
        List<BatchItemView> items = batchItems.findByTenantIdAndBatchIdOrderById(context.tenantId(), batch.id())
                .stream().map(value -> new BatchItemView(value.id(), value.sourceId(), value.sourceVersion(),
                        value.residentId(), value.encounterId(), value.status(), value.exclusionCode(),
                        value.exclusionReason(), value.pageNo(), value.slotNo(), value.reprintReason())).toList();
        DeliveryView deliveryView = delivery == null ? null : new DeliveryView(delivery.id(), delivery.revision(),
                delivery.channel(), delivery.status(), delivery.attemptCount(), delivery.errorCode(),
                delivery.errorMessage(), delivery.queuedAt(), delivery.sentAt(), delivery.confirmedAt());
        return new BatchView(batch.id(), batch.revision(), batch.documentType(), documentName(batch.documentType()),
                batch.status(), template.templateName(), batch.templateVersionId(), media.mediaName(), media.mediaCode(),
                device == null ? null : device.id(), device == null ? "浏览器 PDF" : device.deviceName(),
                batch.businessDate(), batch.layoutStrategy(), batch.startSlot(), batch.selectedCount(),
                batch.includedCount(), batch.excludedCount(), batch.pageCount(), batch.outputId(), batch.jobId(),
                batch.outputId() == null ? null : "/api/platform/printing/outputs/" + batch.outputId() + "/content",
                batch.createdAt(), batch.createdBy(), deliveryView, items);
    }

    private List<DeviceView> availableDevices(ExecutionContext context, String documentType, Long mediaId) {
        Long boundId = bindings
                .findFirstByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileIdAndStatusOrderByDefaultDeviceDesc(
                        context.tenantId(), context.organizationId(), context.departmentId(), documentType, mediaId, "ACTIVE")
                .map(PrintDeviceBinding::deviceId).orElse(null);
        String mediaCode = mediaProfiles.findById(mediaId).map(PrintMediaProfile::mediaCode).orElse("");
        List<DeviceView> result = devices.findByTenantIdAndStatusOrderByDeviceName(context.tenantId(), "ACTIVE")
                .stream().filter(value -> inScope(value, context)).filter(value -> supportsMedia(value, mediaCode))
                .map(value -> deviceView(value, value.id().equals(boundId))).toList();
        if (result.stream().noneMatch(value -> "BROWSER_PDF".equals(value.channel()))) {
            List<DeviceView> mutable = new ArrayList<>(result);
            mutable.add(new DeviceView(null, 0, "BROWSER_PDF", "浏览器 PDF", "BROWSER_PDF", "PDF", null,
                    true, null, "ACTIVE", "{}"));
            return List.copyOf(mutable);
        }
        return result;
    }

    private Long resolveDefaultDevice(ExecutionContext context, String documentType, Long mediaId,
                                      List<DeviceView> available) {
        return bindings.findFirstByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileIdAndStatusOrderByDefaultDeviceDesc(
                        context.tenantId(), context.organizationId(), context.departmentId(), documentType, mediaId, "ACTIVE")
                .map(PrintDeviceBinding::deviceId).filter(id -> available.stream().anyMatch(v -> id.equals(v.id())))
                .orElse(null);
    }

    private ResolvedTemplate resolveTemplate(ExecutionContext context, String documentType) {
        PrintTaskResolutionService.ResolvedPrintTask task = taskResolutionService.resolve(
                taskCode(documentType), "CLINICAL_USE", context);
        PrintTemplate template = task.template();
        PrintTemplateVersion version = task.version();
        PrintMediaProfile media = requireMedia(version.mediaProfileId(), context.tenantId());
        return new ResolvedTemplate(task, template, version, media);
    }

    private List<PrintMediaProfile> compatibleMedia(ExecutionContext context, ResolvedTemplate resolved) {
        LinkedHashMap<String, PrintMediaProfile> available = new LinkedHashMap<>();
        mediaProfiles.findByTenantIdIsNullAndStatusOrderByMediaKindAscMediaNameAsc("ACTIVE")
                .forEach(value -> available.put(value.mediaCode(), value));
        mediaProfiles.findByTenantIdAndStatusOrderByMediaKindAscMediaNameAsc(context.tenantId(), "ACTIVE")
                .forEach(value -> available.put(value.mediaCode(), value));
        BigDecimal[] cardSize = logicalCardSize(resolved);
        return available.values().stream().filter(value -> value.id().equals(resolved.media.id())
                || sheetCanContain(value, cardSize[0], cardSize[1])).toList();
    }

    private PrintMediaProfile selectOutputMedia(Long mediaProfileId, ResolvedTemplate resolved,
                                                List<PrintMediaProfile> compatible) {
        if (mediaProfileId == null) return resolved.media;
        return compatible.stream().filter(value -> value.id().equals(mediaProfileId)).findFirst()
                .orElseThrow(() -> badRequest("PRINT_MEDIA_INCOMPATIBLE", "所选纸张无法容纳当前卡片模板"));
    }

    private BigDecimal[] logicalCardSize(ResolvedTemplate resolved) {
        var paper = jsonCodec.readTree(resolved.version.configJson()).path("paper");
        BigDecimal width = paper.path("widthMm").isNumber() ? paper.path("widthMm").decimalValue()
                : resolved.media.widthMm();
        BigDecimal height = paper.path("heightMm").isNumber() ? paper.path("heightMm").decimalValue()
                : resolved.media.heightMm();
        return new BigDecimal[]{width, height};
    }

    private boolean sheetCanContain(PrintMediaProfile media, BigDecimal cardWidth, BigDecimal cardHeight) {
        if (!"SHEET".equals(media.mediaKind()) || media.heightMm() == null || cardHeight == null
                || media.columns() < 1 || media.rows() < 1) return false;
        BigDecimal printableWidth = media.widthMm().subtract(media.marginLeftMm()).subtract(media.marginRightMm())
                .subtract(media.horizontalGapMm().multiply(BigDecimal.valueOf(media.columns() - 1L)));
        BigDecimal printableHeight = media.heightMm().subtract(media.marginTopMm()).subtract(media.marginBottomMm())
                .subtract(media.verticalGapMm().multiply(BigDecimal.valueOf(media.rows() - 1L)));
        if (printableWidth.signum() <= 0 || printableHeight.signum() <= 0) return false;
        BigDecimal cellWidth = printableWidth.divide(BigDecimal.valueOf(media.columns()), 6, java.math.RoundingMode.DOWN);
        BigDecimal cellHeight = printableHeight.divide(BigDecimal.valueOf(media.rows()), 6, java.math.RoundingMode.DOWN);
        return cellWidth.compareTo(cardWidth) >= 0 && cellHeight.compareTo(cardHeight) >= 0;
    }

    private Long originalJob(String itemKey, Long tenantId) {
        return batchItems.findFirstByTenantIdAndItemKeyAndStatusOrderByCreatedAtDesc(tenantId, itemKey, "INCLUDED")
                .flatMap(item -> batches.findById(item.batchId())).map(ClinicalPrintBatch::jobId).orElse(null);
    }

    private PrintMediaProfile requireMedia(Long id, Long tenantId) {
        return mediaProfiles.findById(id).filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> value.tenantId() == null || value.tenantId().equals(tenantId))
                .orElseThrow(() -> notFound("PRINT_MEDIA_PROFILE_NOT_FOUND", "未找到模板关联的打印介质"));
    }

    private PrintDevice requireDevice(Long id, ExecutionContext context) {
        PrintDevice device = devices.findByIdAndTenantId(id, context.tenantId())
                .filter(value -> "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("PRINT_DEVICE_NOT_FOUND", "未找到启用的打印设备"));
        requireDeviceScope(device, context); return device;
    }

    private PrintDevice requireBridgeDevice(String deviceCode, ExecutionContext context) {
        PrintDevice device = devices.findByTenantIdAndDeviceCode(context.tenantId(), normalizeCode(deviceCode))
                .filter(value -> "LOCAL_BRIDGE".equals(value.channel()) && "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("PRINT_BRIDGE_DEVICE_NOT_FOUND", "未找到启用的本地打印桥设备"));
        requireDeviceScope(device, context); return device;
    }

    private ClinicalPrintBatch requireBatch(Long id, ExecutionContext context) {
        ClinicalPrintBatch batch = batches.findById(id).filter(value -> value.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> notFound("PRINT_BATCH_NOT_FOUND", "未找到打印批次"));
        requireScope(batch, context); return batch;
    }

    private ClinicalPrintBatch requireBatchLocked(Long id, ExecutionContext context) {
        ClinicalPrintBatch batch = batches.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PRINT_BATCH_NOT_FOUND", "未找到打印批次"));
        requireScope(batch, context); return batch;
    }

    private void requireScope(ClinicalPrintBatch batch, ExecutionContext context) {
        if (!context.canAccessOrganization(batch.organizationId()) || !context.canAccessDepartment(batch.departmentId())) {
            throw forbidden("PRINT_BATCH_FORBIDDEN", "无权访问当前工作上下文之外的打印批次");
        }
    }

    private void requireDeviceScope(PrintDevice device, ExecutionContext context) {
        if (!inScope(device, context)) throw forbidden("PRINT_DEVICE_FORBIDDEN", "无权使用当前工作科室之外的打印设备");
    }

    private boolean inScope(PrintDevice device, ExecutionContext context) {
        return (device.organizationId() == null || context.canAccessOrganization(device.organizationId()))
                && (device.departmentId() == null || context.canAccessDepartment(device.departmentId()));
    }

    private boolean matchesDocumentType(TreatmentExecutionTaskView task, String documentType) {
        boolean infusion = task.items().stream().filter(value -> !value.cancelled())
                .map(TreatmentExecutionItemView::routeCode).anyMatch(this::isInfusionRoute);
        return "ORAL_MEDICATION_CARD".equals(documentType) ? !infusion : infusion;
    }

    private boolean isInfusionRoute(String route) {
        if (route == null) return false;
        String code = route.toUpperCase(Locale.ROOT).replace('-', '_');
        return code.contains("IVGTT") || code.contains("INFUSION") || code.contains("静滴") || code.contains("静脉滴注");
    }

    private String exclusionCode(String status) { return switch (status) {
        case "WAITING_SETTLEMENT" -> "WAITING_SETTLEMENT"; case "WAITING_DISPENSE" -> "WAITING_DISPENSE";
        case "WAITING_SKIN_TEST" -> "WAITING_SKIN_TEST"; case "CANCELLED" -> "CANCELLED";
        case "EXCEPTION" -> "CLINICAL_EXCEPTION"; default -> PRINTABLE_STATUSES.contains(status) ? null : "NOT_READY";
    }; }

    private String exclusionReason(String status) { return switch (status) {
        case "WAITING_SETTLEMENT" -> "费用尚未结算"; case "WAITING_DISPENSE" -> "药房尚未完成发药";
        case "WAITING_SKIN_TEST" -> "尚未取得可放行的皮试结果"; case "CANCELLED" -> "医嘱或执行任务已取消";
        case "EXCEPTION" -> "执行任务存在临床异常，需人工处理"; default -> PRINTABLE_STATUSES.contains(status) ? null : "任务尚未就绪";
    }; }

    private void validateCreate(CreateBatchCommand command) {
        if (command == null || command.sourceIds() == null || command.sourceIds().isEmpty())
            throw badRequest("PRINT_BATCH_SELECTION_REQUIRED", "请至少选择一个待打印任务");
        if (clean(command.idempotencyKey()) == null || command.idempotencyKey().trim().length() > 128)
            throw badRequest("PRINT_BATCH_IDEMPOTENCY_INVALID", "打印请求幂等键不能为空且不能超过 128 字");
        if (command.startSlot() != null && command.startSlot() < 1)
            throw badRequest("PRINT_BATCH_START_SLOT_INVALID", "起始格必须大于等于 1");
    }

    private void validateLayout(String layoutStrategy, PrintMediaProfile outputMedia, int startSlot,
                                ResolvedTemplate resolved) {
        int capacity = outputMedia.columns() * outputMedia.rows();
        if ("SHEET_GRID".equals(layoutStrategy)) {
            if (!"SHEET".equals(outputMedia.mediaKind()) || outputMedia.heightMm() == null) {
                throw badRequest("PRINT_BATCH_SHEET_REQUIRED", "多联组版必须选择固定尺寸纸张");
            }
            if (startSlot > capacity) {
                throw badRequest("PRINT_BATCH_START_SLOT_INVALID", "起始格不能超过当前纸张的总格数");
            }
        } else {
            if (!outputMedia.id().equals(resolved.media.id())) {
                throw badRequest("PRINT_BATCH_LAYOUT_MEDIA_MISMATCH", "选择其他纸张时必须使用多联组版");
            }
            if (startSlot != 1) throw badRequest("PRINT_BATCH_START_SLOT_INVALID", "单卡分页只能从第 1 格开始");
        }
    }

    private void validateDevice(DeviceCommand command) {
        if (command == null || clean(command.deviceCode()) == null || clean(command.deviceName()) == null)
            throw badRequest("PRINT_DEVICE_INVALID", "设备编码和名称不能为空");
        if (!Set.of("BROWSER_PDF", "LOCAL_BRIDGE").contains(command.channel()))
            throw badRequest("PRINT_DEVICE_CHANNEL_INVALID", "打印设备通道不受支持");
        if (!Set.of("PDF", "ZPL", "TSPL", "ESC_POS").contains(command.outputLanguage()))
            throw badRequest("PRINT_DEVICE_LANGUAGE_INVALID", "打印设备输出语言不受支持");
    }

    private String normalizeDocumentType(String value) {
        String normalized = normalizeCode(value);
        if (!BATCH_DOCUMENT_TYPES.contains(normalized)) throw badRequest("PRINT_DOCUMENT_TYPE_INVALID", "当前仅支持口服卡、输液瓶签和输液巡视卡");
        return normalized;
    }

    private String normalizeRoutableDocumentType(String value, ExecutionContext context) {
        String normalized = normalizeCode(value);
        resolveTemplate(context, normalized);
        return normalized;
    }

    private boolean supportsMedia(PrintDevice device, String mediaCode) {
        try {
            var codes = jsonCodec.readTree(device.capabilitiesJson()).path("mediaCodes");
            if (!codes.isArray() || codes.isEmpty()) return true;
            for (var code : codes) if (mediaCode.equals(code.asString())) return true;
            return false;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private String normalizeLayout(String value) {
        String normalized = clean(value) == null ? "ONE_CARD_PER_PAGE" : value.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ONE_CARD_PER_PAGE", "SHEET_GRID").contains(normalized))
            throw badRequest("PRINT_BATCH_LAYOUT_INVALID", "批量组版策略不受支持");
        return normalized;
    }

    private ExecutionContext context() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext() || context.departmentId() == null)
            throw forbidden("PRINT_WORK_CONTEXT_REQUIRED", "临床打印前必须选择工作机构和科室");
        return context;
    }

    private TemplateView templateView(ResolvedTemplate value) {
        return new TemplateView(value.template.id(), value.template.templateCode(), value.template.templateName(),
                value.template.documentType(), value.version.id(), value.version.versionNo(), value.version.layoutSchema());
    }
    private MediaView mediaView(PrintMediaProfile value) { return new MediaView(value.id(), value.mediaCode(),
            value.mediaName(), value.mediaKind(), value.widthMm(), value.heightMm(), value.columns(), value.rows(), value.dpi()); }
    private DeviceView deviceView(PrintDevice value, boolean defaultDevice) { return new DeviceView(value.id(),
            value.revision(), value.deviceCode(), value.deviceName(), value.channel(), value.outputLanguage(),
            value.queueName(), defaultDevice, value.lastSeenAt(), value.status(), value.capabilitiesJson()); }
    private BindingView bindingView(PrintDeviceBinding value) { return new BindingView(value.id(), value.revision(),
            value.documentType(), value.mediaProfileId(), value.deviceId(), value.defaultDevice(), value.status()); }
    private String itemKey(Long tenantId, String type, Long sourceId, long sourceVersion, Long versionId,
                           Long mediaProfileId, LocalDate date) {
        return sha256((tenantId + "|" + type + "|" + sourceId + "|" + sourceVersion + "|" + versionId
                + "|" + mediaProfileId + "|" + date)
                .getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
    private String sha256(byte[] value) { try { return HexFormat.of().withUpperCase().formatHex(
            MessageDigest.getInstance("SHA-256").digest(value)); } catch (Exception exception) {
        throw new IllegalStateException("SHA-256 is unavailable", exception); } }
    private String normalizeCode(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String defaultJson(String value) { return clean(value) == null ? "{}" : value.trim(); }
    private String first(String left, String right) { return clean(left) == null ? clean(right) : clean(left); }
    private String doseText(TreatmentExecutionItemView item) {
        if (item.doseValue() == null) return "按医嘱";
        return item.doseValue().stripTrailingZeros().toPlainString() + (clean(item.doseUnit()) == null ? "" : item.doseUnit());
    }
    private String documentName(String value) { return switch (value) {
        case "ORAL_MEDICATION_CARD" -> "口服药卡"; case "INFUSION_LABEL" -> "输液瓶签";
        case "INFUSION_PATROL_CARD" -> "输液巡视卡"; default -> value;
    }; }

    private String taskCode(String documentType) { return switch (documentType) {
        case "OUTPATIENT_NOTE" -> PrintTaskCodes.OUTPATIENT_MEDICAL_RECORD;
        case "OUTPATIENT_PRESCRIPTION" -> PrintTaskCodes.OUTPATIENT_WESTERN_PRESCRIPTION;
        case "LABORATORY_APPLICATION" -> PrintTaskCodes.LABORATORY_APPLICATION;
        case "EXAMINATION_APPLICATION" -> PrintTaskCodes.EXAMINATION_APPLICATION;
        case "TREATMENT_APPLICATION" -> PrintTaskCodes.TREATMENT_APPLICATION;
        case "ORAL_MEDICATION_CARD" -> PrintTaskCodes.ORAL_MEDICATION_CARD;
        case "INFUSION_LABEL" -> PrintTaskCodes.INFUSION_LABEL;
        case "INFUSION_PATROL_CARD" -> PrintTaskCodes.INFUSION_PATROL_CARD;
        default -> throw badRequest("PRINT_DOCUMENT_TYPE_INVALID", "当前文档类型没有标准打印任务");
    }; }

    private record ResolvedTemplate(PrintTaskResolutionService.ResolvedPrintTask task, PrintTemplate template,
                                    PrintTemplateVersion version, PrintMediaProfile media) {}

    private record PendingBatchItem(TreatmentExecutionTaskView task, CandidateView candidate,
            Map<String, Object> snapshot, boolean include, String exclusionCode, String exclusionReason,
            String reprintReason) {}

    public record CreateBatchCommand(String documentType, List<Long> sourceIds, Long mediaProfileId, Long deviceId,
            String idempotencyKey, String layoutStrategy, Integer startSlot, String reprintReason) {}
    public record DeviceCommand(long expectedRevision, String deviceCode, String deviceName, String channel,
            String outputLanguage, String queueName, String capabilitiesJson, String status) {}
    public record BindingCommand(long expectedRevision, String documentType, Long mediaProfileId, Long deviceId) {}
    public record PreparationView(TemplateView template, MediaView media, List<MediaView> mediaProfiles,
            List<DeviceView> devices, Long defaultDeviceId, List<CandidateView> candidates) {}
    public record TemplateView(Long id, String templateCode, String templateName, String documentType,
            Long versionId, int version, String layoutSchema) {}
    public record MediaView(Long id, String mediaCode, String mediaName, String mediaKind,
            BigDecimal widthMm, BigDecimal heightMm, int columns, int rows, int dpi) {}
    public record DeviceView(Long id, long revision, String deviceCode, String deviceName, String channel,
            String outputLanguage, String queueName, boolean defaultDevice, Instant lastSeenAt,
            String status, String capabilitiesJson) {}
    public record CandidateView(Long sourceId, long sourceVersion, String taskNo, String status, Long residentId,
            String residentName, String healthRecordNo, Long encounterId, Instant createdAt, String medicationSummary,
            String routeSummary, int itemCount, boolean eligible, String exclusionCode, String exclusionReason,
            boolean printedBefore, String itemKey) {}
    public record BatchView(Long id, long revision, String documentType, String documentName, String status,
            String templateName, Long templateVersionId, String mediaName, String mediaCode, Long deviceId,
            String deviceName, LocalDate businessDate, String layoutStrategy, int startSlot, int selectedCount,
            int includedCount, int excludedCount, int pageCount, Long outputId, Long jobId, String downloadUrl,
            Instant createdAt, Long createdBy, DeliveryView delivery, List<BatchItemView> items) {}
    public record BatchItemView(Long id, Long sourceId, long sourceVersion, Long residentId, Long encounterId,
            String status, String exclusionCode, String exclusionReason, Integer pageNo, Integer slotNo,
            String reprintReason) {}
    public record DeliveryView(Long id, long revision, String channel, String status, int attemptCount,
            String errorCode, String errorMessage, Instant queuedAt, Instant sentAt, Instant confirmedAt) {}
    public record BridgeJobView(Long deliveryId, long revision, Long batchId, String fileName, String mediaType,
            String downloadUrl, String outputLanguage, String queueName, String digestAlgorithm, String digest) {}
    public record BindingView(Long id, long revision, String documentType, Long mediaProfileId, Long deviceId,
            boolean defaultDevice, String status) {}
    public record DeviceManagementView(List<DeviceView> devices, List<BindingView> bindings) {}
    public record AcknowledgementView(String status, DeliveryView delivery, BatchView batch) {}
}
