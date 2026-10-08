package com.rhn.ai.application;

import com.rhn.ai.api.ClinicalAssistantContracts.HistoricalStablePlanView;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientClinicalHistoryDirectory;
import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.DiagnosisInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.MedicationInput;
import com.rhn.outpatient.api.OutpatientPlanTemplateContracts.ServiceInput;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * Resolves longitudinal stable medication regimens and chronic follow-up plans
 * for return/refill outpatient encounters.
 */
@Service
public class HistoricalPlanResolutionService {
    private static final Logger log = LoggerFactory.getLogger(HistoricalPlanResolutionService.class);

    private final EncounterDirectory encounterDirectory;
    private final OutpatientClinicalHistoryDirectory historyDirectory;
    private final OutpatientPrescriptionInventoryDirectory inventory;
    private final ExecutionContextProvider contextProvider;
    private final com.rhn.platform.masterdata.api.MedicationRouteDirectory routes;
    private final com.rhn.platform.masterdata.api.OrderFrequencyDirectory frequencies;
    private final com.rhn.shared.json.JsonCodec json;

    public HistoricalPlanResolutionService(EncounterDirectory encounterDirectory,
                                           OutpatientClinicalHistoryDirectory historyDirectory,
                                           OutpatientPrescriptionInventoryDirectory inventory,
                                           ExecutionContextProvider contextProvider,
                                           com.rhn.platform.masterdata.api.MedicationRouteDirectory routes,
                                           com.rhn.platform.masterdata.api.OrderFrequencyDirectory frequencies,
                                           com.rhn.shared.json.JsonCodec json) {
        this.encounterDirectory = encounterDirectory;
        this.historyDirectory = historyDirectory;
        this.inventory = inventory;
        this.contextProvider = contextProvider;
        this.routes = routes;
        this.frequencies = frequencies;
        this.json = json;
    }

    public Optional<HistoricalStablePlanView> resolveHistoricalStablePlan(Long encounterId) {
        var encounter = encounterDirectory.requireAccessible(encounterId);
        if (encounter == null) {
            throw notFound("ENCOUNTER_NOT_FOUND", "就诊记录不存在");
        }
        ExecutionContext context = contextProvider.requireCurrent();

        Instant since = Instant.now().minus(180, ChronoUnit.DAYS);
        List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> history =
                historyDirectory.recentForResident(encounter.residentId(), encounterId, since, 10);

        Objects.requireNonNull(history, "历史诊疗记录未返回，不能判定为无历史方案");
        if (history.isEmpty()) {
            return Optional.empty();
        }

        List<OutpatientClinicalHistoryDirectory.MedicationFact> stableMeds = findStableMedications(history);
        if (stableMeds.isEmpty()) {
            return Optional.empty();
        }

        // Extract primary diagnosis from the latest historical visit
        var latestPastEncounter = history.getFirst();
        List<com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem> reviewItems = new ArrayList<>();
        List<DiagnosisInput> diagnoses = extractDiagnoses(latestPastEncounter, reviewItems);

        List<MedicationInput> medicationInputs = new ArrayList<>();
        List<String> guidanceNotes = new ArrayList<>();
        guidanceNotes.add("仅纳入在至少两次已完成就诊中以相同用法重复出现的有效历史医嘱。");
        if (diagnoses.size() != latestPastEncounter.diagnoses().size()) {
            guidanceNotes.add("部分历史诊断缺少编码、名称或类型，未自动补为主诊断，需人工核对。");
        }
        resolveMedicationInputs(context, stableMeds, medicationInputs, guidanceNotes, reviewItems);

        String conditionTitle = !diagnoses.isEmpty() ? diagnoses.getFirst().display() + " 历史重复方案" : "既往重复用药事实";
        String summary = String.format(Locale.ROOT,
                "参考前次就诊（%s），识别 %d 项重复历史用药，其中 %d 项完成当前目录、品规、包装、用法规则和库存核对。",
                latestPastEncounter.registeredAt() != null ? latestPastEncounter.registeredAt().toString().substring(0, 10) : "日期未记录",
                stableMeds.size(),
                medicationInputs.size());

        return Optional.of(new HistoricalStablePlanView(
                encounterId,
                latestPastEncounter.encounterId(),
                latestPastEncounter.registeredAt(),
                conditionTitle,
                summary,
                diagnoses,
                medicationInputs,
                List.of(),
                guidanceNotes,
                reviewItems,
                Set.of("DIAGNOSIS", "MEDICATION")
        ));
    }

