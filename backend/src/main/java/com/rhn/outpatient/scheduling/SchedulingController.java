package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleResult;
import com.rhn.outpatient.scheduling.SchedulingContracts.ScheduleView;
import com.rhn.outpatient.scheduling.SchedulingContracts.SchedulingBootstrap;
import com.rhn.outpatient.scheduling.SchedulingContracts.ChangeScheduleStatusRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.UpdateScheduleRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.ProfessionalScheduleRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.ProfessionalScheduleResult;
import com.rhn.outpatient.scheduling.SchedulingContracts.ProfessionalTemplateView;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/outpatient/scheduling")
class SchedulingController {
    private final SchedulingApplicationService service;

    SchedulingController(SchedulingApplicationService service) {
        this.service = service;
    }

    @GetMapping("/bootstrap")
    SchedulingBootstrap bootstrap() {
        return service.bootstrap();
    }

    @GetMapping("/schedules")
    List<ScheduleView> schedules(@RequestParam(required = false) LocalDate dateFrom,
                                 @RequestParam(required = false) LocalDate dateTo) {
        return service.list(dateFrom, dateTo);
    }

    @PostMapping("/quick-schedules")
    @ResponseStatus(HttpStatus.CREATED)
    QuickScheduleResult quickCreate(@Valid @RequestBody QuickScheduleRequest request) {
        return service.quickCreate(request);
    }

    @GetMapping("/professional/templates")
    List<ProfessionalTemplateView> professionalTemplates() {
        return service.professionalTemplates();
    }

    @PostMapping("/professional/templates")
    @ResponseStatus(HttpStatus.CREATED)
    ProfessionalScheduleResult createProfessionalTemplate(
            @Valid @RequestBody ProfessionalScheduleRequest request) {
        return service.createProfessionalTemplate(request);
    }

    @PutMapping("/schedules/{scheduleId}")
    ScheduleView update(@PathVariable Long scheduleId, @Valid @RequestBody UpdateScheduleRequest request) {
        return service.update(scheduleId, request);
    }

    @PostMapping("/schedules/{scheduleId}/actions")
    ScheduleView changeStatus(@PathVariable Long scheduleId,
                              @Valid @RequestBody ChangeScheduleStatusRequest request) {
        return service.changeStatus(scheduleId, request);
    }
}
