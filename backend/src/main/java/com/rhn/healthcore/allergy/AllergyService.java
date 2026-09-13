package com.rhn.healthcore.allergy;

import com.rhn.healthcore.api.AllergyDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class AllergyService implements AllergyDirectory {
    private static final Set<String> ASSERTIONS = Set.of("ALLERGY", "NO_KNOWN_ALLERGY", "NO_KNOWN_DRUG_ALLERGY");
    private static final Set<String> CATEGORIES = Set.of("DRUG", "FOOD", "ENVIRONMENT", "BIOLOGIC", "OTHER");
    private static final Set<String> CRITICALITIES = Set.of("LOW", "HIGH", "UNABLE_TO_ASSESS");
    private static final Set<String> SEVERITIES = Set.of("MILD", "MODERATE", "SEVERE");
    private static final Set<String> SOURCES = Set.of("PATIENT", "FAMILY", "MEDICAL_RECORD", "CLINICIAN");

    private final AllergyIntoleranceRepository repository;
    private final ResidentDirectory residentDirectory;
    private final ExecutionContextProvider contextProvider;
    private final DomainEventPublisher eventPublisher;
    private final MedicationTerminologyDirectory terminologyDirectory;

    AllergyService(AllergyIntoleranceRepository repository, ResidentDirectory residentDirectory,
                   ExecutionContextProvider contextProvider, DomainEventPublisher eventPublisher,
                   MedicationTerminologyDirectory terminologyDirectory) {
        this.repository = repository; this.residentDirectory = residentDirectory;
        this.contextProvider = contextProvider; this.eventPublisher = eventPublisher;
        this.terminologyDirectory = terminologyDirectory;
    }

    @Transactional(readOnly = true)
    List<AllergyResponse> list(Long residentId, boolean activeOnly) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long canonicalId = residentDirectory.resolveCanonicalResidentId(residentId);
        List<AllergyIntolerance> values = activeOnly
                ? repository.findByTenantIdAndResidentIdAndClinicalStatusOrderByRecordedAtDesc(
                        context.tenantId(), canonicalId, "ACTIVE")
                : repository.findByTenantIdAndResidentIdOrderByRecordedAtDesc(context.tenantId(), canonicalId);
        return values.stream().map(AllergyIntolerance::response).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<AllergySnapshot> activeForResident(Long residentId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long canonicalId = residentDirectory.resolveCanonicalResidentId(residentId);
        return repository.findByTenantIdAndResidentIdAndClinicalStatusOrderByRecordedAtDesc(
                context.tenantId(), canonicalId, "ACTIVE").stream().map(AllergyIntolerance::snapshot).toList();
    }

    @Override
    @Transactional
    public AllergySnapshot recordPositiveDrugSkinTest(Long residentId, Long encounterId, String substanceCode,
                                                      String substanceDisplay, String reactionText,
                                                      Instant onsetAt, Long skinTestEventId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long canonicalId = residentDirectory.resolveCanonicalResidentId(residentId);
        List<AllergyIntolerance> active = repository
                .findByTenantIdAndResidentIdAndClinicalStatusOrderByRecordedAtDesc(
                        context.tenantId(), canonicalId, "ACTIVE");
        AllergyIntolerance existing = active.stream().filter(value -> "ALLERGY".equals(value.assertionType())
                        && "DRUG".equals(value.categoryCode()))
                .filter(value -> {
                    AllergySnapshot snapshot = value.snapshot();
                    return substanceCode != null && snapshot.substanceCode() != null
                            ? substanceCode.equalsIgnoreCase(snapshot.substanceCode())
                            : java.util.Objects.equals(clean(substanceDisplay), clean(snapshot.substanceDisplay()));
                }).findFirst().orElse(null);
        if (existing != null) return existing.snapshot();

        for (AllergyIntolerance value : active) {
            if ("ALLERGY".equals(value.assertionType())) continue;
            value.inactivate(value.revision(), "皮试阳性，自动替代原无已知药物过敏声明", context.subjectId());
            publish(value, "ALLERGY_INACTIVATED", "皮试阳性后停用无已知过敏声明",
                    Map.of("reason", "POSITIVE_SKIN_TEST", "skinTestEventId", skinTestEventId));
        }
        var matchedTerm = terminologyDirectory.searchAllergens(context.tenantId(), "DRUG", substanceDisplay).stream()
                .filter(term -> "DRUG_INGREDIENT".equals(term.conceptType())).findFirst().orElse(null);
        RecordAllergyRequest input = new RecordAllergyRequest(encounterId, matchedTerm == null ? null : matchedTerm.id(),
                "ALLERGY", "DRUG", "HIGH", null, "CLINICIAN",
                matchedTerm == null ? null : matchedTerm.codeSystemUri(),
                matchedTerm == null ? clean(substanceCode) : matchedTerm.code(),
                matchedTerm == null ? clean(substanceDisplay) : matchedTerm.display(), clean(reactionText), onsetAt);
        validate(input);
        AllergyIntolerance value = repository.saveAndFlush(new AllergyIntolerance(context.tenantId(), canonicalId,
                input, context.subjectId(), context.practitionerId()));
        publish(value, "ALLERGY_RECORDED", "皮试阳性自动登记药物过敏", Map.of(
                "assertionType", "ALLERGY", "categoryCode", "DRUG",
                "substanceDisplay", input.substanceDisplay(), "skinTestEventId", skinTestEventId));
        return value.snapshot();
    }

    @Transactional
    AllergyResponse record(Long residentId, RecordAllergyRequest raw) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long canonicalId = residentDirectory.resolveCanonicalResidentId(residentId);
        RecordAllergyRequest input = standardized(context.tenantId(), normalized(raw));
        validate(input);
        List<AllergyIntolerance> active = repository
                .findByTenantIdAndResidentIdAndClinicalStatusOrderByRecordedAtDesc(context.tenantId(), canonicalId, "ACTIVE");
        boolean actualAllergy = active.stream().anyMatch(value -> "ALLERGY".equals(value.assertionType()));
        boolean noKnownAssertion = active.stream().anyMatch(value -> !"ALLERGY".equals(value.assertionType()));
        if ("ALLERGY".equals(input.assertionType()) && noKnownAssertion) {
            throw conflict("ALLERGY_ASSERTION_CONFLICT", "患者存在有效的无已知过敏声明，请先停用该声明");
        }
        if (!"ALLERGY".equals(input.assertionType()) && (actualAllergy || noKnownAssertion)) {
            throw conflict("ALLERGY_ASSERTION_CONFLICT", actualAllergy
                    ? "患者已有有效过敏记录，不能同时声明无已知过敏" : "患者已有有效的无已知过敏声明");
        }
        if (active.stream().anyMatch(value -> value.assertionType().equals(input.assertionType())
                && java.util.Objects.equals(value.categoryCode(), input.categoryCode()))) {
            if (!"ALLERGY".equals(input.assertionType()) || active.stream().anyMatch(value ->
                    java.util.Objects.equals(value.snapshot().substanceCode(), input.substanceCode())
                    && java.util.Objects.equals(value.snapshot().substanceDisplay(), input.substanceDisplay()))) {
                throw conflict("ALLERGY_ASSERTION_DUPLICATE", "相同的过敏声明已经存在");
            }
        }
        AllergyIntolerance value = repository.saveAndFlush(new AllergyIntolerance(context.tenantId(), canonicalId,
                input, context.subjectId(), context.practitionerId()));
        publish(value, "ALLERGY_RECORDED", "记录患者过敏信息", Map.of("assertionType", input.assertionType(),
                "categoryCode", input.categoryCode() == null ? "" : input.categoryCode(),
                "substanceDisplay", input.substanceDisplay() == null ? "" : input.substanceDisplay()));
        return value.response();
    }

    @Transactional
    AllergyResponse inactivate(Long residentId, Long allergyId, InactivateAllergyRequest input) {
        ExecutionContext context = contextProvider.requireCurrent();
        Long canonicalId = residentDirectory.resolveCanonicalResidentId(residentId);
        AllergyIntolerance value = repository.findByIdAndTenantId(allergyId, context.tenantId())
                .filter(item -> item.residentId().equals(canonicalId))
                .orElseThrow(() -> notFound("ALLERGY_NOT_FOUND", "未找到患者过敏信息"));
        value.inactivate(input.expectedRevision(), input.reason().trim(), context.subjectId());
        repository.flush();
        publish(value, "ALLERGY_INACTIVATED", "停用患者过敏信息", Map.of("reason", input.reason().trim()));
        return value.response();
    }

    private void validate(RecordAllergyRequest input) {
        if (!ASSERTIONS.contains(input.assertionType())) throw badRequest("ALLERGY_ASSERTION_INVALID", "过敏声明类型不正确");
        if (!SOURCES.contains(input.informationSource())) throw badRequest("ALLERGY_SOURCE_INVALID", "过敏信息来源不正确");
        if (input.categoryCode() != null && !CATEGORIES.contains(input.categoryCode()))
            throw badRequest("ALLERGY_CATEGORY_INVALID", "过敏类别不正确");
        if (input.criticalityCode() != null && !CRITICALITIES.contains(input.criticalityCode()))
            throw badRequest("ALLERGY_CRITICALITY_INVALID", "过敏危急程度不正确");
        if (input.reactionSeverity() != null && !SEVERITIES.contains(input.reactionSeverity()))
            throw badRequest("ALLERGY_SEVERITY_INVALID", "过敏反应严重程度不正确");
        if ("ALLERGY".equals(input.assertionType())) {
            if (input.categoryCode() == null) throw badRequest("ALLERGY_CATEGORY_REQUIRED", "记录过敏时必须选择类别");
            if (input.substanceDisplay() == null) throw badRequest("ALLERGY_SUBSTANCE_REQUIRED", "记录过敏时必须填写过敏原");
        } else if (input.categoryCode() != null || input.allergenId() != null
                || input.substanceDisplay() != null || input.substanceCode() != null) {
            throw badRequest("NO_KNOWN_ALLERGY_DETAIL_INVALID", "无已知过敏声明不能同时填写具体过敏原");
        }
    }

    private RecordAllergyRequest normalized(RecordAllergyRequest value) {
        return new RecordAllergyRequest(value.encounterId(), value.allergenId(), upper(value.assertionType()), upper(value.categoryCode()),
                upper(value.criticalityCode()), upper(value.reactionSeverity()), upper(value.informationSource()),
                clean(value.substanceCodeSystemUri()), clean(value.substanceCode()), clean(value.substanceDisplay()),
                clean(value.reactionText()), value.onsetAt());
    }

    private RecordAllergyRequest standardized(Long tenantId, RecordAllergyRequest value) {
        if (value.allergenId() == null) return value;
        var term = terminologyDirectory.findAllergen(tenantId, value.allergenId())
                .orElseThrow(() -> badRequest("ALLERGEN_TERM_NOT_FOUND", "未找到有效的标准过敏原"));
        if (value.categoryCode() != null && !value.categoryCode().equals(term.categoryCode())) {
            throw badRequest("ALLERGEN_CATEGORY_MISMATCH", "所选过敏原与过敏类别不一致");
        }
        return new RecordAllergyRequest(value.encounterId(), term.id(), value.assertionType(), term.categoryCode(),
                value.criticalityCode(), value.reactionSeverity(), value.informationSource(), term.codeSystemUri(),
                term.code(), term.display(), value.reactionText(), value.onsetAt());
    }

    private void publish(AllergyIntolerance value, String type, String summary, Map<String, Object> details) {
        ExecutionContext context = contextProvider.requireCurrent();
        var payload = new java.util.LinkedHashMap<String, Object>(details); payload.put("summary", summary);
        eventPublisher.publish(value.tenantId(), context.organizationId(), type, 1, "AllergyIntolerance",
                value.id(), value.revision(), value.residentId(), Instant.now(), payload);
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String upper(String value) { String cleaned = clean(value); return cleaned == null ? null : cleaned.toUpperCase(); }
}
