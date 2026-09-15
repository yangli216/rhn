package com.rhn.platform.printing.web;

import com.rhn.platform.printing.application.ClinicalPrintBatchService;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.BatchView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.AcknowledgementView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.BindingView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.BridgeJobView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.DeviceView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.DeviceManagementView;
import com.rhn.platform.printing.application.ClinicalPrintBatchService.PreparationView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform/printing")
@PreAuthorize("hasAnyAuthority('TREATMENT.ACCESS','ROLE_ADMIN')")
public class ClinicalPrintBatchController {
    private final ClinicalPrintBatchService service;

    public ClinicalPrintBatchController(ClinicalPrintBatchService service) { this.service = service; }

    @GetMapping("/batches/candidates")
    PreparationView candidates(@RequestParam(defaultValue = "ORAL_MEDICATION_CARD") String documentType,
                               @RequestParam(required = false) String keyword,
                               @RequestParam(required = false) Long mediaProfileId) {
        return service.candidates(documentType, keyword, mediaProfileId);
    }

    @GetMapping("/batches")
    List<BatchView> batches() { return service.list(); }

    @GetMapping("/batches/{batchId}")
    BatchView batch(@PathVariable Long batchId) { return service.detail(batchId); }

    @PostMapping("/batches")
    BatchView create(@Valid @RequestBody CreateBatchRequest request) {
        return service.create(new ClinicalPrintBatchService.CreateBatchCommand(request.documentType(),
                request.sourceIds(), request.mediaProfileId(), request.deviceId(), request.idempotencyKey(),
                request.layoutStrategy(), request.startSlot(), request.reprintReason()));
    }

    @PostMapping("/batches/{batchId}/dispatch")
    BatchView dispatch(@PathVariable Long batchId, @RequestBody(required = false) DispatchRequest request) {
        return service.dispatch(batchId, request == null ? null : request.deviceId());
    }

    @GetMapping("/devices")
    List<DeviceView> devices() { return service.devices(); }

    @GetMapping("/device-management")
    DeviceManagementView deviceManagement() { return service.deviceManagement(); }

    @PostMapping("/devices")
    DeviceView createDevice(@Valid @RequestBody DeviceRequest request) {
        return service.createDevice(request.command());
    }

    @PutMapping("/devices/{deviceId}")
    DeviceView updateDevice(@PathVariable Long deviceId, @Valid @RequestBody DeviceRequest request) {
        return service.updateDevice(deviceId, request.command());
    }

    @PostMapping("/device-bindings")
    BindingView bind(@Valid @RequestBody BindingRequest request) {
        return service.bind(new ClinicalPrintBatchService.BindingCommand(request.expectedRevision(),
                request.documentType(), request.mediaProfileId(), request.deviceId()));
    }

    @PostMapping("/bridge/devices/{deviceCode}/heartbeat")
    ResponseEntity<Void> heartbeat(@PathVariable String deviceCode) {
        service.heartbeat(deviceCode);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/bridge/devices/{deviceCode}/jobs/claim")
    ResponseEntity<BridgeJobView> claim(@PathVariable String deviceCode) {
        BridgeJobView job = service.claim(deviceCode);
        return job == null ? ResponseEntity.noContent().build() : ResponseEntity.ok(job);
    }

    @PostMapping("/bridge/deliveries/{deliveryId}/acknowledgements")
    AcknowledgementView acknowledge(@PathVariable Long deliveryId, @Valid @RequestBody AcknowledgeRequest request) {
        return service.acknowledge(deliveryId, request.expectedRevision(), request.status(),
                request.errorCode(), request.errorMessage());
    }

    public record CreateBatchRequest(@NotBlank String documentType, @NotEmpty List<@NotNull Long> sourceIds,
            Long mediaProfileId, Long deviceId, @NotBlank @Size(max = 128) String idempotencyKey, String layoutStrategy,
            @Min(1) Integer startSlot, @Size(max = 500) String reprintReason) {}
    public record DispatchRequest(Long deviceId) {}
    public record DeviceRequest(@Min(0) long expectedRevision, @NotBlank @Size(max = 80) String deviceCode,
            @NotBlank @Size(max = 200) String deviceName, @NotBlank String channel,
            @NotBlank String outputLanguage, @Size(max = 200) String queueName,
            @Size(max = 20000) String capabilitiesJson, String status) {
        ClinicalPrintBatchService.DeviceCommand command() {
            return new ClinicalPrintBatchService.DeviceCommand(expectedRevision, deviceCode, deviceName,
                    channel, outputLanguage, queueName, capabilitiesJson, status);
        }
    }
    public record BindingRequest(@Min(0) long expectedRevision, @NotBlank String documentType,
            @NotNull Long mediaProfileId, @NotNull Long deviceId) {}
    public record AcknowledgeRequest(@Min(0) long expectedRevision, @NotBlank String status,
            @Size(max = 80) String errorCode, @Size(max = 1000) String errorMessage) {}
}
