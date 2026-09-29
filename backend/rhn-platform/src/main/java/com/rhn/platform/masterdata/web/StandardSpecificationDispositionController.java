package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.StandardSpecificationDisposition.*;
import com.rhn.platform.masterdata.application.StandardSpecificationDispositionService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform/master-data/medication-standard-catalog/specification-dispositions")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class StandardSpecificationDispositionController {
    private final StandardSpecificationDispositionService service;

    public StandardSpecificationDispositionController(StandardSpecificationDispositionService service) {
        this.service = service;
    }

    @GetMapping
    public View view() { return service.view(); }

    @PostMapping("/{specificationId}")
    public Event change(@PathVariable String specificationId, @RequestBody Change input) {
        return service.change(specificationId, input);
    }
}
