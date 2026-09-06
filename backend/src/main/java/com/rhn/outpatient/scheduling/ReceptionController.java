package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/outpatient/reception")
class ReceptionController {
    private final RegistrationApplicationService service;

    ReceptionController(RegistrationApplicationService service) {
        this.service = service;
    }

    @GetMapping("/queue")
    @PreAuthorize("hasAnyAuthority('OUTPATIENT_REGISTRATION.ACCESS','OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
    List<ReceptionQueueItem> queue(@RequestParam(required = false) LocalDate date,
                                  @RequestParam(required = false) LocalDate dateFrom,
                                  @RequestParam(required = false) LocalDate dateTo,
                                  @RequestParam(defaultValue = "DEPARTMENT") String scope) {
        boolean organizationScope = organizationScope(scope);
        if (dateFrom != null || dateTo != null) {
            return service.queue(dateFrom, dateTo, organizationScope);
        }
        return service.queue(date, date, organizationScope);
    }

    @GetMapping("/page")
    @PreAuthorize("hasAnyAuthority('OUTPATIENT_REGISTRATION.ACCESS','OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
    RegistrationPageView page(@RequestParam(required = false) LocalDate dateFrom,
                              @RequestParam(required = false) LocalDate dateTo,
                              @RequestParam(required = false) String status,
                              @RequestParam(required = false) String query,
                              @RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "20") int size,
                              @RequestParam(defaultValue = "DEPARTMENT") String scope) {
        return service.page(dateFrom, dateTo, status, query, page, size, organizationScope(scope));
    }

    private boolean organizationScope(String scope) {
        return "ORGANIZATION".equalsIgnoreCase(scope);
    }
}
