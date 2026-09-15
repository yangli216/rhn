package com.rhn.outpatient.encounter;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.rhn.outpatient.encounter.OutpatientReferralContracts.AcceptRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CancelRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CompleteRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.CreateRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.RejectRequest;
import static com.rhn.outpatient.encounter.OutpatientReferralContracts.View;

@RestController
@RequestMapping("/api/outpatient/referrals")
public class OutpatientReferralController {
    private final OutpatientReferralService service;

    public OutpatientReferralController(OutpatientReferralService service) {
        this.service = service;
    }

    @PostMapping("/encounters/{encounterId}")
    @ResponseStatus(HttpStatus.CREATED)
    View create(@PathVariable Long encounterId, @Valid @RequestBody CreateRequest input) {
        return service.create(encounterId, input);
    }

    @GetMapping("/encounters/{encounterId}")
    List<View> byEncounter(@PathVariable Long encounterId) {
        return service.byEncounter(encounterId);
    }

    @GetMapping("/inbox")
    List<View> inbox() {
        return service.inbox();
    }

    @PostMapping("/{requestId}/accept")
    View accept(@PathVariable Long requestId, @Valid @RequestBody AcceptRequest input) {
        return service.accept(requestId, input);
    }

    @PostMapping("/{requestId}/complete")
    View complete(@PathVariable Long requestId, @Valid @RequestBody CompleteRequest input) {
        return service.complete(requestId, input);
    }

    @PostMapping("/{requestId}/reject")
    View reject(@PathVariable Long requestId, @Valid @RequestBody RejectRequest input) {
        return service.reject(requestId, input);
    }

    @PostMapping("/{requestId}/cancel")
    View cancel(@PathVariable Long requestId, @Valid @RequestBody CancelRequest input) {
        return service.cancel(requestId, input);
    }
}
