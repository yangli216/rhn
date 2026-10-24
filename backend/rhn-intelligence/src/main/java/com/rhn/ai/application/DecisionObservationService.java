package com.rhn.ai.application;

import com.rhn.ai.api.DecisionObservationContracts.*;
import com.rhn.ai.infrastructure.DecisionObservationStore;
import com.rhn.ai.infrastructure.DecisionObservationStore.Filter;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class DecisionObservationService {
    public static final String AUDIT_VERSION="DECISION-OBSERVATION-V1";
    private final DecisionObservationStore store;
    private final ExecutionContextProvider contexts;
    private final ClinicalAiRuntimePolicy policy;
    private final com.rhn.ai.infrastructure.RecordQualityStore recordQuality;
    public DecisionObservationService(DecisionObservationStore store,ExecutionContextProvider contexts,ClinicalAiRuntimePolicy policy,
            com.rhn.ai.infrastructure.RecordQualityStore recordQuality){this.store=store;this.contexts=contexts;this.policy=policy;this.recordQuality=recordQuality;}
    private ExecutionContext context() {
        var c=contexts.requireCurrent();
        if(!c.hasAuthority(com.rhn.platform.configuration.api.ClinicalAiConfigurationPermissions.MANAGE))throw forbidden("DECISION_OBSERVATION_ACCESS","无权查看决策运行观察");
        if(c.organizationId()==null||c.departmentId()==null)throw badRequest("DECISION_OBSERVATION_CONTEXT","请先选择机构和科室，观察记录按当前工作范围隔离");
        return c;
    }
    public DecisionObservation list(String scene,String mode,String outcome,Instant from,Instant to,int page,int size) {
        var c=context();
        if(page<0||page>100000||size<1||size>100)throw badRequest("DECISION_OBSERVATION_PAGE","分页参数无效");
        scene=clean(scene);mode=clean(mode);outcome=clean(outcome);
        if(scene!=null)try{DecisionScene.valueOf(scene);}catch(IllegalArgumentException e){throw badRequest("DECISION_OBSERVATION_SCENE","未知决策场景");}
        if(mode!=null&&!Set.of("DISABLED","SHADOW","ASSIST").contains(mode))throw badRequest("DECISION_OBSERVATION_MODE","未知决策模式");
        if(outcome!=null&&!Set.of("MODE_DISABLED","SCENE_DISABLED","CONFIGURATION_INCOMPLETE","CANDIDATE_SCOPE_INVALID","NO_INPUT","CANDIDATE_LIMIT","SHADOW","APPLIED","ASSIST","UNCERTAIN","UNCONFIRMED_MATCH","DECISION_FAILED","FAILED","UNEXPECTED_ERROR","DISABLED").contains(outcome))throw badRequest("DECISION_OBSERVATION_OUTCOME","未知运行结果");
        if(from==null)from=Instant.now().minus(7,ChronoUnit.DAYS);
        if(to==null)to=Instant.now().plus(1,ChronoUnit.SECONDS);
        if(!from.isBefore(to)||java.time.Duration.between(from,to).compareTo(java.time.Duration.ofDays(90))>0)throw badRequest("DECISION_OBSERVATION_RANGE","请选择不超过90天的有效时间范围");
        var filter=new Filter(scene,mode,outcome,from,to);var stats=store.statistics(c,filter);
        var rows=store.page(c,filter,page,size).stream().map(r->new DecisionRow(r.id(),r.scene(),r.mode(),r.outcome(),r.time(),r.traceId(),r.model(),r.latencyMs(),r.comparison(),r.equal(),listReview(c,r),r.uncertain(),r.modelCalled())).toList();
        var settings=DecisionModelSettings.current(policy,c.tenantId());
        var scenes=Arrays.stream(DecisionScene.values()).map(s->{
            var last=store.latest(c,s.name()).orElse(null);
            String state=settings.mode()==DecisionModelSettings.Mode.DISABLED?"MODE_DISABLED"
                    :!policy.booleanValue(c.tenantId(),s.settingKey(),s.defaultEnabled())?"SCENE_DISABLED"
                    :!settings.ready()?"CONFIGURATION_INCOMPLETE":last==null?"NOT_TRIGGERED":"RECORDED";
            return new DecisionSceneState(s.name(),s.label(),settings.mode().name(),state,last);
        }).toList();
        return new DecisionObservation(new PageResult<>(rows,stats.total(),(stats.total()+size-1)/size,page,size),stats,scenes,c.organizationId(),c.departmentId(),AUDIT_VERSION,recordQuality.statistics(c,filter));
    }
    public DecisionDetail detail(Long id) {var c=context();return new DecisionDetail(run(c,id),store.reviews(c,id),recordQuality.feedback(c,id));}
    public DecisionReview review(Long id,DecisionReviewRequest input) {
        var c=context();run(c,id);
        if(!Set.of("APPROPRIATE","INAPPROPRIATE","UNCERTAIN").contains(input.verdict())||input.reason()==null||input.reason().isBlank()||input.reason().length()>2000)throw badRequest("DECISION_REVIEW_INPUT","请选择研判结果并填写原因");
        var review=new DecisionReview(GlobalIds.next(),id,input.verdict(),input.reason().trim(),c.actor(),Instant.now());
        store.appendReview(c,review);return review;
    }
    private DecisionRun run(ExecutionContext c,Long id){
        var run=store.find(c,id).orElseThrow(()->notFound("DECISION_OBSERVATION_NOT_FOUND","当前机构科室未找到该运行记录"));
        if("OUTPATIENT_TRIAGE".equals(run.scene()) && Collections.disjoint(c.authorities(),Set.of("OUTPATIENT_TRIAGE.ACCESS","OUTPATIENT_RECEPTION.ACCESS","OUTPATIENT_REGISTRATION.ACCESS","ROLE_ADMIN")))
            throw forbidden("DECISION_OBSERVATION_CLINICAL_ACCESS","读取或研判分诊输入还需要当前工作范围的临床访问权限");
        if("RECORD_QUALITY".equals(run.scene()) && !canReadRecord(c))
            throw forbidden("DECISION_OBSERVATION_RECORD_ACCESS","读取或研判病历输入还需要当前工作范围的门诊接诊权限");
        return run;
    }
    private DecisionReview listReview(ExecutionContext c,DecisionRun run) {
        var review=store.latestReview(c,run.id()).orElse(null);
        if(review!=null&&"RECORD_QUALITY".equals(run.scene())&&!canReadRecord(c))
            return new DecisionReview(review.id(),review.runId(),review.verdict(),"",review.actor(),review.time());
        return review;
    }
    private boolean canReadRecord(ExecutionContext c) {
        return !Collections.disjoint(c.authorities(),Set.of("OUTPATIENT_RECEPTION.ACCESS","ROLE_ADMIN"));
    }
    private static String clean(String v){return v==null||v.isBlank()?null:v.trim();}
}
