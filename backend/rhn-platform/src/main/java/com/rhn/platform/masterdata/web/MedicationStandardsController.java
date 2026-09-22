package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.*;
import com.rhn.platform.masterdata.application.MedicationStandardReadinessService;
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
    private final MedicationStandardReadinessService readiness;
    public MedicationStandardsController(ExecutionContextProvider contexts, MedicationRouteDirectory routes, OrderFrequencyDirectory frequencies,
            MedicationStandardReadinessService readiness) {
        this.contexts = contexts; this.routes = routes; this.frequencies = frequencies;
        this.readiness = readiness;
    }
    @GetMapping("/readiness")
    public MedicationStandardReadinessService.Readiness readiness(@RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "ALL") String filter, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return readiness.inspect(contexts.requireCurrent().tenantId(), query, filter, page, size);
    }
    @GetMapping("/standards")
    public MedicationStandardsView standards() {
        var context = contexts.requireCurrent(); var date = LocalDate.now();
        return new MedicationStandardsView(ClinicalMedicationStandards.VERSION, ClinicalDoseUnits.vocabulary(),
                routes.active(context.tenantId(), "MASTER_DATA", date),
                frequencies.active(context.tenantId(), context.organizationId(), context.departmentId(), "OUTPATIENT", "MEDICATION", date)
                        .stream().map(f -> new StandardFrequencyView(f.id(), f.code(), f.name(), ClinicalMedicationStandards.frequency(f), ClinicalFrequencySchedule.capability(f))).toList());
    }
    public record StandardFrequencyView(Long id, String code, String name, ClinicalMedicationStandards.StandardFrequency standard, ClinicalFrequencySchedule.Capability scheduleCapability) {}
    public record MedicationStandardsView(String version, List<ClinicalDoseUnits.Unit> doseUnits,
            List<MedicationRouteDirectory.RouteSnapshot> routes, List<StandardFrequencyView> frequencies) {}
}
