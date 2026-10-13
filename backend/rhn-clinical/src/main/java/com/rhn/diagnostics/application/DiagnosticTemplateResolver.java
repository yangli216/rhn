package com.rhn.diagnostics.application;

import com.rhn.diagnostics.application.DiagnosticWorkspaceService.*;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.outpatient.api.ServiceRequestDirectory.ServiceRequestSnapshot;
import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory;
import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.*;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class DiagnosticTemplateResolver {
    private final DiagnosticTemplateDirectory templates;
    private final ResidentDirectory residents;
    private final JsonCodec json;
    public DiagnosticTemplateResolver(DiagnosticTemplateDirectory templates, ResidentDirectory residents, JsonCodec json) {
        this.templates = templates; this.residents = residents; this.json = json;
    }
    public TemplateView current(ServiceRequestSnapshot request) {
        return templates.current(request.tenantId(), request.performerOrganizationId(), request.catalogItemId(), request.businessDate()).orElse(null);
    }
    public LocalReportCommand resolve(ServiceRequestSnapshot request, LocalReportCommand input, Long savedVersion) {
        TemplateView current = current(request);
        if (input.templateVersionId() == null) {
            if (current != null) throw conflict("DIAGNOSTIC_TEMPLATE_REQUIRED", "该项目已有机构报告模板，请选择模板后录入");
            // Older/manual workflows remain explicit; no fabricated template evidence or normal flag.
            return copy(input, null, null, input.observations() == null ? null : input.observations().stream()
                    .map(item -> new LocalObservation(item.observationCode(), item.observationName(), item.valueType(),
                            item.observationValue(), item.unitCode(), item.referenceRangeLow(), item.referenceRangeHigh(),
                            item.interpretationCode(), item.valueComparator(), item.instrumentCode(), item.populationCode(),
                            "MANUAL_UNVERIFIED", null)).toList());
        }
        TemplateView version = templates.requireVersion(request.tenantId(), request.performerOrganizationId(), request.catalogItemId(),
                input.templateVersionId(), request.businessDate());
        if (!Objects.equals(savedVersion, version.id()) && (current == null || !Objects.equals(current.id(), version.id())))
            throw conflict("DIAGNOSTIC_TEMPLATE_VERSION_CONFLICT", "首次选用须使用业务日期有效的当前模板，已保存草稿可继续原版本");
        if (!"LABORATORY".equals(request.serviceType())) return copy(input, version.id(), json.write(version), List.of());
        var resident = residents.requireSnapshot(request.residentId());
        Long ageDays = resident.birthDate() == null || resident.birthDate().isAfter(request.businessDate()) ? null
                : ChronoUnit.DAYS.between(resident.birthDate(), request.businessDate());
        var definitions = version.content().indicators().stream().collect(java.util.stream.Collectors.toMap(Indicator::code, v -> v));
        var result = new ArrayList<LocalObservation>();
        var codes = new HashSet<String>();
        for (LocalObservation item : input.observations() == null ? List.<LocalObservation>of() : input.observations()) {
            if (item == null || !codes.add(item.observationCode())) throw badRequest("LABORATORY_RESULT_DUPLICATE", "指标缺失或代码重复");
            Indicator definition = definitions.get(item.observationCode());
            if (definition == null) throw badRequest("LABORATORY_TEMPLATE_INDICATOR_INVALID", "录入指标不属于所选模板");
            if (!definition.valueType().equals(item.valueType())) throw badRequest("LABORATORY_TEMPLATE_TYPE_MISMATCH", "结果类型与模板不一致");
            if (definition.specimenType() != null && !definition.specimenType().equals(request.specimenType()))
                throw conflict("LABORATORY_TEMPLATE_SPECIMEN_MISMATCH", "模板标本条件与申请不一致，请核对项目配置");
            String value = Strings.trimToNull(item.observationValue());
            var patient = new LaboratoryRuleEvaluator.PatientConditions(resident.gender(), ageDays,
                    Strings.trimToNull(item.instrumentCode()), Strings.trimToNull(item.populationCode()));
            var evaluation = value == null ? new LaboratoryRuleEvaluator.Evaluation("MISSING_VALUE", null, null, null, null)
                    : LaboratoryRuleEvaluator.evaluate(definition, value, item.valueComparator(), Strings.trimToNull(item.unitCode()), patient);
            String snapshot = json.write(new RuleEvidence(version.id(), version.version(), definition, evaluation,
                    resident.birthDate(), resident.gender(), request.businessDate(), patient));
            result.add(new LocalObservation(definition.code(), definition.name(), definition.valueType(), value == null ? "" : value,
                    definition.unitCode(), evaluation.referenceLow(), evaluation.referenceHigh(), evaluation.interpretationCode(),
                    "NUMBER".equals(definition.valueType()) ? Strings.trimToNull(item.valueComparator()) : null, patient.instrumentCode(), patient.populationCode(), evaluation.status(), snapshot));
        }
        // Template order is authoritative, independent of a reordered client request.
        var byCode = result.stream().collect(java.util.stream.Collectors.toMap(LocalObservation::observationCode, v -> v));
        return copy(input, version.id(), json.write(version), version.content().indicators().stream()
                .filter(v -> byCode.containsKey(v.code())).map(v -> byCode.get(v.code())).toList());
    }
    public void requireComplete(LocalReportCommand input, int imageCount) {
        if (input.templateSnapshot() == null) return;
        TemplateView template = json.read(input.templateSnapshot(), TemplateView.class);
        if ("EXAMINATION".equals(template.serviceType())) {
            if (imageCount < template.content().minimumImages()) throw conflict("DIAGNOSTIC_IMAGES_REQUIRED", "图像数量未达到机构模板要求");
            if (Strings.trimToNull(input.findings()) == null || Strings.trimToNull(input.conclusion()) == null)
                throw conflict("EXAMINATION_REPORT_REQUIRED", "请填写检查所见和诊断结论");
            if (hasPlaceholder(input.findings()) || hasPlaceholder(input.conclusion()))
                throw conflict("EXAMINATION_PLACEHOLDER_REQUIRED", "报告含未填写的词条占位项，请补全后签发");
            return;
        }
        List<LocalObservation> rows = input.observations() == null ? List.of() : input.observations();
        if (rows.stream().noneMatch(row -> Strings.trimToNull(row.observationValue()) != null))
            throw conflict("LABORATORY_REQUIRED_RESULT_MISSING", "至少填写一个有效检验指标结果");
        for (Indicator indicator : template.content().indicators()) {
            if (indicator.required() && rows.stream().noneMatch(row -> indicator.code().equals(row.observationCode())
                    && Strings.trimToNull(row.observationValue()) != null))
                throw conflict("LABORATORY_REQUIRED_RESULT_MISSING", "必填指标缺失：" + indicator.name());
        }
        for (LocalObservation row : rows) {
            if (row.ruleStatus() != null && Set.of("AMBIGUOUS_RULE", "POSSIBLE_CRITICAL").contains(row.ruleStatus()))
                throw conflict("LABORATORY_RULE_REVIEW_REQUIRED", "参考规则冲突或比较符结果可能涉及危急范围，请核对结果和规则后再签发");
        }
    }
    public static boolean hasPlaceholder(String value) {
        return value != null && (value.contains("{{") || value.contains("${") || value.contains("[待填写]") || value.contains("【待填写】"));
    }
    private LocalReportCommand copy(LocalReportCommand input, Long id, String snapshot, List<LocalObservation> rows) {
        return new LocalReportCommand(input.expectedRevision(), input.valueType(), input.observationValue(), input.unitCode(),
                input.referenceRangeLow(), input.referenceRangeHigh(), input.interpretationCode(), input.conclusion(), rows,
                input.findings(), input.expectedDraftRevision(), input.correctionReason(), input.commandId(), id, snapshot);
    }
    private record RuleEvidence(Long templateVersionId, int version, Indicator indicator,
            LaboratoryRuleEvaluator.Evaluation evaluation, java.time.LocalDate birthDate, String gender,
            java.time.LocalDate businessDate, LaboratoryRuleEvaluator.PatientConditions conditions) {}
}
