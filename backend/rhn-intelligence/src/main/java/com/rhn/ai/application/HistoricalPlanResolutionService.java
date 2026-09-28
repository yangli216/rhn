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
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
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

    public HistoricalPlanResolutionService(EncounterDirectory encounterDirectory,
                                           OutpatientClinicalHistoryDirectory historyDirectory,
                                           OutpatientPrescriptionInventoryDirectory inventory,
                                           ExecutionContextProvider contextProvider) {
        this.encounterDirectory = encounterDirectory;
        this.historyDirectory = historyDirectory;
        this.inventory = inventory;
        this.contextProvider = contextProvider;
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

        if (history == null || history.isEmpty()) {
            return Optional.empty();
        }

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

        List<OutpatientClinicalHistoryDirectory.MedicationFact> stableMeds = encounterIdsByMedication.entrySet().stream()
                .filter(entry -> entry.getValue().size() >= 2)
                .map(entry -> latestFacts.get(entry.getKey()))
                .filter(java.util.Objects::nonNull)
                .toList();

        if (stableMeds.isEmpty()) {
            return Optional.empty();
        }

        // Extract primary diagnosis from the latest historical visit
        var latestPastEncounter = history.getFirst();
        List<DiagnosisInput> diagnoses = new ArrayList<>();
        if (!latestPastEncounter.diagnoses().isEmpty()) {
            for (var d : latestPastEncounter.diagnoses()) {
                diagnoses.add(new DiagnosisInput(d.code(), d.display(), d.type() == null ? "PRIMARY" : d.type()));
            }
        }

        List<MedicationInput> medicationInputs = new ArrayList<>();
        List<String> guidanceNotes = new ArrayList<>();
        guidanceNotes.add("仅纳入在至少两次已完成就诊中以相同用法重复出现的有效历史医嘱。");

        for (var fact : stableMeds) {
            try {
                List<ResolvedMedication> matches = inventory.findOrderableMedications(
                                context.tenantId(), context.organizationId(), context.departmentId(), fact.name()).stream()
                        .filter(candidate -> exactMedicationMatch(fact, candidate.code(), candidate.name()))
                        .filter(candidate -> "ACTIVE".equals(candidate.sdStatus()))
                        .flatMap(candidate -> candidate.products().stream()
                                .filter(product -> product.orderable() && "ACTIVE".equals(product.sdStatus()))
                                .filter(product -> product.organizationAdoption() != null
                                        && product.organizationAdoption().orderable()
                                        && product.organizationAdoption().dispensable())
                                .map(product -> resolve(context, candidate, product.id())))
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
                            fact.durationValue(), fact.durationUnit(), fact.quantity(), fact.quantityUnit(),
                            false, false, "按既往已完成就诊中的原始用法带入，需医生重新核对",
                            "SALE", true, "复诊历史事实复用"));
                } else if (matches.isEmpty()) {
                    guidanceNotes.add("既往用药“" + fact.name() + "”缺少当前科室唯一可用的药品、品规或包装映射，仅供查看，未带入草稿。");
                } else {
                    guidanceNotes.add("既往用药“" + fact.name() + "”存在多个可用品规或包装，仅供查看，需医生重新选择。");
                }
            } catch (RuntimeException e) {
                log.warn("Failed inspecting inventory for historical fact, medicationCode={}", fact.code(), e);
                guidanceNotes.add("既往用药“" + fact.name() + "”目录核对失败，仅供查看，未带入草稿。");
            }
        }

        String conditionTitle = !diagnoses.isEmpty() ? diagnoses.getFirst().display() + " 历史重复方案" : "既往重复用药事实";
        String summary = String.format(Locale.ROOT,
                "参考前次就诊（%s），识别 %d 项重复历史用药，其中 %d 项完成当前目录、品规、包装和库存核对。",
                latestPastEncounter.registeredAt() != null ? latestPastEncounter.registeredAt().toString().substring(0, 10) : "近期",
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
                guidanceNotes
        ));
    }

    private Optional<ResolvedMedication> resolve(ExecutionContext context,
                                                  OutpatientPrescriptionInventoryDirectory.OrderableMedicationView medication,
                                                  Long productId) {
        var stock = inventory.inspectMedicationAvailability(context.tenantId(), context.organizationId(),
                context.departmentId(), productId, null);
        if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()
                || stock.effectivePackageId() == null || stock.packageFactor() == null
                || stock.packageFactor().signum() <= 0 || stock.availablePackageQuantity() == null
                || stock.availablePackageQuantity().signum() <= 0) {
            return Optional.empty();
        }
        return Optional.of(new ResolvedMedication(medication.id(), productId, stock.effectivePackageId(),
                medication.name(), medication.preparationSpec()));
    }

    private static boolean exactMedicationMatch(OutpatientClinicalHistoryDirectory.MedicationFact fact,
                                                String candidateCode, String candidateName) {
        if (!blank(fact.code()) && fact.code().trim().equalsIgnoreCase(trim(candidateCode))) return true;
        return fact.name().trim().equalsIgnoreCase(trim(candidateName));
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

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private record MedicationSignature(String codeOrName, BigDecimal doseValue, String doseUnit,
                                       String routeCode, String frequencyCode, BigDecimal durationValue,
                                       String durationUnit, BigDecimal quantity, String quantityUnit) {
        private static MedicationSignature from(OutpatientClinicalHistoryDirectory.MedicationFact fact) {
            String identity = !blank(fact.code()) ? fact.code().trim().toUpperCase(Locale.ROOT)
                    : fact.name().trim().toUpperCase(Locale.ROOT);
            return new MedicationSignature(identity, normalized(fact.doseValue()), normalized(fact.doseUnit()),
                    normalized(fact.routeCode()), normalized(fact.frequencyCode()), normalized(fact.durationValue()),
                    normalized(fact.durationUnit()), normalized(fact.quantity()), normalized(fact.quantityUnit()));
        }

        private static BigDecimal normalized(BigDecimal value) {
            return value.stripTrailingZeros();
        }

        private static String normalized(String value) {
            return value.trim().toUpperCase(Locale.ROOT);
        }
    }

    private record ResolvedMedication(Long medicationId, Long catalogItemId, Long packageId,
                                      String medicationName, String preparationSpec) {
        private String key() {
            return medicationId + ":" + catalogItemId + ":" + packageId;
        }
    }
}
