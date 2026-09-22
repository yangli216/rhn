package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MedicationStandardRevisionContracts.*;
import com.rhn.platform.masterdata.api.MedicationStandardImpactDirectory;
import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.platform.masterdata.domain.Medication;
import com.rhn.platform.masterdata.infrastructure.*;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** Explicit, independently reviewed replacement of existing standard relationships. */
@Service
public class MedicationStandardRevisionService {
    private static final String KIND = "STANDARD_REVISION";
    private static final String IMPACT_VERSION = "standard-revision-impact-v1";
    private final MedicationRepository medications;
    private final MedicationStandardSourceRepository sources;
    private final MedicationStandardBindingService binding;
    private final StandardCatalogReviewService catalogReviews;
    private final MedicationStandardService standards;
    private final MedicationSemanticsService semantics;
    private final ClinicalSemanticHistory history;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    private final MedicationStandardImpactDirectory impacts;
    public MedicationStandardRevisionService(MedicationRepository medications, MedicationStandardSourceRepository sources,
            MedicationStandardBindingService binding, StandardCatalogReviewService catalogReviews, MedicationStandardService standards,
            MedicationSemanticsService semantics, ClinicalSemanticHistory history, ExecutionContextProvider contexts, JsonCodec json, MedicationStandardImpactDirectory impacts) {
        this.medications=medications;this.sources=sources;this.binding=binding;this.catalogReviews=catalogReviews;this.standards=standards;
        this.semantics=semantics;this.history=history;this.contexts=contexts;this.json=json;this.impacts=impacts;
    }
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("STANDARD_REVISION_FORBIDDEN","需要基础数据管理权限");if(c.subjectId()==null)throw forbidden("STANDARD_REVISION_ACTOR","需要明确的操作人员身份");return c.tenantId();}
    @Transactional(readOnly=true) public Preview preview(Long id, int page) {tenant();if(page<0)throw badRequest("STANDARD_REVISION_PAGE","历史页码无效");return view(id,page);}
    private Preview view(Long id,int page) {
        Long tenant=contexts.requireCurrent().tenantId();var base=binding.preview(id);var latest=latest(tenant,id);var links=links(tenant,id);
        boolean pending=latest!=null&&"SUBMITTED".equals(latest.status());
        var eligible=eligible(base,links);
        var currentImpact=pending&&validImpact(latest.proposal().impact())?capture(scopes(latest.proposal())):null;
        var issues=pending?staleIssues(base,links,latest.proposal(),currentImpact):List.<String>of();
        var actions=new ArrayList<String>();
        if(pending) {
            if(Objects.equals(latest.proposal().submittedBy(),contexts.requireCurrent().subjectId())) actions.add("CANCEL");
            else {actions.add("REJECT");if(issues.isEmpty()) actions.add("APPLY");}
        } else if(!links.isEmpty()&&!eligible.isEmpty()) actions.add("SUBMIT");
        return new Preview(base,links,ClinicalSemanticVersions.hash(links,json),eligible,latest,issues,List.copyOf(actions),history.historyPage(tenant,KIND,id.toString(),page,20).stream().map(v->json.read(v.snapshot(),Event.class)).toList(),history.count(tenant,KIND,id.toString()),page,currentImpact);
    }
    private List<String> eligible(MedicationStandardBindingService.Preview base,List<SourceLink> links) {
        if(!"ACTIVE".equals(base.medication().status())||links.isEmpty()) return List.of();
        return base.candidates().stream().filter(c->c.issues().isEmpty()&&(c.boundMedicationId()==null||c.boundMedicationId().equals(base.medication().id())))
                .filter(c->!(links.size()==1&&sameTarget(links.getFirst(),base.identity(),c.specification())))
                .map(c->c.specification().path("id").asString()).toList();
    }
    private boolean sameTarget(SourceLink link,com.rhn.platform.masterdata.api.StandardCatalogReview.Identity identity,tools.jackson.databind.JsonNode spec) {
        return Objects.equals(link.catalogId(),identity.catalogId())&&Objects.equals(link.catalogVersion(),identity.catalogVersion())&&Objects.equals(link.contentHash(),identity.contentHash())&&Objects.equals(link.specificationId(),spec.path("id").asString())&&Objects.equals(link.entryId(),spec.path("entryId").asString());
    }
    private List<String> staleIssues(MedicationStandardBindingService.Preview base,List<SourceLink> links,Proposal proposal, ImpactSnapshot currentImpact) {
        var issues=new ArrayList<String>();
        if(base.medication().revision()!=proposal.medicationRevision())issues.add("药品档案已变化，需撤回或退回后重新提交");
        if(!links.equals(proposal.previousLinks()))issues.add("已有标准关联已变化，需重新提交修订");
        if(!base.identity().equals(proposal.identity()))issues.add("标准目录或来源文件已变化，需重新核对目标");
        if(!eligible(base,links).contains(proposal.specificationId()))issues.add("目标规格不再满足身份校验、占用或药品状态要求");
        if(!validImpact(proposal.impact())) issues.add("提交时没有有效的冻结影响清单，需撤回或退回后重新提交");
        else if(currentImpact==null || !proposal.impact().fingerprint().equals(currentImpact.fingerprint()))
            issues.add("知识、规则、部署或关联对象的影响清单已变化，需撤回或退回后重新核对并提交");
        return List.copyOf(issues);
    }
    @Transactional public Preview submit(Long id,Submit input) {
        Long tenant=tenant();
        if(input==null||input.expectedMedicationRevision()==null||!input.confirmedIdentity()||blank(input.reason(),2000)||blank(input.impactNotes(),4000))
            throw badRequest("STANDARD_REVISION_REQUIRED","请确认药品身份，并填写修订依据和影响核对说明");
        var medication=lock(tenant,id);var current=latest(tenant,id);checkEvent(current,input.expectedEventId());
        if(current!=null&&"SUBMITTED".equals(current.status()))throw conflict("STANDARD_REVISION_PENDING","已有待复核修订，请先复核或撤回");
        var base=binding.preview(id);var links=links(tenant,id);
        if(!Objects.equals(input.expectedSourceFingerprint(),ClinicalSemanticVersions.hash(links,json)))throw conflict("STANDARD_REVISION_STALE","已有标准关联已变化，请刷新后重新核对");
        if(medication.revision()!=input.expectedMedicationRevision()||!catalogReviews.identity().equals(input.identity()))throw conflict("STANDARD_REVISION_STALE","药品档案、标准目录或来源文件已变化，请刷新核对");
        if(!eligible(base,links).contains(input.specificationId()))throw conflict("STANDARD_REVISION_TARGET","仅可修订已有关系；目标须身份一致、未被其他药品占用且与原关联不同");
        var target=base.candidates().stream().filter(c->c.specification().path("id").asString().equals(input.specificationId())).findFirst().orElseThrow();
        var impact=capture(scopes(links,base.identity().catalogId(),target.specification().path("entryId").asString(),input.specificationId()));
        if(!Objects.equals(impact.fingerprint(),input.expectedImpactFingerprint()))
            throw conflict("STANDARD_REVISION_IMPACT_STALE","影响清单未核对或已变化，请刷新影响清单并重新确认");
        var c=contexts.requireCurrent();
        var proposal=new Proposal(id,medication.revision(),json.readTree(json.write(base.medication())),links,base.identity(),input.specificationId(),target.specification(),input.reason().strip(),input.impactNotes().strip(),c.subjectId(),c.actor(),Instant.now(),impact);
        append(tenant,proposal,"SUBMITTED",input.reason().strip());
        return view(id,0);
    }
    @Transactional public Preview review(Long id,Review input) {
        Long tenant=tenant();
        if(input==null||blank(input.reason(),2000)||!List.of("APPLY","REJECT","CANCEL").contains(Objects.toString(input.action(),"")))throw badRequest("STANDARD_REVISION_REVIEW","请提供有效的复核动作和理由");
        var medication=lock(tenant,id);var current=latest(tenant,id);checkEvent(current,input.expectedEventId());
        if(current==null||!"SUBMITTED".equals(current.status()))throw conflict("STANDARD_REVISION_STATE","只有待复核修订可以处理");
        var proposal=current.proposal();var c=contexts.requireCurrent();boolean own=Objects.equals(proposal.submittedBy(),c.subjectId());
        if("CANCEL".equals(input.action())?!own:own)throw forbidden("STANDARD_REVISION_SEPARATION","提交人只能撤回；复核或应用须由另一位有权限的人员完成");
        if("APPLY".equals(input.action())) {
            if(!input.confirmedIdentity()||!input.confirmedImpact())throw badRequest("STANDARD_REVISION_CONFIRMATION","复核人须确认标准身份、影响核对说明及历史快照保留要求");
            var issues=staleIssues(binding.preview(id),links(tenant,id),proposal,validImpact(proposal.impact())?capture(scopes(proposal)):null);
            if(!issues.isEmpty())throw conflict("STANDARD_REVISION_STALE",String.join("；",issues));
            semantics.captureMedication(medication);
            try {
                sources.deleteAll(sources.findByTenantIdAndMedicationId(tenant,id));sources.flush();
                standards.link(tenant,id,proposal.specificationId(),c.subjectId());
            } catch(DataIntegrityViolationException race) {throw conflict("STANDARD_REVISION_CONCURRENT","目标标准已被其他药品占用，请重新核对");}
            if(!standards.reference(tenant,id).linked())throw conflict("STANDARD_REVISION_TARGET","应用后的标准身份未通过校验，修订已回滚");
            semantics.captureMedication(medication);
        }
        append(tenant,proposal,"APPLY".equals(input.action())?"APPLIED":"REJECT".equals(input.action())?"REJECTED":"CANCELLED",input.reason().strip());
        return view(id,0);
    }
    @Transactional(readOnly=true) public ImpactSnapshot impact(Long id,String specificationId) {
        Long tenant=tenant();var base=binding.preview(id);var links=links(tenant,id);
        if(!eligible(base,links).contains(specificationId))throw conflict("STANDARD_REVISION_TARGET","请先选择满足修订条件的目标规格");
        var target=base.candidates().stream().filter(v->v.specification().path("id").asString().equals(specificationId)).findFirst().orElseThrow();
        return capture(scopes(links,base.identity().catalogId(),target.specification().path("entryId").asString(),specificationId));
    }
    private List<Scope> scopes(Proposal proposal) {
        return scopes(proposal.previousLinks(),proposal.identity().catalogId(),proposal.target().path("entryId").asString(),proposal.specificationId());
    }
    private List<Scope> scopes(List<SourceLink> links,String catalog,String entry,String spec) {
        var values=new ArrayList<Scope>();links.forEach(v->values.add(new Scope(v.catalogId(),v.entryId(),v.specificationId())));
        values.add(new Scope(catalog,entry,spec));
        return values.stream().distinct().sorted(Comparator.comparing(Scope::catalogId).thenComparing(Scope::entryId).thenComparing(Scope::specificationId)).toList();
    }
    private ImpactSnapshot capture(List<Scope> scopes) {
        var areas=impacts.capture(scopes);
        if(areas==null||!areas.stream().map(MedicationStandardImpactDirectory.Area::scope).toList().equals(scopes))
            throw conflict("STANDARD_REVISION_IMPACT_INCOMPLETE","影响清单未覆盖全部原关联与目标范围，请稍后重新核对");
        return new ImpactSnapshot(IMPACT_VERSION,Instant.now(),areas,impactHash(IMPACT_VERSION,areas));
    }
    private String impactHash(String version,List<MedicationStandardImpactDirectory.Area> areas) {
        return ClinicalSemanticVersions.hash(List.of(version,areas),json);
    }
    private boolean validImpact(ImpactSnapshot impact) {
        return impact!=null&&IMPACT_VERSION.equals(impact.version())&&impact.areas()!=null
                &&Objects.equals(impact.fingerprint(),impactHash(impact.version(),impact.areas()));
    }
    private Medication lock(Long tenant,Long id) {return medications.lockByIdAndTenantId(id,tenant).orElseThrow(()->notFound("MEDICATION_NOT_FOUND","未找到当前租户的药品"));}
    private void checkEvent(Event current,Long expected) {if(!Objects.equals(current==null?null:current.id(),expected))throw conflict("STANDARD_REVISION_STALE","修订记录已变化，请刷新后重试");}
    private Event latest(Long tenant,Long id) {return history.latest(tenant,KIND,id.toString()).map(v->json.read(v.snapshot(),Event.class)).orElse(null);}
    private List<SourceLink> links(Long tenant,Long id) {
        return sources.findByTenantIdAndMedicationId(tenant,id).stream().map(s->new SourceLink(s.id(),s.catalogCode(),s.catalogVersion(),s.entryCode(),s.specificationCode(),s.sourceHash(),s.createdBy(),s.createdAt())).sorted(Comparator.comparing(SourceLink::id)).toList();
    }
    private void append(Long tenant,Proposal proposal,String status,String reason) {
        var c=contexts.requireCurrent();var event=new Event(GlobalIds.next(),status,proposal,c.subjectId(),c.actor(),reason,Instant.now(),links(tenant,proposal.medicationId()));
        history.append(tenant,c.subjectId(),KIND,proposal.medicationId().toString(),ClinicalSemanticVersions.hash(event,json),status,"MANUAL_STANDARD_REVISION",json.write(event));
    }
    private boolean blank(String text,int max) {return text==null||text.isBlank()||text.length()>max;}
    public record Preview(MedicationStandardBindingService.Preview binding,List<SourceLink> currentLinks,String sourceFingerprint,List<String> eligibleSpecificationIds,
            Event latest,List<String> staleIssues,List<String> allowedActions,List<Event> history,long totalEvents,int historyPage,ImpactSnapshot currentImpact) {}
}
