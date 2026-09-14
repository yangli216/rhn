package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintBusinessDefinition;
import com.rhn.platform.printing.domain.PrintImplementation;
import com.rhn.platform.printing.domain.PrintImplementationBinding;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.domain.PrintTemplateVersion;
import com.rhn.platform.printing.infrastructure.PrintBusinessDefinitionRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationBindingRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateVersionRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PrintTaskResolutionService {
    private final PrintBusinessDefinitionRepository tasks;
    private final PrintImplementationBindingRepository bindings;
    private final PrintImplementationRepository implementations;
    private final PrintTemplateRepository templates;
    private final PrintTemplateVersionRepository versions;
    private final JsonCodec jsonCodec;

    public PrintTaskResolutionService(PrintBusinessDefinitionRepository tasks,
                                      PrintImplementationBindingRepository bindings,
                                      PrintImplementationRepository implementations,
                                      PrintTemplateRepository templates,
                                      PrintTemplateVersionRepository versions, JsonCodec jsonCodec) {
        this.tasks = tasks; this.bindings = bindings; this.implementations = implementations;
        this.templates = templates; this.versions = versions; this.jsonCodec = jsonCodec;
    }

    public ResolvedPrintTask resolve(String taskCode, String purpose, ExecutionContext context) {
        String normalizedTask = normalizeTaskCode(taskCode);
        PrintBusinessDefinition task = tasks.findByTaskCodeAndStatus(normalizedTask, "ACTIVE")
                .orElseThrow(() -> notFound("PRINT_TASK_NOT_FOUND", "未找到可用的标准打印任务"));
        requirePurpose(task, purpose);
        return resolve(task, purpose, context, false);
    }

    private ResolvedPrintTask resolve(PrintBusinessDefinition task, String purpose, ExecutionContext context,
                                      boolean platformOnly) {
        Instant now = Instant.now();
        List<PrintImplementationBinding> candidates = bindings
                .findByTaskDefinitionIdAndStatus(task.id(), "ACTIVE").stream()
                .filter(value -> value.effectiveAt(now))
                .filter(value -> purpose.equals(value.purpose()) || "*".equals(value.purpose()))
                .filter(value -> platformOnly ? "PLATFORM".equals(value.scopeType()) : inScope(value, context))
                .sorted(Comparator.comparingInt((PrintImplementationBinding value) -> score(value, purpose)).reversed())
                .toList();
        if (candidates.isEmpty()) {
            throw notFound("PRINT_IMPLEMENTATION_BINDING_NOT_FOUND", "当前打印任务没有生效的实现绑定");
        }
        PrintImplementationBinding binding = candidates.getFirst();
        int bestScore = score(binding, purpose);
        if (candidates.stream().skip(1).anyMatch(value -> score(value, purpose) == bestScore)) {
            throw conflict("PRINT_IMPLEMENTATION_BINDING_CONFLICT", "当前打印任务存在重叠的生效实现绑定");
        }
        try {
            return materialize(task, binding);
        } catch (RuntimeException exception) {
            if (!platformOnly && !"PLATFORM".equals(binding.scopeType())
                    && "PLATFORM_DEFAULT".equals(binding.fallbackPolicy())) {
                return resolve(task, purpose, context, true);
            }
            throw exception;
        }
    }

    private ResolvedPrintTask materialize(PrintBusinessDefinition task, PrintImplementationBinding binding) {
        PrintImplementation implementation = implementations.findById(binding.implementationId())
                .filter(value -> "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("PRINT_IMPLEMENTATION_NOT_FOUND", "打印实现不存在或已停用"));
        if (!task.payloadSchema().equals(implementation.payloadSchema())) {
            throw conflict("PRINT_PAYLOAD_SCHEMA_INCOMPATIBLE", "打印实现与标准任务的数据契约不兼容");
        }
        if (!"INTERNAL_TEMPLATE".equals(implementation.rendererType())) {
            throw notFound("PRINT_RENDERER_ADAPTER_UNAVAILABLE", "当前打印实现对应的报表适配器尚未启用");
        }
        PrintTemplate template = templates.findById(implementation.templateId())
                .filter(value -> "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_NOT_FOUND", "打印实现关联的模板不存在或已停用"));
        PrintTemplateVersion version = versions.findByTemplateIdAndVersionNo(template.id(), template.currentVersion())
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_VERSION_NOT_FOUND", "打印实现关联的模板版本不存在"));
        return new ResolvedPrintTask(task, binding, implementation, template, version);
    }

    private boolean inScope(PrintImplementationBinding value, ExecutionContext context) {
        return switch (value.scopeType()) {
            case "DEPARTMENT" -> value.tenantId().equals(context.tenantId())
                    && value.organizationId().equals(context.organizationId())
                    && value.departmentId().equals(context.departmentId());
            case "ORGANIZATION" -> value.tenantId().equals(context.tenantId())
                    && value.organizationId().equals(context.organizationId());
            case "TENANT" -> value.tenantId().equals(context.tenantId());
            case "PLATFORM" -> true;
            default -> false;
        };
    }

    private int score(PrintImplementationBinding value, String purpose) {
        int scope = switch (value.scopeType()) {
            case "DEPARTMENT" -> 400;
            case "ORGANIZATION" -> 300;
            case "TENANT" -> 200;
            case "PLATFORM" -> 100;
            default -> 0;
        };
        return scope + (purpose.equals(value.purpose()) ? 10 : 0);
    }

    private void requirePurpose(PrintBusinessDefinition task, String purpose) {
        if (purpose == null || purpose.isBlank()) throw badRequest("PRINT_PURPOSE_INVALID", "打印用途不能为空");
        var values = jsonCodec.readTree(task.purposesJson());
        for (var value : values) if (purpose.equals(value.asString())) return;
        throw badRequest("PRINT_PURPOSE_INVALID", "当前标准打印任务不支持该打印用途");
    }

    private String normalizeTaskCode(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (!normalized.matches("[A-Z][A-Z0-9_.]{2,99}")) {
            throw badRequest("PRINT_TASK_CODE_INVALID", "标准打印任务编码格式不正确");
        }
        return normalized;
    }

    public record ResolvedPrintTask(PrintBusinessDefinition task, PrintImplementationBinding binding,
                                    PrintImplementation implementation, PrintTemplate template,
                                    PrintTemplateVersion version) {}
}
