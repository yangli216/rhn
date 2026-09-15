package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.PharmacyViews.WardDeliveryView;
import com.rhn.pharmacy.application.WardDeliveryApplicationService;
import com.rhn.pharmacy.application.WardDeliveryApplicationService.CreateWardDeliveryCommand;
import com.rhn.pharmacy.application.WardDeliveryApplicationService.ReceiptLineCommand;
import com.rhn.pharmacy.application.WardDeliveryApplicationService.ReceiveWardDeliveryCommand;
import com.rhn.pharmacy.application.WardDeliveryApplicationService.ResolveWardDeliveryCommand;
import com.rhn.pharmacy.application.WardDeliveryApplicationService.TransitionCommand;
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
@RequestMapping("/api/pharmacy/ward-deliveries")
public class WardDeliveryController {
    private static final String READ = "hasAnyAuthority('PHARMACY.DISPENSE','INPATIENT.ACCESS','ROLE_ADMIN')";
    private static final String PHARMACY = "hasAnyAuthority('PHARMACY.DISPENSE','ROLE_ADMIN')";
    private static final String WARD = "hasAnyAuthority('INPATIENT.ACCESS','ROLE_ADMIN')";
    private final WardDeliveryApplicationService service;

    public WardDeliveryController(WardDeliveryApplicationService service) { this.service = service; }

    @PostMapping
    @PreAuthorize(PHARMACY)
    @ResponseStatus(HttpStatus.CREATED)
    WardDeliveryView create(@Valid @RequestBody CreateRequest input) {
        return service.create(new CreateWardDeliveryCommand(input.deliveryNo(), input.dispenseIds(), input.note()));
    }

    @GetMapping
    @PreAuthorize(READ)
    List<WardDeliveryView> list(@RequestParam(defaultValue = "OPEN") String status,
                                @RequestParam(required = false) Long nursingUnitDepartmentId,
                                @RequestParam(required = false) Long encounterId) {
        return service.list(status, nursingUnitDepartmentId, encounterId);
    }

    @GetMapping("/{deliveryId}")
    @PreAuthorize(READ)
    WardDeliveryView get(@PathVariable Long deliveryId) { return service.get(deliveryId); }

    @PostMapping("/{deliveryId}/dispatch")
    @PreAuthorize(PHARMACY)
    WardDeliveryView dispatch(@PathVariable Long deliveryId, @Valid @RequestBody TransitionRequest input) {
        return service.dispatch(deliveryId,
                new TransitionCommand(input.expectedRevision(), input.commandCode(), input.note()));
    }

    @PostMapping("/{deliveryId}/receive")
    @PreAuthorize(WARD)
    WardDeliveryView receive(@PathVariable Long deliveryId, @Valid @RequestBody ReceiveRequest input) {
        return service.receive(deliveryId, new ReceiveWardDeliveryCommand(input.expectedRevision(),
                input.commandCode(), input.note(), input.lines().stream().map(ReceiptLineRequest::command).toList()));
    }

    @PostMapping("/{deliveryId}/resolve")
    @PreAuthorize(PHARMACY)
    WardDeliveryView resolve(@PathVariable Long deliveryId, @Valid @RequestBody ResolveRequest input) {
        return service.resolve(deliveryId, new ResolveWardDeliveryCommand(input.expectedRevision(),
                input.commandCode(), input.resolutionCode(), input.note()));
    }

    record CreateRequest(@NotBlank @Size(max = 64) String deliveryNo,
                         @NotNull @Size(min = 1, max = 100) List<@NotNull Long> dispenseIds,
                         @Size(max = 1000) String note) {}

    record TransitionRequest(long expectedRevision, @NotBlank @Size(max = 128) String commandCode,
                             @Size(max = 1000) String note) {}

    record ReceiptLineRequest(@NotNull Long lineId,
                              @NotNull @DecimalMin("0") @Digits(integer = 20, fraction = 8)
                              BigDecimal receivedQuantity,
                              @Pattern(regexp = "SHORTAGE|DAMAGED|WRONG_ITEM|OTHER") String discrepancyCode,
                              @Size(max = 1000) String discrepancyNote) {
        ReceiptLineCommand command() {
            return new ReceiptLineCommand(lineId, receivedQuantity, discrepancyCode, discrepancyNote);
        }
    }

    record ReceiveRequest(long expectedRevision, @NotBlank @Size(max = 128) String commandCode,
                          @Size(max = 1000) String note,
                          @NotNull @Size(min = 1, max = 100) List<@Valid ReceiptLineRequest> lines) {}

    record ResolveRequest(long expectedRevision, @NotBlank @Size(max = 128) String commandCode,
                          @NotBlank @Pattern(regexp = "SUPPLEMENTED|RETURNED_TO_PHARMACY|ACCEPTED_VARIANCE")
                          String resolutionCode,
                          @NotBlank @Size(max = 1000) String note) {}
}
