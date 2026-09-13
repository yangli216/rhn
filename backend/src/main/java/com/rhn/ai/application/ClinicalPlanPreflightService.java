package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.EvaluationBoundary;
import com.rhn.ai.api.ClinicalAssistantContracts.MedicationPreflight;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanPreflight;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanPreflightRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.PreflightCheck;
import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** Read-only deterministic checks performed before an AI-recommended plan enters the doctor's draft. */
@Service
public class ClinicalPlanPreflightService {
    private static final EvaluationBoundary INTERACTIONS_NOT_EVALUATED = new EvaluationBoundary("NOT_EVALUATED",
            "当前未接入经治理的药物相互作用规则源，系统未对此项作出安全判断。");
    private static final EvaluationBoundary CONTRAINDICATIONS_NOT_EVALUATED = new EvaluationBoundary("NOT_EVALUATED",
            "当前未接入经治理的禁忌证规则源，系统未对此项作出安全判断。");

    private final EncounterDirectory encounterDirectory;
    private final OutpatientPlanTemplateDirectory planDirectory;
    private final CatalogLifecycleDirectory catalogDirectory;
    private final MedicationRouteDirectory routeDirectory;
    private final OrderFrequencyDirectory frequencyDirectory;
    private final AllergyDirectory allergyDirectory;
    private final MedicationTerminologyDirectory terminologyDirectory;
    private final OutpatientPrescriptionInventoryDirectory inventoryDirectory;
    private final ExecutionContextProvider contextProvider;
    private final ClinicalAiMetrics metrics;

    public ClinicalPlanPreflightService(EncounterDirectory encounterDirectory,
                                        OutpatientPlanTemplateDirectory planDirectory,
                                        CatalogLifecycleDirectory catalogDirectory,
                                        MedicationRouteDirectory routeDirectory,
                                        OrderFrequencyDirectory frequencyDirectory,
                                        AllergyDirectory allergyDirectory,
                                        MedicationTerminologyDirectory terminologyDirectory,
                                        OutpatientPrescriptionInventoryDirectory inventoryDirectory,
                                        ExecutionContextProvider contextProvider,
                                        ClinicalAiMetrics metrics) {
        this.encounterDirectory = encounterDirectory;
        this.planDirectory = planDirectory;
        this.catalogDirectory = catalogDirectory;
        this.routeDirectory = routeDirectory;
        this.frequencyDirectory = frequencyDirectory;
        this.allergyDirectory = allergyDirectory;
        this.terminologyDirectory = terminologyDirectory;
        this.inventoryDirectory = inventoryDirectory;
        this.contextProvider = contextProvider;
        this.metrics = metrics;
    }

    @Transactional(readOnly = true)
    public PlanPreflight preflight(Long encounterId, Long templateId, PlanPreflightRequest input) {
        Access access = requireAccess(encounterId);
        OutpatientPlanTemplateDirectory.PlanTemplateSnapshot template = planDirectory.visibleForCurrentContext().stream()
                .filter(value -> value.id().equals(templateId)).findFirst()
                .orElseThrow(() -> notFound("AI_PLAN_TEMPLATE_NOT_VISIBLE", "方案已停用或当前工作上下文不可见"));
        Set<Long> selected = new HashSet<>(input.selectedMedicationLineIds());
        Set<Long> actual = template.medications().stream().map(OutpatientPlanTemplateDirectory.MedicationSnapshot::lineId)
                .collect(java.util.stream.Collectors.toSet());
        if (!actual.containsAll(selected)) {
            throw badRequest("AI_PLAN_PREFLIGHT_LINE_INVALID", "选择的药品条目不属于当前可见方案");
        }
        List<OutpatientPlanTemplateDirectory.MedicationSnapshot> medications = selected.isEmpty()
                ? template.medications() : template.medications().stream().filter(value -> selected.contains(value.lineId())).toList();
        List<AllergyDirectory.AllergySnapshot> allergies = allergyDirectory.activeForResident(access.encounter().residentId());
        List<MedicationPreflight> results = medications.stream()
                .map(value -> inspect(value, access, allergies, input)).toList();
        int blocking = results.stream().mapToInt(value -> (int) value.checks().stream()
                .filter(check -> "BLOCKED".equals(check.status())).count()).sum();
        int warnings = results.stream().mapToInt(value -> (int) value.checks().stream()
                .filter(check -> "WARNING".equals(check.status()) || "NOT_EVALUATED".equals(check.status())).count()).sum();
        if (!medications.isEmpty()) warnings += 2;
        String status = blocking > 0 ? "BLOCKED" : warnings > 0 ? "WARNING" : "READY";
        PlanPreflight result = new PlanPreflight(template.id(), template.revision(), status, blocking, warnings, results,
                INTERACTIONS_NOT_EVALUATED, CONTRAINDICATIONS_NOT_EVALUATED, Instant.now());
        metrics.recordPlanPreflight(status, blocking);
        return result;
    }

