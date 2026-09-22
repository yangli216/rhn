package com.rhn.quality.medication.application;

import com.rhn.pharmacy.api.PharmacyReviewDirectory;
import com.rhn.quality.medication.api.MedicationRuleIntakeContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeRuleStore;
import com.rhn.quality.medication.infrastructure.MedicationRuleIntakeStore;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;

/** A pharmacist's saved opinion starts a knowledge improvement, never an automatic clinical change. */
@Service
public class PharmacyFeedbackImprovementService {
    private final PharmacyReviewDirectory pharmacy;
    private final MedicationRuleIntakeService intakes;
    private final MedicationRuleIntakeStore store;
    private final MedicationKnowledgeRuleStore candidates;
    private final ExecutionContextProvider contexts;
    private final TransactionTemplate tx;

    public PharmacyFeedbackImprovementService(PharmacyReviewDirectory pharmacy, MedicationRuleIntakeService intakes,
            MedicationRuleIntakeStore store, MedicationKnowledgeRuleStore candidates, ExecutionContextProvider contexts,
            org.springframework.transaction.PlatformTransactionManager manager) {
        this.pharmacy=pharmacy;this.intakes=intakes;this.store=store;this.candidates=candidates;this.contexts=contexts;
        this.tx=new TransactionTemplate(manager);
    }
    public FeedbackOrigin source(Long task, Long review, Long finding) {
        var c=contexts.requireCurrent();
        if(!c.hasAuthority("MASTER_DATA.MANAGE")||c.subjectId()==null)
            throw forbidden("QMED_PHARMACY_IMPROVEMENT_FORBIDDEN","需要药品知识管理权限，请由有权限的药师处理知识改进");
        if(!c.hasWorkContext()||!c.canAccessOrganization(c.organizationId())||!c.canAccessDepartment(c.departmentId()))
            throw forbidden("QMED_PHARMACY_IMPROVEMENT_SCOPE","请在可访问的机构与科室处理药师反馈");
        var source=pharmacy.improvementSource(task,review);
        var selected=finding==null?null:source.findings().stream().filter(f->Objects.equals(f.findingId(),finding)).findFirst()
                .orElseThrow(()->badRequest("QMED_PHARMACY_FINDING","所选提示不属于本次药品审方，请重新选择"));
        Long knowledge=null;int version=0;String title="药师审方提出的用药规则改进";
        if(selected!=null&&selected.ruleCode().startsWith("QMED.KNOWLEDGE.")) {
            try {knowledge=Long.valueOf(selected.ruleCode().substring("QMED.KNOWLEDGE.".length()));}
            catch(NumberFormatException invalid) {throw conflict("QMED_PHARMACY_KNOWLEDGE","原提示的知识关联无效，请核对来源");}
            var candidate=candidates.versions(c.tenantId(),knowledge).stream().filter(v->v.version()==selected.ruleVersion()).findFirst()
                    .orElseThrow(()->conflict("QMED_PHARMACY_KNOWLEDGE","原提示关联的知识候选缺失，请先核对来源"));
            version=candidate.knowledge().version();title=candidate.knowledge().body().title();
        }
        return new FeedbackOrigin(null,knowledge,version,title,new PharmacyOrigin(c.organizationId(),c.departmentId(),task,source.review(),selected));
    }
    public PageResult<Summary> history(Long task,Long review,int page) {
        if(page<0)throw badRequest("QMED_IMPROVEMENT_PAGE","分页参数无效");
        source(task,review,null);var c=contexts.requireCurrent();
        return store.pharmacyPage(c.tenantId(),c.organizationId(),c.departmentId(),review,page);
    }
    public Run analyze(Long task,Long review,PharmacyImprovementRequest command) {
        if(command==null||command.intake()==null||!command.confirmed())
            throw badRequest("QMED_IMPROVEMENT_CONFIRM","请核对审方意见与待发送的需求，确认后再分析");
        var origin=source(task,review,command.findingId());
        if(command.intake().parentId()!=null&&!Objects.equals(intakes.feedbackOrigin(command.intake().parentId()),origin))
            throw conflict("QMED_IMPROVEMENT_PARENT","澄清记录不属于所选审方意见和规则提示");
        var run=intakes.prepare(command.intake());
        return tx.execute(status->{
            if(!Objects.equals(source(task,review,command.findingId()),origin))
                throw conflict("QMED_IMPROVEMENT_STALE","原审方材料发生变化，请重新核对");
            store.appendImprovement(contexts.requireCurrent().tenantId(),run,origin);return run;
        });
    }
}
