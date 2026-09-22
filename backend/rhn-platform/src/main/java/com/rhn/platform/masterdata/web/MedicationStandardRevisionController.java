package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MedicationStandardRevisionContracts.*;
import com.rhn.platform.masterdata.application.MedicationStandardRevisionService;
import com.rhn.platform.masterdata.application.MedicationStandardRevisionService.Preview;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform/master-data/medications/{id}/standard-revision")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationStandardRevisionController {
    private final MedicationStandardRevisionService service;
    public MedicationStandardRevisionController(MedicationStandardRevisionService service) {this.service=service;}
    @GetMapping public Preview preview(@PathVariable Long id,@RequestParam(defaultValue="0") int historyPage) {return service.preview(id,historyPage);}
    @GetMapping("/impact") public ImpactSnapshot impact(@PathVariable Long id,@RequestParam String specificationId) {return service.impact(id,specificationId);}
    @PostMapping public Preview submit(@PathVariable Long id,@RequestBody Submit input) {return service.submit(id,input);}
    @PostMapping("/review") public Preview review(@PathVariable Long id,@RequestBody Review input) {return service.review(id,input);}
}
