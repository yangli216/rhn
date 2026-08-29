package com.rhn.outpatient.scheduling;

import com.rhn.outpatient.api.OutpatientRegistrationDirectory.ReceptionQueueItem;
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
    List<ReceptionQueueItem> queue(@RequestParam(required = false) LocalDate date) {
        return service.queue(date);
    }
}
