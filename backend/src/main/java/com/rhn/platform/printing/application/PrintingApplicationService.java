package com.rhn.platform.printing.application;

import com.rhn.platform.printing.api.PrintContent;
import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintRequest;
import com.rhn.platform.printing.api.PrintRecordView;
import com.rhn.platform.printing.api.PrintTemplateView;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.printing.domain.PrintJob;
import com.rhn.platform.printing.domain.PrintOutput;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.domain.PrintTemplateVersion;
import com.rhn.platform.printing.infrastructure.PrintJobRepository;
import com.rhn.platform.printing.infrastructure.PrintOutputRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateVersionRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
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
    private final ClinicalPdfRenderer renderer;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;

    public PrintingApplicationService(PrintTemplateRepository templateRepository,
                                      PrintTemplateVersionRepository versionRepository,
                                      PrintOutputRepository outputRepository,
                                      PrintJobRepository jobRepository,
                                      ClinicalPdfRenderer renderer, JsonCodec jsonCodec,
                                      ExecutionContextProvider contextProvider) {
        this.templateRepository = templateRepository; this.versionRepository = versionRepository;
        this.outputRepository = outputRepository; this.jobRepository = jobRepository; this.renderer = renderer;
        this.jsonCodec = jsonCodec; this.contextProvider = contextProvider;
    }

    @Override
    @Transactional
    public PrintReceipt generate(PrintRequest request) {
        ExecutionContext context = requireContext();
        validate(request);
        requireScope(context, request.organizationId(), request.departmentId());
        PrintTemplate template = resolveTemplate(context.tenantId(), request.documentType());
        PrintTemplateVersion version = versionRepository.findByTemplateIdAndVersionNo(template.id(), template.currentVersion())
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_VERSION_NOT_FOUND", "打印模板当前版本不存在"));
        Map<String, Object> snapshot = new LinkedHashMap<>(request.snapshot());
        snapshot.put("sourceType", request.sourceType()); snapshot.put("sourceId", request.sourceId());
        snapshot.put("sourceVersion", request.sourceVersion()); snapshot.put("purposeText", purposeText(request.purpose()));
        byte[] pdf = renderer.render(request.documentType(), snapshot);
        String digest = sha256(pdf);
        PrintOutput output = outputRepository.save(new PrintOutput(context.tenantId(), template, version,
                request.sourceType(), request.sourceId(), request.sourceVersion(), request.documentType(),
                request.residentId(), request.encounterId(), request.organizationId(), request.departmentId(),
                request.purpose(), jsonCodec.write(snapshot), safeFileName(request.suggestedFileName()), pdf,
                "SHA-256", digest, context.subjectId()));
        PrintJob job = jobRepository.save(new PrintJob(context.tenantId(), output.id(), null, "ORIGINAL",
                request.copies(), context.subjectId(), context.correlationId()));
        return receipt(job, output, template, version);
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
        return receipt(job, output, template, version);
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

    private PrintTemplate resolveTemplate(Long tenantId, String documentType) {
        return templateRepository.findFirstByTenantIdAndDocumentTypeAndStatusOrderByUpdatedAtDesc(
                        tenantId, documentType, "ACTIVE")
                .or(() -> templateRepository.findFirstByTenantIdIsNullAndDocumentTypeAndStatusOrderByUpdatedAtDesc(
                        documentType, "ACTIVE"))
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_NOT_FOUND", "当前文档类型没有已发布的打印模板"));
    }

    private void validate(PrintRequest request) {
        if (request.sourceType() == null || request.sourceType().isBlank() || request.sourceId() == null
                || request.sourceVersion() < 1 || request.documentType() == null || request.documentType().isBlank()) {
            throw badRequest("PRINT_SOURCE_INVALID", "打印来源、版本和文档类型不能为空");
        }
        if (!PURPOSES.contains(request.purpose())) throw badRequest("PRINT_PURPOSE_INVALID", "打印用途不受支持");
        requireCopies(request.copies());
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

    private PrintReceipt receipt(PrintJob job, PrintOutput output, PrintTemplate template, PrintTemplateVersion version) {
        return new PrintReceipt(job.id(), output.id(), job.originalJobId(), job.requestType(), job.status(), job.copies(),
                output.documentType(), template.templateCode(), version.versionNo(), output.fileName(),
                output.contentDigestAlgorithm(), output.contentDigest(), job.requestedAt(),
                "/api/platform/printing/outputs/" + output.id() + "/content");
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
}
