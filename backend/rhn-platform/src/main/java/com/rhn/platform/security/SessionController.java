package com.rhn.platform.security;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.platform.identityaccess.api.AuthenticationAuditLog;
import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.identityaccess.api.WorkContextOption;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.util.List;

@RestController
@RequestMapping("/api/session")
public class SessionController {
    private final ExecutionContextProvider executionContextProvider;
    private final WorkContextDirectory workContextDirectory;
    private final RefreshLoginSessionService refreshLogin;
    private final SecondFactorPolicy secondFactor;
    private final AuthenticationAuditLog audit;

    public SessionController(ExecutionContextProvider executionContextProvider,
                             WorkContextDirectory workContextDirectory,
                             RefreshLoginSessionService refreshLogin,
                             SecondFactorPolicy secondFactor,
                             AuthenticationAuditLog audit) {
        this.executionContextProvider = executionContextProvider;
        this.workContextDirectory = workContextDirectory;
        this.refreshLogin = refreshLogin;
        this.secondFactor = secondFactor;
        this.audit = audit;
    }

    @GetMapping
    SessionResponse current(HttpServletRequest request, HttpServletResponse response) {
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (refreshLogin.ensureIssued(request, response, context)) {
            // Reaching here with a required second factor means the account is a break-glass exemption.
            String eventType = secondFactor.required(context.tenantId(), context.authorities())
                    ? AuthenticationAuditLog.SECOND_FACTOR_EXEMPTED : AuthenticationAuditLog.LOGIN_SUCCEEDED;
            audit.record(new AuthenticationAuditLog.LoginEvent(context.tenantId(), eventType, context.subjectId(),
                    LoginMethods.PASSWORD, null, null, request.getRemoteAddr()));
        }
        return new SessionResponse(context.subjectId(), context.actor(), context.tenantId(),
                context.authorities().stream().sorted().toList(),
                workContextDirectory.availableContexts(context.tenantId(), context.subjectId()),
                context.hasWorkContext() ? new ActiveWorkContext(context.organizationId(), context.departmentId()) : null,
                refreshLogin.enabled());
    }

    @DeleteMapping
    void logout(HttpServletRequest request, HttpServletResponse response) {
        refreshLogin.invalidateCurrent(request, response, executionContextProvider.requireCurrent().tenantId());
        response.setStatus(HttpServletResponse.SC_NO_CONTENT);
    }

    record SessionResponse(Long userId, String username, Long tenantId, List<String> authorities,
                           List<WorkContextOption> workContexts, ActiveWorkContext activeWorkContext,
                           boolean refreshLoginEnabled) {
    }

    record ActiveWorkContext(Long organizationId, Long departmentId) {
    }
}
