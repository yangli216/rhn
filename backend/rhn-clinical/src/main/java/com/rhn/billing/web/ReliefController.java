package com.rhn.billing.web;

import com.rhn.billing.application.ReliefPolicyApplicationService;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefCreatePolicyCommand;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefDraftInput;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefPolicySummaryView;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefPolicyView;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefRevisionCommand;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefUpdateDraftCommand;
import com.rhn.billing.application.ReliefRosterApplicationService;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefAddRosterCommand;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefRosterImportResultView;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefRosterImportCommand;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefRosterImportRow;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefRevokeRosterCommand;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefRosterEntryView;
import com.rhn.billing.application.ReliefRosterApplicationService.ReliefUpdateRosterCommand;
import com.rhn.billing.domain.ReliefRosterStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** 惠民政策与资格名单维护；查看对收费人员开放，维护分别需要政策管理或名单维护权限。 */
@RestController
@RequestMapping("/api/billing/relief")
public class ReliefController {
    private static final String READ = "hasAnyAuthority('BILLING_RELIEF.MANAGE','BILLING_RELIEF.ROSTER','BILLING.ACCESS')";
    private static final String MANAGE = "hasAuthority('BILLING_RELIEF.MANAGE')";
    private static final String ROSTER = "hasAnyAuthority('BILLING_RELIEF.ROSTER','BILLING_RELIEF.MANAGE')";

    private final ReliefPolicyApplicationService policies;
    private final ReliefRosterApplicationService roster;

    public ReliefController(ReliefPolicyApplicationService policies, ReliefRosterApplicationService roster) {
        this.policies = policies; this.roster = roster;
    }

    @GetMapping("/policies")
    @PreAuthorize(READ)
    List<ReliefPolicySummaryView> listReliefPolicies() { return policies.list(); }

    @GetMapping("/policies/{policyId}")
    @PreAuthorize(READ)
    ReliefPolicyView getReliefPolicy(@PathVariable Long policyId) { return policies.get(policyId); }

    @PostMapping("/policies")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(MANAGE)
    ReliefPolicyView createReliefPolicy(@Valid @RequestBody ReliefCreatePolicyRequest input) {
        return policies.create(new ReliefCreatePolicyCommand(input.code(), input.name(), input.description(), input.draft()));
    }

    @PutMapping("/policies/{policyId}/draft")
    @PreAuthorize(MANAGE)
    ReliefPolicyView updateReliefPolicyDraft(@PathVariable Long policyId, @Valid @RequestBody ReliefUpdateDraftRequest input) {
        return policies.updateDraft(policyId, new ReliefUpdateDraftCommand(input.expectedRevision(), input.name(),
                input.description(), input.draft()));
    }

    @PostMapping("/policies/{policyId}/draft/discard")
    @PreAuthorize(MANAGE)
    ReliefPolicyView discardReliefPolicyDraft(@PathVariable Long policyId, @Valid @RequestBody ReliefRevisionRequest input) {
        return policies.discardDraft(policyId, new ReliefRevisionCommand(input.expectedRevision()));
    }

    @PostMapping("/policies/{policyId}/publish")
    @PreAuthorize(MANAGE)
    ReliefPolicyView publishReliefPolicy(@PathVariable Long policyId, @Valid @RequestBody ReliefRevisionRequest input) {
        return policies.publish(policyId, new ReliefRevisionCommand(input.expectedRevision()));
    }

    @PostMapping("/policies/{policyId}/suspend")
    @PreAuthorize(MANAGE)
    ReliefPolicyView suspendReliefPolicy(@PathVariable Long policyId, @Valid @RequestBody ReliefRevisionRequest input) {
        return policies.suspend(policyId, new ReliefRevisionCommand(input.expectedRevision()));
    }

    @PostMapping("/policies/{policyId}/resume")
    @PreAuthorize(MANAGE)
    ReliefPolicyView resumeReliefPolicy(@PathVariable Long policyId, @Valid @RequestBody ReliefRevisionRequest input) {
        return policies.resume(policyId, new ReliefRevisionCommand(input.expectedRevision()));
    }

