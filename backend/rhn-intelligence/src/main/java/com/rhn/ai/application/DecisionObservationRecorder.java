package com.rhn.ai.application;

import com.rhn.ai.api.DecisionObservationContracts.DecisionRun;
import com.rhn.ai.infrastructure.DecisionObservationStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.List;

@Service
public class DecisionObservationRecorder {
    private static final Logger log=LoggerFactory.getLogger(DecisionObservationRecorder.class);
    private final DecisionObservationStore store;
    private final JsonCodec json;
    public DecisionObservationRecorder(DecisionObservationStore store,JsonCodec json){this.store=store;this.json=json;}
    public Long record(ExecutionContext c,DecisionScene scene,String mode,String outcome,String version,String hash,
                       long started,boolean called,Double threshold,String configuredModel,DecisionModelGateway.Request input,DecisionModelGateway.Result result,
                       List<String> selected,List<String> baseline,String comparison,String exceptionType) {
        try {
        var equal="COMPARABLE".equals(comparison)?selected.stream().sorted().toList().equals(baseline.stream().distinct().sorted().toList()):null;
        boolean judged=result!=null && List.of("SHADOW","ASSIST","UNCERTAIN","APPLIED","UNCONFIRMED_MATCH").contains(outcome);
        boolean uncertain=judged && ("UNCERTAIN".equals(outcome) || result.answers().values().stream().anyMatch(a->"NONE".equals(a.choice()) || "UNKNOWN".equals(a.choice()) || threshold!=null&&a.confidence()<threshold));
        var run=new DecisionRun(GlobalIds.next(),scene.name(),mode,outcome,Instant.now(),c.correlationId(),result==null?null:result.traceId(),
                result==null?configuredModel:result.model(),version,hash,(int)Math.min(Integer.MAX_VALUE,(System.nanoTime()-started)/1_000_000),
                threshold,called,judged,uncertain,comparison,equal,input==null?null:json.readTree(json.write(input)),result==null?null:json.readTree(json.write(result.answers())),
                selected,baseline,exceptionType);
        store.append(c,run);
        return run.id();
        }
        catch(RuntimeException e){log.warn("decision_observation_not_persisted correlationId={} scene={} run={} exceptionType={}",c.correlationId(),scene,null,e.getClass().getSimpleName());return null;}
    }
}