    private static List<OutpatientClinicalHistoryDirectory.MedicationFact> findStableMedications(
            List<OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot> history) {
        Map<MedicationSignature, Set<Long>> encounterIdsByMedication = new LinkedHashMap<>();
        Map<MedicationSignature, OutpatientClinicalHistoryDirectory.MedicationFact> latestFacts = new LinkedHashMap<>();

        for (var pastEncounter : history) {
            for (var med : pastEncounter.medications()) {
                if (!isCompleteActiveFact(med)) continue;
                MedicationSignature signature = MedicationSignature.from(med);
                encounterIdsByMedication.computeIfAbsent(signature, ignored -> new LinkedHashSet<>())
                        .add(pastEncounter.encounterId());
                latestFacts.putIfAbsent(signature, med);
            }
        }

        return encounterIdsByMedication.entrySet().stream()
                .filter(entry -> entry.getValue().size() >= 2)
                .map(entry -> latestFacts.get(entry.getKey()))
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private static List<DiagnosisInput> extractDiagnoses(
            OutpatientClinicalHistoryDirectory.EncounterHistorySnapshot latestPastEncounter,
            List<com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem> reviewItems) {
        List<DiagnosisInput> diagnoses = new ArrayList<>();
        if (!latestPastEncounter.diagnoses().isEmpty()) {
            for (var d : latestPastEncounter.diagnoses()) {
                if (!blank(d.code()) && !blank(d.display()) && !blank(d.type()))
                    diagnoses.add(new DiagnosisInput(d.code(), d.display(), d.type()));
                else reviewItems.add(new com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem(
                        "DIAGNOSIS", d.id(), null, null, d.code(), d.display(), "原始诊断编码、名称或类型不完整，未带入草稿"));
            }
        }
        return diagnoses;
    }

    private void resolveMedicationInputs(ExecutionContext context,
                                         List<OutpatientClinicalHistoryDirectory.MedicationFact> stableMeds,
                                         List<MedicationInput> medicationInputs,
                                         List<String> guidanceNotes,
                                         List<com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem> reviewItems) {
        List<OutpatientPrescriptionInventoryDirectory.OrderableMedicationView> current = null;
        for (var fact : stableMeds) {
            if (!hasReusableCatalogFacts(fact)) {
                reviewMedication(fact, reviewItems, guidanceNotes, "既往用药“" + fact.name() + "”的原产品、包装、规格或供应计价事实不完整或不一致，仅供查看，未带入草稿。");
                continue;
            }
            if (stableMeds.stream().filter(other -> other.catalog() != null
                    && fact.catalog().medicationId().equals(other.catalog().medicationId())).count() > 1) {
                reviewMedication(fact, reviewItems, guidanceNotes,
                        "既往用药“" + fact.name() + "”存在多套重复历史用法或品规，未合并带入，请医生明确本次方案。");
                continue;
            }
            try {
                if (!hasConfirmedUsage(context, fact)) {
                    reviewMedication(fact, reviewItems, guidanceNotes, "既往用药“" + fact.name() + "”的原途径或频次规则未确认与当前有效规则一致，仅供查看，未带入草稿。");
                    continue;
                }
                if (current == null) current = inventory.findOrderableMedicationCandidates(
                        context.tenantId(), context.organizationId(), context.departmentId(), "");
                List<ResolvedMedication> matches = current.stream()
                        .filter(candidate -> fact.catalog().medicationId().equals(candidate.id()))
                        .filter(candidate -> "ACTIVE".equals(candidate.sdStatus()))
                        .filter(candidate -> MedicationSpecificationEvidence.reviewExplicitSpecification(
                                fact.catalog().preparationSpec(), candidate.preparationSpec()) == null)
                        .filter(candidate -> Objects.equals(fact.catalog().preparationUnit(), candidate.preparationUnit()))
                        .flatMap(candidate -> candidate.products().stream()
                                .filter(product -> fact.catalog().catalogItemId().equals(product.id())
                                        && fact.catalog().medicationId().equals(product.medicationId()))
                                .filter(product -> usableProduct(product, context))
                                .map(product -> resolve(context, candidate, product, fact)))
                        .flatMap(Optional::stream)
                        .collect(Collectors.collectingAndThen(
                                Collectors.toMap(ResolvedMedication::key, Function.identity(), (left, right) -> left,
                                        LinkedHashMap::new), values -> List.copyOf(values.values())));
                if (matches.size() == 1) {
                    ResolvedMedication match = matches.getFirst();
                    medicationInputs.add(new MedicationInput(
                            match.medicationId(), match.catalogItemId(), match.packageId(),
                            match.medicationName(), match.preparationSpec(),
                            fact.doseValue(), fact.doseUnit(), fact.routeCode(), fact.frequencyCode(),
                            fact.durationValue(), fact.durationUnit(), fact.quantity(), match.quantityUnit(),
                            fact.catalog().substitutionAllowed(), fact.catalog().selfProvided(), fact.catalog().instruction(),
                            fact.catalog().priceType(), true, "复诊历史事实复用"));
                } else if (matches.isEmpty()) {
                    reviewMedication(fact, reviewItems, guidanceNotes, "既往用药“" + fact.name() + "”的原产品、规格、包装、单位或数量未通过当前目录与库存核对，仅供查看，未带入草稿。");
                } else {
                    reviewMedication(fact, reviewItems, guidanceNotes, "既往用药“" + fact.name() + "”存在多个可用品规或包装，仅供查看，需医生重新选择。");
                }
            } catch (RuntimeException e) {
                log.warn("Failed inspecting inventory for historical fact, medicationCode={}", fact.code(), e);
                reviewMedication(fact, reviewItems, guidanceNotes, "既往用药“" + fact.name() + "”目录核对失败，仅供查看，未带入草稿。");
            }
        }
    }

    private static void reviewMedication(OutpatientClinicalHistoryDirectory.MedicationFact fact,
                                         List<com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem> reviewItems,
                                         List<String> guidanceNotes, String reason) {
        reviewItems.add(new com.rhn.ai.api.ClinicalAssistantContracts.HistoricalPlanReviewItem("MEDICATION", fact.id(),
                fact.catalog() == null ? null : fact.catalog().medicationId(),
                fact.catalog() == null ? null : fact.catalog().catalogItemId(), fact.code(), fact.name(), reason));
        guidanceNotes.add(reason);
    }

    private Optional<ResolvedMedication> resolve(ExecutionContext context,
                                                  OutpatientPrescriptionInventoryDirectory.OrderableMedicationView medication,
                                                  com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView product,
                                                  OutpatientClinicalHistoryDirectory.MedicationFact fact) {
        var original = fact.catalog();
        if (!Objects.equals(original.baseUnit(), product.unitCode())) return Optional.empty();
        String packageUnitCode = product.unitCode();
        String packageUnitName = product.unitCode();
        if (original.packageId() != null) {
            if (product.packages() == null) return Optional.empty();
            var packages = product.packages().stream().filter(value -> original.packageId().equals(value.id())).toList();
            if (packages.size() != 1) return Optional.empty();
            var itemPackage = packages.getFirst();
            if (!Objects.equals(original.packageSpec(), itemPackage.packageSpec())
                    || !Objects.equals(original.packageUnitName(), itemPackage.unitName())
                    || itemPackage.quantityFactor() == null
                    || original.packageFactor().compareTo(itemPackage.quantityFactor()) != 0) return Optional.empty();
            packageUnitCode = itemPackage.unitCode();
            packageUnitName = itemPackage.unitName();
        }
        var stock = inventory.inspectMedicationAvailabilityForExactPackage(context.tenantId(), context.organizationId(),
                context.departmentId(), product.id(), original.packageId());
        if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()
                || !Objects.equals(original.packageId(), stock.effectivePackageId())
                || stock.packageFactor() == null || stock.packageFactor().compareTo(original.packageFactor()) != 0
                || blank(stock.packageUnitCode())
                || !Objects.equals(packageUnitCode, stock.packageUnitCode())
                || !(fact.quantityUnit().equals(stock.packageUnitCode()) || fact.quantityUnit().equals(packageUnitName))
                || stock.availableBaseQuantity() == null || stock.availableBaseQuantity().compareTo(original.baseQuantity()) < 0
                || stock.availablePackageQuantity() == null || stock.availablePackageQuantity().compareTo(fact.quantity()) < 0) {
            return Optional.empty();
        }
        return Optional.of(new ResolvedMedication(medication.id(), product.id(), original.packageId(),
                medication.name(), original.preparationSpec(), stock.packageUnitCode()));
    }

