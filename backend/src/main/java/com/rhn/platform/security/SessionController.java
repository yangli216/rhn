package com.rhn.platform.security;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.identityaccess.api.WorkContextOption;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/session")
public class SessionController {
    private final ExecutionContextProvider executionContextProvider;
    private final WorkContextDirectory workContextDirectory;

    public SessionController(ExecutionContextProvider executionContextProvider,
                             WorkContextDirectory workContextDirectory) {
        this.executionContextProvider = executionContextProvider;
        this.workContextDirectory = workContextDirectory;
    }

    @GetMapping
    SessionResponse current() {
        ExecutionContext context = executionContextProvider.requireCurrent();
        return new SessionResponse(context.subjectId(), context.actor(), context.tenantId(),
                context.authorities().stream().sorted().toList(),
                workContextDirectory.availableContexts(context.tenantId(), context.subjectId()),
                context.hasWorkContext() ? new ActiveWorkContext(context.organizationId(), context.departmentId()) : null);
    }

    record SessionResponse(Long userId, String username, Long tenantId, List<String> authorities,
                           List<WorkContextOption> workContexts, ActiveWorkContext activeWorkContext) {
    }

    record ActiveWorkContext(Long organizationId, Long departmentId) {
    }
}
