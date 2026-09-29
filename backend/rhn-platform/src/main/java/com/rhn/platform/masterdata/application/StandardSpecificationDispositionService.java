package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.StandardSpecificationDisposition.*;
import com.rhn.platform.masterdata.infrastructure.StandardSpecificationDispositionStore;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import java.time.Instant;
import java.util.List;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class StandardSpecificationDispositionService {
    private final StandardMedicationCatalogService catalog;
    private final StandardCatalogReviewService reviews;
    private final StandardSpecificationDispositionStore store;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;

    public StandardSpecificationDispositionService(StandardMedicationCatalogService catalog,
            StandardCatalogReviewService reviews, StandardSpecificationDispositionStore store,
            ExecutionContextProvider contexts, JsonCodec json) {
        this.catalog = catalog;
        this.reviews = reviews;
        this.store = store;
        this.contexts = contexts;
        this.json = json;
    }

    private void authorize() {
        var context = contexts.requireCurrent();
        if (context.subjectId() == null || !context.hasAuthority("MASTER_DATA.MANAGE"))
            throw forbidden("STANDARD_SPEC_DISPOSITION_FORBIDDEN", "需要基础数据管理权限");
    }

    public View view() {
        authorize();
        var identity = reviews.identity();
        return new View(identity, store.latest(contexts.requireCurrent().tenantId(), identityHash(identity)));
    }

    @Transactional
    public Event change(String specificationId, Change input) {
        authorize();
        var view = view();
        var context = contexts.requireCurrent();
        if (input == null || !view.identity().equals(input.identity()))
            throw conflict("STANDARD_SPEC_DISPOSITION_EDITION", "目录版本已变化，请刷新后重新处理");
        if (input.expectedRevision() == null || input.expectedRevision() < 0
                || !List.of("SUPPLEMENT_REQUIRED", "NOT_ADOPTED").contains(input.status() == null ? "" : input.status()))
            throw badRequest("STANDARD_SPEC_DISPOSITION_INPUT", "请选择待补充具体规格或本院不采用，并提供当前版本");
        String note = input.note() == null ? "" : input.note().strip();
        if (note.isEmpty() || note.length() > 1000)
            throw badRequest("STANDARD_SPEC_DISPOSITION_NOTE", "请填写处置依据或后续所需材料，最多 1000 字");
        var specification = catalog.specification(specificationId);
        if (catalog.specificationIdentityIssues(specification).isEmpty())
            throw badRequest("STANDARD_SPEC_DISPOSITION_NOT_REQUIRED", "该规格身份完整，可直接建立或关联本院药品");
        var previous = view.specifications().stream()
                .filter(event -> specificationId.equals(event.specificationId())).findFirst().orElse(null);
        int revision = previous == null ? 0 : previous.revision();
        if (revision != input.expectedRevision())
            throw conflict("STANDARD_SPEC_DISPOSITION_CONCURRENT", "规格处置结果已变化，请刷新后重试");
        var event = new Event(GlobalIds.next(), view.identity(), specificationId, revision + 1,
                input.status(), note, context.subjectId(), context.actor(), Instant.now());
        try {
            store.append(context.tenantId(), identityHash(view.identity()), event);
        } catch (DuplicateKeyException concurrent) {
            throw conflict("STANDARD_SPEC_DISPOSITION_CONCURRENT", "规格处置结果已变化，请刷新后重试");
        }
        return event;
    }

    private String identityHash(com.rhn.platform.masterdata.api.StandardCatalogReview.Identity identity) {
        return ClinicalSemanticVersions.hash(identity, json);
    }
}
