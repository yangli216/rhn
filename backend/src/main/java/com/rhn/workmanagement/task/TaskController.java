package com.rhn.workmanagement.task;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;

    public TaskController(TaskService service) {
        this.service = service;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('TASK.READ')")
    List<TaskResponse> queue() {
        return service.myQueue();
    }

    @GetMapping("/summary")
    @PreAuthorize("hasAuthority('TASK.READ')")
    TaskSummaryResponse summary() {
        return service.summary();
    }

    @PostMapping("/{id}/claim")
    @PreAuthorize("hasAuthority('TASK.MANAGE')")
    TaskResponse claim(@PathVariable Long id) {
        return service.claim(id);
    }

    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('TASK.MANAGE')")
    TaskResponse complete(@PathVariable Long id, @Valid @RequestBody(required = false) CompleteTaskRequest request) {
        return service.complete(id, request == null ? null : request.comment());
    }

    record CompleteTaskRequest(@Size(max = 1000) String comment) {
    }
}
