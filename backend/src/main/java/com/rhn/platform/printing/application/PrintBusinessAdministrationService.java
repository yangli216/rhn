package com.rhn.platform.printing.application;

import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.printing.domain.PrintBusinessDefinition;
import com.rhn.platform.printing.domain.PrintImplementation;
import com.rhn.platform.printing.domain.PrintImplementationBinding;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.infrastructure.PrintBusinessDefinitionRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationBindingRepository;
import com.rhn.platform.printing.infrastructure.PrintImplementationRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PrintBusinessAdministrationService {
    private final PrintBusinessDefinitionRepository tasks;
    private final PrintImplementationRepository implementations;
    private final PrintImplementationBindingRepository bindings;
    private final PrintTemplateRepository templates;
    private final PrintTaskResolutionService resolver;
    private final ExecutionContextProvider contexts;
    private final OrganizationDirectory organizations;
    private final JsonCodec jsonCodec;

    public PrintBusinessAdministrationService(PrintBusinessDefinitionRepository tasks,
            PrintImplementationRepository implementations, PrintImplementationBindingRepository bindings,
            PrintTemplateRepository templates, PrintTaskResolutionService resolver,
            ExecutionContextProvider contexts, OrganizationDirectory organizations, JsonCodec jsonCodec) {
        this.tasks = tasks; this.implementations = implementations; this.bindings = bindings;
        this.templates = templates; this.resolver = resolver; this.contexts = contexts;
        this.organizations = organizations; this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    public Overview overview() {
        ExecutionContext context = context();
        List<TaskView> taskViews = tasks.findByStatusOrderByCategoryAscTaskNameAsc("ACTIVE").stream()
                .map(this::taskView).toList();
        List<ImplementationView> implementationViews = implementations
                .findByStatusOrderByImplementationNameAsc("ACTIVE").stream()
                .filter(value -> value.tenantId() == null || value.tenantId().equals(context.tenantId()))
                .map(this::implementationView).toList();
        List<BindingView> bindingViews = bindings
                .findByStatusOrderByTaskDefinitionIdAscScopeTypeAsc("ACTIVE").stream()
                .filter(value -> value.tenantId() == null || value.tenantId().equals(context.tenantId()))
                .map(value -> bindingView(value, context)).toList();
        String organizationName = organizations.requireOrganization(context.tenantId(), context.organizationId()).name();
        return new Overview(taskViews, implementationViews, bindingViews,
                context.tenantId(), context.organizationId(), context.departmentId(), organizationName);
    }

    @Transactional(readOnly = true)
    public ResolutionView preview(String taskCode, String purpose) {
        ExecutionContext context = context();
        var resolved = resolver.resolve(taskCode, purpose, context);
        List<ResolutionStep> trace = new ArrayList<>();
        for (String scope : List.of("DEPARTMENT", "ORGANIZATION", "TENANT", "PLATFORM")) {
            List<PrintImplementationBinding> scoped = bindings
                    .findByTaskDefinitionIdAndStatus(resolved.task().id(), "ACTIVE").stream()
                    .filter(value -> value.scopeType().equals(scope))
                    .filter(value -> visibleInTrace(value, context))
                    .filter(value -> purpose.equals(value.purpose()) || "*".equals(value.purpose()))
                    .filter(value -> value.effectiveAt(java.time.Instant.now())).toList();
            if (scoped.isEmpty()) trace.add(new ResolutionStep(scope, "未配置", false, null));
            else scoped.forEach(value -> trace.add(new ResolutionStep(scope,
                    implementationName(value.implementationId()), value.id().equals(resolved.binding().id()), value.id())));
        }
        return new ResolutionView(taskView(resolved.task()), bindingView(resolved.binding(), context),
                implementationView(resolved.implementation()), resolved.template().templateCode(),
                resolved.template().templateName(), resolved.version().versionNo(), List.copyOf(trace));
    }

    @Transactional
    public BindingView bind(BindingCommand command) {
        ExecutionContext context = context();
        String scope = normalizeScope(command.scopeType());
        String purpose = normalizePurpose(command.purpose());
        PrintBusinessDefinition task = tasks.findById(command.taskDefinitionId())
                .filter(value -> "ACTIVE".equals(value.status()))
                .orElseThrow(() -> notFound("PRINT_TASK_NOT_FOUND", "标准打印任务不存在"));
        PrintImplementation implementation = implementations.findById(command.implementationId())
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> value.tenantId() == null || value.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> notFound("PRINT_IMPLEMENTATION_NOT_FOUND", "打印实现不存在或不属于当前租户"));
        if (!task.payloadSchema().equals(implementation.payloadSchema())) {
            throw conflict("PRINT_PAYLOAD_SCHEMA_INCOMPATIBLE", "打印实现与标准任务的数据契约不兼容");
        }
        requirePurpose(task, purpose);
        Long organizationId = List.of("ORGANIZATION", "DEPARTMENT").contains(scope)
                ? context.organizationId() : null;
        Long departmentId = "DEPARTMENT".equals(scope) ? context.departmentId() : null;
        List<PrintImplementationBinding> exact = bindings.findByTaskDefinitionIdAndStatus(task.id(), "ACTIVE").stream()
                .filter(value -> value.scopeType().equals(scope) && java.util.Objects.equals(value.tenantId(), context.tenantId()))
                .filter(value -> java.util.Objects.equals(value.organizationId(), organizationId))
                .filter(value -> java.util.Objects.equals(value.departmentId(), departmentId))
                .filter(value -> value.purpose().equals(purpose)).toList();
        if (exact.size() > 1) throw conflict("PRINT_IMPLEMENTATION_BINDING_CONFLICT", "当前作用域存在重叠的生效配置");
        PrintImplementationBinding binding = exact.isEmpty() ? null : exact.getFirst();
        String fallback = "PLATFORM_DEFAULT".equals(command.fallbackPolicy()) ? "PLATFORM_DEFAULT" : "FAIL_CLOSED";
        if (binding == null) binding = new PrintImplementationBinding(context.tenantId(), organizationId,
                departmentId, task.id(), purpose, implementation.id(), scope, fallback, context.subjectId());
        else binding.update(command.expectedRevision(), implementation.id(), fallback, "ACTIVE", context.subjectId());
        return bindingView(bindings.saveAndFlush(binding), context);
    }

    @Transactional
    public PrintImplementation ensureInternalTemplateImplementation(PrintTemplate template, String payloadSchema,
                                                                     Long actorId) {
        if (template.tenantId() == null) throw badRequest("PRINT_IMPLEMENTATION_SCOPE_INVALID", "平台模板由平台迁移统一注册");
        String code = "TMPL_" + template.id();
        PrintImplementation value = implementations.findByTenantIdAndImplementationCode(template.tenantId(), code)
                .orElse(null);
        if (value == null) value = new PrintImplementation(template.tenantId(), code,
                template.templateName() + " 实现", template.id(), payloadSchema, actorId);
        else value.refresh(template.templateName() + " 实现", template.id(), payloadSchema, actorId);
        return implementations.saveAndFlush(value);
    }

    private TaskView taskView(PrintBusinessDefinition value) {
        List<String> purposes = new ArrayList<>();
        for (var item : jsonCodec.readTree(value.purposesJson())) purposes.add(item.asString());
        return new TaskView(value.id(), value.revision(), value.taskCode(), value.taskName(), value.category(),
                value.sourceType(), value.dataProviderCode(), value.payloadSchema(), value.schemaVersion(),
                List.copyOf(purposes), value.batchSupported(), value.status());
    }

    private ImplementationView implementationView(PrintImplementation value) {
        PrintTemplate template = value.templateId() == null ? null : templates.findById(value.templateId()).orElse(null);
        return new ImplementationView(value.id(), value.revision(), value.implementationCode(),
                value.implementationName(), value.rendererType(), value.adapterCode(), value.templateId(),
                template == null ? null : template.templateCode(), template == null ? null : template.templateName(),
                value.payloadSchema(), value.outputFormat(), value.tenantId() == null ? "PLATFORM" : "TENANT",
                value.status());
    }

    private BindingView bindingView(PrintImplementationBinding value, ExecutionContext context) {
        String ownerName = switch (value.scopeType()) {
            case "PLATFORM" -> "平台默认";
            case "TENANT" -> "当前租户";
            case "ORGANIZATION" -> value.organizationId().equals(context.organizationId())
                    ? organizations.requireOrganization(context.tenantId(), value.organizationId()).name() : "其他机构";
            case "DEPARTMENT" -> value.departmentId().equals(context.departmentId()) ? "当前科室" : "其他科室";
            default -> value.scopeType();
        };
        return new BindingView(value.id(), value.revision(), value.taskDefinitionId(), value.purpose(),
                value.implementationId(), value.scopeType(), ownerName, value.fallbackPolicy(),
                value.validFrom(), value.validTo(), value.status());
    }

    private boolean visibleInTrace(PrintImplementationBinding value, ExecutionContext context) {
        return switch (value.scopeType()) {
            case "PLATFORM" -> true;
            case "TENANT" -> value.tenantId().equals(context.tenantId());
            case "ORGANIZATION" -> value.tenantId().equals(context.tenantId())
                    && value.organizationId().equals(context.organizationId());
            case "DEPARTMENT" -> value.tenantId().equals(context.tenantId())
                    && value.organizationId().equals(context.organizationId())
                    && value.departmentId().equals(context.departmentId());
            default -> false;
        };
    }

    private String implementationName(Long id) {
        return implementations.findById(id).map(PrintImplementation::implementationName).orElse("实现不存在");
    }

    private void requirePurpose(PrintBusinessDefinition task, String purpose) {
        if ("*".equals(purpose)) return;
        for (var value : jsonCodec.readTree(task.purposesJson())) if (purpose.equals(value.asString())) return;
        throw badRequest("PRINT_PURPOSE_INVALID", "标准打印任务不支持该打印用途");
    }

    private String normalizeScope(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("TENANT", "ORGANIZATION", "DEPARTMENT").contains(normalized)) {
            throw forbidden("PRINT_BINDING_SCOPE_FORBIDDEN", "医院管理员只能维护租户、机构或科室级打印映射");
        }
        return normalized;
    }

    private String normalizePurpose(String value) {
        String normalized = value == null ? "*" : value.trim().toUpperCase(Locale.ROOT);
        if (!List.of("*", "CLINICAL_USE", "PATIENT_COPY", "ARCHIVE_COPY").contains(normalized)) {
            throw badRequest("PRINT_PURPOSE_INVALID", "打印用途不受支持");
        }
        return normalized;
    }

    private ExecutionContext context() {
        ExecutionContext context = contexts.requireCurrent();
        if (context.tenantId() == null || context.organizationId() == null || context.departmentId() == null) {
            throw forbidden("PRINT_WORK_CONTEXT_REQUIRED", "维护打印业务映射前必须选择工作机构和科室");
        }
        return context;
    }

    public record Overview(List<TaskView> tasks, List<ImplementationView> implementations,
                           List<BindingView> bindings, Long tenantId, Long organizationId,
                           Long departmentId, String organizationName) {}
    public record TaskView(Long id, long revision, String taskCode, String taskName, String category,
                           String sourceType, String dataProviderCode, String payloadSchema, int schemaVersion,
                           List<String> allowedPurposes, boolean batchSupported, String status) {}
    public record ImplementationView(Long id, long revision, String implementationCode,
            String implementationName, String rendererType, String adapterCode, Long templateId,
            String templateCode, String templateName, String payloadSchema, String outputFormat,
            String scope, String status) {}
    public record BindingView(Long id, long revision, Long taskDefinitionId, String purpose,
            Long implementationId, String scopeType, String ownerName, String fallbackPolicy,
            java.time.Instant validFrom, java.time.Instant validTo, String status) {}
    public record ResolutionStep(String scopeType, String result, boolean selected, Long bindingId) {}
    public record ResolutionView(TaskView task, BindingView binding, ImplementationView implementation,
            String templateCode, String templateName, int templateVersion, List<ResolutionStep> trace) {}
    public record BindingCommand(long expectedRevision, Long taskDefinitionId, String scopeType,
                                 String purpose, Long implementationId, String fallbackPolicy) {}
}
