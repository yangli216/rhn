package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/encounters/{encounterId}/order-submissions")
class OrderSubmissionController {
    private final OrderSubmissionService service;
    OrderSubmissionController(OrderSubmissionService service) { this.service = service; }

    @PostMapping
    @io.swagger.v3.oas.annotations.Operation(operationId = "submitOutpatientOrders")
    OrderSubmissionResponse submit(@PathVariable Long encounterId, @Valid @RequestBody OrderSubmissionRequest input) {
        return service.submit(encounterId, input);
    }
}
