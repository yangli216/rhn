package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor;
import com.rhn.platform.masterdata.api.ClinicalSemanticImpactContributor.Impact;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.bind.annotation.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@RestController
@RequestMapping("/api/platform/master-data/clinical-semantics/impact")
public class ClinicalSemanticImpactController {
    private final ObjectProvider<ClinicalSemanticImpactContributor> contributors;
    private final ExecutionContextProvider contexts;
    public ClinicalSemanticImpactController(ObjectProvider<ClinicalSemanticImpactContributor> contributors,
                                           ExecutionContextProvider contexts) {
        this.contributors = contributors; this.contexts = contexts;
    }

    @GetMapping
    public List<Impact> impact(@RequestParam String kind, @RequestParam String conceptId) {
        contexts.requireCurrent();
        if (!Set.of("MEDICATION", "FREQUENCY", "ROUTE", "UNIT").contains(kind)
                || (!"UNIT".equals(kind) && !conceptId.matches("[1-9][0-9]{0,17}"))) {
            throw badRequest("SEMANTIC_IMPACT_CONCEPT_INVALID", "请提供有效的概念类型与标识");
        }
        var result = new ArrayList<>(contributors.orderedStream().map(c -> c.describe(kind, conceptId)).toList());
        result.add(new Impact("ORDER_TEMPLATES", "UNAVAILABLE", null, List.of(), true,
                "模板尚未提供统一概念引用查询，不能据此判定没有模板受影响"));
        return List.copyOf(result);
    }
}
