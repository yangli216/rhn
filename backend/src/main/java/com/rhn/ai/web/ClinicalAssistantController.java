package com.rhn.ai.web;

import com.rhn.ai.api.ClinicalAssistantContracts.Capabilities;
import com.rhn.ai.api.ClinicalAssistantContracts.Event;
import com.rhn.ai.api.ClinicalAssistantContracts.EventRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.GenerateRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.Suggestion;
import com.rhn.ai.application.ClinicalAssistantApplicationService;
import com.rhn.ai.application.ClinicalAssistantApplicationService.EventRecordingOutcome;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

@RestController
@RequestMapping("/api/ai/clinical-assistant")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class ClinicalAssistantController {
    private final ClinicalAssistantApplicationService service;

    ClinicalAssistantController(ClinicalAssistantApplicationService service) {
        this.service = service;
    }

    @GetMapping("/capabilities")
    Capabilities capabilities() {
        return service.capabilities();
    }

    @PostMapping("/encounters/{encounterId}/suggestions")
    @ResponseStatus(HttpStatus.CREATED)
    Suggestion generate(@PathVariable Long encounterId, @Valid @RequestBody GenerateRequest input) {
        return service.generate(encounterId, input);
    }

    @GetMapping("/encounters/{encounterId}/suggestions")
    List<Suggestion> history(@PathVariable Long encounterId) {
        return service.history(encounterId);
    }

    @PostMapping("/suggestions/{suggestionId}/events")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void recordEvent(@PathVariable Long suggestionId, @Valid @RequestBody EventRequest input) {
        EventRecordingOutcome outcome = service.recordEvent(suggestionId, input);
        if (outcome == EventRecordingOutcome.ADOPTION_REJECTED_EXPIRED) {
            throw conflict("AI_SUGGESTION_EXPIRED", "AI 建议已过期，请重新分析后再采纳");
        }
        if (outcome == EventRecordingOutcome.ADOPTION_REJECTED_SERVER_CONTEXT_CHANGED) {
            throw conflict("AI_SUGGESTION_SERVER_CONTEXT_CHANGED", "患者临床信息已变化，请重新分析后再采纳");
        }
    }

    @GetMapping("/suggestions/{suggestionId}/events")
    List<Event> eventHistory(@PathVariable Long suggestionId) {
        return service.eventHistory(suggestionId);
    }
}
