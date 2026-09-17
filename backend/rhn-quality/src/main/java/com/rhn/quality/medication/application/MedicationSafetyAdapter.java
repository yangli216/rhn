package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.MedicationSafetyPort;
import com.rhn.outpatient.api.PrescriptionSafetyRequest;
import com.rhn.quality.medication.domain.MedicationSafetyEvaluation;
import com.rhn.quality.medication.domain.rule.DuplicateMedicationRule;
import com.rhn.quality.medication.infrastructure.MedicationEvaluationStore;
import com.rhn.quality.medication.infrastructure.MedicationRuleRegistry;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import static com.rhn.shared.api.BusinessErrors.forbidden;

@Service
public class MedicationSafetyAdapter implements MedicationSafetyPort {
    private static final Logger LOG = LoggerFactory.getLogger(MedicationSafetyAdapter.class);
    private final ExecutionContextProvider contexts;
    private final MedicationRuleRegistry registry;
    private final MedicationEvaluationStore store;
    private final JsonCodec json;
    private final MedicationSafetyEngine engine;

    public MedicationSafetyAdapter(ExecutionContextProvider contexts, MedicationRuleRegistry registry,
                                   MedicationEvaluationStore store, JsonCodec json) {
        this.contexts = contexts; this.registry = registry; this.store = store; this.json = json;
        this.engine = new MedicationSafetyEngine(List.of(
                new DuplicateMedicationRule(),
                new com.rhn.quality.medication.domain.rule.AntimicrobialOutpatientRule(json),
                new com.rhn.quality.medication.domain.rule.DrugAllergyRule(json),
                new com.rhn.quality.medication.domain.rule.SkinTestRequirementRule(json),
                new com.rhn.quality.medication.domain.rule.NsaidDuplicateRule(json),
                new com.rhn.quality.medication.domain.rule.AgeContraindicationRule(json),
                new com.rhn.quality.medication.domain.rule.DisulfiramInteractionRule(json)));
    }

    @Override
    public MedicationSafetyDecision evaluate(PrescriptionSafetyRequest request) {
        var context = contexts.requireCurrent();
        var snapshot = request.snapshot();
        if (!Objects.equals(context.tenantId(), snapshot.tenantId())) {
            throw forbidden("MEDICATION_SAFETY_TENANT_MISMATCH", "无权评价其他租户的处方");
        }
        requireScope(context, snapshot.organizationId(), snapshot.departmentId());
        var started = Instant.now();
        var hash = PrescriptionSafetyHasher.hash(snapshot, json);
        String targetRuleSet = request.ruleSetVersion() != null ? request.ruleSetVersion() : MedicationSafetyEngine.RULE_SET;
        MedicationSafetyEngine.Result result;
        try {
            result = engine.evaluate(snapshot, registry.load(targetRuleSet), started);
        } catch (RuntimeException exception) {
            LOG.warn("Medication safety rule catalog unavailable: {}", exception.getClass().getSimpleName());
            result = new MedicationSafetyEngine.Result(List.of(), List.of(), List.of("RULE_CATALOG_UNAVAILABLE"));
        }
        Long id = GlobalIds.next();
        var decision = new MedicationSafetyDecision(id, snapshot.prescriptionId(), snapshot.prescriptionRevision(), hash,
                targetRuleSet, MedicationSafetyEngine.VERSION, "SHADOW", result.decision(),
                result.findings().stream().map(finding -> finding.snapshot()).toList(), result.executions(), result.failureCodes());
        try {
            store.append(new MedicationSafetyEvaluation(id, context.subjectId(), snapshot, hash,
                    started, Instant.now(), decision, result.findings()));
            return decision;
        } catch (RuntimeException exception) {
            LOG.warn("Medication safety evaluation could not be recorded: {}", exception.getClass().getSimpleName());
            return new MedicationSafetyDecision(null, snapshot.prescriptionId(), snapshot.prescriptionRevision(), hash,
                    MedicationSafetyEngine.RULE_SET, MedicationSafetyEngine.VERSION, "SHADOW",
                    MedicationSafetyDecision.Status.UNAVAILABLE, List.of(), result.executions(),
                    java.util.stream.Stream.concat(result.failureCodes().stream(), java.util.stream.Stream.of("EVALUATION_NOT_PERSISTED"))
                            .distinct().toList());
        }
    }

    @Override
    public Optional<MedicationSafetyDecision> find(Long prescriptionId, Long evaluationId) {
        var context = contexts.requireCurrent();
        return store.find(context.tenantId(), prescriptionId, evaluationId).map(stored -> {
            requireScope(context, stored.organizationId(), stored.departmentId());
            return stored.decision();
        });
    }

    private static void requireScope(ExecutionContext context, Long organizationId, Long departmentId) {
        if (!context.canAccessOrganization(organizationId) || !context.canAccessDepartment(departmentId)) {
            throw forbidden("MEDICATION_SAFETY_SCOPE_INVALID", "无权访问当前工作范围以外的处方安全评价");
        }
    }
}
