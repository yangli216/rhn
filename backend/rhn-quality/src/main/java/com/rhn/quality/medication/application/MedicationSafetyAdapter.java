package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.MedicationSafetyDecision;
import com.rhn.outpatient.api.MedicationSafetyPort;
import com.rhn.outpatient.api.PrescriptionSafetyRequest;
import com.rhn.quality.medication.domain.MedicationSafetyEvaluation;
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
    private final MedicationRuleRuntime runtime;

    public MedicationSafetyAdapter(ExecutionContextProvider contexts, MedicationRuleRegistry registry,
                                   MedicationEvaluationStore store, JsonCodec json) {
        this(contexts, registry, store, json, null, null);
    }

    public MedicationSafetyAdapter(ExecutionContextProvider contexts, MedicationRuleRegistry registry,
                                   MedicationEvaluationStore store, JsonCodec json, MedicationRuleRuntime runtime) {
        this(contexts, registry, store, json, runtime, null);
    }

    @org.springframework.beans.factory.annotation.Autowired
    public MedicationSafetyAdapter(ExecutionContextProvider contexts, MedicationRuleRegistry registry,
                                   MedicationEvaluationStore store, JsonCodec json, MedicationRuleRuntime runtime,
                                   @org.springframework.beans.factory.annotation.Autowired(required = false) MedicationSafetyCategoryService safetyCategories) {
        this.runtime = runtime;
        this.contexts = contexts; this.registry = registry; this.store = store; this.json = json;
        this.engine = MedicationSafetyEngine.standard(json, safetyCategories);
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
        // Production path (no explicit rule set, runtime available): built-in baseline rules and ENFORCED knowledge
        // releases are formal and gate submission; SHADOW knowledge releases are only recorded for observation.
        // An explicit rule set version (replay / workbench) stays an observation-only SHADOW evaluation.
        boolean production=runtime!=null && request.ruleSetVersion()==null;
        MedicationSafetyEngine.Result observed=null;
        MedicationSafetyEngine.Result formal=null;
        // Baseline rules that cannot be evaluated stay visible (failure codes, executions) but do not by themselves
        // block submission; only formal knowledge releases and an unreadable rule catalog report UNAVAILABLE.
        boolean formalIncomplete=false;
        String formalSet=targetRuleSet;
        try {
            var versions=registry.load(targetRuleSet);
            if(production) {
                var plan=runtime.plan(snapshot,versions,started);
                var baseline=plan.baseline().isEmpty()?new MedicationSafetyEngine.Result(List.of(),List.of(),List.of()):engine.evaluateSelected(snapshot,plan.baseline(),started);
                if(!plan.shadow().isEmpty()) observed=runtime.evaluate(snapshot,plan.shadow(),started);
                if(plan.enforced().isEmpty()) formal=baseline;
                else {
                    var released=runtime.evaluate(snapshot,plan.enforced(),started);
                    formal=combine(baseline,released);
                    formalIncomplete=!released.failureCodes().isEmpty();
                    formalSet="qmed-release-"+GlobalIds.next();
                }
            } else observed=engine.evaluate(snapshot,versions,started);
        } catch(RuntimeException exception) {
            LOG.warn("Medication safety rule catalog unavailable: {}",exception.getClass().getSimpleName());
            var unavailable=new MedicationSafetyEngine.Result(List.of(),List.of(),List.of("RULE_CATALOG_UNAVAILABLE"));
            // When rule or deployment state cannot be read, never silently bypass potentially active formal rules.
            if(production) {formal=unavailable;formalIncomplete=true;} else observed=unavailable;
        }
        var shadowDecision=observed==null?null:persist(context,snapshot,hash,targetRuleSet,"SHADOW",observed,observed.decision(),started);
        if(formal==null) return shadowDecision;
        var formalDecision=DecisionAggregator.aggregate(formal.findings().stream().map(f->f.rule().decision()).toList(),formalIncomplete);
        return persist(context,snapshot,hash,formalSet,"ENFORCED",formal,formalDecision,started);
    }
    private MedicationSafetyEngine.Result combine(MedicationSafetyEngine.Result a,MedicationSafetyEngine.Result b) {
        return new MedicationSafetyEngine.Result(java.util.stream.Stream.concat(a.findings().stream(),b.findings().stream()).toList(),
                java.util.stream.Stream.concat(a.executions().stream(),b.executions().stream()).toList(),
                java.util.stream.Stream.concat(a.failureCodes().stream(),b.failureCodes().stream()).distinct().toList());
    }
    private MedicationSafetyDecision persist(ExecutionContext context,com.rhn.outpatient.api.PrescriptionSafetySnapshot snapshot,
            String hash,String ruleSet,String mode,MedicationSafetyEngine.Result result,MedicationSafetyDecision.Status status,Instant started) {
        Long id=GlobalIds.next();
        var decision=new MedicationSafetyDecision(id,snapshot.prescriptionId(),snapshot.prescriptionRevision(),hash,
                ruleSet,MedicationSafetyEngine.VERSION,mode,status,result.findings().stream().map(f->f.snapshot()).toList(),result.executions(),result.failureCodes());
        try {
            store.append(new MedicationSafetyEvaluation(id,context.subjectId(),snapshot,hash,started,Instant.now(),decision,result.findings()));
            return decision;
        } catch(RuntimeException exception) {
            LOG.warn("Medication safety evaluation could not be recorded: {}",exception.getClass().getSimpleName());
            return new MedicationSafetyDecision(null,snapshot.prescriptionId(),snapshot.prescriptionRevision(),hash,ruleSet,MedicationSafetyEngine.VERSION,mode,
                    MedicationSafetyDecision.Status.UNAVAILABLE,List.of(),result.executions(),
                    java.util.stream.Stream.concat(result.failureCodes().stream(),java.util.stream.Stream.of("EVALUATION_NOT_PERSISTED")).distinct().toList());
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
