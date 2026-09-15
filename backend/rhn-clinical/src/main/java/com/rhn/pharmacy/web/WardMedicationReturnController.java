package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.WardMedicationReturnViews.ReturnableMedicationLineView;
import com.rhn.pharmacy.api.WardMedicationReturnViews.WardMedicationReturnRequestView;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService.CreateReturnLineCommand;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService.CreateReturnRequestCommand;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService.ReceiveCommand;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService.ReceiveLineCommand;
import com.rhn.pharmacy.application.WardMedicationReturnApplicationService.TransitionCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
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
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/ward-medication-returns")
public class WardMedicationReturnController {
    private static final String READ = "hasAnyAuthority('INPATIENT.ACCESS','PHARMACY.DISPENSE','ROLE_ADMIN')";
    private static final String WARD = "hasAnyAuthority('INPATIENT.ACCESS','ROLE_ADMIN')";
    private static final String PHARMACY = "hasAnyAuthority('PHARMACY.DISPENSE','ROLE_ADMIN')";

    private final WardMedicationReturnApplicationService service;

    public WardMedicationReturnController(WardMedicationReturnApplicationService service) {
        this.service = service;
    }

    @GetMapping("/returnable")
    @PreAuthorize(WARD)
    List<ReturnableMedicationLineView> returnable(@RequestParam Long encounterId) {
        return service.returnable(encounterId);
    }

    @GetMapping
    @PreAuthorize(READ)
    List<WardMedicationReturnRequestView> list(
            @RequestParam(defaultValue = "ALL") String status,
            @RequestParam(required = false) Long encounterId) {
        return service.list(status, encounterId);
    }

    @GetMapping("/{requestId}")
    @PreAuthorize(READ)
    WardMedicationReturnRequestView get(@PathVariable Long requestId) {
        return service.get(requestId);
    }

    @PostMapping
    @PreAuthorize(WARD)
    @ResponseStatus(HttpStatus.CREATED)
    WardMedicationReturnRequestView create(@Valid @RequestBody CreateRequest input) {
        return service.create(new CreateReturnRequestCommand(input.encounterId(), input.commandCode(), input.note(),
                input.lines().stream().map(CreateLineRequest::command).toList()));
    }

    @PostMapping("/{requestId}/handover")
    @PreAuthorize(WARD)
    WardMedicationReturnRequestView handOver(@PathVariable Long requestId,
                                             @Valid @RequestBody TransitionRequest input) {
        return service.handOver(requestId,
                new TransitionCommand(input.expectedRevision(), input.commandCode(), input.note()));
    }

    @PostMapping("/{requestId}/receive")
    @PreAuthorize(PHARMACY)
    WardMedicationReturnRequestView receive(@PathVariable Long requestId,
                                            @Valid @RequestBody ReceiveRequest input) {
        return service.receive(requestId, new ReceiveCommand(input.expectedRevision(), input.commandCode(),
                input.processorPractitionerId(), input.processorAssignmentId(), input.note(),
                input.lines().stream().map(ReceiveLineRequest::command).toList()));
    }

    record CreateLineRequest(
            @NotNull Long originalDispenseLineId,
            @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 20, fraction = 8)
            BigDecimal quantity) {
        CreateReturnLineCommand command() {
            return new CreateReturnLineCommand(originalDispenseLineId, quantity);
        }
    }

    record CreateRequest(
            @NotNull Long encounterId,
            @NotBlank @Size(max = 128) String commandCode,
            @Size(max = 1000) String note,
            @NotNull @Size(min = 1, max = 100) List<@Valid CreateLineRequest> lines) {
    }

    record TransitionRequest(
            long expectedRevision,
            @NotBlank @Size(max = 128) String commandCode,
            @Size(max = 1000) String note) {
    }

    record ReceiveLineRequest(
            @NotNull Long returnRequestLineId,
            @NotBlank @Pattern(regexp = "RESTOCK|QUARANTINE|DESTROY") String disposition,
            @Size(max = 1000) String exceptionDescription) {
        ReceiveLineCommand command() {
            return new ReceiveLineCommand(returnRequestLineId, disposition, exceptionDescription);
        }
    }

    record ReceiveRequest(
            long expectedRevision,
            @NotBlank @Size(max = 128) String commandCode,
            @NotNull Long processorPractitionerId,
            @NotNull Long processorAssignmentId,
            @Size(max = 1000) String note,
            @NotNull @Size(min = 1, max = 100) List<@Valid ReceiveLineRequest> lines) {
    }
}
