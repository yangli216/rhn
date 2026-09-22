package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.TestCase;
import com.rhn.quality.medication.api.MedicationKnowledgeRuleContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeRuleStore;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;
import static com.rhn.quality.medication.application.MedicationKnowledgeReplayService.hash;

@Service
public class MedicationKnowledgeRuleService {
    private final MedicationKnowledgeDraftService drafts;private final MedicationKnowledgeRuleStore store;
    private final ExecutionContextProvider contexts;private final JsonCodec json;
    public MedicationKnowledgeRuleService(MedicationKnowledgeDraftService drafts,MedicationKnowledgeRuleStore store,ExecutionContextProvider contexts,JsonCodec json) {this.drafts=drafts;this.store=store;this.contexts=contexts;this.json=json;}
    private Long tenant() {var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_KNOW_RULE_FORBIDDEN","需要药品主数据管理权限");return c.tenantId();}
    public Preview preview(Long knowledge,int expectedVersion) {
        tenant();var detail=drafts.detail(knowledge);var saved=detail.saved();
        if(saved.version()!=expectedVersion) throw conflict("QMED_KNOW_RULE_STALE","知识版本已变化，请刷新并核对后生成规则候选");
        String identity=hash(json.write(saved));
        if(!detail.currentAssessment().structureComplete()) return new Preview(false,saved,identity,null,null,detail.currentAssessment().issues(),List.of());
        var program=MedicationKnowledgeRuleCompiler.compile(saved.body(),saved.assessment());
        var cases=MedicationKnowledgeDraftPreview.cases(saved.body(),saved.assessment());
        return new Preview(!cases.isEmpty()&&cases.stream().allMatch(TestCase::passed),saved,identity,program,hash(json.write(program)),List.of(),cases);
    }
    @Transactional public KnowledgeRuleCandidate create(Long knowledge,Create input) {
        Long tenant=tenant();
        if(input==null || input.reason()==null || input.reason().isBlank() || input.reason().length()>2000 || input.expectedProgramHash()==null || !input.expectedProgramHash().matches("[a-f0-9]{64}"))
            throw badRequest("QMED_KNOW_RULE_INPUT","请先预览规则表达，并填写生成原因（最多 2000 字）");
        // Authorize the knowledge before taking a tenant-scoped lock used by all creators of this rule lineage.
        drafts.detail(knowledge);store.lockKnowledge(tenant,knowledge);
        var preview=preview(knowledge,input.expectedKnowledgeVersion());
        if(!preview.ready()) throw conflict("QMED_KNOW_RULE_GAPS","知识存在当前标准或结构缺口，请先处理后再生成候选");
        if(!preview.programHash().equals(input.expectedProgramHash())) throw conflict("QMED_KNOW_RULE_STALE","预览的规则表达已变化，请重新核对");
        var versions=store.versions(tenant,knowledge);
        var existing=versions.stream().filter(v->v.knowledge().version()==preview.knowledge().version()&&v.program().schemaVersion().equals(preview.program().schemaVersion())).findFirst();
        if(existing.isPresent()) {
            var saved=existing.get();
            if(!saved.programHash().equals(preview.programHash()) || !saved.knowledgeHash().equals(preview.knowledgeHash())) throw conflict("QMED_KNOW_RULE_COMPILER_DRIFT","相同来源和编译版本产生了不同表达，请先核查编译器版本");
            return saved;
        }
        var c=contexts.requireCurrent();int version=versions.stream().mapToInt(KnowledgeRuleCandidate::version).max().orElse(0)+1;
        var candidate=new KnowledgeRuleCandidate(GlobalIds.next(),knowledge,version,preview.knowledge(),preview.knowledgeHash(),preview.program(),preview.programHash(),preview.cases(),c.subjectId(),c.actor(),Instant.now(),input.reason().strip());
        store.append(tenant,candidate);return candidate;
    }
}
