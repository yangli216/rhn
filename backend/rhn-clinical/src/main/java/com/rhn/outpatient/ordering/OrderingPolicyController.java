package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 当前就诊生效的医嘱开立策略，只读下发给医生站决定交互；门禁仍在提交命令中执行。 */
@RestController
@RequestMapping("/api/encounters/{encounterId}/ordering-policy")
class OrderingPolicyController {
    private final EncounterDirectory encounters;
    private final OrderReviewModePolicy reviewMode;
    private final PrescriptionSplitPolicy splitPolicy;

    OrderingPolicyController(EncounterDirectory encounters, OrderReviewModePolicy reviewMode,
                             PrescriptionSplitPolicy splitPolicy) {
        this.encounters = encounters; this.reviewMode = reviewMode; this.splitPolicy = splitPolicy;
    }

    @GetMapping
    @Transactional(readOnly = true)
    @io.swagger.v3.oas.annotations.Operation(operationId = "getOutpatientOrderingPolicy")
    OrderingPolicyResponse policy(@PathVariable Long encounterId) {
        var encounter = encounters.requireAccessible(encounterId);
        var split = splitPolicy.resolve(encounter);
        return new OrderingPolicyResponse(reviewMode.resolve(encounter).name(), split.mergeWesternAndPatent(),
                split.separateInfusion(), split.maxItemsPerPrescription());
    }

    record OrderingPolicyResponse(String reviewMode, boolean mergeWesternAndPatent, boolean separateInfusion,
                                  int maxItemsPerPrescription) {}
}
