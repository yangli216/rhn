package com.rhn.outpatient.ordering;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/encounters/{encounterId}/order-drafts")
class OrderDraftController {
    private final OrderDraftSaveService service;
    OrderDraftController(OrderDraftSaveService service) { this.service = service; }

    @PostMapping
    @io.swagger.v3.oas.annotations.Operation(operationId = "saveOutpatientOrderDrafts")
    OrderDraftSaveResponse save(@PathVariable Long encounterId, @Valid @RequestBody OrderDraftSaveRequest input) {
        return service.save(encounterId, input);
    }
}
