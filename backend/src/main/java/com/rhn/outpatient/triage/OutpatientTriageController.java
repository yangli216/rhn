package com.rhn.outpatient.triage;

import com.rhn.outpatient.triage.TriageContracts.CreateTriageRequest;
import com.rhn.outpatient.triage.TriageContracts.DepartmentRecommendationResponse;
import com.rhn.outpatient.triage.TriageContracts.PendingEncounterResponse;
import com.rhn.outpatient.triage.TriageContracts.TriageRecordResponse;
import com.rhn.outpatient.triage.TriageContracts.TriageStatisticsResponse;
import com.rhn.outpatient.triage.TriageContracts.UpdateTriageRequest;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/outpatient/triage")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_REGISTRATION.ACCESS','OUTPATIENT_RECEPTION.ACCESS','OUTPATIENT_TRIAGE.ACCESS','ROLE_ADMIN')")
public class OutpatientTriageController {

    private final OutpatientTriageService triageService;

    public OutpatientTriageController(OutpatientTriageService triageService) {
        this.triageService = triageService;
    }

    @PostMapping
    public TriageRecordResponse createTriage(@Valid @RequestBody CreateTriageRequest request) {
        return triageService.createTriageRecord(request);
    }

    @PutMapping("/{id}")
    public TriageRecordResponse updateTriage(@PathVariable Long id, @Valid @RequestBody UpdateTriageRequest request) {
        return triageService.updateTriageRecord(id, request);
    }

    @GetMapping("/{id}")
    public TriageRecordResponse getTriage(@PathVariable Long id) {
        return triageService.getTriageRecord(id);
    }

    @GetMapping("/by-encounter/{encounterId}")
    public TriageRecordResponse getTriageByEncounter(@PathVariable Long encounterId) {
        return triageService.getTriageRecordByEncounter(encounterId);
    }

    @GetMapping
    public Page<TriageRecordResponse> search(
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) String triageLevel,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        int pageIndex = Math.max(0, page);
        int pageSize = Math.min(100, Math.max(1, size));
        return triageService.searchTriageRecords(organizationId, date, triageLevel, status, query, PageRequest.of(pageIndex, pageSize));
    }

    @GetMapping("/statistics")
    public TriageStatisticsResponse statistics(
            @RequestParam(required = false) Long organizationId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return triageService.todayStatistics(organizationId, date);
    }

    @GetMapping("/pending-encounters")
    public List<PendingEncounterResponse> pendingEncounters(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return triageService.listPendingEncounters(date);
    }

    @GetMapping("/recommend-departments")
    public List<DepartmentRecommendationResponse> recommendDepartments(
            @RequestParam(required = false) String chiefComplaint,
            @RequestParam(required = false) String symptoms,
            @RequestParam(required = false) BigDecimal temperature,
            @RequestParam(required = false) BigDecimal systolic,
            @RequestParam(required = false) BigDecimal diastolic,
            @RequestParam(required = false) BigDecimal oxygenSaturation,
            @RequestParam(required = false) BigDecimal pulseRate,
            @RequestParam(required = false) Integer age,
            @RequestParam(required = false) String gender
    ) {
        return triageService.recommendDepartments(
                chiefComplaint, symptoms, temperature, systolic, diastolic, oxygenSaturation, pulseRate, age, gender
        );
    }

    @PostMapping("/{id}/bind-encounter")
    public TriageRecordResponse bindEncounter(
            @PathVariable Long id,
            @RequestParam Long encounterId,
            @RequestParam(required = false) Long registrationId
    ) {
        return triageService.bindEncounter(id, encounterId, registrationId);
    }
}