    private MedicationPreflight inspect(OutpatientPlanTemplateDirectory.MedicationSnapshot line, Access access,
                                        List<AllergyDirectory.AllergySnapshot> allergies,
                                        PlanPreflightRequest input) {
        List<PreflightCheck> checks = new ArrayList<>();
        LocalDate date = LocalDate.now();
        CatalogLifecycleDirectory.MedicationSnapshot medication = null;
        CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog = null;
        try {
            if (line.catalogItemId() == null) {
                medication = catalogDirectory.requireMedication(access.context().tenantId(), line.medicationId());
                if (!"ACTIVE".equals(medication.status())) {
                    checks.add(blocked("PRODUCT_PACKAGE", "通用药品知识当前不可用"));
                } else {
                    checks.add(warning("PRODUCT_PACKAGE", "尚未选择院内药品产品和包装，需在医嘱草稿中补充"));
                }
            } else {
                catalog = catalogDirectory.resolve(access.context().tenantId(), line.catalogItemId(),
                        access.encounter().organizationId(), line.packageId(), priceType(line), date);
                medication = catalog.medication();
                String invalid = catalogProblem(line, catalog, date);
                checks.add(invalid == null
                        ? (line.packageId() == null
                        ? warning("PRODUCT_PACKAGE", "产品有效；未指定包装，将沿用产品基本包装")
                        : passed("PRODUCT_PACKAGE", "院内药品产品与包装有效"))
                        : blocked("PRODUCT_PACKAGE", invalid));
            }
        } catch (BusinessException exception) {
            checks.add(blocked("PRODUCT_PACKAGE", exception.getMessage()));
        }

        checkDose(line, medication, checks);
        checkRoute(line, medication, access, date, checks);
        checkFrequency(line, medication, access, date, checks);
        checkDuration(line, checks);
        checkQuantity(line, catalog, checks);
        checkInventory(line, access, checks);
        checkAllergy(line, medication, allergies, input, checks, access.context().tenantId());

        String status = checks.stream().anyMatch(value -> "BLOCKED".equals(value.status())) ? "BLOCKED"
                : checks.stream().anyMatch(value -> !"PASS".equals(value.status())) ? "WARNING" : "READY";
        return new MedicationPreflight(line.lineId(), line.medicationId(), line.catalogItemId(), line.packageId(),
                line.medicationCode(), line.medicationName(), line.productName(), status, checks);
    }

    private String catalogProblem(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                                  CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog,
                                  LocalDate date) {
        if (catalog.item() == null || !"MED_PRODUCT".equals(catalog.item().itemType()) || catalog.medication() == null) {
            return "方案条目不是有效的药品产品";
        }
        if (!line.medicationId().equals(catalog.medication().id())) return "产品与通用药品不匹配";
        if (!"ACTIVE".equals(catalog.medication().status()) || !"ACTIVE".equals(catalog.item().status())) {
            return "药品或产品当前已停用";
        }
        if (!effective(catalog.item().validFrom(), catalog.item().validTo(), date)) return "药品产品当前不在有效期内";
        if (catalog.itemPackage() != null && (!"ACTIVE".equals(catalog.itemPackage().status())
                || !effective(catalog.itemPackage().validFrom(), catalog.itemPackage().validTo(), date))) {
            return "药品包装当前不可用";
        }
        if (!catalog.item().orderable()) return "药品产品未开放开立能力";
        if (catalog.adoption() == null || !catalog.adoption().orderable()) return "当前机构未开放该药品的开立能力";
        if (!line.selfProvided() && !catalog.adoption().dispensable()) return "当前机构未开放该药品的发药能力";
        if (line.pricingRequired() && (catalog.price() == null || !catalog.item().chargeable()
                || !catalog.adoption().chargeable())) return "药品价格或收费能力尚未配置完整";
        return null;
    }

    private void checkDose(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                           CatalogLifecycleDirectory.MedicationSnapshot medication, List<PreflightCheck> checks) {
        BigDecimal value = line.doseValue() == null && medication != null ? medication.defaultDose() : line.doseValue();
        String unit = clean(line.doseUnit()) == null && medication != null ? clean(medication.defaultDoseUnit()) : clean(line.doseUnit());
        if (value == null || unit == null) checks.add(blocked("DOSE", "单次剂量与剂量单位必须完整"));
        else if (value.signum() <= 0) checks.add(blocked("DOSE", "单次剂量必须大于 0"));
        else checks.add(passed("DOSE", "单次剂量与剂量单位完整"));
    }

