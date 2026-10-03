package com.rhn.outpatient.template;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.PlanSearchProfile;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
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
import java.util.Set;

import static com.rhn.outpatient.api.OutpatientPlanTemplateContracts.*;
import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class OutpatientPlanTemplateService implements OutpatientPlanTemplateDirectory {
    private static final String ICD10_SYSTEM = "WHO.BD.CS.ICD10";
    private static final Map<String, String> DIAGNOSIS_SYSTEMS = Map.of(
            "WESTERN_MEDICINE", ICD10_SYSTEM,
            "TCM_DISEASE", "RHN.BD.CS.TCM_DISEASE",
            "TCM_SYNDROME", "RHN.BD.CS.TCM_SYNDROME");
    private static final Set<String> TASK_KINDS = Set.of("DIAGNOSIS", "MEDICATION", "LABORATORY",
            "EXAMINATION", "EDUCATION", "FOLLOW_UP", "CONDITION");
    private static final Set<String> TASK_STATUSES = Set.of("MATCHED", "NEEDS_REVIEW", "UNMATCHED");
    private final OutpatientPlanTemplateRepository templates;
    private final OutpatientPlanDiagnosisRepository diagnoses;
    private final OutpatientPlanMedicationRepository medications;
    private final OutpatientPlanServiceRepository services;
    private final OutpatientNoteTemplateRepository noteTemplates;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final MedicationRouteDirectory medicationRouteDirectory;
    private final TerminologyDirectory terminologyDirectory;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    OutpatientPlanTemplateService(OutpatientPlanTemplateRepository templates,
                                  OutpatientPlanDiagnosisRepository diagnoses,
                                  OutpatientPlanMedicationRepository medications,
                                  OutpatientPlanServiceRepository services,
                                  OutpatientNoteTemplateRepository noteTemplates,
                                  CatalogLifecycleDirectory catalogDirectory,
                                  MedicationRouteDirectory medicationRouteDirectory,
                                  TerminologyDirectory terminologyDirectory,
                                  ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.templates = templates; this.diagnoses = diagnoses; this.medications = medications;
        this.services = services; this.noteTemplates = noteTemplates; this.catalogDirectory = catalogDirectory;
        this.medicationRouteDirectory = medicationRouteDirectory;
        this.terminologyDirectory = terminologyDirectory; this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    List<View> visible(String keyword) {
        ExecutionContext context = requireContext();
        List<OutpatientPlanTemplate> values = templates.findVisible(context.tenantId(), context.organizationId(),
                context.departmentId(), context.practitionerId());
        String term = Strings.trimToNull(keyword);
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
        return snapshots(values, context);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PlanTemplateSnapshot> visibleByIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > 20) throw badRequest("PLAN_CANDIDATE_LIMIT", "每次最多读取20个方案候选");
        var context = requireContext();
        var selected = Set.copyOf(ids);
        return snapshots(templates.findVisible(context.tenantId(), context.organizationId(), context.departmentId(),
                context.practitionerId()).stream().filter(value -> selected.contains(value.id())).toList(), context);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PlanTemplateSnapshot> searchIndexForCurrentContext() {
        var context = requireContext();
        var values = templates.findVisible(context.tenantId(), context.organizationId(), context.departmentId(), context.practitionerId());
        var noteIds = values.stream().map(OutpatientPlanTemplate::noteTemplateId).filter(java.util.Objects::nonNull).distinct().toList();
        var notes = noteIds.isEmpty() ? Map.<Long, OutpatientNoteTemplate>of() : noteTemplates.findByTenantIdAndIdIn(context.tenantId(), noteIds)
                .stream().collect(java.util.stream.Collectors.toMap(OutpatientNoteTemplate::id, value -> value));
        var result = new ArrayList<PlanTemplateSnapshot>();
        var missing = new ArrayList<OutpatientPlanTemplate>();
        for (var value : values) {
            var profile = readProfile(value, value.noteTemplateId() == null ? null : notes.get(value.noteTemplateId()));
            if (profile == null) { missing.add(value); continue; }
            result.add(new PlanTemplateSnapshot(value.id(), value.revision(), value.scopeType(), value.sourceType(),
                    value.guidelineReference(), value.name(), value.description(), value.useCount(), profile.diagnoses(),
                    List.of(), List.of(), readTasks(value.planTasks()), profile));
        }
        // Missing/stale derived data can never stand in for current content. Hydrate only those rows.
        result.addAll(snapshots(missing, context));
        return List.copyOf(result);
    }

    private List<PlanTemplateSnapshot> snapshots(List<OutpatientPlanTemplate> values, ExecutionContext context) {
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
                        diagnosis.codeSystem(), diagnosis.diagnosisDomain(), diagnosis.code(),
                        diagnosis.name(), diagnosis.type())).toList(),
                medicationMap.getOrDefault(value.id(), List.of()).stream().map(line -> new MedicationSnapshot(
                        line.id(), line.medicationId(), line.catalogItemId(), line.packageId(), line.categoryCode(),
                        line.medicationCode(), line.medicationName(), line.preparationSpec(), line.productName(),
                        line.doseValue(), line.doseUnit(), line.routeCode(), line.frequencyCode(),
                        line.durationValue(), line.durationUnit(), line.quantity(), line.quantityUnit(),
                        line.medicationInstruction(), line.substitutionAllowed(), line.selfProvided(), line.priceType(),
                        line.pricingRequired(), line.reason())).toList(),
                serviceMap.getOrDefault(value.id(), List.of()).stream().map(line -> new ServiceSnapshot(
                        line.catalogItemId(), line.itemCode(), line.itemName(), line.serviceType(),
                        line.quantity(), line.unitCode(), line.priceType(), line.pricingRequired(), line.reason(),
                        line.clinicalDescription())).toList(),
                readTasks(value.planTasks()), profileFor(value)
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
        Long noteTemplateId = validateNoteTemplate(input.noteTemplateId(), scope, context);
        List<DiagnosisInput> diagnosisInputs = input.diagnoses() == null ? List.of() : input.diagnoses();
        List<MedicationInput> medicationInputs = input.medications() == null ? List.of() : input.medications();
        List<ServiceInput> serviceInputs = input.services() == null ? List.of() : input.services();
        if (diagnosisInputs.isEmpty() && medicationInputs.isEmpty() && serviceInputs.isEmpty()) {
            if (input.tasks() == null || input.tasks().isEmpty())
                throw badRequest("PLAN_TEMPLATE_EMPTY", "至少选择一条方案任务");
        }
        diagnosisInputs = normalizeDiagnoses(diagnosisInputs, context.tenantId());
        List<PlanTaskInput> taskInputs = validateTasks(input.tasks());
        Instant now = Instant.now();
        OutpatientPlanTemplate value = new OutpatientPlanTemplate(context.tenantId(), context.organizationId(),
                context.departmentId(), scope, ownerId, name, Strings.trimToNull(input.description()),
                input.sortOrder() == null ? 0 : input.sortOrder(), Strings.trimToNull(input.sourceType()),
                Strings.trimToNull(input.guidelineReference()), noteTemplateId, context.subjectId(), now);
        value.setPlanTasks(jsonCodec.write(taskInputs));
        try {
            templates.saveAndFlush(value);
            saveDiagnoses(value, diagnosisInputs);
            saveMedications(value, medicationInputs, context);
            saveServices(value, serviceInputs, context);
            rebuildSearchProfile(value);
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
        Long noteTemplateId = validateNoteTemplate(input.noteTemplateId(), scope, context);
        List<DiagnosisInput> diagnosisInputs = input.diagnoses() == null ? List.of() : input.diagnoses();
        List<MedicationInput> medicationInputs = input.medications() == null ? List.of() : input.medications();
        List<ServiceInput> serviceInputs = input.services() == null ? List.of() : input.services();
        if (diagnosisInputs.isEmpty() && medicationInputs.isEmpty() && serviceInputs.isEmpty()) {
            if (input.tasks() == null || input.tasks().isEmpty())
                throw badRequest("PLAN_TEMPLATE_EMPTY", "至少选择一条方案任务");
        }
        diagnosisInputs = normalizeDiagnoses(diagnosisInputs, context.tenantId());
        List<PlanTaskInput> taskInputs = validateTasks(input.tasks());
        Instant now = Instant.now();
        value.update(scope, ownerId, name, Strings.trimToNull(input.description()),
                input.sortOrder() == null ? 0 : input.sortOrder(), Strings.trimToNull(input.guidelineReference()),
                noteTemplateId, jsonCodec.write(taskInputs), context.subjectId(), now);
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
            rebuildSearchProfile(value);
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
                    input.codeSystem(), input.diagnosisDomain(), input.code().trim(),
                    input.display().trim(), upper(input.type())));
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
            MedicationRouteDirectory.RouteSnapshot route = Strings.trimToNull(input.routeCode()) == null ? null
                    : medicationRouteDirectory.requireActive(context.tenantId(), input.routeCode(),
                    "OUTPATIENT", date);
            String quantityUnit = Strings.trimToNull(input.quantityUnit());
            if (quantityUnit == null) quantityUnit = itemPackage == null ? medication.preparationUnit() : itemPackage.unitCode();
            values.add(new OutpatientPlanMedication(template.tenantId(), template.id(), index + 1,
                    medication.id(), input.catalogItemId(), input.packageId(), medication.medicationType(),
                    medication.code(), medication.name(), medication.preparationSpec(), item == null ? null : item.name(),
                    input.doseValue(), Strings.trimToNull(input.doseUnit()), route == null ? null : route.code(), Strings.trimToNull(input.frequencyCode()),
                    input.durationValue(), Strings.trimToNull(input.durationUnit()), input.quantity(), quantityUnit,
                    input.substitutionAllowed(), input.selfProvided(), Strings.trimToNull(input.medicationInstruction()),
                    normalizedPriceType(input.priceType()), input.pricingRequired() == null || input.pricingRequired(),
                    Strings.trimToNull(input.reason())));
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
                    Strings.trimToNull(input.unitCode()) == null ? item.unitCode() : Strings.trimToNull(input.unitCode()), priceType,
                    input.pricingRequired() == null || input.pricingRequired(), Strings.trimToNull(input.reason()),
                    Strings.trimToNull(input.clinicalDescription())));
        }
        services.saveAll(values);
    }

    private List<DiagnosisInput> normalizeDiagnoses(List<DiagnosisInput> inputs, Long tenantId) {
        long primary = inputs.stream().filter(value -> "PRIMARY".equals(upper(value.type()))).count();
        if (primary > 1) throw badRequest("PLAN_TEMPLATE_PRIMARY_DIAGNOSIS_INVALID", "常用方案最多包含一个主要诊断");
        if (inputs.stream().anyMatch(value -> !List.of("PRIMARY", "SECONDARY").contains(upper(value.type())))) {
            throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_TYPE_INVALID", "诊断类型仅支持主要诊断或次要诊断");
        }
        List<DiagnosisInput> normalized = new ArrayList<>();
        for (DiagnosisInput input : inputs) {
            String requestedDomain = Strings.trimToNull(input.diagnosisDomain());
            String requestedSystem = Strings.trimToNull(input.codeSystem());
            if (requestedDomain == null && requestedSystem == null) {
                requestedDomain = "WESTERN_MEDICINE";
                requestedSystem = ICD10_SYSTEM;
            } else if (requestedSystem == null) {
                requestedSystem = DIAGNOSIS_SYSTEMS.get(requestedDomain);
                if (requestedSystem == null) {
                    throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_INVALID", "诊断领域无效");
                }
            } else if (requestedDomain == null) {
                String targetSystem = requestedSystem;
                requestedDomain = DIAGNOSIS_SYSTEMS.entrySet().stream()
                        .filter(entry -> entry.getValue().equals(targetSystem))
                        .map(Map.Entry::getKey).findFirst().orElse(null);
            }
            if (requestedDomain == null) {
                throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_INVALID", "诊断编码体系不属于受支持的诊断领域");
            }
            try {
                var concept = terminologyDirectory.requireConcept(tenantId, requestedSystem,
                        input.code().trim().toUpperCase(Locale.ROOT), LocalDate.now());
                var disease = terminologyDirectory.requireDisease(tenantId, concept.id(), LocalDate.now());
                if (!requestedSystem.equals(disease.systemCode())
                        || requestedDomain != null && !requestedDomain.equals(disease.diagnosisDomain())) {
                    throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_MISMATCH",
                            "诊断编码体系、诊断领域与所选标准诊断不一致");
                }
                normalized.add(new DiagnosisInput(disease.systemCode(), disease.diagnosisDomain(),
                        disease.code(), disease.display(), upper(input.type())));
            } catch (BusinessException exception) {
                if ("PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_MISMATCH".equals(exception.code())) throw exception;
                throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_INVALID",
                        "诊断编码 " + input.code() + " 不在指定诊断目录中");
            }
        }
        if (normalized.stream().map(value -> value.codeSystem() + "|" + value.code())
                .distinct().count() != normalized.size()) {
            throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DUPLICATED", "常用方案中不能包含重复诊断");
        }
        return List.copyOf(normalized);
    }

    private List<PlanTaskInput> validateTasks(List<PlanTaskInput> values) {
        if (values == null) return List.of();
        for (PlanTaskInput value : values) {
            if (!TASK_KINDS.contains(upper(value.kind()))
                    || !TASK_STATUSES.contains(upper(value.status()))
                    || !Set.of("EXPLICIT", "SUGGESTED").contains(upper(value.origin()))) {
                throw badRequest("PLAN_TEMPLATE_TASK_INVALID", "方案任务类型或核对状态无效");
            }
        }
        return List.copyOf(values);
    }

    private List<PlanTaskInput> readTasks(String json) {
        if (json == null || json.isBlank()) return List.of();
        return List.of(jsonCodec.read(json, PlanTaskInput[].class));
    }

    private void validateStoredDiagnoses(Long tenantId, List<OutpatientPlanDiagnosis> values) {
        for (OutpatientPlanDiagnosis value : values) {
            requireActiveDiagnosis(tenantId, value.codeSystem(), value.diagnosisDomain(), value.code(), true);
        }
    }

    private Long validateNoteTemplate(Long noteTemplateId, String planScope, ExecutionContext context) {
        if (noteTemplateId == null) return null;
        if ("HOSPITAL".equals(planScope)) {
            throw badRequest("PLAN_TEMPLATE_NOTE_SCOPE_INVALID", "全院诊疗方案暂不能关联个人或科室病历模板");
        }
        OutpatientNoteTemplate note = noteTemplates.findByIdAndTenantId(noteTemplateId, context.tenantId())
                .orElseThrow(() -> notFound("NOTE_TEMPLATE_NOT_FOUND", "未找到关联的病历模板"));
        boolean sameWorkContext = note.organizationId().equals(context.organizationId())
                && note.departmentId().equals(context.departmentId());
        boolean visible = "DEPARTMENT".equals(note.scopeType())
                || "PERSONAL".equals(note.scopeType()) && note.ownerId().equals(context.practitionerId());
        if (!sameWorkContext || !visible) {
            throw forbidden("PLAN_TEMPLATE_NOTE_FORBIDDEN", "当前工作上下文不能关联该病历模板");
        }
        if (!"ACTIVE".equals(note.status())) {
            throw conflict("PLAN_TEMPLATE_NOTE_INACTIVE", "关联的病历模板已经停用");
        }
        if ("DEPARTMENT".equals(planScope) && !"DEPARTMENT".equals(note.scopeType())) {
            throw badRequest("PLAN_TEMPLATE_NOTE_SCOPE_INVALID", "科室诊疗方案只能关联科室病历模板");
        }
        return note.id();
    }

    private void requireActiveDiagnosis(Long tenantId, String codeSystem, String diagnosisDomain,
                                        String code, boolean reuse) {
        try {
            var concept = terminologyDirectory.requireConcept(tenantId, codeSystem,
                    code.trim().toUpperCase(Locale.ROOT), LocalDate.now());
            var disease = terminologyDirectory.requireDisease(tenantId, concept.id(), LocalDate.now());
            if (!codeSystem.equals(disease.systemCode()) || !diagnosisDomain.equals(disease.diagnosisDomain())) {
                if (reuse) {
                    throw conflict("PLAN_TEMPLATE_DIAGNOSIS_IDENTITY_INVALID",
                            "常用方案中的诊断编码体系与诊断领域不一致，请维护方案后再使用");
                }
                throw badRequest("PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_MISMATCH",
                        "诊断编码体系、诊断领域与所选标准诊断不一致");
            }
        } catch (BusinessException exception) {
            if ("PLAN_TEMPLATE_DIAGNOSIS_IDENTITY_INVALID".equals(exception.code())
                    || "PLAN_TEMPLATE_DIAGNOSIS_DOMAIN_MISMATCH".equals(exception.code())) throw exception;
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

    private OutpatientNoteTemplate profileNote(OutpatientPlanTemplate value) {
        if (value.noteTemplateId() == null) return null;
        return noteTemplates.findByIdAndTenantId(value.noteTemplateId(), value.tenantId())
                .filter(note -> "ACTIVE".equals(note.status())).orElse(null);
    }

    private PlanSearchProfile profileFor(OutpatientPlanTemplate value) {
        return readProfile(value, profileNote(value));
    }

    private PlanSearchProfile readProfile(OutpatientPlanTemplate value, OutpatientNoteTemplate note) {
        if (value.searchProfile() == null) return null;
        var profile = jsonCodec.read(value.searchProfile(), PlanSearchProfile.class);
        String noteHash = note == null || !"ACTIVE".equals(note.status()) ? null : PlanSearchProfiles.hash(note.contentJson());
        return profile.schemaVersion() == 1 && java.util.Objects.equals(profile.noteTemplateId(), value.noteTemplateId())
                && java.util.Objects.equals(profile.noteContentHash(), noteHash) ? profile : null;
    }

    private void rebuildSearchProfile(OutpatientPlanTemplate value) {
        var profile = PlanSearchProfiles.build(value,
                diagnoses.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()),
                medications.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()),
                services.findByTenantIdAndTemplateIdOrderByLineNo(value.tenantId(), value.id()),
                readTasks(value.planTasks()), profileNote(value), jsonCodec);
        value.setSearchProfile(jsonCodec.write(profile));
        // New templates have application-assigned IDs and save() may return a merged managed instance.
        templates.saveAndFlush(value);
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
                value.noteTemplateId(),
                value.sortOrder(), value.useCount(), value.lastUsedAt(),
                diagnosisValues.stream().map(line -> new DiagnosisView(line.codeSystem(), line.diagnosisDomain(),
                        line.code(), line.name(), line.type())).toList(),
                medicationValues.stream().map(line -> medicationView(value.tenantId(), line)).toList(),
                serviceValues.stream().map(line -> new ServiceView(line.catalogItemId(), line.itemCode(),
                        line.itemName(), line.serviceType(), line.quantity(), line.unitCode(), line.priceType(),
                        line.pricingRequired(), line.reason(), line.clinicalDescription())).toList(),
                readTasks(value.planTasks()),
                value.createdAt(), value.updatedAt(), profileFor(value));
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
    private String normalizedPriceType(String value) { return Strings.trimToNull(value) == null ? "SALE" : upper(value); }
    private String upper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String required(String value, String code, String message) {
        String result = Strings.trimToNull(value); if (result == null) throw badRequest(code, message); return result;
    }
}
