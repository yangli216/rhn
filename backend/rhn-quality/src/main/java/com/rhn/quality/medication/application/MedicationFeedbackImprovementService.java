package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.api.MedicationKnowledgeFeedbackContracts.Detail;
import com.rhn.quality.medication.infrastructure.MedicationRuleIntakeStore;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** User-authored improvement intent; feedback is a lead, never clinical evidence. */
@Service
public class MedicationFeedbackImprovementService {
    private final MedicationKnowledgeFeedbackService feedback;
    private final MedicationRuleIntakeService intakes;
    private final MedicationRuleIntakeStore store;
    private final ExecutionContextProvider contexts;
    private final TransactionTemplate tx;
    public MedicationFeedbackImprovementService(MedicationKnowledgeFeedbackService feedback,MedicationRuleIntakeService intakes,MedicationRuleIntakeStore store,ExecutionContextProvider contexts,org.springframework.transaction.PlatformTransactionManager manager) {
        this.feedback=feedback;this.intakes=intakes;this.store=store;this.contexts=contexts;this.tx=new TransactionTemplate(manager);
    }
    public com.rhn.shared.api.PageResult<Summary> history(Long candidate,Long deployment,Long run,int page) {
        if(page<0)throw badRequest("QMED_IMPROVEMENT_PAGE","分页参数无效");
        feedback.detail(candidate,deployment,run,0);var c=contexts.requireCurrent();
        return store.feedbackPage(c.tenantId(),c.organizationId(),c.departmentId(),run,page);
    }
    public Run analyze(Long candidate,Long deployment,Long run,ImprovementRequest command) {
        if(command==null||command.intake()==null||!command.confirmed()||command.feedbackId()==null||command.expectedBasisHash()==null)
            throw badRequest("QMED_IMPROVEMENT_CONFIRM","请核对原研判与待发送的改进需求，并明确确认");
        var origin=check(feedback.detail(candidate,deployment,run,0),command);
        if(command.intake().parentId()!=null&&!Objects.equals(intakes.feedbackOrigin(command.intake().parentId()),origin))
            throw conflict("QMED_IMPROVEMENT_PARENT","澄清记录不属于本次研判版本，请从当前意见重新建立改进需求");
        var generated=intakes.prepare(command.intake());
        return tx.execute(status->{
            var current=check(feedback.lockedDetail(candidate,deployment,run),command);
            if(!Objects.equals(current,origin))throw conflict("QMED_IMPROVEMENT_STALE","模型分析期间研判或固定材料已变化，请刷新并重新核对");
            store.appendImprovement(contexts.requireCurrent().tenantId(),generated,origin);
            return generated;
        });
    }
    private FeedbackOrigin check(Detail detail,ImprovementRequest command) {
        var latest=detail.latest();
        if(latest==null||!Objects.equals(latest.id(),command.feedbackId())||!Objects.equals(detail.basis().fingerprint(),command.expectedBasisHash()))
            throw conflict("QMED_IMPROVEMENT_STALE","研判或固定材料已变化，请刷新并重新核对");
        if(!"RECORD".equals(latest.operation())||!List.of("FALSE_POSITIVE","POSSIBLE_MISS","DATA_ISSUE","RULE_ISSUE","UNCERTAIN").contains(latest.verdict()))
            throw badRequest("QMED_IMPROVEMENT_VERDICT","请先记录需要核查或改进的有效意见，已撤回或一致意见不能直接转为问题需求");
        if(!detail.gaps().isEmpty()||detail.frozenCandidate()==null||!Objects.equals(latest.basis(),detail.basis()))
            throw conflict("QMED_IMPROVEMENT_MATERIAL","原观察材料缺失、损坏或与研判不一致，请先核查运行审计");
        var c=detail.frozenCandidate();
        return new FeedbackOrigin(latest,c.knowledgeId(),c.version(),c.knowledge().body().title());
    }
}