    private void checkRoute(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                            CatalogLifecycleDirectory.MedicationSnapshot medication, Access access,
                            LocalDate date, List<PreflightCheck> checks) {
        String route = clean(line.routeCode()) == null && medication != null ? clean(medication.defaultRoute()) : clean(line.routeCode());
        if (route == null) { checks.add(blocked("ROUTE", "给药途径未填写且药品无默认值")); return; }
        try {
            var resolved = routeDirectory.requireActive(access.context().tenantId(), route, "OUTPATIENT", date);
            checks.add(passed("ROUTE", "给药途径有效：" + resolved.name()));
        } catch (BusinessException exception) {
            checks.add(blocked("ROUTE", exception.getMessage()));
        }
    }

    private void checkFrequency(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                                CatalogLifecycleDirectory.MedicationSnapshot medication, Access access,
                                LocalDate date, List<PreflightCheck> checks) {
        String frequency = clean(line.frequencyCode()) == null && medication != null
                ? clean(medication.defaultFrequency()) : clean(line.frequencyCode());
        if (frequency == null) { checks.add(blocked("FREQUENCY", "用药频次未填写且药品无默认值")); return; }
        try {
            var resolved = frequencyDirectory.requireActive(access.context().tenantId(), frequency,
                    access.encounter().organizationId(), access.encounter().departmentId(),
                    "OUTPATIENT", "MEDICATION", date);
            checks.add(passed("FREQUENCY", "用药频次有效：" + resolved.name()));
        } catch (BusinessException exception) {
            checks.add(blocked("FREQUENCY", exception.getMessage()));
        }
    }

    private void checkDuration(OutpatientPlanTemplateDirectory.MedicationSnapshot line, List<PreflightCheck> checks) {
        String unit = clean(line.durationUnit());
        if (line.durationValue() == null && unit == null) {
            checks.add(warning("DURATION", "未设置疗程时长，需在医嘱草稿中核对"));
        } else if (line.durationValue() == null || unit == null || line.durationValue().signum() <= 0) {
            checks.add(blocked("DURATION", "疗程时长与单位必须成对填写且时长大于 0"));
        } else checks.add(passed("DURATION", "疗程时长与单位完整"));
    }

    private void checkQuantity(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                               CatalogLifecycleDirectory.CatalogOperationalSnapshot catalog,
                               List<PreflightCheck> checks) {
        if (line.quantity() == null || line.quantity().signum() <= 0) {
            checks.add(blocked("QUANTITY", "申请数量必须大于 0")); return;
        }
        String expected = catalog == null ? null : catalog.itemPackage() == null
                ? clean(catalog.item().unitCode()) : clean(catalog.itemPackage().unitCode());
        if (expected != null && clean(line.quantityUnit()) != null && !expected.equals(clean(line.quantityUnit()))) {
            checks.add(blocked("QUANTITY", "申请数量单位与所选产品包装不一致"));
        } else checks.add(passed("QUANTITY", "申请数量有效"));
    }

    private void checkInventory(OutpatientPlanTemplateDirectory.MedicationSnapshot line, Access access,
                                List<PreflightCheck> checks) {
        if (line.selfProvided()) { checks.add(passed("INVENTORY", "患者自备药品，院内库存不适用")); return; }
        if (line.catalogItemId() == null) {
            checks.add(notEvaluated("INVENTORY", "未选择药品产品，无法检查路由药房库存")); return;
        }
        try {
            var availability = inventoryDirectory.inspectMedicationAvailability(access.context().tenantId(),
                    access.encounter().organizationId(), access.encounter().departmentId(),
                    line.catalogItemId(), line.packageId());
            if (!availability.routeConfigured()) {
                checks.add(blocked("INVENTORY", "未找到当前门诊科室的发药药房配置"));
            } else if (!availability.stockItemConfigured()) {
                checks.add(blocked("INVENTORY", "路由药房未纳入该药品产品"));
            } else if (line.quantity() != null
                    && availability.availablePackageQuantity().compareTo(line.quantity()) < 0) {
                checks.add(blocked("INVENTORY", "路由药房库存不足：需要 %s %s，当前可用 %s %s".formatted(
                        number(line.quantity()), safe(availability.packageUnitCode()),
                        number(availability.availablePackageQuantity()), safe(availability.packageUnitCode()))));
            } else {
                checks.add(passed("INVENTORY", "路由药房 %s 当前可用 %s %s".formatted(
                        safe(availability.stockSiteName()), number(availability.availablePackageQuantity()),
                        safe(availability.packageUnitCode()))));
            }
        } catch (BusinessException exception) {
            checks.add(blocked("INVENTORY", exception.getMessage()));
        }
    }

