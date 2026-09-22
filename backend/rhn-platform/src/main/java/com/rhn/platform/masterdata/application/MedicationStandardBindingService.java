package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MedicationStandardReference;
import com.rhn.platform.masterdata.api.StandardCatalogReview.Identity;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Explicit binding of unchanged legacy medication identities, with immutable before/after provenance. */
@Service
public class MedicationStandardBindingService {
    private final MedicationRepository medications;
    private final MedicationStandardSourceRepository sources;
    private final StandardMedicationCatalogService catalog;
    private final StandardCatalogReviewService reviews;
    private final MedicationStandardService standards;
    private final MedicationSemanticsService semantics;
    private final ClinicalSemanticHistory history;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public MedicationStandardBindingService(MedicationRepository medications, MedicationStandardSourceRepository sources,
            StandardMedicationCatalogService catalog, StandardCatalogReviewService reviews, MedicationStandardService standards,
            MedicationSemanticsService semantics, ClinicalSemanticHistory history, ExecutionContextProvider contexts, JsonCodec json) {
        this.medications = medications; this.sources = sources; this.catalog = catalog; this.reviews = reviews;
        this.standards = standards; this.semantics = semantics; this.history = history; this.contexts = contexts; this.json = json;
    }
    @Transactional(readOnly = true)
    public Preview preview(Long medicationId) {
        var context = contexts.requireCurrent();
        var medication = medications.findByIdAndTenantId(medicationId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到当前租户的药品"));
        return preview(medication);
    }
    private Preview preview(Medication medication) {
        var context = contexts.requireCurrent(); var identity = reviews.identity();
        var reference = standards.reference(context.tenantId(), medication.id());
        var candidates = catalog.identityCandidates(medication.code(), medication.name(), medication.aliasName()).stream().map(spec -> {
            var issues = standards.identityIssues(medication, spec);
            var owner = sources.findFirstByTenantIdAndCatalogCodeAndCatalogVersionAndSpecificationCodeOrderByMedicationIdAsc(context.tenantId(),
                    identity.catalogId(), identity.catalogVersion(), spec.path("id").asString()).map(s -> s.medicationId()).orElse(null);
            return new Candidate(spec, issues, owner, context.hasAuthority("MASTER_DATA.MANAGE")
                    && "ACTIVE".equals(medication.status()) && "UNMAPPED".equals(reference.status()) && issues.isEmpty());
        }).sorted(Comparator.comparing(Candidate::canBind).reversed().thenComparing(c -> c.specification().path("id").asString())).toList();
        var bindings = sources.findByTenantIdAndMedicationId(context.tenantId(), medication.id()).stream()
                .map(s -> new Binding(s.catalogCode(), s.catalogVersion(), s.entryCode(), s.specificationCode(), s.sourceHash())).toList();
        var audits = history.history(context.tenantId(), "STANDARD_BINDING", medication.id().toString(), 100).stream()
                .map(v -> new Audit(v.revision(), v.recordedAt(), json.readTree(v.snapshot()))).toList();
        return new Preview(new LocalMedication(medication.id(), medication.revision(), medication.code(), medication.name(), medication.medicationType(),
                medication.doseForm(), medication.preparationSpec(), medication.preparationUnit(), medication.strengthValue(), medication.strengthUnit(), medication.status()),
                identity, reference, candidates, bindings, audits);
    }
    @Transactional
    public Preview bind(Long medicationId, Bind input) {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("STANDARD_BINDING_FORBIDDEN", "需要基础数据管理权限");
        if (input == null || input.expectedRevision() == null || input.expectedRevision() < 0 || !input.confirmedIdentity()
                || input.reason() == null || input.reason().isBlank() || input.reason().length() > 1000)
            throw badRequest("STANDARD_BINDING_CONFIRMATION_REQUIRED", "请确认药品身份、填写核对依据，并提供当前药品版本");
        var medication = medications.lockByIdAndTenantId(medicationId, context.tenantId())
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到当前租户的药品"));
        if (medication.revision() != input.expectedRevision()) throw conflict("STANDARD_BINDING_STALE", "药品档案已变化，请重新核对");
        if (!reviews.identity().equals(input.identity())) throw conflict("STANDARD_BINDING_STALE", "标准目录或来源文件已变化，请重新核对");
        var before = preview(medication);
        if (!"UNMAPPED".equals(before.reference().status())) throw conflict("STANDARD_BINDING_EXISTS", "已有标准关联不能直接覆盖；当前入口仅支持未关联药品");
        if (before.candidates().stream().noneMatch(c -> c.canBind() && c.specification().path("id").asString().equals(input.specificationId())))
            throw conflict("STANDARD_BINDING_NOT_ELIGIBLE", "所选规格身份不一致或药品已停用，请刷新核对");
        semantics.captureMedication(medication);
        try { standards.linkExisting(context.tenantId(), medicationId, input.specificationId(), context.subjectId()); }
        catch (DataIntegrityViolationException concurrent) { throw conflict("STANDARD_BINDING_CONCURRENT", "该本地药品关联已变化，请刷新核对"); }
        var after = standards.reference(context.tenantId(), medicationId);
        if (!after.linked()) throw conflict("STANDARD_BINDING_NOT_ELIGIBLE", "关联校验未通过，请重新核对药品身份");
        var audit = new LinkedHashMap<String, Object>();
        audit.put("actorId", context.subjectId()); audit.put("actor", context.actor()); audit.put("reason", input.reason().strip());
        audit.put("medication", before.medication()); audit.put("identity", before.identity());
        audit.put("before", before.reference()); audit.put("after", after);
        history.append(context.tenantId(), context.subjectId(), "STANDARD_BINDING", medicationId.toString(),
                ClinicalSemanticVersions.hash(audit, json), "LINK", "MANUAL_STANDARD_BINDING", json.write(audit));
        semantics.captureMedication(medication);
        return preview(medication);
    }
    public record LocalMedication(Long id, long revision, String code, String name, String medicationType, String doseForm,
            String preparationSpec, String presentationUnit, BigDecimal strengthValue, String strengthUnit, String status) {}
    public record Candidate(JsonNode specification, List<String> issues, Long boundMedicationId, boolean canBind) {}
    public record Binding(String catalogId, String catalogVersion, String entryId, String specificationId, String contentHash) {}
    public record Audit(Long id, Instant recordedAt, JsonNode snapshot) {}
    public record Preview(LocalMedication medication, Identity identity, MedicationStandardReference reference,
            List<Candidate> candidates, List<Binding> bindings, List<Audit> audits) {}
    public record Bind(Long expectedRevision, Identity identity, String specificationId, String reason, boolean confirmedIdentity) {}
}
