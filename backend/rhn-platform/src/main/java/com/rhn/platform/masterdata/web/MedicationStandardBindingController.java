package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.application.MedicationStandardBindingService;
import com.rhn.platform.masterdata.application.MedicationStandardBindingService.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform/master-data/medications/{id}/standard-binding")
public class MedicationStandardBindingController {
    private final MedicationStandardBindingService service;
    public MedicationStandardBindingController(MedicationStandardBindingService service) { this.service = service; }
    @GetMapping public Preview preview(@PathVariable Long id) { return service.preview(id); }
    @PostMapping @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public Preview bind(@PathVariable Long id, @RequestBody Bind input) { return service.bind(id, input); }
}
