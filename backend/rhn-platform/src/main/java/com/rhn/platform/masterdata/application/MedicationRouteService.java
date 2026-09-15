package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.domain.MedicationRouteProfile;
import com.rhn.platform.masterdata.infrastructure.MedicationRouteProfileRepository;
import com.rhn.platform.terminology.api.ConceptView;
import com.rhn.platform.terminology.api.TerminologyDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class MedicationRouteService implements MedicationRouteDirectory {
    public static final String MASTER_VALUE_SET = "RHN.EX.VS.MEDICATION.ROUTE";
    public static final String OUTPATIENT_VALUE_SET = "RHN.EX.VS.OUTPATIENT_PRESCRIPTION.ROUTE";
    public static final String INPATIENT_VALUE_SET = "RHN.EX.VS.INPATIENT_MEDICATION.ROUTE";

    private final TerminologyDirectory terminology;
    private final MedicationRouteProfileRepository profiles;

    public MedicationRouteService(TerminologyDirectory terminology, MedicationRouteProfileRepository profiles) {
        this.terminology = terminology;
        this.profiles = profiles;
    }

    @Override
    @Transactional(readOnly = true)
    public RouteSnapshot requireActive(Long tenantId, String codeOrAlias, String scene, LocalDate businessDate) {
        if (clean(codeOrAlias) == null) {
            throw badRequest("MEDICATION_ROUTE_REQUIRED", "给药途径不能为空");
        }
        return resolveActive(tenantId, codeOrAlias, scene, businessDate)
                .orElseThrow(() -> badRequest("MEDICATION_ROUTE_INVALID", "给药途径不存在或不适用于当前场景：" + codeOrAlias));
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<RouteSnapshot> resolveActive(Long tenantId, String codeOrAlias, String scene,
                                                  LocalDate businessDate) {
        String value = clean(codeOrAlias);
        if (value == null) return Optional.empty();
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        return terminology.findValueSetMember(tenantId, valueSet(scene), value, date).map(this::snapshot);
    }

    @Override
    @Transactional(readOnly = true)
    public List<RouteSnapshot> active(Long tenantId, String scene, LocalDate businessDate) {
        LocalDate date = businessDate == null ? LocalDate.now() : businessDate;
        List<ConceptView> concepts = terminology.expandValueSet(tenantId, valueSet(scene), date);
        Map<Long, MedicationRouteProfile> byConcept = profiles.findByConceptIdIn(
                        concepts.stream().map(ConceptView::id).toList()).stream()
                .collect(Collectors.toMap(MedicationRouteProfile::conceptId, Function.identity()));
        return concepts.stream().map(value -> snapshot(value, byConcept.get(value.id()))).toList();
    }

    private RouteSnapshot snapshot(ConceptView concept) {
        MedicationRouteProfile profile = profiles.findByConceptId(concept.id())
                .orElseThrow(() -> new IllegalStateException("Medication route profile is missing: " + concept.code()));
        return snapshot(concept, profile);
    }

    private RouteSnapshot snapshot(ConceptView concept, MedicationRouteProfile profile) {
        if (profile == null) {
            throw new IllegalStateException("Medication route profile is missing: " + concept.code());
        }
        return new RouteSnapshot(concept.id(), concept.code(), concept.display(), concept.system(),
                concept.systemVersion(), profile.executionType());
    }

    private static String valueSet(String scene) {
        String normalized = clean(scene) == null ? "OUTPATIENT" : scene.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "MASTER_DATA", "MEDICATION" -> MASTER_VALUE_SET;
            case "OUTPATIENT" -> OUTPATIENT_VALUE_SET;
            case "INPATIENT" -> INPATIENT_VALUE_SET;
            default -> throw badRequest("MEDICATION_ROUTE_SCENE_INVALID", "不支持的给药途径业务场景：" + scene);
        };
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
