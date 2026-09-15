package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.scheduling.AppointmentContracts.AppointmentView;
import com.rhn.outpatient.scheduling.AppointmentContracts.CancelAppointmentRequest;
import com.rhn.outpatient.scheduling.AppointmentContracts.CreateAppointmentRequest;
import com.rhn.outpatient.scheduling.AppointmentContracts.RescheduleAppointmentRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/outpatient/appointments")
class AppointmentController {
    private final AppointmentApplicationService service;

    AppointmentController(AppointmentApplicationService service) {
        this.service = service;
    }

    @GetMapping
    List<AppointmentView> list(@RequestParam(required = false) LocalDate dateFrom,
                               @RequestParam(required = false) LocalDate dateTo,
                               @RequestParam(required = false) String status,
                               @RequestParam(required = false) String query) {
        return service.list(dateFrom, dateTo, status, query);
    }

    @GetMapping("/{appointmentId}")
    AppointmentView get(@PathVariable Long appointmentId) {
        return service.get(appointmentId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AppointmentView create(@Valid @RequestBody CreateAppointmentRequest request) {
        return service.create(request);
    }

    @PostMapping("/{appointmentId}/cancel")
    AppointmentView cancel(@PathVariable Long appointmentId,
                           @Valid @RequestBody CancelAppointmentRequest request) {
        return service.cancel(appointmentId, request);
    }

    @PostMapping("/{appointmentId}/reschedule")
    AppointmentView reschedule(@PathVariable Long appointmentId,
                               @Valid @RequestBody RescheduleAppointmentRequest request) {
        return service.reschedule(appointmentId, request);
    }
}
