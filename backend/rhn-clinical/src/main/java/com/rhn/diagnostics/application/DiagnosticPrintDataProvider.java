package com.rhn.diagnostics.application;

import com.rhn.diagnostics.api.DiagnosticReportResponse;
import com.rhn.diagnostics.domain.DiagnosticExecutionTask;
import com.rhn.diagnostics.domain.DiagnosticSpecimenTask;
import com.rhn.diagnostics.infrastructure.DiagnosticExecutionTaskRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticSpecimenRepository;
import com.rhn.diagnostics.infrastructure.DiagnosticSpecimenTaskRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.printing.api.PrintDataProvider;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintDataSnapshot;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** Frozen clinical payloads use the platform's tasks, templates, outputs and delivery receipts. */
@Service
public class DiagnosticPrintDataProvider implements PrintDataProvider {
    private final DiagnosticReportAccess access;
    private final DiagnosticExchangeService exchange;
    private final DiagnosticExecutionTaskRepository tasks;
    private final DiagnosticExecutionService execution;
    private final DiagnosticSpecimenRepository specimens;
    private final DiagnosticSpecimenTaskRepository specimenTasks;
    private final DiagnosticImageService images;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;
    private final ExecutionContextProvider contexts;

    public DiagnosticPrintDataProvider(DiagnosticReportAccess access, DiagnosticExchangeService exchange,
                                      DiagnosticExecutionTaskRepository tasks, DiagnosticExecutionService execution,
                                      DiagnosticSpecimenRepository specimens, DiagnosticSpecimenTaskRepository specimenTasks,
                                      DiagnosticImageService images, ResidentDirectory residents,
                                      OrganizationDirectory organizations, ExecutionContextProvider contexts) {
        this.access = access; this.exchange = exchange; this.tasks = tasks; this.execution = execution;
        this.specimens = specimens; this.specimenTasks = specimenTasks; this.images = images;
        this.residents = residents; this.organizations = organizations; this.contexts = contexts;
    }
    @Override public String providerCode() { return "DIAGNOSTICS"; }

    @Override
    @Transactional
    public PrintDataSnapshot load(PrintDataRequest input) {
        return PrintTaskCodes.SPECIMEN_LABEL.equals(input.taskCode()) ? label(input) : report(input);
    }

    private PrintDataSnapshot report(PrintDataRequest input) {
        var source = access.require(input.source().sourceId());
        var task = tasks.lockByTenantIdAndRequestId(source.tenantId(), source.requestId())
                .orElseThrow(() -> conflict("DIAGNOSTIC_PRINT_TASK_MISSING", "此报告缺少可核对的执行任务"));
        String expected = "LABORATORY".equals(source.reportType()) ? PrintTaskCodes.LABORATORY_REPORT : PrintTaskCodes.EXAMINATION_REPORT;
        if (!expected.equals(input.taskCode()) || !source.encounterId().equals(input.source().encounterId()))
            throw conflict("DIAGNOSTIC_PRINT_SOURCE_MISMATCH", "打印任务或就诊与报告不一致");
        if (!List.of("FINAL", "CORRECTED").contains(source.status())
                || !source.id().equals(task.reportId()) || !"COMPLETED".equals(task.status().name()))
            throw conflict("DIAGNOSTIC_PRINT_CURRENT_REQUIRED", "只可生成当前有效正式报告；历史制品通过打印审计查看");
        var report = exchange.readReport(source.id());
        var payload = base(source.residentId());
        payload.put("title", source.reportName());
        payload.put("reportNo", source.externalReportId()); payload.put("reportVersion", source.reportVersion());
        payload.put("conclusion", source.conclusion()); payload.put("findings", source.findings());
        payload.put("authorName", source.authorName() == null ? "未记录录入人" : source.authorName());
        payload.put("signerName", source.signerName() == null ? "未记录签发人" : source.signerName());
        payload.put("issuedAt", source.issuedAt()); payload.put("correctionReason", source.correctionReason());
        payload.put("contentDigest", source.contentDigest()); payload.put("items", report.observations().stream().map(this::observation).toList());
        payload.put("images", report.images().stream().map(image -> {
            var content = images.readReport(source.id(), image.id());
            Map<String, Object> frozen = new LinkedHashMap<>();
            frozen.put("contentHash", image.contentHash()); frozen.put("caption", image.caption());
            frozen.put("mediaType", image.mediaType()); frozen.put("contentBase64", Base64.getEncoder().encodeToString(content.bytes()));
            return frozen;
        }).toList());
        var context = contexts.requireCurrent();
        return new PrintDataSnapshot("DiagnosticReport", source.id(), source.reportVersion(), source.residentId(),
                source.encounterId(), context.organizationId(), context.departmentId(),
                source.reportName() + "-V" + source.reportVersion() + ".pdf", payload);
    }

