package com.rhn.ai.web;

import com.rhn.ai.api.ClinicalAssistantContracts.Capabilities;
import com.rhn.ai.api.ClinicalAssistantContracts.Event;
import com.rhn.ai.api.ClinicalAssistantContracts.EventRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.GenerateRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.KnowledgeSearch;
import com.rhn.ai.api.ClinicalAssistantContracts.KnowledgeSearchRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanPreflight;
import com.rhn.ai.api.ClinicalAssistantContracts.PlanPreflightRequest;
import com.rhn.ai.api.ClinicalAssistantContracts.Suggestion;
import com.rhn.ai.api.ClinicalAssistantContracts.Transcription;
import com.rhn.ai.application.ClinicalAssistantApplicationService;
import com.rhn.ai.application.ClinicalAssistantApplicationService.EventRecordingOutcome;
import com.rhn.ai.application.ClinicalPlanPreflightService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

import java.util.List;

import static com.rhn.shared.api.BusinessErrors.conflict;

@RestController
@RequestMapping("/api/ai/clinical-assistant")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class ClinicalAssistantController {
    private final ClinicalAssistantApplicationService service;
    private final ClinicalPlanPreflightService planPreflightService;
    private final com.rhn.shared.json.JsonCodec jsonCodec;

    ClinicalAssistantController(ClinicalAssistantApplicationService service,
                                ClinicalPlanPreflightService planPreflightService, com.rhn.shared.json.JsonCodec jsonCodec) {
        this.service = service;
        this.jsonCodec = jsonCodec;
        this.planPreflightService = planPreflightService;
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

    @PostMapping(path = "/encounters/{encounterId}/suggestions/stream", produces = "text/event-stream")
    void generateStream(@PathVariable Long encounterId, @Valid @RequestBody GenerateRequest input,
                        jakarta.servlet.http.HttpServletRequest request,
                        jakarta.servlet.http.HttpServletResponse response) throws IOException {
        response.setContentType("text/event-stream");
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Accel-Buffering", "no");
        try {
            // Remain on the authenticated request thread. The service transaction commits before 'complete'.
            Suggestion result = service.generate(encounterId, input,
                    delta -> sendStreamEvent(response, "delta", java.util.Map.of("text", delta)));
            sendStreamEvent(response, "complete", result);
        } catch (RuntimeException exception) {
            if (!response.isCommitted()) {
                response.resetBuffer();
                response.setContentType("application/json");
                throw exception;
            }
            var error = exception instanceof com.rhn.shared.api.BusinessException value ? value : null;
            sendStreamEvent(response, "error", java.util.Map.of(
                    "code", error == null ? "AI_STREAM_FAILED" : error.code(),
                    "message", error == null ? "生成中断，请重新整理。" : error.getMessage(),
                    "correlationId", java.util.Objects.toString(request.getAttribute(
                            com.rhn.shared.api.CorrelationIds.ATTRIBUTE_NAME), "")));
        }
    }

    private void sendStreamEvent(jakarta.servlet.http.HttpServletResponse response, String event, Object data) {
        try {
            var writer = response.getWriter();
            writer.write("event: " + event + "\ndata: " + jsonCodec.write(data) + "\n\n");
            writer.flush();
            if (writer.checkError()) throw new IOException("Stream client disconnected");
        } catch (IOException exception) {
            throw new java.io.UncheckedIOException(exception);
        }
    }

    @PostMapping(path = "/encounters/{encounterId}/transcriptions", consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.CREATED)
    Transcription transcribe(@PathVariable Long encounterId,
                             @RequestPart("file") MultipartFile file) throws IOException {
        return service.transcribe(encounterId, file.getContentType(), file.getBytes());
    }

    @PostMapping("/encounters/{encounterId}/knowledge-searches")
    KnowledgeSearch searchKnowledge(@PathVariable Long encounterId,
                                    @Valid @RequestBody KnowledgeSearchRequest input) {
        return service.searchKnowledge(encounterId, input);
    }

    @PostMapping("/encounters/{encounterId}/plan-templates/{templateId}/preflight")
    PlanPreflight preflightPlan(@PathVariable Long encounterId, @PathVariable Long templateId,
                                @Valid @RequestBody PlanPreflightRequest input) {
        return planPreflightService.preflight(encounterId, templateId, input);
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
