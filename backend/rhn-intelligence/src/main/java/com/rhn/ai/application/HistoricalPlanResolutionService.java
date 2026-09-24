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
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

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

        // Analyze frequency and long-term nature of medications across visits
        Map<String, Integer> medicationCounts = new LinkedHashMap<>();
        Map<String, OutpatientClinicalHistoryDirectory.MedicationFact> latestFacts = new LinkedHashMap<>();
        Set<String> acuteTerms = Set.of("布洛芬", "阿莫西林", "头孢", "感冒", "退热", "止痛", "对乙酰氨基酚");

        for (var pastEncounter : history) {
            for (var med : pastEncounter.medications()) {
                if (med.name() == null || med.name().isBlank()) continue;
                String normalized = med.name().trim();
                boolean isAcute = acuteTerms.stream().anyMatch(normalized::contains);
                // Chronic drugs usually have duration >= 14d or repeated usage
                if (!isAcute || (med.durationValue() != null && med.durationValue().compareTo(BigDecimal.valueOf(14)) >= 0)) {
                    medicationCounts.put(normalized, medicationCounts.getOrDefault(normalized, 0) + 1);
                    latestFacts.putIfAbsent(normalized, med);
                }
            }
        }

        // Filter medications that appear repeatedly or are clearly chronic maintenance
        List<OutpatientClinicalHistoryDirectory.MedicationFact> stableMeds = new ArrayList<>();
        for (var entry : medicationCounts.entrySet()) {
            if (entry.getValue() >= 2 || history.size() == 1) {
                var fact = latestFacts.get(entry.getKey());
                if (fact != null) stableMeds.add(fact);
            }
        }

        if (stableMeds.isEmpty() && !latestFacts.isEmpty()) {
            // Fallback: take up to 2 most recent medications from previous visit
            stableMeds.addAll(latestFacts.values().stream().limit(2).toList());
        }

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
        } else {
            diagnoses.add(new DiagnosisInput("I10", "高血压（慢病维持）", "PRIMARY"));
        }

        // Map stable medications into actual orderable MedicationInput
        List<MedicationInput> medicationInputs = new ArrayList<>();
        List<String> guidanceNotes = new ArrayList<>();
        guidanceNotes.add("已从患者近180天历史就诊中识别出平稳维持期处方组合。");

        for (var fact : stableMeds) {
            try {
                var candidates = inventory.findOrderableMedications(
                        context.tenantId(), context.organizationId(), context.departmentId(), fact.name());
                boolean matched = false;
                for (var candidate : candidates) {
                    if (!"ACTIVE".equals(candidate.sdStatus())) continue;
                    for (var product : candidate.products()) {
                        if (!product.orderable() || product.organizationAdoption() == null
                                || !product.organizationAdoption().orderable()
                                || !product.organizationAdoption().dispensable()) continue;

                        var stock = inventory.inspectMedicationAvailability(
                                context.tenantId(), context.organizationId(), context.departmentId(), product.id(), null);
                        if (stock == null || !stock.routeConfigured() || !stock.stockItemConfigured()) continue;

                        Long packageId = stock.effectivePackageId() != null ? stock.effectivePackageId()
                                : !product.packages().isEmpty() ? product.packages().getFirst().id() : 1L;

                        medicationInputs.add(new MedicationInput(
                                candidate.id(),
                                product.id(),
                                packageId,
                                fact.doseValue() != null ? fact.doseValue() : BigDecimal.ONE,
                                fact.doseUnit() != null ? fact.doseUnit() : "片",
                                fact.routeCode() != null ? fact.routeCode() : "PO",
                                fact.frequencyCode() != null ? fact.frequencyCode() : "QD",
                                fact.durationValue() != null ? fact.durationValue() : BigDecimal.valueOf(30),
                                fact.durationUnit() != null ? fact.durationUnit() : "d",
                                fact.quantity() != null ? fact.quantity() : BigDecimal.ONE,
                                fact.quantityUnit() != null ? fact.quantityUnit() : "盒",
                                true,
                                false,
                                "复诊原方案维持用药，遵医嘱执行",
                                "SALE",
                                true,
                                "慢病平稳期原方案续方"
                        ));
                        matched = true;
                        break;
                    }
                    if (matched) break;
                }
                if (!matched) {
                    guidanceNotes.add("既往用药“" + fact.name() + "”当前科室未查询到可用库存品规，建议医生评估替换。");
                }
            } catch (RuntimeException e) {
                log.warn("Failed inspecting inventory for historical fact: {}", fact.name(), e);
            }
        }

        String conditionTitle = !diagnoses.isEmpty() ? diagnoses.getFirst().display() + " 平稳维持方案" : "既往慢病成熟方案";
        String summary = String.format(Locale.ROOT,
                "参考前次就诊（%s 开立），包含 %d 项平稳长期用药，可直接复核后快速开立。",
                latestPastEncounter.registeredAt() != null ? latestPastEncounter.registeredAt().toString().substring(0, 10) : "近期",
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
}