    private PrintDataSnapshot label(PrintDataRequest input) {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("DIAGNOSTICS.ACCESS") && !context.hasAuthority("ROLE_ADMIN"))
            throw forbidden("DIAGNOSTIC_PRINT_FORBIDDEN", "标本标签仅供授权医技人员生成");
        com.rhn.diagnostics.api.DiagnosticPermissions.require(context, "LABORATORY", "EXECUTE");
        var specimen = specimens.findByIdAndTenantId(input.source().sourceId(), context.tenantId())
                .orElseThrow(() -> notFound("DIAGNOSTIC_SPECIMEN_NOT_FOUND", "未找到标本"));
        var linked = specimenTasks.findByTenantIdAndSpecimenId(context.tenantId(), specimen.id()).stream()
                .map(DiagnosticSpecimenTask::taskId).distinct().sorted().map(execution::requireLocalTask).toList();
        if (linked.isEmpty() || !specimen.encounterId().equals(input.source().encounterId()) || "REJECTED".equals(specimen.status())
                || linked.stream().anyMatch(task -> List.of("CANCELLED", "EXCEPTION").contains(task.status().name())))
            throw conflict("DIAGNOSTIC_LABEL_SOURCE_INVALID", "标本已拒收、申请已取消或关联不一致，不能打印作业标签");
        var payload = base(specimen.residentId());
        payload.put("barcode", specimen.specimenNo()); payload.put("specimenNo", specimen.specimenNo());
        payload.put("specimenName", specimen.specimenName()); payload.put("containerName", specimen.containerName());
        payload.put("itemsText", linked.stream().map(DiagnosticExecutionTask::itemNameSnapshot).collect(Collectors.joining("、")));
        payload.put("collectedAt", specimen.collectedAt());
        return new PrintDataSnapshot("DiagnosticSpecimen", specimen.id(), specimen.revision(), specimen.residentId(),
                specimen.encounterId(), specimen.organizationId(), specimen.departmentId(),
                "标本标签-" + specimen.specimenNo() + ".pdf", payload);
    }

    private Map<String, Object> base(Long residentId) {
        var context = contexts.requireCurrent();
        var resident = residents.requireSnapshot(context.tenantId(), residentId);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("organizationName", organizations.requireOrganization(context.tenantId(), context.organizationId()).name());
        payload.put("departmentName", organizations.requireDepartment(context.tenantId(), context.organizationId(), context.departmentId()).name());
        Map<String, Object> patient = new LinkedHashMap<>();
        patient.put("fullName", resident.fullName()); patient.put("healthRecordNo", resident.healthRecordNo());
        patient.put("gender", resident.gender()); patient.put("birthDate", resident.birthDate());
        payload.put("resident", patient); return payload;
    }
    private String comparator(String value) {
        if (value == null) return "";
        return switch (value) { case "LT" -> "<"; case "LE" -> "≤"; case "GT" -> ">"; case "GE" -> "≥"; default -> ""; };
    }
    private Map<String, Object> observation(DiagnosticReportResponse.ObservationView item) {
        Map<String, Object> row = new LinkedHashMap<>();
        Object result = switch (item.valueType()) {
            case "NUMBER" -> item.valueNumber() == null ? null : comparator(item.valueComparator()) + item.valueNumber();
            case "STRING" -> item.valueString();
            case "CODE" -> item.valueCode();
            case "BOOLEAN" -> item.valueBoolean();
            case "DATETIME" -> item.valueDateTime();
            default -> null;
        };
        row.put("name", item.observationName()); row.put("value", result == null ? "结果缺失" : result);
        row.put("unit", item.unitCode()); row.put("range", (item.referenceRangeLow() == null ? "—" : item.referenceRangeLow())
                + "～" + (item.referenceRangeHigh() == null ? "—" : item.referenceRangeHigh()));
        row.put("flag", item.interpretationCode() == null ? "NO_RULE".equals(item.ruleStatus()) ? "未配置适用规则" : "未判定" : item.interpretationCode());
        row.put("ruleStatus", item.ruleStatus()); row.put("ruleSnapshot", item.ruleSnapshot());
        return row;
    }
}
