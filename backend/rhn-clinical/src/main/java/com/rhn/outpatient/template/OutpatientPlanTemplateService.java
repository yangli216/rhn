package com.rhn.outpatient.template;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.outpatient.api.OutpatientPlanTemplateContracts.*;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class OutpatientPlanTemplateService implements OutpatientPlanTemplateDirectory {
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private final OutpatientPlanTemplateRepository templates;
    private final OutpatientPlanDiagnosisRepository diagnoses;
    private final OutpatientPlanMedicationRepository medications;
    private final OutpatientPlanServiceRepository services;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final MedicationRouteDirectory medicationRouteDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final ExecutionContextProvider contextProvider;

    OutpatientPlanTemplateService(OutpatientPlanTemplateRepository templates,
                                  OutpatientPlanDiagnosisRepository diagnoses,
                                  OutpatientPlanMedicationRepository medications,
                                  OutpatientPlanServiceRepository services,
                                  CatalogLifecycleDirectory catalogDirectory,
                                  MedicationRouteDirectory medicationRouteDirectory,
                                  TerminologyDirectory terminologyDirectory,
                                  ExecutionContextProvider contextProvider) {
        this.templates = templates; this.diagnoses = diagnoses; this.medications = medications;
        this.services = services; this.catalogDirectory = catalogDirectory;
        this.medicationRouteDirectory = medicationRouteDirectory;
        this.terminologyDirectory = terminologyDirectory; this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    List<View> visible(String keyword) {
        ExecutionContext context = requireContext();
        List<OutpatientPlanTemplate> values = templates.findVisible(context.tenantId(), context.organizationId(),
                context.departmentId(), context.practitionerId());
        String term = clean(keyword);
        if (term != null) {
            String normalized = term.toLowerCase(Locale.ROOT);
            values = values.stream().filter(value -> value.name().toLowerCase(Locale.ROOT).contains(normalized)
                    || value.description() != null && value.description().toLowerCase(Locale.ROOT).contains(normalized))
                    .toList();
        }
        return views(values, context.tenantId());
    }

    @Override
    @Transactional(readOnly = true)
    public List<PlanTemplateSnapshot> visibleForCurrentContext() {
        ExecutionContext context = requireContext();
        List<OutpatientPlanTemplate> values = templates.findVisible(context.tenantId(), context.organizationId(),
                context.departmentId(), context.practitionerId());
        if (values.isEmpty()) return List.of();
        List<Long> templateIds = values.stream().map(OutpatientPlanTemplate::id).toList();
        Map<Long, List<OutpatientPlanDiagnosis>> diagnosisMap = groupDiagnoses(
                diagnoses.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
                        context.tenantId(), templateIds));
        Map<Long, List<OutpatientPlanMedication>> medicationMap = groupMedications(
                medications.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
                        context.tenantId(), templateIds));
        Map<Long, List<OutpatientPlanServiceLine>> serviceMap = groupServices(
                services.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(
                        context.tenantId(), templateIds));
        return values.stream().map(value -> new PlanTemplateSnapshot(
                value.id(), value.revision(), value.scopeType(), value.sourceType(), value.guidelineReference(),
                value.name(), value.description(), value.useCount(),
                diagnosisMap.getOrDefault(value.id(), List.of()).stream().map(diagnosis -> new DiagnosisSnapshot(
                        diagnosis.code(), diagnosis.name(), diagnosis.type())).toList(),
                medicationMap.getOrDefault(value.id(), List.of()).stream().map(line -> new MedicationSnapshot(
                        line.id(), line.medicationId(), line.catalogItemId(), line.packageId(), line.categoryCode(),
                        line.medicationCode(), line.medicationName(), line.preparationSpec(), line.productName(),
                        line.doseValue(), line.doseUnit(), line.routeCode(), line.frequencyCode(),
                        line.durationValue(), line.durationUnit(), line.quantity(), line.quantityUnit(),
                        line.medicationInstruction(), line.selfProvided(), line.priceType(), line.pricingRequired(),
                        line.reason())).toList(),
                serviceMap.getOrDefault(value.id(), List.of()).stream().map(line -> new ServiceSnapshot(
                        line.catalogItemId(), line.itemCode(), line.itemName(), line.serviceType(),
                        line.quantity(), line.unitCode(), line.reason(), line.clinicalDescription())).toList()
        )).toList();
    }

    @Transactional
    View create(SaveRequest input) {
        ExecutionContext context = requireContext();
        String scope = scope(input.scopeType());
        Long ownerId = "PERSONAL".equals(scope) ? context.practitionerId()
                : "DEPARTMENT".equals(scope) ? context.departmentId()
                : context.organizationId();
        String name = required(input.name(), "PLAN_TEMPLATE_NAME_REQUIRED", "方案名称不能为空");
        List<DiagnosisInput> diagnosisInputs = input.diagnoses() == null ? List.of() : input.diagnoses();
        List<MedicationInput> medicationInputs = input.medications() == null ? List.of() : input.medications();
        List<ServiceInput> serviceInputs = input.services() == null ? List.of() : input.services();
        if (diagnosisInputs.isEmpty() && medicationInputs.isEmpty() && serviceInputs.isEmpty()) {
            throw badRequest("PLAN_TEMPLATE_EMPTY", "至少选择一条诊断、药品或诊疗项目");
        }
        validateDiagnoses(diagnosisInputs, context.tenantId());
        Instant now = Instant.now();
        OutpatientPlanTemplate value = new OutpatientPlanTemplate(context.tenantId(), context.organizationId(),
                context.departmentId(), scope, ownerId, name, clean(input.description()),
                input.sortOrder() == null ? 0 : input.sortOrder(), clean(input.sourceType()),
                clean(input.guidelineReference()), context.subjectId(), now);
        try {
            templates.saveAndFlush(value);
            saveDiagnoses(value, diagnosisInputs);
            saveMedications(value, medicationInputs, context);
            saveServices(value, serviceInputs, context);
        } catch (DataIntegrityViolationException error) {
            throw conflict("PLAN_TEMPLATE_NAME_DUPLICATED", "当前范围已经存在同名常用方案");
        }
        return view(value,
                diagnoses.findByTenantIdAndTemplateIdOrderByLineNo(context.tenantId(), value.id()),
                medications.findByTenantIdAndTemplateIdOrderByLineNo(context.tenantId(), value.id()),
                services.findByTenantIdAndTemplateIdOrderByLineNo(context.tenantId(), value.id()));
    }

    @Transactional
    View markUsed(Long id) {
        ExecutionContext context = requireContext();
        OutpatientPlanTemplate value = requireAccessibleLocked(id, context);
        if (!"ACTIVE".equals(value.status())) throw conflict("PLAN_TEMPLATE_INACTIVE", "常用方案已经停用");
        validateStoredDiagnoses(context.tenantId(),
                diagnoses.findByTenantIdAndTemplateIdOrderByLineNo(context.tenantId(), value.id()));
        value.markUsed(context.subjectId(), Instant.now());
        templates.flush();
        return loadedView(value);
    }

    @Transactional
    View disable(Long id, long expectedRevision) {
        ExecutionContext context = requireContext();
        OutpatientPlanTemplate value = requireAccessibleLocked(id, context);
        if (value.revision() != expectedRevision) {
            throw conflict("PLAN_TEMPLATE_REVISION_CONFLICT", "常用方案已被更新，请刷新后重试");
        }
        value.disable(context.subjectId(), Instant.now());
        templates.flush();
        return loadedView(value);
    }

    @Transactional
    View update(Long id, UpdateRequest input) {
        ExecutionContext context = requireContext();
        OutpatientPlanTemplate value = requireAccessibleLocked(id, context);
        if (value.revision() != input.expectedRevision()) {
            throw conflict("PLAN_TEMPLATE_REVISION_CONFLICT", "常用方案已被更新，请刷新后重试");
        }
        if (!"ACTIVE".equals(value.status())) {
            throw conflict("PLAN_TEMPLATE_INACTIVE", "常用方案已经停用，无法调整");
        }
        String scope = scope(input.scopeType());
        Long ownerId = "PERSONAL".equals(scope) ? context.practitionerId()
                : "DEPARTMENT".equals(scope) ? context.departmentId()
                : context.organizationId();
        String name = required(input.name(), "PLAN_TEMPLATE_NAME_REQUIRED", "方案名称不能为空");
        List<DiagnosisInput> diagnosisInputs = input.diagnoses() == null ? List.of() : input.diagnoses();
        List<MedicationInput> medicationInputs = input.medications() == null ? List.of() : input.medications();
        List<ServiceInput> serviceInputs = input.services() == null ? List.of() : input.services();
        if (diagnosisInputs.isEmpty() && medicationInputs.isEmpty() && serviceInputs.isEmpty()) {
            throw badRequest("PLAN_TEMPLATE_EMPTY", "至少选择一条诊断、药品或诊疗项目");
        }
        validateDiagnoses(diagnosisInputs, context.tenantId());
        Instant now = Instant.now();
        value.update(scope, ownerId, name, clean(input.description()),
                input.sortOrder() == null ? 0 : input.sortOrder(), clean(input.guidelineReference()),
                context.subjectId(), now);
        try {
            templates.saveAndFlush(value);
            diagnoses.deleteByTenantIdAndTemplateId(context.tenantId(), value.id());
            medications.deleteByTenantIdAndTemplateId(context.tenantId(), value.id());
            services.deleteByTenantIdAndTemplateId(context.tenantId(), value.id());
            diagnoses.flush();
            medications.flush();
            services.flush();
            saveDiagnoses(value, diagnosisInputs);
            saveMedications(value, medicationInputs, context);
            saveServices(value, serviceInputs, context);
        } catch (DataIntegrityViolationException error) {
            throw conflict("PLAN_TEMPLATE_NAME_DUPLICATED", "当前范围已经存在同名常用方案");
        }
        return loadedView(value);
    }

    private void saveDiagnoses(OutpatientPlanTemplate template, List<DiagnosisInput> inputs) {
        List<OutpatientPlanDiagnosis> values = new ArrayList<>();
        for (int index = 0; index < inputs.size(); index++) {
            DiagnosisInput input = inputs.get(index);
            values.add(new OutpatientPlanDiagnosis(template.tenantId(), template.id(), index + 1,
                    input.code().trim(), input.display().trim(), upper(input.type())));
        }
        diagnoses.saveAll(values);
    }

    private void saveMedications(OutpatientPlanTemplate template, List<MedicationInput> inputs,
                                 ExecutionContext context) {
        List<OutpatientPlanMedication> values = new ArrayList<>(); LocalDate date = LocalDate.now();
        for (int index = 0; index < inputs.size(); index++) {
            MedicationInput input = inputs.get(index);
            CatalogLifecycleDirectory.MedicationSnapshot medication;
            CatalogLifecycleDirectory.CatalogItemSnapshot item = null;
            CatalogLifecycleDirectory.PackageSnapshot itemPackage = null;
            if (input.catalogItemId() == null) {
                if (input.packageId() != null) throw badRequest("PLAN_TEMPLATE_PACKAGE_INVALID", "通用药品方案不能指定产品包装");
                medication = catalogDirectory.requireMedication(context.tenantId(), input.medicationId());
            } else {
                var catalog = catalogDirectory.resolve(context.tenantId(), input.catalogItemId(), context.organizationId(),
                        input.packageId(), normalizedPriceType(input.priceType()), date);
                item = catalog.item(); itemPackage = catalog.itemPackage(); medication = catalog.medication();
                if (!"MED_PRODUCT".equals(item.itemType()) || medication == null
                        || !input.medicationId().equals(medication.id())) {
                    throw badRequest("PLAN_TEMPLATE_MEDICATION_INVALID", "方案中的药品产品与通用药品不匹配");
                }
            }
            if (!"ACTIVE".equals(medication.status())) throw conflict("PLAN_TEMPLATE_MEDICATION_INACTIVE", "方案中存在已停用药品");
            MedicationRouteDirectory.RouteSnapshot route = clean(input.routeCode()) == null ? null
                    : medicationRouteDirectory.requireActive(context.tenantId(), input.routeCode(),
                    "OUTPATIENT", date);
            String quantityUnit = clean(input.quantityUnit());
            if (quantityUnit == null) quantityUnit = itemPackage == null ? medication.preparationUnit() : itemPackage.unitCode();
            values.add(new OutpatientPlanMedication(template.tenantId(), template.id(), index + 1,
                    medication.id(), input.catalogItemId(), input.packageId(), medication.medicationType(),
                    medication.code(), medication.name(), medication.preparationSpec(), item == null ? null : item.name(),
                    input.doseValue(), clean(input.doseUnit()), route == null ? null : route.code(), clean(input.frequencyCode()),
                    input.durationValue(), clean(input.durationUnit()), input.quantity(), quantityUnit,
                    input.substitutionAllowed(), input.selfProvided(), clean(input.medicationInstruction()),
                    normalizedPriceType(input.priceType()), input.pricingRequired() == null || input.pricingRequired(),
                    clean(input.reason())));
        }
        medications.saveAll(values);
    }

    private void saveServices(OutpatientPlanTemplate template, List<ServiceInput> inputs, ExecutionContext context) {
        List<OutpatientPlanServiceLine> values = new ArrayList<>(); LocalDate date = LocalDate.now();
        for (int index = 0; index < inputs.size(); index++) {
            ServiceInput input = inputs.get(index);
            String priceType = normalizedPriceType(input.priceType());
            var catalog = catalogDirectory.resolve(context.tenantId(), input.catalogItemId(), context.organizationId(),
                    null, priceType, date);
            var item = catalog.item();
            if (!"SERVICE".equals(item.itemType())) {
                throw badRequest("PLAN_TEMPLATE_SERVICE_INVALID", "方案中的诊疗项目类型不正确");
            }
            values.add(new OutpatientPlanServiceLine(template.tenantId(), template.id(), index + 1,
                    item.id(), item.code(), item.name(), item.serviceType(), input.quantity(),
                    clean(input.unitCode()) == null ? item.unitCode() : clean(input.unitCode()), priceType,
                    input.pricingRequired() == null || input.pricingRequired(), clean(input.reason()),
                    clean(input.clinicalDescription())));
        }
        services.saveAll(values);
    }

    private void validateDiagnoses(List<DiagnosisInput> inputs, Long tenantId) {
        long primary = inputs.stream().filter(value -> "PRIMARY".equals(upper(value.type()))).count();
        if (primary > 1) throw badRequest("PLAN_TEMPLATE_PRIMARY_DIAGNOSIS_INVALID", "常用方案最多包含一个主要诊断");
        if (inputs.stream().anyMatch(value -> !List.of("PRIMARY", "SECONDARY").contains(upper(value.type())))) {
            throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_TYPE_INVALID", "诊断类型仅支持主要诊断或次要诊断");
        }
        if (inputs.stream().map(value -> value.code().trim().toUpperCase(Locale.ROOT)).distinct().count() != inputs.size()) {
            throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DUPLICATED", "常用方案中不能包含重复诊断");
        }
        for (DiagnosisInput input : inputs) {
            requireActiveDiagnosis(tenantId, input.code(), false);
        }
    }

    private void validateStoredDiagnoses(Long tenantId, List<OutpatientPlanDiagnosis> values) {
        for (OutpatientPlanDiagnosis value : values) {
            requireActiveDiagnosis(tenantId, value.code(), true);
        }
    }

    private void requireActiveDiagnosis(Long tenantId, String code, boolean reuse) {
        try {
            terminologyDirectory.requireConcept(tenantId, ICD10_SYSTEM,
                    code.trim().toUpperCase(Locale.ROOT), LocalDate.now());
        } catch (BusinessException exception) {
            if (reuse) {
                throw conflict("PLAN_TEMPLATE_DIAGNOSIS_INACTIVE",
                        "常用方案中的诊断编码 " + code + " 已失效，请维护方案后再使用");
            }
            throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_INVALID",
                    "诊断编码 " + code + " 不在当前有效的 ICD-10 术语目录中");
        }
    }

    private OutpatientPlanTemplate requireAccessibleLocked(Long id, ExecutionContext context) {
        OutpatientPlanTemplate value = templates.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PLAN_TEMPLATE_NOT_FOUND", "未找到常用诊疗方案"));
        boolean accessible = value.organizationId().equals(context.organizationId())
                && ("HOSPITAL".equals(value.scopeType())
                    || (value.departmentId().equals(context.departmentId())
                        && ("DEPARTMENT".equals(value.scopeType()) || value.ownerId().equals(context.practitionerId()))));
        if (!accessible) throw forbidden("PLAN_TEMPLATE_FORBIDDEN", "当前工作上下文不能访问该常用方案");
        return value;
    }

    private List<View> views(List<OutpatientPlanTemplate> values, Long tenantId) {
        if (values.isEmpty()) return List.of();
        List<Long> ids = values.stream().map(OutpatientPlanTemplate::id).toList();
        Map<Long, List<OutpatientPlanDiagnosis>> diagnosisMap = groupDiagnoses(
                diagnoses.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(tenantId, ids));
        Map<Long, List<OutpatientPlanMedication>> medicationMap = groupMedications(
                medications.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(tenantId, ids));
        Map<Long, List<OutpatientPlanServiceLine>> serviceMap = groupServices(
                services.findByTenantIdAndTemplateIdInOrderByTemplateIdAscLineNoAsc(tenantId, ids));
        return values.stream().map(value -> view(value, diagnosisMap.getOrDefault(value.id(), List.of()),
                medicationMap.getOrDefault(value.id(), List.of()), serviceMap.getOrDefault(value.id(), List.of()))).toList();
    }

    private View loadedView(OutpatientPlanTemplate value) {
        return view(value, diagnoses.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()),
                medications.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()),
                services.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()));
    }

    private View view(OutpatientPlanTemplate value, List<OutpatientPlanDiagnosis> diagnosisValues,
                      List<OutpatientPlanMedication> medicationValues, List<OutpatientPlanServiceLine> serviceValues) {
        return new View(value.id(), value.revision(), value.scopeType(), value.name(), value.description(),
                value.status(), value.sourceType(), value.guidelineReference(),
                value.sortOrder(), value.useCount(), value.lastUsedAt(),
                diagnosisValues.stream().map(line -> new DiagnosisView(line.code(), line.name(), line.type())).toList(),
                medicationValues.stream().map(line -> medicationView(value.tenantId(), line)).toList(),
                serviceValues.stream().map(line -> new ServiceView(line.catalogItemId(), line.itemCode(),
                        line.itemName(), line.serviceType(), line.quantity(), line.unitCode(), line.priceType(),
                        line.pricingRequired(), line.reason(), line.clinicalDescription())).toList(),
                value.createdAt(), value.updatedAt());
    }

    private MedicationView medicationView(Long tenantId, OutpatientPlanMedication line) {
        MedicationRouteDirectory.RouteSnapshot route = medicationRouteDirectory.resolveActive(
                tenantId, line.routeCode(), "OUTPATIENT", LocalDate.now()).orElse(null);
        return new MedicationView(line.id(), line.medicationId(), line.catalogItemId(), line.packageId(),
                "HERBAL".equals(line.categoryCode()) ? "herbal" : "regular", line.categoryCode(),
                line.medicationCode(), line.medicationName(), line.preparationSpec(), line.productName(),
                line.doseValue(), line.doseUnit(), route == null ? line.routeCode() : route.code(),
                route == null ? null : route.name(), route == null ? null : route.executionType(),
                line.frequencyCode(), line.durationValue(), line.durationUnit(), line.quantity(), line.quantityUnit(),
                line.substitutionAllowed(), line.selfProvided(), line.medicationInstruction(), line.priceType(),
                line.pricingRequired(), line.reason());
    }

    private Map<Long, List<OutpatientPlanDiagnosis>> groupDiagnoses(List<OutpatientPlanDiagnosis> values) {
        Map<Long, List<OutpatientPlanDiagnosis>> result = new HashMap<>();
        values.forEach(value -> result.computeIfAbsent(value.templateId(), ignored -> new ArrayList<>()).add(value)); return result;
    }
    private Map<Long, List<OutpatientPlanMedication>> groupMedications(List<OutpatientPlanMedication> values) {
        Map<Long, List<OutpatientPlanMedication>> result = new HashMap<>();
        values.forEach(value -> result.computeIfAbsent(value.templateId(), ignored -> new ArrayList<>()).add(value)); return result;
    }
    private Map<Long, List<OutpatientPlanServiceLine>> groupServices(List<OutpatientPlanServiceLine> values) {
        Map<Long, List<OutpatientPlanServiceLine>> result = new HashMap<>();
        values.forEach(value -> result.computeIfAbsent(value.templateId(), ignored -> new ArrayList<>()).add(value)); return result;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null || context.practitionerId() == null) {
            throw forbidden("PLAN_TEMPLATE_WORK_CONTEXT_REQUIRED", "请先选择包含科室和执业人员的工作上下文");
        }
        return context;
    }
    private String scope(String value) {
        String result = upper(value);
        if (!List.of("PERSONAL", "DEPARTMENT", "HOSPITAL").contains(result)) {
            throw badRequest("PLAN_TEMPLATE_SCOPE_INVALID", "方案范围仅支持个人、科室或全院");
        }
        return result;
    }
    private String normalizedPriceType(String value) { return clean(value) == null ? "SALE" : upper(value); }
    private String upper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
}
