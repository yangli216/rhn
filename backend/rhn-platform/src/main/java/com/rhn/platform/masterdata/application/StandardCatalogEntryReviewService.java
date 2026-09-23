package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.StandardCatalogEntryReview.*;
import com.rhn.platform.masterdata.infrastructure.StandardCatalogEntryReviewStore;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.*;

/** Transcription checks only; never changes catalog provenance approval or clinical readiness. */
@Service
public class StandardCatalogEntryReviewService {
    private final StandardCatalogEditionService editions;
    private final StandardCatalogEntryReviewStore store;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public StandardCatalogEntryReviewService(StandardCatalogEditionService editions, StandardCatalogEntryReviewStore store, ExecutionContextProvider contexts, JsonCodec json) {
        this.editions=editions; this.store=store; this.contexts=contexts; this.json=json;
    }
    private void authorize() {
        var c=contexts.requireCurrent();
        if(c.subjectId()==null || !c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("STANDARD_ENTRY_REVIEW_FORBIDDEN", "需要基础数据管理权限");
    }
    public EntryReviewView view(Long editionId) {
        authorize(); var identity=editions.detail(editionId,0).edition().identity();
        return new EntryReviewView(identity,store.latest(contexts.requireCurrent().tenantId(), ClinicalSemanticVersions.hash(identity,json)));
    }
    @Transactional
    public EntryReviewEvent change(Long editionId,String entryId,EntryReviewChange input) {
        authorize(); var view=view(editionId); var c=contexts.requireCurrent();
        if(input==null || !view.identity().equals(input.identity())) throw conflict("STANDARD_ENTRY_REVIEW_EDITION", "目录版本已变化，请刷新后重新核对");
        if(input.expectedRevision()==null || input.expectedRevision()<0 || !List.of("CHECKED","ISSUE").contains(input.status()==null ? "" : input.status()))
            throw badRequest("STANDARD_ENTRY_REVIEW_INPUT", "请提供有效的核对结果及版本");
        String note=input.note()==null ? "" : input.note().strip();
        if(note.length()>1000 || ("ISSUE".equals(input.status()) && note.isEmpty())) throw badRequest("STANDARD_ENTRY_REVIEW_NOTE", "发现问题时请填写说明，最多 1000 字");
        var catalog=editions.content(editionId); boolean exists=false;
        for(var entry:catalog.path("entries")) if(entryId.equals(entry.path("id").asString())) {exists=true;break;}
        if(!exists) throw badRequest("STANDARD_ENTRY_REVIEW_ENTRY", "此版目录中不存在该条目");
        var previous=view.entries().stream().filter(e -> entryId.equals(e.entryId())).findFirst().orElse(null);
        int revision=previous==null ? 0 : previous.revision();
        if(revision!=input.expectedRevision()) throw conflict("STANDARD_ENTRY_REVIEW_CONCURRENT", "核对结果已变化，请刷新后重试");
        var event=new EntryReviewEvent(GlobalIds.next(),view.identity(),entryId,revision+1,input.status(),note,c.subjectId(),c.actor(),Instant.now());
        try {store.append(c.tenantId(),ClinicalSemanticVersions.hash(view.identity(),json),event);}
        catch(DuplicateKeyException e) {throw conflict("STANDARD_ENTRY_REVIEW_CONCURRENT", "核对结果已变化，请刷新后重试");}
        return event;
    }
}
