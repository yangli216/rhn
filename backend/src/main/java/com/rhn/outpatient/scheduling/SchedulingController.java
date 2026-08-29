package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleRequest;
import com.rhn.outpatient.scheduling.SchedulingContracts.QuickScheduleResult;
import com.rhn.outpatient.scheduling.SchedulingContracts.ScheduleView;
import com.rhn.outpatient.scheduling.SchedulingContracts.SchedulingBootstrap;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
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
}