    private boolean hasConfirmedUsage(ExecutionContext context, OutpatientClinicalHistoryDirectory.MedicationFact fact) {
        var original = fact.usage();
        if (original == null || original.routeId() == null || original.routeId() <= 0
                || !"RESOLVED".equals(original.routeResolutionStatus()) || blank(original.routeExecutionType())
                || original.frequencyId() == null || original.frequencyId() <= 0) return false;
        var rule = HistoricalMedicationUsage.rule(original.frequencyRuleSnapshot());
        if (rule == null) return false;
        LocalDate today = LocalDate.now();
        var route = routes.requireActive(context.tenantId(), fact.routeCode(), "OUTPATIENT", today);
        if (route == null || !Objects.equals(original.routeId(), route.id())
                || !Objects.equals(fact.routeCode(), route.code())
                || !Objects.equals(original.routeExecutionType(), route.executionType())) return false;
        var frequency = frequencies.requireActive(context.tenantId(), fact.frequencyCode(), context.organizationId(),
                context.departmentId(), "OUTPATIENT", "MEDICATION", today);
        return frequency != null && Objects.equals(original.frequencyId(), frequency.id())
                && Objects.equals(fact.frequencyCode(), frequency.code())
                && rule.equals(HistoricalMedicationUsage.rule(json.write(frequency)));
    }

