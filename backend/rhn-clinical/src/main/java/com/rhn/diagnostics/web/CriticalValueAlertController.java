package com.rhn.diagnostics.web;

import com.rhn.diagnostics.api.CriticalValueAlertView;
import com.rhn.diagnostics.application.CriticalValueAlertService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/critical-values")
public class CriticalValueAlertController {
    private final CriticalValueAlertService service;

    public CriticalValueAlertController(CriticalValueAlertService service) { this.service = service; }

    @GetMapping
    List<CriticalValueAlertView> active() { return service.active(); }

    @PostMapping("/{alertId}/acknowledge")
    CriticalValueAlertView acknowledge(@PathVariable Long alertId, @Valid @RequestBody AcknowledgeRequest input) {
        return service.acknowledge(alertId, input.expectedRevision(), input.note());
    }

    @PostMapping("/{alertId}/close")
    CriticalValueAlertView close(@PathVariable Long alertId, @Valid @RequestBody CloseRequest input) {
        return service.close(alertId, input.expectedRevision(), input.dispositionCode(), input.note());
    }

    record AcknowledgeRequest(@NotNull Long expectedRevision, @Size(max = 1000) String note) {}
    record CloseRequest(@NotNull Long expectedRevision, @NotBlank @Size(max = 64) String dispositionCode,
                        @Size(max = 1000) String note) {}
}
