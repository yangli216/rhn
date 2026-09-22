package com.rhn.quality.medication.application;

import com.rhn.outpatient.api.PrescriptionSafetySnapshot;
import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.Result;
import com.rhn.quality.medication.api.MedicationKnowledgeReplayContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeReplayStore;
import com.rhn.shared.context.*;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class MedicationKnowledgeReplayService {
    private final MedicationKnowledgeDraftService drafts;private final MedicationKnowledgeReplayStore store;
    private final ExecutionContextProvider contexts;private final JsonCodec json;
    public MedicationKnowledgeReplayService(MedicationKnowledgeDraftService drafts,MedicationKnowledgeReplayStore store,ExecutionContextProvider contexts,JsonCodec json) {this.drafts=drafts;this.store=store;this.contexts=contexts;this.json=json;}
    private ExecutionContext context() {
        var c=contexts.requireCurrent();if(!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_KNOW_REPLAY_FORBIDDEN","需要药品主数据管理权限");
        if(!c.hasWorkContext()) throw badRequest("QMED_KNOW_REPLAY_SCOPE","请选择工作机构和科室；仅可回放当前工作范围的原评价快照");return c;
    }
    private void page(int page) {if(page<0) throw badRequest("QMED_KNOW_REPLAY_PAGE","分页参数无效");}
    public PageResult<Source> sources(int page) {var c=context();page(page);return store.sources(c.tenantId(),c.organizationId(),c.departmentId(),page);}
    public PageResult<Summary> history(Long knowledge,int page) {var c=context();page(page);drafts.detail(knowledge);return store.history(c.tenantId(),c.organizationId(),c.departmentId(),knowledge,page);}
    public Run detail(Long knowledge,Long id) {var c=context();return store.find(c.tenantId(),c.organizationId(),c.departmentId(),knowledge,id).orElseThrow(()->notFound("QMED_KNOW_REPLAY_NOT_FOUND","未找到当前工作范围的回放记录"));}
    @Transactional public Run replay(Long knowledge,Request request) {
        var c=context();
        if(request==null || request.evaluationId()==null || request.evaluationId()<=0 || request.expectedVersion()<1) throw badRequest("QMED_KNOW_REPLAY_INPUT","请选择原评价记录与已保存知识版本");
        var detail=drafts.detail(knowledge);var saved=detail.saved();
        if(saved.version()!=request.expectedVersion()) throw conflict("QMED_KNOW_REPLAY_STALE","知识版本已变化，请刷新后重新选择回放");
        var stored=store.source(c.tenantId(),c.organizationId(),c.departmentId(),request.evaluationId()).orElseThrow(()->notFound("QMED_KNOW_REPLAY_SOURCE_NOT_FOUND","未找到当前工作范围的原评价记录"));
        if(!Objects.equals(hash(stored.rawInput()),stored.source().inputHash())) throw conflict("QMED_KNOW_REPLAY_SOURCE_INVALID","原评价输入与保存指纹不一致，无法可靠回放");
        PrescriptionSafetySnapshot snapshot;
        try {snapshot=json.read(stored.rawInput(),PrescriptionSafetySnapshot.class);} catch(RuntimeException malformed) {throw conflict("QMED_KNOW_REPLAY_SOURCE_INVALID","原评价输入无法解析，无法可靠回放");}
        var source=stored.source();
        if(snapshot==null || !Objects.equals(c.tenantId(),snapshot.tenantId()) || !Objects.equals(source.organizationId(),snapshot.organizationId()) || !Objects.equals(source.departmentId(),snapshot.departmentId())
                || !Objects.equals(source.prescriptionId(),snapshot.prescriptionId()) || !Objects.equals(source.encounterId(),snapshot.encounterId()) || source.prescriptionRevision()!=snapshot.prescriptionRevision())
            throw conflict("QMED_KNOW_REPLAY_SOURCE_INVALID","原评价输入身份与审计记录不一致，无法可靠回放");
        var input=MedicationKnowledgeReplayAdapter.adapt(saved,snapshot,json);
        var result=input.gaps().isEmpty()?MedicationKnowledgeDraftPreview.evaluate(saved.body(),saved.assessment(),input.facts()):new Result("UNAVAILABLE",input.gaps(),List.of());
        var run=new Run(GlobalIds.next(),MedicationKnowledgeReplayAdapter.VERSION,saved,hash(json.write(saved)),source,input,hash(json.write(input)),result,detail.currentAssessment().issues(),c.subjectId(),c.actor(),Instant.now());
        store.append(c.tenantId(),run);return run;
    }
    public static String hash(String value) {try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
}