    private void checkAllergy(OutpatientPlanTemplateDirectory.MedicationSnapshot line,
                              CatalogLifecycleDirectory.MedicationSnapshot medication,
                              List<AllergyDirectory.AllergySnapshot> allergies,
                              PlanPreflightRequest input, List<PreflightCheck> checks, Long tenantId) {
        List<AllergyDirectory.AllergySnapshot> drugAllergies = allergies.stream()
                .filter(AllergyDirectory.AllergySnapshot::isDrugAllergy).toList();
        boolean statusKnown = !drugAllergies.isEmpty() || allergies.stream().anyMatch(value ->
                "NO_KNOWN_ALLERGY".equals(value.assertionType())
                        || "NO_KNOWN_DRUG_ALLERGY".equals(value.assertionType()));
        String medicationCode = medication == null ? line.medicationCode() : medication.code();
        List<AllergyDirectory.AllergySnapshot> matched = drugAllergies.stream()
                .filter(value -> value.allergenId() != null && line.medicationId() != null
                        ? terminologyDirectory.medicationMatchesAllergen(tenantId, line.medicationId(), value.allergenId())
                        : value.substanceCode() != null && medicationCode != null
                        && value.substanceCode().equalsIgnoreCase(medicationCode)).toList();
        if (!matched.isEmpty() && !input.allergyReviewConfirmed()) {
            checks.add(blocked("ALLERGY_REVIEW", "患者存在药物过敏记录，必须由医生确认已核对"));
        } else if (!matched.isEmpty() && clean(input.allergyOverrideReason()) == null) {
            checks.add(blocked("ALLERGY_MATCH", "命中患者药物过敏原，继续带入必须填写临床理由"));
        } else if (!matched.isEmpty()) {
            checks.add(warning("ALLERGY_MATCH", "命中过敏原，已记录继续带入的临床理由"));
        } else if ((!statusKnown || !drugAllergies.isEmpty()) && !input.allergyReviewConfirmed()) {
            checks.add(blocked("ALLERGY_REVIEW", statusKnown
                    ? "患者存在药物过敏记录，必须由医生确认已核对" : "患者药物过敏状态未知，必须由医生确认已核对"));
        } else checks.add(passed("ALLERGY_REVIEW", "未命中已记录的药物过敏原"));
    }

    private Access requireAccess(Long encounterId) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (context.tenantId() == null || context.organizationId() == null || context.departmentId() == null
                || context.practitionerId() == null || context.subjectId() == null) {
            throw forbidden("AI_DOCTOR_WORK_CONTEXT_REQUIRED", "请先选择包含机构、科室和执业人员的工作上下文");
        }
        EncounterDirectory.EncounterSnapshot encounter = encounterDirectory.requireAccessible(encounterId);
        if (!context.tenantId().equals(encounter.tenantId()) || !context.organizationId().equals(encounter.organizationId())
                || !context.departmentId().equals(encounter.departmentId())) {
            throw forbidden("AI_ENCOUNTER_CONTEXT_FORBIDDEN", "AI 预检只能用于当前机构和科室的就诊");
        }
        if (encounter.clinicianId() == null || !encounter.clinicianId().equals(context.actor())) {
            throw forbidden("AI_ENCOUNTER_DOCTOR_FORBIDDEN", "只有当前接诊医生可以预检该就诊的方案");
        }
        if (!"IN_PROGRESS".equals(encounter.status())) {
            throw conflict("AI_ENCOUNTER_NOT_ACTIVE", "只有接诊中的就诊可以预检诊疗方案");
        }
        return new Access(context, encounter);
    }

    private static String priceType(OutpatientPlanTemplateDirectory.MedicationSnapshot line) {
        return clean(line.priceType()) == null ? "SALE" : clean(line.priceType()).toUpperCase(java.util.Locale.ROOT);
    }
    private static boolean effective(LocalDate from, LocalDate to, LocalDate date) {
        return (from == null || !date.isBefore(from)) && (to == null || !date.isAfter(to));
    }
    private static String number(BigDecimal value) { return value.stripTrailingZeros().toPlainString(); }
    private static String safe(String value) { return value == null || value.isBlank() ? "包装" : value.trim(); }
    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static PreflightCheck passed(String code, String message) { return new PreflightCheck(code, "PASS", message); }
    private static PreflightCheck warning(String code, String message) { return new PreflightCheck(code, "WARNING", message); }
    private static PreflightCheck blocked(String code, String message) { return new PreflightCheck(code, "BLOCKED", message); }
    private static PreflightCheck notEvaluated(String code, String message) { return new PreflightCheck(code, "NOT_EVALUATED", message); }

    private record Access(ExecutionContext context, EncounterDirectory.EncounterSnapshot encounter) {}
}
