package com.rhn.portal.workspace;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/portal/workspace")
public class WorkspaceController {
    private final WorkspaceService service;

    public WorkspaceController(WorkspaceService service) {
        this.service = service;
    }

    @GetMapping
    WorkspaceResponse current() {
        return service.current();
    }

    @PutMapping
    WorkspaceResponse update(@Valid @RequestBody UpdateWorkspaceRequest request) {
        return service.update(request);
    }
}
