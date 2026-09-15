package com.rhn.inpatient.web;

import com.rhn.inpatient.api.InpatientOrderViews.DoctorWorklistView;
import com.rhn.inpatient.api.InpatientOrderViews.NurseWorklistView;
import com.rhn.inpatient.api.InpatientOrderViews.OrderView;
import com.rhn.inpatient.api.InpatientOrderViews.TaskView;
import com.rhn.inpatient.api.InpatientPermissions;
import com.rhn.inpatient.application.InpatientOrderApplicationService;
import com.rhn.inpatient.application.InpatientOrderApplicationService.CreateOrderCommand;
import com.rhn.inpatient.application.InpatientOrderApplicationService.OrderCommand;
import com.rhn.inpatient.application.InpatientOrderApplicationService.PlanCommand;
import com.rhn.inpatient.application.InpatientOrderApplicationService.StopCommand;
import com.rhn.inpatient.application.InpatientOrderApplicationService.TaskCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/inpatient")
@PreAuthorize(InpatientPermissions.ACCESS)
public class InpatientOrderController {
    private final InpatientOrderApplicationService service;

    public InpatientOrderController(InpatientOrderApplicationService service) {
        this.service = service;
    }

    @PostMapping("/orders")
    @ResponseStatus(HttpStatus.CREATED)
    OrderView createDraft(@Valid @RequestBody CreateOrderRequest input) {
        return service.createDraft(new CreateOrderCommand(input.episodeId(), input.orderCategory(),
                input.durationType(), input.catalogItemId(), input.itemCode(), input.itemName(),
                input.dosageAmount(), input.dosageUnit(), input.routeCode(), input.frequencyCode(),
                input.instructions(), input.commandCode()));
    }

    @PostMapping("/orders/{orderId}/sign")
    OrderView sign(@PathVariable Long orderId, @Valid @RequestBody SignRequest input) {
        return service.sign(orderId, new InpatientOrderApplicationService.SignOrderCommand(
                input.expectedRevision(), input.allergyReviewConfirmed(), input.allergyOverrideReason(),
                input.commandCode()));
    }

    @PostMapping("/orders/{orderId}/verify")
    OrderView verify(@PathVariable Long orderId, @Valid @RequestBody RevisionRequest input) {
        return service.verify(orderId, new OrderCommand(input.expectedRevision(), input.commandCode()));
    }

    @PostMapping("/orders/{orderId}/plans")
    OrderView plan(@PathVariable Long orderId, @Valid @RequestBody PlanRequest input) {
        return service.plan(orderId, new PlanCommand(input.expectedRevision(), input.plannedTimes(), input.commandCode()));
    }

    @PostMapping("/orders/{orderId}/stop")
    OrderView stop(@PathVariable Long orderId, @Valid @RequestBody StopRequest input) {
        return service.stop(orderId, new StopCommand(input.expectedRevision(), input.reason(), input.commandCode()));
    }

    @PostMapping("/order-tasks/{taskId}/execute")
    TaskView execute(@PathVariable Long taskId, @Valid @RequestBody TaskRequest input) {
        return service.execute(taskId, new TaskCommand(input.expectedRevision(), input.outcomeCode(), input.note(),
                input.commandCode()));
    }

    @PostMapping("/order-tasks/{taskId}/skip")
    TaskView skip(@PathVariable Long taskId, @Valid @RequestBody TaskRequest input) {
        return service.skip(taskId, new TaskCommand(input.expectedRevision(), input.outcomeCode(), input.note(),
                input.commandCode()));
    }

    @GetMapping("/orders/doctor-worklist")
    DoctorWorklistView doctorWorklist(@RequestParam(required = false) Long episodeId,
                                      @RequestParam(required = false) String status) {
        return service.doctorWorklist(episodeId, status);
    }

    @GetMapping("/order-tasks/nurse-worklist")
    NurseWorklistView nurseWorklist(@RequestParam(required = false) Long episodeId,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) Instant from,
                                    @RequestParam(required = false) Instant to) {
        return service.nurseWorklist(episodeId, status, from, to);
    }

    public record CreateOrderRequest(
            @NotNull Long episodeId,
            @NotBlank @Pattern(regexp = "MEDICATION|SERVICE|NURSING") String orderCategory,
            @NotBlank @Pattern(regexp = "LONG_TERM|TEMPORARY") String durationType,
            Long catalogItemId,
            @Size(max = 64) String itemCode,
            @Size(max = 300) String itemName,
            @DecimalMin(value = "0", inclusive = false) BigDecimal dosageAmount,
            @Size(max = 64) String dosageUnit,
            @Size(max = 64) String routeCode,
            @Size(max = 64) String frequencyCode,
            @Size(max = 2000) String instructions,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record RevisionRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record SignRequest(
            @NotNull Long expectedRevision,
            Boolean allergyReviewConfirmed,
            @Size(max = 800) String allergyOverrideReason,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record PlanRequest(
            @NotNull Long expectedRevision,
            @NotEmpty @Size(max = 128) List<@NotNull Instant> plannedTimes,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record TaskRequest(
            @NotNull Long expectedRevision,
            @Size(max = 64) String outcomeCode,
            @Size(max = 1000) String note,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    public record StopRequest(
            @NotNull Long expectedRevision,
            @NotBlank @Size(max = 1000) String reason,
            @NotBlank @Size(max = 128) String commandCode) {
    }
}
