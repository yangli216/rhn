package com.rhn.workmanagement.announcement;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/announcements")
@PreAuthorize("hasAuthority('ANNOUNCEMENT.READ')")
public class AnnouncementController {
    private final AnnouncementService service;

    public AnnouncementController(AnnouncementService service) { this.service = service; }

    @GetMapping
    List<AnnouncementView> active() { return service.active(); }

    @GetMapping("/summary")
    AnnouncementSummary summary() { return service.summary(); }

    @PostMapping("/{id}/read")
    AnnouncementView markRead(@PathVariable Long id) { return service.markRead(id); }
}
