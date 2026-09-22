package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.StandardCatalogReview.*;
import com.rhn.platform.masterdata.infrastructure.StandardCatalogReviewStore;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class StandardCatalogReviewService {
    private final StandardMedicationCatalogService catalog;
    private final StandardCatalogReviewStore store;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public StandardCatalogReviewService(StandardMedicationCatalogService catalog, StandardCatalogReviewStore store,
            ExecutionContextProvider contexts, JsonCodec json) {
        this.catalog = catalog; this.store = store; this.contexts = contexts; this.json = json;
    }
    public Identity identity() {
        var summary = catalog.summary();
        return new Identity(summary.path("catalogId").asString(), summary.path("catalogVersion").asString(),
                summary.path("contentHash").asString(), summary.path("source").path("sha256").asString());
    }
    private String key(Identity identity) { return ClinicalSemanticVersions.hash(identity, json); }
    public View view() { return view(0); }
    public View view(int historyPage) { return view(identity(),historyPage); }
    public View view(Identity identity,int historyPage) {
        if (historyPage < 0) throw badRequest("STANDARD_REVIEW_QUERY_INVALID", "历史页码不能小于零");
        var context = contexts.requireCurrent();
        var current = store.history(context.tenantId(), key(identity), 1);
        var latest = current.isEmpty() ? null : current.getFirst();
        return new View(identity, latest == null ? 0 : latest.revision(), latest == null ? "UNVERIFIED" : latest.status(),
                latest, store.catalogHistory(context.tenantId(), identity.catalogId(), historyPage, 20), store.count(context.tenantId(), identity.catalogId()), historyPage, 20,
                allowedActions(context, latest));
    }
    /** Read tenant review once per batch, retaining the original supplied-source metadata. */
    public JsonNode summary(Long tenant) {
        var value = (ObjectNode) catalog.summary();
        var events = store.history(tenant, key(identity()), 1);
        var source = (ObjectNode) value.path("source");
        source.put("suppliedVerificationStatus", source.path("verificationStatus").asString("UNKNOWN"));
        source.put("verificationStatus", events.isEmpty() ? "UNVERIFIED" : events.getFirst().status());
        if (!events.isEmpty()) source.put("verificationId", events.getFirst().id().toString());
        return value;
    }
    @Transactional
    public View change(Change input) { return change(identity(),input); }
    @Transactional
    public View change(Identity identity,Change input) {
        var context = contexts.requireCurrent();
        if (!context.hasAuthority("MASTER_DATA.MANAGE") || context.subjectId()==null) throw forbidden("STANDARD_REVIEW_FORBIDDEN", "需要基础数据管理权限");
        if (input == null || input.expectedRevision() == null || input.expectedRevision() < 0 || input.action() == null)
            throw badRequest("STANDARD_REVIEW_INVALID", "请提供核验操作和当前版本");
        if (!identity.equals(input.identity())) throw conflict("STANDARD_REVIEW_EDITION_CHANGED", "目录或来源文件版本已变化，请刷新后重新核验");
        var latest = store.history(context.tenantId(), key(identity), 1).stream().findFirst().orElse(null);
        int revision = latest == null ? 0 : latest.revision();
        if (revision != input.expectedRevision()) throw conflict("STANDARD_REVIEW_CONCURRENT", "核验记录已变化，请刷新后重试");
        if (!allowedActions(context, latest).contains(input.action()))
            throw conflict("STANDARD_REVIEW_TRANSITION_INVALID", "当前状态不能执行该操作；提交人不能复核自己的材料");
        Evidence evidence;
        Long submittedBy; String submitter;
        if ("SUBMIT".equals(input.action())) {
            if (input.evidence() == null) throw badRequest("STANDARD_REVIEW_EVIDENCE_REQUIRED", "请补齐来源核验材料");
            var e = input.evidence();
            evidence = new Evidence(required(e.title(), 240), required(e.publisher(), 160), required(e.edition(), 120),
                    required(e.location(), 1000), required(e.verificationNotes(), 2000));
            submittedBy = context.subjectId(); submitter = context.actor();
        } else {
            // Reviewers cannot silently replace the evidence submitted for review.
            if (input.evidence() != null) throw badRequest("STANDARD_REVIEW_EVIDENCE_IMMUTABLE", "复核操作不能修改已提交的材料");
            evidence = latest.evidence(); submittedBy = latest.submittedBy(); submitter = latest.submitter();
        }
        String reason = required(input.reason(), 2000);
        String status = switch (input.action()) {
            case "SUBMIT" -> "SUBMITTED";
            case "VERIFY" -> "VERIFIED";
            case "REJECT" -> "REJECTED";
            case "REVOKE" -> "REVOKED";
            default -> throw badRequest("STANDARD_REVIEW_INVALID", "不支持的核验操作");
        };
        var event = new Event(GlobalIds.next(), revision + 1, identity, status, evidence, submittedBy, submitter,
                context.subjectId(), context.actor(), reason, Instant.now());
        try { store.append(context.tenantId(), key(identity), event); }
        catch (DuplicateKeyException concurrent) { throw conflict("STANDARD_REVIEW_CONCURRENT", "核验记录已变化，请刷新后重试"); }
        return view(identity,0);
    }
    private List<String> allowedActions(ExecutionContext context, Event latest) {
        if (!context.hasAuthority("MASTER_DATA.MANAGE")) return List.of();
        if (latest == null || List.of("REJECTED", "REVOKED").contains(latest.status())) return List.of("SUBMIT");
        if ("VERIFIED".equals(latest.status())) return List.of("REVOKE");
        if ("SUBMITTED".equals(latest.status()) && !Objects.equals(context.subjectId(), latest.submittedBy()))
            return List.of("VERIFY", "REJECT");
        return List.of();
    }
    private String required(String value, int max) {
        if (value == null || value.isBlank() || value.length() > max)
            throw badRequest("STANDARD_REVIEW_EVIDENCE_REQUIRED", "请完整填写来源名称、发布机构、版本、证据位置、核验说明及操作理由，并遵守长度限制");
        return value.strip();
    }
}
