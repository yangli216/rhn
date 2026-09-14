package com.rhn.platform.printing.application;

import com.rhn.platform.printing.api.PrintContent;
import com.rhn.platform.printing.api.PrintDataProvider;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintDataSnapshot;
import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintRequest;
import com.rhn.platform.printing.api.PrintRecordView;
import com.rhn.platform.printing.api.PrintTemplateView;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.printing.api.StandardPrintCommand;
import com.rhn.platform.printing.domain.PrintDelivery;
import com.rhn.platform.printing.domain.PrintDevice;
import com.rhn.platform.printing.domain.PrintDeviceBinding;
import com.rhn.platform.printing.domain.PrintJob;
import com.rhn.platform.printing.domain.PrintOutput;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.domain.PrintTemplateVersion;
import com.rhn.platform.printing.infrastructure.PrintDeliveryRepository;
import com.rhn.platform.printing.infrastructure.PrintDeviceBindingRepository;
import com.rhn.platform.printing.infrastructure.PrintDeviceRepository;
import com.rhn.platform.printing.infrastructure.PrintJobRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationBindingRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationRepository;
import com.rhn.platform.printing.infrastructure.PrintOutputRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateVersionRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.platform.idempotency.IdempotencyService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PrintingApplicationService implements PrintingService {
    private static final Set<String> PURPOSES = Set.of("CLINICAL_USE", "PATIENT_COPY", "ARCHIVE_COPY");
    private final PrintTemplateRepository templateRepository;
    private final PrintTemplateVersionRepository versionRepository;
    private final PrintOutputRepository outputRepository;
    private final PrintJobRepository jobRepository;
    private final PrintDeliveryRepository deliveryRepository;
    private final PrintDeviceBindingRepository bindingRepository;
    private final PrintDeviceRepository deviceRepository;
    private final ClinicalPdfRenderer renderer;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;
    private final PrintTaskResolutionService taskResolutionService;
    private final PrintImplementationRepository implementationRepository;
    private final PrintImplementationBindingRepository implementationBindingRepository;
    private final IdempotencyService idempotencyService;
    private final Map<String, PrintDataProvider> dataProviders;

    public PrintingApplicationService(PrintTemplateRepository templateRepository,
                                      PrintTemplateVersionRepository versionRepository,
                                      PrintOutputRepository outputRepository,
                                      PrintJobRepository jobRepository,
                                      PrintDeliveryRepository deliveryRepository,
                                      PrintDeviceBindingRepository bindingRepository,
                                      PrintDeviceRepository deviceRepository,
                                      ClinicalPdfRenderer renderer, JsonCodec jsonCodec,
                                      ExecutionContextProvider contextProvider,
                                      PrintTaskResolutionService taskResolutionService,
                                      PrintImplementationRepository implementationRepository,
                                      PrintImplementationBindingRepository implementationBindingRepository,
                                      IdempotencyService idempotencyService,
                                      List<PrintDataProvider> dataProviders) {
        this.templateRepository = templateRepository; this.versionRepository = versionRepository;
        this.outputRepository = outputRepository; this.jobRepository = jobRepository;
        this.deliveryRepository = deliveryRepository; this.bindingRepository = bindingRepository;
        this.deviceRepository = deviceRepository; this.renderer = renderer;
        this.jsonCodec = jsonCodec; this.contextProvider = contextProvider;
        this.taskResolutionService = taskResolutionService;
        this.implementationRepository = implementationRepository;
        this.implementationBindingRepository = implementationBindingRepository;
        this.idempotencyService = idempotencyService;
        this.dataProviders = dataProviders.stream().collect(Collectors.toUnmodifiableMap(
                PrintDataProvider::providerCode, Function.identity()));
    }

    @Override
    @Transactional
    public PrintReceipt submit(StandardPrintCommand command) {
        ExecutionContext context = requireContext();
        validate(command);
        PrintTaskResolutionService.ResolvedPrintTask resolved = taskResolutionService
                .resolve(command.taskCode(), command.purpose(), context);
        PrintDataProvider provider = dataProviders.get(resolved.task().dataProviderCode());
        if (provider == null) throw notFound("PRINT_DATA_PROVIDER_NOT_FOUND", "标准打印任务的数据提供器未注册");
        PrintDataSnapshot data = provider.load(new PrintDataRequest(resolved.task().taskCode(), command.source()));
        validateData(resolved, command, data);
        requireScope(context, data.organizationId(), data.departmentId());

        String key = clean(command.idempotencyKey());
        String operation = "STANDARD_PRINT:" + resolved.task().taskCode();
        if (key != null) {
            var reservation = idempotencyService.reserve(operation, key, jsonCodec.write(Map.of(
                    "taskCode", resolved.task().taskCode(), "sourceType", command.source().sourceType(),
                    "sourceId", command.source().sourceId(), "purpose", command.purpose(), "copies", command.copies())));
            if (reservation.replay()) return jsonCodec.read(reservation.responseJson(), PrintReceipt.class);
        }

        PrintReceipt receipt = generateResolved(context, resolved, data, command.purpose(), command.copies());
        if (key != null) idempotencyService.complete(operation, key, "PRINT_JOB", receipt.jobId(), 201,
                jsonCodec.write(receipt));
        return receipt;
    }

    @Override
    @Transactional
    public PrintReceipt generate(PrintRequest request) {
        ExecutionContext context = requireContext();
        validate(request);
        requireScope(context, request.organizationId(), request.departmentId());
        PrintTaskResolutionService.ResolvedPrintTask resolved = taskResolutionService
                .resolve(taskCodeForDocumentType(request.documentType()), request.purpose(), context);
        PrintDataSnapshot data = new PrintDataSnapshot(request.sourceType(), request.sourceId(), request.sourceVersion(),
                request.residentId(), request.encounterId(), request.organizationId(), request.departmentId(),
                request.suggestedFileName(), request.snapshot());
        return generateResolved(context, resolved, data, request.purpose(), request.copies());
    }

    private PrintReceipt generateResolved(ExecutionContext context, PrintTaskResolutionService.ResolvedPrintTask resolved,
                                          PrintDataSnapshot data, String purpose, int copies) {
        PrintTemplate template = resolved.template();
        PrintTemplateVersion version = resolved.version();
        Map<String, Object> snapshot = new LinkedHashMap<>(data.payload());
        snapshot.put("sourceType", data.sourceType()); snapshot.put("sourceId", data.sourceId());
        snapshot.put("sourceVersion", data.sourceVersion()); snapshot.put("purposeText", purposeText(purpose));
        snapshot.put("printTaskCode", resolved.task().taskCode());
        snapshot.put("payloadSchema", resolved.task().payloadSchema());
        byte[] pdf = renderer.render(template.documentType(), version.layoutSchema(), version.configJson(), snapshot);
        String digest = sha256(pdf);
        PrintOutput output = outputRepository.save(new PrintOutput(context.tenantId(), template, version,
                resolved.task(), resolved.implementation(), resolved.binding(), data.sourceType(), data.sourceId(),
                data.sourceVersion(), template.documentType(), data.residentId(), data.encounterId(),
                data.organizationId(), data.departmentId(), purpose, jsonCodec.write(snapshot),
                safeFileName(data.suggestedFileName()), pdf,
                "SHA-256", digest, context.subjectId()));
        PrintJob job = jobRepository.save(new PrintJob(context.tenantId(), output.id(), null, "ORIGINAL",
                copies, context.subjectId(), context.correlationId()));
        PrintDelivery delivery = createDelivery(context, template.documentType(), version.mediaProfileId(), job.id());
        return receipt(job, output, template, version, delivery, resolved.implementation().implementationCode(),
                resolved.binding().scopeType());
    }

    @Override
    @Transactional
    public PrintReceipt reprint(Long jobId, int copies) {
        ExecutionContext context = requireContext(); requireCopies(copies);
        PrintJob original = jobRepository.findByIdAndTenantId(jobId, context.tenantId())
                .orElseThrow(() -> notFound("PRINT_JOB_NOT_FOUND", "未找到打印任务"));
        PrintOutput output = requireOutput(original.outputId(), context);
        PrintJob root = original.originalJobId() == null ? original
                : jobRepository.findByIdAndTenantId(original.originalJobId(), context.tenantId()).orElse(original);
        PrintJob job = jobRepository.save(new PrintJob(context.tenantId(), output.id(), root.id(), "REPRINT",
                copies, context.subjectId(), context.correlationId()));
        PrintTemplate template = templateRepository.findById(output.templateId()).orElseThrow();
        PrintTemplateVersion version = versionRepository.findById(output.templateVersionId()).orElseThrow();
        PrintDelivery delivery = createDelivery(context, output.documentType(), version.mediaProfileId(), job.id());
        return receipt(job, output, template, version, delivery, implementationCode(output), implementationScope(output));
    }

    @Override
    @Transactional(readOnly = true)
    public PrintContent output(Long outputId) {
        PrintOutput output = requireOutput(outputId, requireContext());
        byte[] content = output.content();
        if (!output.contentDigest().equals(sha256(content))) {
            throw forbidden("PRINT_OUTPUT_INTEGRITY_FAILED", "打印输出完整性校验失败，禁止下载");
        }
        return new PrintContent(output.fileName(), output.mediaType(), content);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PrintRecordView> recordsByEncounter(Long encounterId) {
        ExecutionContext context = requireContext();
        if (encounterId == null) throw badRequest("PRINT_ENCOUNTER_REQUIRED", "就诊标识不能为空");
        return outputRepository.findByTenantIdAndEncounterIdOrderByGeneratedAtDesc(context.tenantId(), encounterId)
                .stream().map(output -> record(output, context)).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<PrintTemplateView> visibleTemplates() {
        ExecutionContext context = requireContext();
        Map<String, PrintTemplate> visible = new LinkedHashMap<>();
        templateRepository.findByTenantIdIsNullAndStatusOrderByDocumentType("ACTIVE")
                .forEach(value -> visible.put(value.documentType(), value));
        templateRepository.findByTenantIdAndStatusOrderByDocumentType(context.tenantId(), "ACTIVE")
                .forEach(value -> visible.put(value.documentType(), value));
        List<PrintTemplateView> result = new ArrayList<>();
        visible.values().forEach(template -> {
            PrintTemplateVersion version = versionRepository.findByTemplateIdAndVersionNo(template.id(), template.currentVersion())
                    .orElseThrow(() -> notFound("PRINT_TEMPLATE_VERSION_NOT_FOUND", "打印模板当前版本不存在"));
            result.add(new PrintTemplateView(template.id(), template.templateCode(), template.templateName(),
                    template.documentType(), template.tenantId() == null ? "PLATFORM" : "TENANT",
                    template.currentVersion(), version.layoutSchema()));
        });
        return List.copyOf(result);
    }

    private PrintOutput requireOutput(Long outputId, ExecutionContext context) {
        PrintOutput output = outputRepository.findByIdAndTenantId(outputId, context.tenantId())
                .orElseThrow(() -> notFound("PRINT_OUTPUT_NOT_FOUND", "未找到打印输出"));
        requireScope(context, output.organizationId(), output.departmentId());
        return output;
    }

    private void validate(PrintRequest request) {
        if (request.sourceType() == null || request.sourceType().isBlank() || request.sourceId() == null
                || request.sourceVersion() < 0 || request.documentType() == null || request.documentType().isBlank()) {
            throw badRequest("PRINT_SOURCE_INVALID", "打印来源、版本和文档类型不能为空");
        }
        if (!PURPOSES.contains(request.purpose())) throw badRequest("PRINT_PURPOSE_INVALID", "打印用途不受支持");
        requireCopies(request.copies());
    }

    private void validate(StandardPrintCommand command) {
        if (command == null || command.source() == null || command.source().sourceType() == null
                || command.source().sourceType().isBlank() || command.source().sourceId() == null) {
            throw badRequest("PRINT_SOURCE_INVALID", "标准打印任务的来源类型和来源标识不能为空");
        }
        requireCopies(command.copies());
        String key = clean(command.idempotencyKey());
        if (key != null && key.length() > 128) throw badRequest("PRINT_IDEMPOTENCY_KEY_INVALID", "打印幂等键不能超过 128 个字符");
    }

    private void validateData(PrintTaskResolutionService.ResolvedPrintTask resolved, StandardPrintCommand command,
                              PrintDataSnapshot data) {
        if (data == null || data.sourceId() == null || data.organizationId() == null || data.departmentId() == null
                || data.sourceVersion() < 0) throw badRequest("PRINT_DATA_INVALID", "打印数据提供器返回的数据不完整");
        if (!resolved.task().sourceType().equals(data.sourceType())
                || !data.sourceType().equals(command.source().sourceType())
                || !data.sourceId().equals(command.source().sourceId())) {
            throw badRequest("PRINT_SOURCE_CONTRACT_MISMATCH", "业务来源与标准打印任务的数据契约不匹配");
        }
    }

    private void requireCopies(int copies) {
        if (copies < 1 || copies > 10) throw badRequest("PRINT_COPIES_INVALID", "打印份数必须在 1 到 10 之间");
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.subjectId() == null || !context.hasWorkContext()) {
            throw forbidden("PRINT_WORK_CONTEXT_REQUIRED", "打印正式业务文件前必须选择工作机构和科室");
        }
        return context;
    }

    private void requireScope(ExecutionContext context, Long organizationId, Long departmentId) {
        if (organizationId == null || departmentId == null || !context.canAccessOrganization(organizationId)
                || !context.canAccessDepartment(departmentId)) {
            throw forbidden("PRINT_SOURCE_FORBIDDEN", "无权打印当前工作上下文之外的业务文件");
        }
    }

    private PrintReceipt receipt(PrintJob job, PrintOutput output, PrintTemplate template, PrintTemplateVersion version,
                                 PrintDelivery delivery, String implementationCode, String implementationScope) {
        PrintDevice device = delivery.deviceId() == null ? null : deviceRepository.findById(delivery.deviceId()).orElse(null);
        PrintReceipt.DeliveryReceipt deliveryReceipt = new PrintReceipt.DeliveryReceipt(delivery.id(), delivery.revision(),
                delivery.deviceId(), device == null ? "浏览器 PDF" : device.deviceName(), delivery.channel(),
                delivery.status(), delivery.attemptCount());
        return new PrintReceipt(job.id(), output.id(), job.originalJobId(), job.requestType(), job.status(), job.copies(),
                output.taskCode(), implementationCode, implementationScope, output.payloadSchema(), output.documentType(),
                template.templateCode(), version.versionNo(), output.fileName(),
                output.contentDigestAlgorithm(), output.contentDigest(), job.requestedAt(),
                "/api/platform/printing/outputs/" + output.id() + "/content", deliveryReceipt);
    }

    private PrintDelivery createDelivery(ExecutionContext context, String documentType, Long mediaProfileId, Long jobId) {
        PrintDevice device = mediaProfileId == null ? null : bindingRepository
                .findFirstByTenantIdAndOrganizationIdAndDepartmentIdAndDocumentTypeAndMediaProfileIdAndStatusOrderByDefaultDeviceDesc(
                        context.tenantId(), context.organizationId(), context.departmentId(), documentType,
                        mediaProfileId, "ACTIVE")
                .map(PrintDeviceBinding::deviceId)
                .flatMap(deviceRepository::findById)
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> inScope(value, context))
                .orElse(null);
        PrintDelivery delivery = new PrintDelivery(context.tenantId(), null, jobId,
                device == null ? null : device.id(), device == null ? "BROWSER_PDF" : device.channel());
        if (device != null && "LOCAL_BRIDGE".equals(device.channel())) delivery.queue(0);
        else delivery.sent(0);
        return deliveryRepository.save(delivery);
    }

    private boolean inScope(PrintDevice device, ExecutionContext context) {
        return (device.organizationId() == null || context.canAccessOrganization(device.organizationId()))
                && (device.departmentId() == null || context.canAccessDepartment(device.departmentId()));
    }

    private PrintRecordView record(PrintOutput output, ExecutionContext context) {
        requireScope(context, output.organizationId(), output.departmentId());
        PrintTemplate template = templateRepository.findById(output.templateId())
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_NOT_FOUND", "打印记录关联的模板不存在"));
        PrintTemplateVersion version = versionRepository.findById(output.templateVersionId())
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_VERSION_NOT_FOUND", "打印记录关联的模板版本不存在"));
        List<PrintRecordView.JobView> jobs = jobRepository
                .findByTenantIdAndOutputIdOrderByRequestedAtDesc(context.tenantId(), output.id()).stream()
                .map(job -> new PrintRecordView.JobView(job.id(), job.originalJobId(), job.requestType(),
                        job.status(), job.copies(), job.requestedAt(), job.requestedBy()))
                .toList();
        return new PrintRecordView(output.id(), output.sourceType(), output.sourceId(), output.sourceVersion(),
                output.taskCode(), output.implementationId(), output.implementationBindingId(), output.payloadSchema(),
                output.documentType(), output.residentId(), output.encounterId(), output.organizationId(),
                output.departmentId(), output.purpose(), output.fileName(), output.mediaType(),
                output.contentDigestAlgorithm(), output.contentDigest(), output.generatedAt(), output.generatedBy(),
                template.templateCode(), template.templateName(), version.versionNo(),
                "/api/platform/printing/outputs/" + output.id() + "/content", jobs);
    }

    private String safeFileName(String value) {
        String normalized = value == null || value.isBlank() ? "rhn-print.pdf" : value.trim();
        normalized = normalized.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "-");
        if (!normalized.toLowerCase(Locale.ROOT).endsWith(".pdf")) normalized += ".pdf";
        return normalized.length() > 300 ? normalized.substring(0, 296) + ".pdf" : normalized;
    }

    private String sha256(byte[] value) {
        try { return HexFormat.of().withUpperCase().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }

    private String purposeText(String purpose) { return switch (purpose) {
        case "CLINICAL_USE" -> "临床使用"; case "ARCHIVE_COPY" -> "归档副本"; default -> "患者副本";
    }; }

    private String taskCodeForDocumentType(String documentType) {
        return switch (documentType) {
            case "OUTPATIENT_NOTE" -> "OP.MEDICAL_RECORD.PRINT";
            case "OUTPATIENT_PRESCRIPTION" -> "OP.PRESCRIPTION.WESTERN.PRINT";
            case "LABORATORY_APPLICATION" -> "OP.APPLICATION.LAB.PRINT";
            case "EXAMINATION_APPLICATION" -> "OP.APPLICATION.EXAM.PRINT";
            case "TREATMENT_APPLICATION" -> "OP.APPLICATION.TREATMENT.PRINT";
            case "ORAL_MEDICATION_CARD" -> "TREATMENT.ORAL_MEDICATION_CARD.PRINT";
            case "INFUSION_LABEL" -> "TREATMENT.INFUSION_LABEL.PRINT";
            case "INFUSION_PATROL_CARD" -> "TREATMENT.INFUSION_PATROL_CARD.PRINT";
            default -> throw notFound("PRINT_TASK_NOT_FOUND", "当前文档类型没有标准打印任务");
        };
    }

    private String implementationCode(PrintOutput output) {
        if (output.implementationId() == null) return null;
        return implementationRepository.findById(output.implementationId())
                .map(value -> value.implementationCode()).orElse("#" + output.implementationId());
    }

    private String implementationScope(PrintOutput output) {
        if (output.implementationBindingId() == null) return null;
        return implementationBindingRepository.findById(output.implementationBindingId())
                .map(value -> value.scopeType()).orElse("FROZEN");
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
