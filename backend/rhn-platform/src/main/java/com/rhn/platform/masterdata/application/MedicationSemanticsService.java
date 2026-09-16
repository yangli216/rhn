package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.MedicationSemanticDirectory.*;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory.Version;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationSemanticsService implements MedicationSemanticDirectory {
    public static final String SCHEMA = "qmed-medication-semantics-v1";
    private final ClinicalSemanticHistory history;
    private final MedicationRepository medications;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;

    public MedicationSemanticsService(ClinicalSemanticHistory history, MedicationRepository medications,
                                     ExecutionContextProvider contexts, JsonCodec json) {
        this.history = history; this.medications = medications; this.contexts = contexts; this.json = json;
    }

    @Transactional
    public Ingredient createIngredient(String code, String display, String system, String systemVersion, String source) {
        var context = contexts.requireCurrent();
        var ingredient = new Ingredient("ING:" + ClinicalSemanticVersions.hash(List.of(context.tenantId(), required(system),
                required(systemVersion), required(code)), json), required(code), required(display),
                required(system), required(systemVersion), required(source));
        // Ingredients are explicit concepts; no drug-name, allergen or classification inference.
        if (ingredients().stream().anyMatch(v -> v.code().equals(ingredient.code())
                && v.system().equals(ingredient.system()) && v.systemVersion().equals(ingredient.systemVersion()))) {
            throw conflict("INGREDIENT_CODE_DUPLICATE", "该来源及版本已存在相同成分编码，请选择已有成分");
        }
        publish(context.tenantId(), "INGREDIENT", ingredient.id(), ingredient, ingredient, ingredient.source());
        return ingredient;
    }

    @Transactional(readOnly = true)
    public List<Ingredient> ingredients() {
        return history.ingredients(contexts.requireCurrent().tenantId()).stream()
                .map(v -> json.read(v.snapshot(), Ingredient.class)).toList();
    }

    @Transactional(readOnly = true)
    public Composition composition(Long medicationId) {
        Long tenant = contexts.requireCurrent().tenantId();
        requireMedication(tenant, medicationId);
        return composition(tenant, medicationId);
    }

    private Composition composition(Long tenant, Long medicationId) {
        return history.latest(tenant, "COMPOSITION", medicationId.toString())
                .map(v -> {
                    var saved = json.read(v.snapshot(), Composition.class);
                    return new Composition(v.revision(), saved.source(), saved.components());
                }).orElse(new Composition(null, null, List.of()));
    }

    @Transactional
    public Composition saveComposition(Long medicationId, Composition input) {
        var context = contexts.requireCurrent();
        var medication = medications.lockByIdAndTenantId(medicationId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到药品知识"));
        var existing = composition(context.tenantId(), medicationId);
        if (!Objects.equals(existing.revision(), input.revision())) {
            throw conflict("MEDICATION_COMPOSITION_STALE", "药品成分已被修改，请刷新后重试");
        }
        if (input.components().size() > 100) throw badRequest("MEDICATION_COMPONENT_LIMIT", "成分数量不能超过100项");
        var seen = new HashSet<String>();
        var components = input.components().stream().map(component -> {
            if (component == null || component.ingredientId() == null || !seen.add(component.ingredientId())) {
                throw badRequest("MEDICATION_COMPONENT_DUPLICATE", "成分不能为空或重复");
            }
            if (history.latest(context.tenantId(), "INGREDIENT", component.ingredientId()).isEmpty()) {
                throw badRequest("MEDICATION_INGREDIENT_UNKNOWN", "成分不存在或不属于当前租户");
            }
            boolean hasStrength = component.numeratorValue() != null || component.numeratorUnit() != null
                    || component.denominatorValue() != null || component.denominatorUnit() != null;
            if (!hasStrength) return component;
            if (component.numeratorValue() == null || component.numeratorValue().signum() <= 0
                    || component.denominatorValue() == null || component.denominatorValue().signum() <= 0) {
                throw badRequest("MEDICATION_STRENGTH_INVALID", "填写含量时必须同时填写正数的含量值和基准量");
            }
            String denominator = required(component.denominatorUnit());
            // Denominator may be a clinical unit or exactly one preparation unit, never a package alias.
            if (ClinicalDoseUnits.resolve(denominator).isEmpty() && !denominator.equals(medication.preparationUnit())) {
                throw badRequest("MEDICATION_STRENGTH_DENOMINATOR_INVALID", "基准单位须为临床单位或当前药品制剂单位");
            }
            return new Component(component.ingredientId(), component.numeratorValue().stripTrailingZeros(),
                    canonicalUnit(required(component.numeratorUnit())), component.denominatorValue().stripTrailingZeros(), canonicalUnit(denominator));
        }).sorted(Comparator.comparing(Component::ingredientId)).toList();
        captureMedication(medication);
        var value = new Composition(null, required(input.source()), components);
        var version = publish(context.tenantId(), "COMPOSITION", medicationId.toString(), components, value, value.source());
        captureMedication(medication);
        return new Composition(version.revision(), value.source(), components);
    }

    @Transactional(readOnly = true)
    public List<Version> medicationHistory(Long medicationId) {
        var tenant = contexts.requireCurrent().tenantId();
        requireMedication(tenant, medicationId);
        return history.history(tenant, "MEDICATION", medicationId.toString(), 100);
    }

    /** Called in the same transaction as master-data maintenance, including before the first legacy edit. */
    public void captureMedication(Medication medication) {
        medicationVersion(medication.tenantId(), snapshot(medication));
    }

    /** Preserve definitions and configuration changes even if they have not yet been used in an order. */
    public void captureDefinition(String kind, String conceptId, Object definition, String... displayFields) {
        var context = contexts.requireCurrent();
        var semantic = json.readObject(json.write(definition));
        for (String field : displayFields) semantic.remove(field);
        publish(context.tenantId(), kind, conceptId, semantic, definition, "LOCAL_MAINTENANCE");
    }

    @Override
    @Transactional
    public JsonNode freeze(Long tenantId, CatalogLifecycleDirectory.MedicationSnapshot medication, Long productId,
                           MedicationRouteDirectory.RouteSnapshot route, OrderFrequencyDirectory.FrequencySnapshot frequency,
                           BigDecimal dose, String doseUnit, BigDecimal duration, String durationUnit, LocalDate businessDate) {
        if (!Objects.equals(contexts.requireCurrent().tenantId(), tenantId)) {
            throw forbidden("MEDICATION_SEMANTICS_TENANT_INVALID", "无权读取其他租户的药品语义");
        }
        var composition = composition(tenantId, medication.id());
        var medVersion = medicationVersion(tenantId, medication, composition);
        var medData = json.readObject(medVersion.snapshot());
        var unknown = new ArrayList<String>();
        if (composition.components().isEmpty()) unknown.add("INGREDIENT_MAPPING_MISSING");
        if (composition.components().isEmpty() || composition.components().stream().anyMatch(c -> c.numeratorValue() == null)) {
            unknown.add("INGREDIENT_STRENGTH_MISSING");
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("schemaVersion", SCHEMA);
        result.put("medicationId", medication.id()); result.put("medicationSemanticVersion", medVersion.semanticVersion());
        result.put("versionStatus", "CAPTURED"); result.put("versionRecordedAt", medVersion.recordedAt());
        result.put("source", medVersion.source());
        result.put("productId", productId); result.put("businessDate", businessDate);
        result.put("ingredientIds", composition.components().stream().map(Component::ingredientId).toList());
        result.put("ingredients", medData.get("ingredients")); result.put("strengths", medData.get("strengths"));
        result.put("dose", quantity(dose, doseUnit));
        if (dose == null || ClinicalDoseUnits.resolve(doseUnit).isEmpty()) unknown.add("CLINICAL_DOSE_UNIT_UNKNOWN");
        result.put("durationValue", duration); result.put("durationUnit", durationUnit);
        if (route == null) {
            result.put("route", null); unknown.add("ROUTE_MISSING");
        } else {
            var semantic = new LinkedHashMap<String, Object>();
            semantic.put("conceptId", route.id()); semantic.put("system", route.systemCode());
            semantic.put("systemVersion", route.systemVersion()); semantic.put("executionType", route.executionType());
            var version = publish(tenantId, "ROUTE", route.id().toString(), semantic, route, "RESOLVED_ROUTE");
            semantic.put("semanticVersion", version.semanticVersion()); semantic.put("code", route.code());
            semantic.put("display", route.name()); result.put("route", semantic);
        }
        if (frequency == null) {
            result.put("frequency", null); unknown.add("FREQUENCY_MISSING");
        } else {
            var semantic = json.readObject(json.write(frequency));
            for (String field : List.of("revision", "code", "name", "shortName", "description")) semantic.remove(field);
            var interpreted = ClinicalFrequencySemantics.interpret(frequency);
            semantic.put("interpretation", interpreted);
            var version = publish(tenantId, "FREQUENCY", frequency.id().toString(), semantic, frequency, "RESOLVED_FREQUENCY");
            semantic.put("semanticVersion", version.semanticVersion()); semantic.put("conceptId", frequency.id());
            semantic.put("code", frequency.code()); semantic.put("display", frequency.name());
            result.put("frequency", semantic);
            if ("OTHER".equals(interpreted.kind())) unknown.add("FREQUENCY_UNCOMPUTABLE");
        }
        if (composition.components().stream().anyMatch(c -> c.numeratorValue() != null
                && ClinicalDoseUnits.resolve(c.numeratorUnit()).isEmpty())) unknown.add("STRENGTH_UNIT_UNKNOWN");
        result.put("status", unknown.isEmpty() ? "VERSIONED" : "VERSIONED_PARTIAL");
        result.put("unknownReasons", unknown);
        var saved = json.readObject(json.write(medication));
        saved.put("clinicalSemantics", result);
        return json.readTree(json.write(saved));
    }

    private Version medicationVersion(Long tenant, CatalogLifecycleDirectory.MedicationSnapshot medication) {
        return medicationVersion(tenant, medication, composition(tenant, medication.id()));
    }

    private Version medicationVersion(Long tenant, CatalogLifecycleDirectory.MedicationSnapshot medication, Composition mapping) {
        var data = json.readObject(json.write(medication));
        data.put("ingredients", mapping.components().stream().map(c -> history.latest(tenant, "INGREDIENT", c.ingredientId())
                .map(v -> json.read(v.snapshot(), Ingredient.class)).orElseThrow()).toList());
        data.put("strengths", mapping.components().stream().map(c -> {
            var value = new LinkedHashMap<String, Object>();
            value.put("ingredientId", c.ingredientId()); value.put("numerator", quantity(c.numeratorValue(), c.numeratorUnit()));
            value.put("denominator", quantity(c.denominatorValue(), c.denominatorUnit()));
            value.put("denominatorKind", ClinicalDoseUnits.resolve(c.denominatorUnit()).isPresent() ? "CLINICAL" : "PRESENTATION");
            return value;
        }).toList());
        var semantic = new LinkedHashMap<>(data);
        for (String field : List.of("code", "name", "aliasName")) semantic.remove(field);
        semantic.put("strengthUnit", canonicalUnit(medication.strengthUnit()));
        semantic.put("defaultDoseUnit", canonicalUnit(medication.defaultDoseUnit()));
        semantic.put("schemaVersion", SCHEMA);
        return publish(tenant, "MEDICATION", medication.id().toString(), semantic, data,
                mapping.source() == null ? "LOCAL_MEDICATION" : mapping.source());
    }

    private Map<String, Object> quantity(BigDecimal value, String unit) {
        var result = new LinkedHashMap<String, Object>();
        result.put("value", value); result.put("unitCode", canonicalUnit(unit));
        result.put("clinicalUnit", ClinicalDoseUnits.resolve(unit).orElse(null));
        return result;
    }

    private Version publish(Long tenant, String kind, String conceptId, Object semantic, Object snapshot, String source) {
        String hash = ClinicalSemanticVersions.hash(semantic, json), saved = json.write(snapshot);
        var previous = history.latest(tenant, kind, conceptId);
        if (previous.isPresent() && previous.get().semanticVersion().equals(hash)
                && previous.get().snapshot().equals(saved) && Objects.equals(previous.get().source(), source)) return previous.get();
        String change = previous.isEmpty() ? "INITIAL_CAPTURE"
                : previous.get().semanticVersion().equals(hash) ? "DISPLAY_CHANGE"
                : "COMPOSITION".equals(kind) ? "MAPPING_CHANGE" : "CLINICAL_SEMANTIC_CHANGE";
        return history.append(tenant, contexts.requireCurrent().subjectId(), kind, conceptId, hash, change, source, saved);
    }

    private Medication requireMedication(Long tenant, Long id) {
        return medications.findByIdAndTenantId(id, tenant).orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到药品知识"));
    }

    private static String canonicalUnit(String unit) {
        return ClinicalDoseUnits.resolve(unit).map(ClinicalDoseUnits.Unit::code).orElse(unit);
    }

    private static String required(String value) {
        if (value == null || value.isBlank() || value.length() > 256) throw badRequest("MEDICATION_SEMANTIC_VALUE_INVALID", "成分编码、名称、来源和单位须填写有效内容（不超过256字）");
        return value.trim();
    }

    public static CatalogLifecycleDirectory.MedicationSnapshot snapshot(Medication value) {
        return new CatalogLifecycleDirectory.MedicationSnapshot(value.id(), value.itemTypeId(), value.code(), value.name(), value.aliasName(),
                value.medicationType(), value.doseForm(), value.preparationSpec(), value.preparationUnit(),
                value.strengthValue(), value.strengthUnit(), value.storageType(), value.prescriptionDrug(),
                value.essentialDrug(), value.antimicrobial(), value.antimicrobialLevel(),
                value.antimicrobialOutpatientAllowed(), value.antimicrobialConsultationRequired(),
                value.antimicrobialEmergencyAllowed(), value.antimicrobialMaxDays(), value.skinTestRequired(),
                value.skinTestMethod(), value.skinTestSolutionMode(), value.skinTestObservationMinutes(),
                value.skinTestResultValidityHours(), value.skinTestInstructions(),
                value.defaultDose(), value.defaultDoseUnit(), value.defaultRoute(), value.defaultFrequencyId(), value.defaultFrequency(),
                value.chronicDiseaseDrug(), value.singleOrder(), value.status());
    }
}