    private static boolean hasReusableCatalogFacts(OutpatientClinicalHistoryDirectory.MedicationFact fact) {
        var original = fact.catalog();
        return original != null && original.medicationId() != null && original.medicationId() > 0
                && original.catalogItemId() != null && original.catalogItemId() > 0
                && (original.packageId() == null || original.packageId() > 0)
                && !blank(original.preparationSpec()) && !blank(original.preparationUnit()) && !blank(original.baseUnit())
                && positive(original.baseQuantity()) && positive(original.packageFactor())
                && original.baseQuantity().compareTo(fact.quantity().multiply(original.packageFactor())) == 0
                && (original.packageId() != null || original.packageFactor().compareTo(BigDecimal.ONE) == 0)
                && !original.selfProvided() && "SALE".equals(original.priceType());
    }

    private static boolean usableProduct(com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView product,
                                          ExecutionContext context) {
        var adoption = product.organizationAdoption();
        LocalDate today = LocalDate.now();
        return product.orderable() && product.stocked() && product.chargeable() && "ACTIVE".equals(product.sdStatus())
                && product.validFrom() != null && !product.validFrom().isAfter(today)
                && (product.validTo() == null || !product.validTo().isBefore(today))
                && adoption != null && Objects.equals(context.organizationId(), adoption.organizationId())
                && Objects.equals(product.id(), adoption.catalogItemId()) && "ACTIVE".equals(adoption.sdStatus())
                && adoption.orderable() && adoption.dispensable() && adoption.chargeable()
                && adoption.validFrom() != null && !adoption.validFrom().isAfter(today)
                && (adoption.validTo() == null || !adoption.validTo().isBefore(today));
    }

    private static boolean isCompleteActiveFact(OutpatientClinicalHistoryDirectory.MedicationFact fact) {
        return fact != null && "ACTIVE".equals(fact.status()) && !blank(fact.name())
                && positive(fact.doseValue()) && !blank(fact.doseUnit())
                && !blank(fact.routeCode()) && !blank(fact.frequencyCode())
                && positive(fact.durationValue()) && !blank(fact.durationUnit())
                && positive(fact.quantity()) && !blank(fact.quantityUnit());
    }

    private static boolean positive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record MedicationSignature(String codeOrName, BigDecimal doseValue, String doseUnit,
                                       String routeCode, String frequencyCode, BigDecimal durationValue,
                                       String durationUnit, BigDecimal quantity, String quantityUnit,
                                       OutpatientClinicalHistoryDirectory.MedicationCatalogFact catalog, HistoricalMedicationUsage.Signature usage) {
        private static MedicationSignature from(OutpatientClinicalHistoryDirectory.MedicationFact fact) {
            String identity = !blank(fact.code()) ? fact.code().trim().toUpperCase(Locale.ROOT)
                    : fact.name().trim().toUpperCase(Locale.ROOT);
            return new MedicationSignature(identity, normalized(fact.doseValue()), normalized(fact.doseUnit()),
                    normalized(fact.routeCode()), normalized(fact.frequencyCode()), normalized(fact.durationValue()),
                    normalized(fact.durationUnit()), normalized(fact.quantity()), normalized(fact.quantityUnit()), fact.catalog(), HistoricalMedicationUsage.signature(fact.usage()));
        }

        private static BigDecimal normalized(BigDecimal value) {
            return value.stripTrailingZeros();
        }

        private static String normalized(String value) {
            return value.trim().toUpperCase(Locale.ROOT);
        }
    }

    private record ResolvedMedication(Long medicationId, Long catalogItemId, Long packageId,
                                      String medicationName, String preparationSpec, String quantityUnit) {
        private String key() {
            return medicationId + ":" + catalogItemId + ":" + packageId;
        }
    }
}
