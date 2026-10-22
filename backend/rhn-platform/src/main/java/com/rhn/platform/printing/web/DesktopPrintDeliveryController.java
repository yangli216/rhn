package com.rhn.platform.printing.web;

import com.rhn.platform.printing.application.DesktopPrintDeliveryService;
import com.rhn.platform.printing.application.DesktopPrintDeliveryService.DesktopPrintDeliveryView;
import com.rhn.platform.printing.application.DesktopPrintDeliveryService.DesktopPrintDispatchView;
import com.rhn.platform.printing.application.DesktopPrintDeliveryService.Outcome;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** RHN Link 工作站打印的分发、结果回报、人工核对与浏览器回退。 */
@RestController
@RequestMapping("/api/platform/printing/deliveries/{deliveryId}")
public class DesktopPrintDeliveryController {
    private final DesktopPrintDeliveryService service;

    public DesktopPrintDeliveryController(DesktopPrintDeliveryService service) { this.service = service; }

    @PostMapping("/desktop-dispatches")
    DesktopPrintDispatchView dispatchDesktopPrint(@PathVariable Long deliveryId, @Valid @RequestBody DesktopDispatchRequest request) {
        return service.dispatch(deliveryId, request.expectedRevision(), request.operationId());
    }

    @PostMapping("/desktop-results")
    DesktopPrintDeliveryView reportDesktopPrintResult(@PathVariable Long deliveryId, @Valid @RequestBody DesktopResultRequest request) {
        return service.report(deliveryId, request.expectedRevision(), request.operationId(), request.outcome(),
                request.systemJobNo(), request.resultCode());
    }

    @PostMapping("/reconciliations")
    DesktopPrintDeliveryView reconcileDesktopPrint(@PathVariable Long deliveryId, @Valid @RequestBody DesktopReconcileRequest request) {
        return service.reconcile(deliveryId, request.expectedRevision(), request.printed(), request.note());
    }

    @PostMapping("/browser-fallbacks")
    DesktopPrintDeliveryView fallBackDesktopPrintToBrowser(@PathVariable Long deliveryId, @Valid @RequestBody DesktopRevisionRequest request) {
        return service.fallBackToBrowser(deliveryId, request.expectedRevision());
    }

    record DesktopDispatchRequest(@Min(0) long expectedRevision, @NotBlank @Size(max = 36) String operationId) {}
    record DesktopResultRequest(@Min(0) long expectedRevision, @NotBlank @Size(max = 36) String operationId,
            @NotNull Outcome outcome, @Size(max = 20) String systemJobNo, @Size(max = 80) String resultCode) {}
    record DesktopReconcileRequest(@Min(0) long expectedRevision, boolean printed, @Size(max = 500) String note) {}
    record DesktopRevisionRequest(@Min(0) long expectedRevision) {}
}
