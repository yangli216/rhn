package com.rhn.workmanagement.notification;

import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/notifications")
@PreAuthorize("hasAuthority('NOTIFICATION.READ') or hasRole('CLINICIAN')")
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping
    List<NotificationResponse> inbox() {
        return service.inbox();
    }

    @GetMapping("/summary")
    NotificationSummaryResponse summary() {
        return service.summary();
    }

    @PostMapping("/{id}/read")
    NotificationResponse markRead(@PathVariable Long id) {
        return service.markRead(id);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void archive(@PathVariable Long id) {
        service.archive(id);
    }
}
