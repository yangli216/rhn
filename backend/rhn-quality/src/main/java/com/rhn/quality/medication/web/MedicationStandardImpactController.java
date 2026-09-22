package com.rhn.quality.medication.web;

import com.rhn.platform.masterdata.api.MedicationStandardDependencyDirectory.Scope;
import com.rhn.quality.medication.api.MedicationStandardImpactContracts.Report;
import com.rhn.quality.medication.application.MedicationStandardImpactService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/quality/medication-standard-impact")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationStandardImpactController {
    private final MedicationStandardImpactService service;
    public MedicationStandardImpactController(MedicationStandardImpactService service) {this.service = service;}
    @GetMapping public Report inspect(@RequestParam String catalogId, @RequestParam(required=false) String entryId,
            @RequestParam(required=false) String specificationId, @RequestParam(defaultValue="ALL") String kind,
            @RequestParam(defaultValue="true") boolean includeHistory, @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return service.inspect(new Scope(catalogId,entryId,specificationId),kind,includeHistory,page,size);
    }
}
