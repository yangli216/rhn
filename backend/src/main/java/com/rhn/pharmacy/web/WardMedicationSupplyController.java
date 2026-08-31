package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyBatchView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyLineView;
import com.rhn.pharmacy.api.WardMedicationSupplyViews.SupplyFulfillmentView;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.GenerateCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.IntakeCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.BatchIntakeCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.BatchIntakeLineCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.BatchReviewReserveCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.BatchPickingCommand;
import com.rhn.pharmacy.application.WardMedicationSupplyApplicationService.BatchDispenseDeliveryCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy")
@PreAuthorize(com.rhn.pharmacy.api.PharmacyPermissions.PHARMACY_DISPENSE)
public class WardMedicationSupplyController {
    private final WardMedicationSupplyApplicationService service;

    public WardMedicationSupplyController(WardMedicationSupplyApplicationService service) {
        this.service = service;
    }

    @PostMapping("/ward-supply-batches")
    @ResponseStatus(HttpStatus.CREATED)
    SupplyBatchView generate(@Valid @RequestBody GenerateRequest input) {
        return service.generate(new GenerateCommand(input.stockSiteId(), input.nursingUnitDepartmentId(),
                input.businessDate(), input.shiftCode(), input.commandCode()));
    }

    @GetMapping("/ward-supply-batches")
    List<SupplyBatchView> list(@RequestParam Long stockSiteId,
                               @RequestParam Long nursingUnitDepartmentId,
                               @RequestParam(required = false) LocalDate businessDate,
                               @RequestParam(defaultValue = "DAY") String shiftCode) {
        return service.list(stockSiteId, nursingUnitDepartmentId, businessDate, shiftCode);
    }

    @GetMapping("/ward-supply-batches/{batchId}")
    SupplyBatchView get(@PathVariable Long batchId) {
        return service.get(batchId);
    }

    @PostMapping("/ward-supply-lines/{lineId}/intake")
    @ResponseStatus(HttpStatus.CREATED)
    SupplyLineView intake(@PathVariable Long lineId, @Valid @RequestBody IntakeRequest input) {
        return service.intake(lineId, new IntakeCommand(input.stockItemId(), input.description()));
    }

    @PostMapping("/ward-supply-batches/{batchId}/intake")
    SupplyBatchView intakeBatch(@PathVariable Long batchId, @Valid @RequestBody BatchIntakeRequest input) {
        return service.intakeBatch(batchId, new BatchIntakeCommand(input.lines().stream()
                .map(value -> new BatchIntakeLineCommand(value.lineId(), value.stockItemId())).toList(),
                input.description()));
    }

    @PostMapping("/ward-supply-batches/{batchId}/review-reserve")
    SupplyBatchView reviewAndReserveBatch(@PathVariable Long batchId,
                                          @Valid @RequestBody BatchReviewReserveRequest input) {
        return service.reviewAndReserveBatch(batchId, new BatchReviewReserveCommand(
                input.pharmacistPractitionerId(), input.reviewerAssignmentId(),
                input.expiryMinutes(), input.description()));
    }

    @PostMapping("/ward-supply-batches/{batchId}/picking/complete")
    SupplyBatchView completePickingBatch(@PathVariable Long batchId,
                                         @Valid @RequestBody BatchPickingRequest input) {
        return service.completePickingBatch(batchId, new BatchPickingCommand(
                input.pickerPractitionerId(), input.pickerAssignmentId(), input.description()));
    }

    @PostMapping("/ward-supply-batches/{batchId}/dispense-deliveries")
    SupplyFulfillmentView dispenseAndCreateDeliveries(@PathVariable Long batchId,
                                                       @Valid @RequestBody BatchDispenseDeliveryRequest input) {
        return service.dispenseAndCreateDeliveries(batchId, new BatchDispenseDeliveryCommand(
                input.dispenserPractitionerId(), input.dispenserAssignmentId(),
                input.checkerPractitionerId(), input.checkerAssignmentId(), input.description()));
    }

    record GenerateRequest(
            @NotNull Long stockSiteId,
            @NotNull Long nursingUnitDepartmentId,
            @NotNull LocalDate businessDate,
            @NotBlank @Pattern(regexp = "NIGHT|DAY|EVENING") String shiftCode,
            @NotBlank @Size(max = 128) String commandCode) {
    }

    record IntakeRequest(@NotNull Long stockItemId, @Size(max = 1000) String description) {
    }

    record BatchIntakeRequest(
            @NotNull @Size(min = 1, max = 500) List<@NotNull @Valid BatchIntakeLineRequest> lines,
            @Size(max = 1000) String description) {
    }

    record BatchIntakeLineRequest(@NotNull Long lineId, @NotNull Long stockItemId) {
    }

    record BatchReviewReserveRequest(
            @NotNull Long pharmacistPractitionerId,
            @NotNull Long reviewerAssignmentId,
            @Min(1) @Max(1440) Integer expiryMinutes,
            @Size(max = 1000) String description) {
    }

    record BatchPickingRequest(
            @NotNull Long pickerPractitionerId,
            @NotNull Long pickerAssignmentId,
            @Size(max = 1000) String description) {
    }

    record BatchDispenseDeliveryRequest(
            @NotNull Long dispenserPractitionerId,
            @NotNull Long dispenserAssignmentId,
            Long checkerPractitionerId,
            Long checkerAssignmentId,
            @Size(max = 1000) String description) {
    }
}
