package com.rhn.quality.medication.application;

import com.rhn.quality.medication.api.MedicationKnowledgeDraftContracts.*;
import com.rhn.quality.medication.infrastructure.MedicationKnowledgeDraftStore;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;
import static com.rhn.quality.medication.application.MedicationKnowledgeDraftValidator.*;

@Service
public class MedicationKnowledgeDraftService {
    private final ExecutionContextProvider contexts;
    private final MedicationKnowledgeDraftStore store;
    private final MedicationKnowledgeDraftValidator validator;
    private final JsonCodec json;
    private final MedicationKnowledgeExtractionService extractions;
    private final MedicationRuleIntakeService intakes;
    public MedicationKnowledgeDraftService(ExecutionContextProvider contexts, MedicationKnowledgeDraftStore store, MedicationKnowledgeDraftValidator validator, JsonCodec json, MedicationKnowledgeExtractionService extractions,MedicationRuleIntakeService intakes) {
        this.contexts = contexts; this.store = store; this.validator = validator; this.json = json; this.extractions = extractions;this.intakes=intakes;
    }
    private Long tenant() {
        var c = contexts.requireCurrent();
        if (!c.hasAuthority("MASTER_DATA.MANAGE")) throw forbidden("QMED_KNOWLEDGE_FORBIDDEN", "需要药品主数据管理权限");
        return c.tenantId();
    }
    public PageResult<Summary> list(String query, int page, int size) {
        Long tenant = tenant(); page(page, size);
        String q = Objects.toString(query, "").strip().toLowerCase(Locale.ROOT);
        var all = store.latest(tenant).stream().filter(v -> v.body().title().toLowerCase(Locale.ROOT).contains(q)).toList();
        var content = all.stream().skip((long) page * size).limit(size).map(v -> new Summary(v.id(), v.version(), v.body().title(), v.body().kind(),
                current(tenant, v).structureComplete(), v.savedAt())).toList();
        return new PageResult<>(content, all.size(), (all.size() + size - 1) / size, page, size);
    }
    public com.rhn.quality.medication.api.MedicationRuleIntakeContracts.Run intakeOrigin(Long id,int version) {var t=tenant();var origin=store.intakeId(t,id,version);return origin==null?null:intakes.get(origin);}
    public Detail detail(Long id) {Long tenant = tenant(); return detail(tenant, require(tenant, id));}
    public List<Version> history(Long id, int page) {Long tenant = tenant(); page(page, 20); require(tenant, id); return store.history(tenant, id, page);}
    public Assessment validate(Body body) {Long tenant = tenant(); bounded(body); return validator.assess(tenant, body);}
    public List<TestCase> preview(Body body) {Long tenant = tenant(); bounded(body); return MedicationKnowledgeDraftPreview.cases(body, validator.assess(tenant, body));}
    @Transactional public Detail save(Long id, Save input) {
        Long tenant = tenant();
        if (input == null || input.body() == null || blank(input.body().title()) || input.body().title().length() > 200 || blank(input.changeReason()) || input.changeReason().length() > 2000)
            throw badRequest("QMED_KNOWLEDGE_INPUT", "请填写知识标题（最多 200 字）和保存原因（最多 2000 字）");
        if (!List.of("DUPLICATE_THERAPY", "DRUG_INTERACTION").contains(Objects.toString(input.body().kind(), "")))
            throw badRequest("QMED_KNOWLEDGE_KIND", "请先选择重复用药或相互作用知识类型");
        bounded(input.body());
        extractions.checkOrigin(tenant, input.extractionId(), input.body().evidence());
        intakes.checkOrigin(tenant,input.intakeId(),input.body().kind());
        if(id!=null) {require(tenant,id);store.lockRoot(tenant,id);}
        int expected = id == null ? 0 : require(tenant, id).version();
        if (input.expectedVersion() == null || input.expectedVersion() != expected) throw conflict("QMED_KNOWLEDGE_STALE", "草稿版本已变化，请刷新并核对后保存");
        var c = contexts.requireCurrent();
        var saved = new Version(id == null ? GlobalIds.next() : id, expected + 1, "DRAFT", input.body(), validator.assess(tenant, input.body()),
                c.subjectId(), c.actor(), Instant.now(), input.changeReason().strip(), input.extractionId());
        try {store.append(tenant, saved,input.intakeId());} catch (DuplicateKeyException race) {throw conflict("QMED_KNOWLEDGE_STALE", "草稿版本已变化，请刷新并核对后保存");}
        return detail(tenant, saved);
    }
    private Detail detail(Long tenant, Version saved) {
        var assessment = current(tenant, saved);
        // Conservative overlap hints. They do not assert clinical contradiction or replace review.
        var conflicts = store.latest(tenant).stream().filter(v -> !v.id().equals(saved.id()) && Objects.equals(v.body().kind(), saved.body().kind()))
                .filter(v -> possibleOverlap(saved.body(), assessment, v.body(), validator.assess(tenant, v.body())))
                .map(v -> new Conflict(v.id(), v.version(), v.body().title(), "药品范围可能重叠；请人工对照来源、适用条件和建议动作，尚未判定为冲突")).toList();
        return new Detail(saved, assessment, conflicts, MedicationKnowledgeDraftPreview.cases(saved.body(), assessment),store.intakeId(tenant,saved.id(),saved.version()));
    }
    private Assessment current(Long tenant, Version version) {
        var current = validator.assess(tenant, version.body());
        var issues = new ArrayList<>(current.issues());
        if (!version.assessment().groupA().equals(current.groupA()) || !version.assessment().groupB().equals(current.groupB()))
            issues.add(new Issue("standardReferences", "STALE_STANDARD_REFERENCE", "引用的标准身份或来源文件已变化；请核对当前定义，历史引用保持不变"));
        if (!version.assessment().groupARoutes().equals(current.groupARoutes()) || !version.assessment().groupBRoutes().equals(current.groupBRoutes()))
            issues.add(new Issue("conditions.routes", "STALE_ROUTE", "给药途径定义或版本已变化；请核对后保存新的知识版本，历史快照保持不变"));
        return new Assessment(issues.isEmpty(), List.copyOf(issues), current.ruleDescription(), current.groupA(), current.groupB(), current.groupARoutes(), current.groupBRoutes());
    }
    private boolean possibleOverlap(Body x, Assessment a, Body y, Assessment b) {
        if ("SAME_STANDARD_ENTRY".equals(x.matchMode()) || "SAME_STANDARD_ENTRY".equals(y.matchMode())) return true;
        boolean aa = overlapGroups(a.groupA(), b.groupA());
        if (!"DRUG_INTERACTION".equals(x.kind())) return aa;
        return aa && overlapGroups(a.groupB(), b.groupB()) || overlapGroups(a.groupA(), b.groupB()) && overlapGroups(a.groupB(), b.groupA());
    }
    private boolean overlapGroups(List<ResolvedTarget> a, List<ResolvedTarget> b) {return a.stream().anyMatch(x -> b.stream().anyMatch(y -> overlap(x, y)));}
    private Version require(Long tenant, Long id) {return store.latest(tenant, id).orElseThrow(() -> notFound("QMED_KNOWLEDGE_NOT_FOUND", "未找到当前租户的知识草稿"));}
    private void bounded(Body body) {
        if (body == null || json.write(body).length() > 40000 || MedicationKnowledgeDraftValidator.list(body.groupA()).size() > 50 || MedicationKnowledgeDraftValidator.list(body.groupB()).size() > 50
                || body.conditions() != null && ((body.conditions().groupARoutes() != null && MedicationKnowledgeDraftValidator.list(body.conditions().groupARoutes().codes()).size() > 50)
                || (body.conditions().groupBRoutes() != null && MedicationKnowledgeDraftValidator.list(body.conditions().groupBRoutes().codes()).size() > 50)))
            throw badRequest("QMED_KNOWLEDGE_SIZE", "请填写草稿，每组最多 50 项，草稿总长度不超过 40000 字符");
    }
    private void page(int page, int size) {if (page < 0 || size < 1 || size > 100) throw badRequest("QMED_KNOWLEDGE_PAGE", "分页参数无效");}
}
