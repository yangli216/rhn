package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import com.rhn.platform.masterdata.application.MedicationRouteService;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/medication-routes")
public class MedicationRouteController {
    private final MedicationRouteService service;
    private final ExecutionContextProvider contextProvider;

    public MedicationRouteController(MedicationRouteService service, ExecutionContextProvider contextProvider) {
        this.service = service;
        this.contextProvider = contextProvider;
    }

    @GetMapping("/active")
    List<RouteSnapshot> active(@RequestParam(defaultValue = "OUTPATIENT") String scene,
                               @RequestParam(required = false) LocalDate businessDate) {
        return service.active(contextProvider.requireCurrent().tenantId(), scene, businessDate);
    }
}
