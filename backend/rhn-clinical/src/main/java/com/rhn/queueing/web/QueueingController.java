package com.rhn.queueing.web;

import com.rhn.queueing.api.QueueingDirectory.CheckInCommand;
import com.rhn.queueing.api.QueueingDirectory.ServiceQueueSnapshot;
import com.rhn.queueing.api.QueueingDirectory.TicketSnapshot;
import com.rhn.queueing.application.QueueingApplicationService;
import com.rhn.shared.api.PageResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/queueing")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','PHARMACY.ACCESS','DIAGNOSTICS.ACCESS','ROLE_ADMIN')")
public class QueueingController {
    private final QueueingApplicationService service;

    public QueueingController(QueueingApplicationService service) {
        this.service = service;
    }

    @GetMapping("/queues")
    List<ServiceQueueSnapshot> queues() {
        return service.queues();
    }

    @GetMapping("/tickets")
    PageResult<TicketSnapshot> tickets(@RequestParam Long queueId,
                                       @RequestParam(required = false) LocalDate businessDate,
                                       @RequestParam(required = false) String status,
                                       @RequestParam(defaultValue = "0") @Min(0) int page,
                                       @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return service.page(queueId, businessDate, status, page, size);
    }

    @PostMapping("/check-ins")
    TicketSnapshot checkIn(@Valid @RequestBody CheckInRequest input) {
        return service.checkIn(input.command());
    }

    @PostMapping("/queues/{queueId}/call-next")
    TicketSnapshot callNext(@PathVariable Long queueId, @Valid @RequestBody ActionRequest input) {
        return service.callNext(queueId, input.businessDate(), input.commandCode(),
                input.serviceLocationId(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/ready")
    TicketSnapshot ready(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.ready(ticketId, input.commandCode(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/call")
    TicketSnapshot call(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.call(ticketId, input.commandCode(), input.serviceLocationId(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/recall")
    TicketSnapshot recall(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.recall(ticketId, input.commandCode(), input.serviceLocationId(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/miss")
    TicketSnapshot miss(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.miss(ticketId, input.commandCode(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/requeue")
    TicketSnapshot requeue(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.requeue(ticketId, input.commandCode(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/start")
    TicketSnapshot start(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.start(ticketId, input.commandCode(), input.serviceLocationId(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/suspend")
    TicketSnapshot suspend(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.suspend(ticketId, input.commandCode(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/resume")
    TicketSnapshot resume(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.resume(ticketId, input.commandCode(), input.serviceLocationId(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/complete")
    TicketSnapshot complete(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.complete(ticketId, input.commandCode(), input.description());
    }

    @PostMapping("/tickets/{ticketId}/cancel")
    TicketSnapshot cancel(@PathVariable Long ticketId, @Valid @RequestBody ActionRequest input) {
        return service.cancel(ticketId, input.commandCode(), input.description());
    }

    record CheckInRequest(
            @NotNull Long organizationId,
            @NotNull Long departmentId,
            Long waitingLocationId,
            @NotBlank @Size(max = 64) String queueCode,
            @NotBlank @Size(max = 100) String queueName,
            @NotBlank @Pattern(regexp = "OUTPATIENT|PHARMACY|LAB_COLLECTION|EXAMINATION") String scene,
            @NotBlank @Size(max = 8) String ticketPrefix,
            @NotNull Long residentId,
            Long encounterId,
            @NotBlank @Pattern(regexp = "PAT_REG|DISP_TASK|DIAG_TASK") String sourceType,
            @NotNull Long sourceId,
            @Min(0) int priority,
            boolean ready,
            @NotBlank @Size(max = 128) String commandCode) {
        CheckInCommand command() {
            return new CheckInCommand(organizationId, departmentId, waitingLocationId, queueCode, queueName,
                    scene, ticketPrefix, residentId, encounterId, sourceType, sourceId, priority, ready, commandCode);
        }
    }

    record ActionRequest(@NotBlank @Size(max = 128) String commandCode,
                         Long serviceLocationId,
                         LocalDate businessDate,
                         @Size(max = 500) String description) {}
}
