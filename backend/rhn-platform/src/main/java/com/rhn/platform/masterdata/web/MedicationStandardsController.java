package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.*;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/clinical-semantics")
public class MedicationStandardsController {
    private final ExecutionContextProvider contexts;
    private final MedicationRouteDirectory routes;
    private final OrderFrequencyDirectory frequencies;
    public MedicationStandardsController(ExecutionContextProvider contexts, MedicationRouteDirectory routes, OrderFrequencyDirectory frequencies) {
        this.contexts = contexts; this.routes = routes; this.frequencies = frequencies;
    }
    @GetMapping("/standards")
    public MedicationStandardsView standards() {
        var context = contexts.requireCurrent(); var date = LocalDate.now();
        return new MedicationStandardsView(ClinicalMedicationStandards.VERSION, ClinicalDoseUnits.vocabulary(),
                routes.active(context.tenantId(), "MASTER_DATA", date),
                frequencies.active(context.tenantId(), context.organizationId(), context.departmentId(), "OUTPATIENT", "MEDICATION", date)
                        .stream().map(f -> new StandardFrequencyView(f.id(), f.code(), f.name(), ClinicalMedicationStandards.frequency(f))).toList());
    }
    public record StandardFrequencyView(Long id, String code, String name, ClinicalMedicationStandards.StandardFrequency standard) {}
    public record MedicationStandardsView(String version, List<ClinicalDoseUnits.Unit> doseUnits,
            List<MedicationRouteDirectory.RouteSnapshot> routes, List<StandardFrequencyView> frequencies) {}
}
