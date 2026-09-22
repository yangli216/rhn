package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class StandardMedicationOnboardingService {
    private final StandardMedicationCatalogService catalog;
    private final MedicationStandardSourceRepository sources;
    private final MedicationRepository medications;
    private final MasterDataApplicationService master;
    private final ExecutionContextProvider contexts;
    private final MedicationStandardService standards;
    public StandardMedicationOnboardingService(StandardMedicationCatalogService catalog,
            MedicationStandardSourceRepository sources, MedicationRepository medications,
            MasterDataApplicationService master, ExecutionContextProvider contexts, MedicationStandardService standards) {
        this.standards = standards;
        this.catalog = catalog; this.sources = sources; this.medications = medications;
        this.master = master; this.contexts = contexts;
    }

    @Transactional(readOnly = true)
    public List<MedicationView> candidates(String specificationId, Long organizationId) {
        var context = contexts.requireCurrent();
        var spec = catalog.specification(specificationId);
        var summary = catalog.summary();
        var mapped = sources.findAllByTenantIdAndCatalogCodeAndCatalogVersionAndSpecificationCodeOrderByMedicationIdAsc(context.tenantId(),
                summary.path("catalogId").asString(), summary.path("catalogVersion").asString(), specificationId);
        if (!mapped.isEmpty()) return mapped.stream().map(s -> master.medication(s.medicationId(), organizationId)).toList();
        var entry = catalog.detail(spec.path("entryId").asString());
        String legacyPrefix = entry.path("legacyCode").asString() + "-";
        // Offer legacy and manually created equivalents for explicit reuse; never infer equivalence from name alone.
        return medications.findByTenantIdOrderByName(context.tenantId()).stream()
                .filter(m -> m.code().equals(specificationId)
                    || (m.code().equals(entry.path("legacyCode").asString()) || m.code().startsWith(legacyPrefix) || normalize(m.name()).equals(normalize(entry.path("name").asString())))
                        && Objects.equals(m.medicationType(), entry.path("medicationType").asString())
                        && standards.doseFormMatches(m.name(), m.doseForm(), spec)
                        && normalize(m.preparationSpec()).equals(normalize(spec.path("specification").asString())))
                .filter(m -> catalog.qualifierIdentityIssues(m.name(), spec).isEmpty())
                .map(m -> master.medication(m.id(), organizationId)).toList();
    }

    @Transactional
    public MedicationView save(String specificationId, Long medicationId, Long expectedRevision,
            MedicationCommand command, Long organizationId) {
        var context = contexts.requireCurrent();
        var existing = candidates(specificationId, organizationId);
        if (!existing.isEmpty() && (medicationId == null || existing.stream().noneMatch(m -> m.id().equals(medicationId))))
            throw conflict("STANDARD_MEDICATION_REUSE_REQUIRED", "已有同规格药品，请选择已有档案关联，避免重复建档");
        if (existing.isEmpty() && medicationId != null)
            throw badRequest("STANDARD_MEDICATION_LINK_INVALID", "所选药品与标准规格不匹配");
        if (medicationId != null && expectedRevision == null)
            throw badRequest("MEDICATION_REVISION_REQUIRED", "请刷新药品版本后重试");
        standards.validateSpecification(specificationId, command);
        command = command.withStandardSpecification(specificationId);
        if (medicationId != null) standards.linkExisting(context.tenantId(), medicationId, specificationId, context.subjectId());
        var saved = medicationId == null ? master.createMedication(command, organizationId)
                : master.updateMedication(medicationId, expectedRevision, command, organizationId);
        standards.link(context.tenantId(), saved.id(), specificationId, context.subjectId());
        return master.medication(saved.id(), organizationId);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").replace("（", "(").replace("）", ")").replace("∶", ":").replace("：", ":").toLowerCase(java.util.Locale.ROOT);
    }
}
