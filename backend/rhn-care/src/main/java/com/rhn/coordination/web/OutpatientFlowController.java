package com.rhn.coordination.web;

import com.rhn.coordination.api.OutpatientFlowViews.BoardView;
import com.rhn.coordination.application.OutpatientFlowService;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminateEncounterRequest;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminationReadinessView;
import com.rhn.coordination.api.OutpatientTerminationViews.TerminationResultView;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/outpatient-flow")
@PreAuthorize(com.rhn.coordination.api.OutpatientFlowPermissions.ACCESS)
public class OutpatientFlowController {
    private final OutpatientFlowService service;

    public OutpatientFlowController(OutpatientFlowService service) {
        this.service = service;
    }

    @GetMapping
    BoardView board(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
                    @RequestParam(required = false) String flowStatus,
                    @RequestParam(required = false) String keyword) {
        return service.board(date, dateFrom, dateTo, flowStatus, keyword);
    }

    @GetMapping("/{encounterId}/termination-readiness")
    TerminationReadinessView terminationReadiness(@PathVariable Long encounterId) {
        return service.terminationReadiness(encounterId);
    }

    @PostMapping("/{encounterId}/terminate")
    TerminationResultView terminate(@PathVariable Long encounterId,
                                    @Valid @RequestBody TerminateEncounterRequest request) {
        return service.terminate(encounterId, request);
    }
}
