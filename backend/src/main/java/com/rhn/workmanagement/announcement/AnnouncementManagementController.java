package com.rhn.workmanagement.announcement;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/announcement-management")
@PreAuthorize("hasAuthority('ANNOUNCEMENT.MANAGE')")
public class AnnouncementManagementController {
    private final AnnouncementService service;

    public AnnouncementManagementController(AnnouncementService service) { this.service = service; }

    @GetMapping
    List<AnnouncementView> list(@RequestParam(required = false) String status) {
        return service.managementList(status);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AnnouncementView create(@Valid @RequestBody DraftRequest input) { return service.create(input.command()); }

    @PutMapping("/{id}")
    AnnouncementView update(@PathVariable Long id, @Valid @RequestBody UpdateRequest input) {
        return service.update(id, input.expectedRevision(), input.command());
    }

    @PostMapping("/{id}/publish")
    AnnouncementView publish(@PathVariable Long id, @Valid @RequestBody PublishRequest input) {
        return service.publish(id, new AnnouncementCommands.Publish(
                input.expectedRevision(), input.publishAt(), input.expireAt()));
    }

    @PostMapping("/{id}/withdraw")
    AnnouncementView withdraw(@PathVariable Long id, @Valid @RequestBody RevisionRequest input) {
        return service.withdraw(id, input.expectedRevision());
    }

    record DraftRequest(@NotBlank String scopeType, Long organizationId, Long departmentId,
                        @NotBlank String category, @NotBlank String priority,
                        @NotBlank @Size(max = 200) String title,
                        @NotBlank @Size(max = 500) String summary,
                        @NotBlank @Size(max = 20000) String content, boolean pinned) {
        AnnouncementCommands.Draft command() { return new AnnouncementCommands.Draft(scopeType, organizationId,
                departmentId, category, priority, title, summary, content, pinned); }
    }
    record UpdateRequest(@NotNull Long expectedRevision, @NotBlank String scopeType,
                         Long organizationId, Long departmentId, @NotBlank String category,
                         @NotBlank String priority, @NotBlank @Size(max = 200) String title,
                         @NotBlank @Size(max = 500) String summary,
                         @NotBlank @Size(max = 20000) String content, boolean pinned) {
        AnnouncementCommands.Draft command() { return new AnnouncementCommands.Draft(scopeType, organizationId,
                departmentId, category, priority, title, summary, content, pinned); }
    }
    record PublishRequest(@NotNull Long expectedRevision, Instant publishAt, Instant expireAt) {}
    record RevisionRequest(@NotNull Long expectedRevision) {}
}
