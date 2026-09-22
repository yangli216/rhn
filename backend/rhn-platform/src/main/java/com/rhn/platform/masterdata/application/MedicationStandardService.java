package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.domain.MedicationStandardSource;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.infrastructure.MedicationStandardSourceRepository;
import com.rhn.platform.masterdata.infrastructure.MedicationRepository;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import java.util.Objects;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationStandardService {
    private final StandardMedicationCatalogService catalog;
    private final MedicationStandardSourceRepository sources;
    private final MedicationRepository medications;
    private final StandardCatalogReviewService reviews;
    public MedicationStandardService(StandardMedicationCatalogService catalog, MedicationStandardSourceRepository sources, MedicationRepository medications,
            StandardCatalogReviewService reviews) {
        this.catalog = catalog; this.sources = sources; this.medications = medications;
        this.reviews = reviews;
    }

    public void validateNew(Long tenant, MedicationCommand command) {
        validateSpecification(command.standardSpecificationId(), command);
        var summary = catalog.summary();
        if (sources.findByTenantIdAndCatalogCodeAndCatalogVersionAndSpecificationCode(tenant,
                summary.path("catalogId").asString(), summary.path("catalogVersion").asString(), command.standardSpecificationId()).isPresent())
            throw conflict("STANDARD_MEDICATION_REUSE_REQUIRED", "标准规格已有药品档案，请从标准目录关联已有档案");
    }

    public void validateSpecification(String specificationId, MedicationCommand command) {
        if (specificationId == null || specificationId.isBlank())
            throw badRequest("MEDICATION_STANDARD_REQUIRED", "新建药品必须选择标准参考目录中的规格；目录外药品须先补充标准目录");
        var spec = catalog.specification(specificationId);
        if (!catalog.specificationIdentityIssues(spec).isEmpty())
            throw badRequest("MEDICATION_STANDARD_SPECIFICATION_REQUIRES_REVIEW", "标准原文存在规格不完整、剂型边界或成分拆分问题，请先核对标准规格");
        if (!Objects.equals(spec.path("medicationType").asString(), command.medicationType())
                || !Objects.equals(spec.path("doseForm").asString(), command.doseForm())
                || !normalize(spec.path("specification").asString()).equals(normalize(command.preparationSpec())))
            throw badRequest("MEDICATION_STANDARD_IDENTITY_MISMATCH", "药品类型、剂型和规格须与标准参考目录一致");
        String unit = spec.path("presentationUnit").asString("");
        if (!unit.isBlank() && !Objects.equals(unit, command.preparationUnit()))
            throw badRequest("MEDICATION_STANDARD_UNIT_MISMATCH", "制剂单位须与标准规格一致");
        var strength = spec.path("strength");
        if (command.defaultDoseUnit() != null && ClinicalDoseUnits.resolve(command.defaultDoseUnit()).isEmpty()
                && !Objects.equals(command.defaultDoseUnit(), command.preparationUnit())
                && !Objects.equals(command.defaultDoseUnit(), strength.path("numerator").path("unit").asString(null)))
            throw badRequest("MEDICATION_STANDARD_DOSE_UNIT_INVALID", "默认剂量单位须为标准临床单位、制剂单位或标准规格明确记载的单位");
        if ("AMOUNT_PER_PRESENTATION".equals(strength.path("kind").asString()) && strength.path("computable").asBoolean()
                && command.strengthValue() != null) {
            var expected = strength.path("numerator");
            var actual = ClinicalDoseUnits.convert(command.strengthValue(), command.strengthUnit(), expected.path("unit").asString());
            // Non-convertible units may still be identical (e.g. IU); never infer a conversion.
            boolean same = Objects.equals(command.strengthUnit(), expected.path("unit").asString())
                    && command.strengthValue().compareTo(new java.math.BigDecimal(expected.path("value").asString())) == 0;
            if (!same && (actual.isEmpty() || actual.get().compareTo(new java.math.BigDecimal(expected.path("value").asString())) != 0))
                throw badRequest("MEDICATION_STANDARD_STRENGTH_MISMATCH", "结构化含量须与标准规格一致，不能修改为另一规格");
        }
    }

    public void validateUpdate(Long tenant, Long medicationId, MedicationCommand command) {
        var links = sources.findByTenantIdAndMedicationId(tenant, medicationId);
        if (links.size() > 1) throw conflict("MEDICATION_STANDARD_AMBIGUOUS", "药品关联了多个标准规格，请先整理标准关联");
        if (!links.isEmpty()) {
            var source = links.getFirst();
            requireCurrent(source);
            if (command.standardSpecificationId() != null && !source.specificationCode().equals(command.standardSpecificationId()))
                throw conflict("MEDICATION_STANDARD_IMMUTABLE", "已关联的标准规格不能通过修改药品属性更换");
            validateSpecification(source.specificationCode(), command);
        }
    }

    @org.springframework.transaction.annotation.Transactional
    public void link(Long tenant, Long medicationId, String specificationId, Long actor) {
        medications.lockByIdAndTenantId(medicationId, tenant)
                .orElseThrow(() -> notFound("MEDICATION_NOT_FOUND", "未找到通用药品"));
        var spec = catalog.specification(specificationId); var summary = catalog.summary();
        var links = sources.findByTenantIdAndMedicationId(tenant, medicationId);
        if (!links.isEmpty()) {
            if (links.size() != 1 || !links.getFirst().specificationCode().equals(specificationId))
                throw conflict("MEDICATION_STANDARD_IMMUTABLE", "该药品已关联其他标准规格，不能重复关联");
            requireCurrent(links.getFirst());
            return;
        }
        sources.saveAndFlush(new MedicationStandardSource(tenant, medicationId, summary.path("catalogId").asString(),
                summary.path("catalogVersion").asString(), spec.path("entryId").asString(), specificationId,
                summary.path("contentHash").asString(), actor));
    }

    public MedicationStandardReference reference(Long tenant, Long medicationId) {
        var links = sources.findByTenantIdAndMedicationId(tenant, medicationId);
        return reference(medications.findByIdAndTenantId(medicationId, tenant).orElse(null), links, reviews.summary(tenant));
    }

    /** Tenant-wide audit reuses the runtime identity check without a query for every medication. */
    public java.util.Map<Long, MedicationStandardReference> references(Long tenant, List<Medication> items) {
        var grouped = sources.findByTenantId(tenant).stream().collect(java.util.stream.Collectors.groupingBy(MedicationStandardSource::medicationId));
        var summary = reviews.summary(tenant);
        var result = new java.util.HashMap<Long, MedicationStandardReference>();
        for (var item : items) {
            if (!Objects.equals(tenant, item.tenantId())) throw new IllegalArgumentException("Medication tenant mismatch");
            result.put(item.id(), reference(item, grouped.getOrDefault(item.id(), List.of()), summary));
        }
        return result;
    }

    private MedicationStandardReference reference(Medication medication, List<MedicationStandardSource> links, JsonNode summary) {
        if (links.isEmpty()) return MedicationStandardReference.unavailable("UNMAPPED", "STANDARD_REFERENCE_MISSING");
        if (links.size() != 1) return MedicationStandardReference.unavailable("AMBIGUOUS", "STANDARD_REFERENCE_AMBIGUOUS");
        var source = links.getFirst();
        if (!current(source, summary)) return MedicationStandardReference.unavailable("STALE", "STANDARD_REFERENCE_VERSION_UNAVAILABLE");
        JsonNode spec;
        try { spec = catalog.specification(source.specificationCode()); }
        catch (com.rhn.shared.api.BusinessException ex) {
            if (!"STANDARD_SPEC_NOT_FOUND".equals(ex.code())) throw ex;
            return MedicationStandardReference.unavailable("STALE", "STANDARD_REFERENCE_SPECIFICATION_UNAVAILABLE");
        }
        if (!source.entryCode().equals(spec.path("entryId").asString()))
            return MedicationStandardReference.unavailable("MISMATCH", "STANDARD_REFERENCE_IDENTITY_MISMATCH");
        var issues = identityIssues(medication, spec);
        if (!issues.isEmpty()) return MedicationStandardReference.unavailable("MISMATCH", issues.getFirst());
        return new MedicationStandardReference("LINKED", source.catalogCode(), source.catalogVersion(), source.sourceHash(),
                source.entryCode(), source.specificationCode(), spec.path("semanticVersion").asInt(), spec.path("name").asString(),
                spec.path("doseForm").asString(), spec.path("specification").asString(), spec.path("presentationUnit").asString(null),
                spec.path("strength").deepCopy(), summary.path("source").path("verificationStatus").asString("UNKNOWN"), List.of(),
                summary.path("source").path("verificationId").asString(null));
    }

    /** The same structural comparison is used by runtime references and explicit legacy binding. */
    public List<String> identityIssues(Medication medication, JsonNode spec) {
        var sourceIssues = catalog.specificationIdentityIssues(spec);
        if (!sourceIssues.isEmpty()) return sourceIssues;
        String unit = spec.path("presentationUnit").asString("");
        if (medication == null) return List.of("STANDARD_REFERENCE_IDENTITY_MISMATCH");
        var differences = new java.util.ArrayList<String>();
        if (!Objects.equals(medication.medicationType(), spec.path("medicationType").asString())) differences.add("STANDARD_REFERENCE_TYPE_MISMATCH");
        if (!Objects.equals(medication.doseForm(), spec.path("doseForm").asString())) differences.add("STANDARD_REFERENCE_FORM_MISMATCH");
        if (!normalize(medication.preparationSpec()).equals(normalize(spec.path("specification").asString()))) differences.add("STANDARD_REFERENCE_SPEC_MISMATCH");
        if (!unit.isBlank() && !Objects.equals(unit, medication.preparationUnit())) differences.add("STANDARD_REFERENCE_UNIT_MISMATCH");
        if (!differences.isEmpty()) {
            differences.addFirst("STANDARD_REFERENCE_IDENTITY_MISMATCH");
            return List.copyOf(differences);
        }
        var strength = spec.path("strength");
        if (medication.strengthValue() != null && "AMOUNT_PER_PRESENTATION".equals(strength.path("kind").asString())
                && strength.path("computable").asBoolean()) {
            var expected = strength.path("numerator");
            var converted = ClinicalDoseUnits.convert(medication.strengthValue(), medication.strengthUnit(), expected.path("unit").asString());
            var actual = Objects.equals(medication.strengthUnit(), expected.path("unit").asString()) ? medication.strengthValue() : converted.orElse(null);
            if (actual == null || actual.compareTo(new java.math.BigDecimal(expected.path("value").asString())) != 0)
                return List.of("STANDARD_REFERENCE_STRENGTH_MISMATCH");
        }
        return List.of();
    }

    public void requireLinked(Long tenant, Long medicationId) {
        if (!reference(tenant, medicationId).linked())
            throw conflict("MEDICATION_PRODUCT_STANDARD_REQUIRED", "请先从标准参考目录关联药品档案，再新建厂家产品");
    }
    private void requireCurrent(MedicationStandardSource source) {
        if (!current(source, catalog.summary())) throw conflict("MEDICATION_STANDARD_VERSION_UNAVAILABLE", "标准关联版本不可用，请先核对标准来源");
    }
    private boolean current(MedicationStandardSource source, JsonNode summary) {
        return source.catalogCode().equals(summary.path("catalogId").asString())
                && source.catalogVersion().equals(summary.path("catalogVersion").asString())
                && source.sourceHash().equals(summary.path("contentHash").asString());
    }
    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").replace("（", "(").replace("）", ")").replace("∶", ":").replace("：", ":");
    }
}