    @PostMapping("/policies/{policyId}/retire")
    @PreAuthorize(MANAGE)
    ReliefPolicyView retireReliefPolicy(@PathVariable Long policyId, @Valid @RequestBody ReliefRevisionRequest input) {
        return policies.retire(policyId, new ReliefRevisionCommand(input.expectedRevision()));
    }

    @GetMapping("/roster")
    @PreAuthorize(READ)
    List<ReliefRosterEntryView> searchReliefRoster(@RequestParam(required = false) String qualificationType,
                                             @RequestParam(required = false) Long residentId,
                                             @RequestParam(required = false) ReliefRosterStatus status,
                                             @RequestParam(required = false) String importBatch) {
        return roster.search(qualificationType, residentId, status, importBatch);
    }

    @PostMapping("/roster")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(ROSTER)
    ReliefRosterEntryView addReliefRosterEntry(@Valid @RequestBody ReliefAddRosterRequest input) {
        return roster.add(new ReliefAddRosterCommand(input.qualificationType(), input.residentId(), input.effectiveFrom(),
                input.effectiveTo(), input.evidenceNo(), input.evidence()));
    }

    @PutMapping("/roster/{entryId}")
    @PreAuthorize(ROSTER)
    ReliefRosterEntryView updateReliefRosterEntry(@PathVariable Long entryId, @Valid @RequestBody ReliefUpdateRosterRequest input) {
        return roster.update(entryId, new ReliefUpdateRosterCommand(input.expectedRevision(), input.effectiveFrom(),
                input.effectiveTo(), input.evidenceNo(), input.evidence()));
    }

    @PostMapping("/roster/{entryId}/revoke")
    @PreAuthorize(ROSTER)
    ReliefRosterEntryView revokeReliefRosterEntry(@PathVariable Long entryId, @Valid @RequestBody ReliefRevokeRosterRequest input) {
        return roster.revoke(entryId, new ReliefRevokeRosterCommand(input.expectedRevision(), input.reason()));
    }

    @PostMapping("/roster/import")
    @PreAuthorize(ROSTER)
    ReliefRosterImportResultView importReliefRoster(@Valid @RequestBody ReliefRosterImportRequest input) {
        return roster.importRoster(new ReliefRosterImportCommand(input.batchCode(), input.qualificationType(),
                Boolean.TRUE.equals(input.dryRun()), input.rows()));
    }

    record ReliefCreatePolicyRequest(@NotBlank @Size(max = 64) String code, @NotBlank @Size(max = 200) String name,
                               @Size(max = 2000) String description, @NotNull ReliefDraftInput draft) {}

    record ReliefUpdateDraftRequest(@NotNull Long expectedRevision, @NotBlank @Size(max = 200) String name,
                              @Size(max = 2000) String description, @NotNull ReliefDraftInput draft) {}

    record ReliefRevisionRequest(@NotNull Long expectedRevision) {}

    record ReliefAddRosterRequest(@NotBlank @Size(max = 64) String qualificationType, @NotNull Long residentId,
                            @NotNull LocalDate effectiveFrom, LocalDate effectiveTo,
                            @Size(max = 128) String evidenceNo, @Size(max = 1000) String evidence) {}

    record ReliefUpdateRosterRequest(@NotNull Long expectedRevision, @NotNull LocalDate effectiveFrom, LocalDate effectiveTo,
                               @Size(max = 128) String evidenceNo, @Size(max = 1000) String evidence) {}

    record ReliefRevokeRosterRequest(@NotNull Long expectedRevision, @NotBlank @Size(max = 1000) String reason) {}

    record ReliefRosterImportRequest(@NotBlank @Size(max = 64) String batchCode,
                               @NotBlank @Size(max = 64) String qualificationType, Boolean dryRun,
                               @NotEmpty List<ReliefRosterImportRow> rows) {}
}
