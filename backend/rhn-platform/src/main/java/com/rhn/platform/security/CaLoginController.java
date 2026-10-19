package com.rhn.platform.security;

import com.rhn.platform.cryptography.api.CaLoginService;
import com.rhn.platform.cryptography.api.CaLoginService.Outcome;
import com.rhn.platform.cryptography.api.CaLoginService.State;
import com.rhn.platform.identityaccess.api.AuthenticationAuditLog;
import com.rhn.platform.identityaccess.api.AuthenticationAuditLog.LoginEvent;
import com.rhn.platform.identityaccess.api.AuthenticatedAccount;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.api.BusinessException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.Optional;
import java.util.regex.Pattern;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * Optional CA login (phone app QR code or UKey) and the CA second factor after a password. Anonymous
 * requests log in directly; requests carrying password credentials step up that account and fail when
 * the CA proof belongs to someone else. Both issue the refresh-login session, so they need
 * {@code rhn.security.refresh-login.enabled}. Password login is always kept.
 */
@RestController
@RequestMapping("/api/session/ca-login")
public class CaLoginController {
    private static final String NONCE_COOKIE = "RHN_CA_LOGIN";
    private static final Pattern VALID_NONCE = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final Duration NONCE_TTL = Duration.ofMinutes(10);

    private final CaLoginService caLogin;
    private final RefreshLoginSessionService refreshLogin;
    private final IdentityAccessDirectory accounts;
    private final AuthenticationAuditLog audit;
    private final SecureRandom random = new SecureRandom();

    public CaLoginController(CaLoginService caLogin, RefreshLoginSessionService refreshLogin,
                             IdentityAccessDirectory accounts, AuthenticationAuditLog audit) {
        this.caLogin = caLogin;
        this.refreshLogin = refreshLogin;
        this.accounts = accounts;
        this.audit = audit;
    }

    @GetMapping("/options")
    CaLoginOptions caLoginOptions() {
        if (!refreshLogin.enabled()) return new CaLoginOptions(false, false, null);
        CaLoginService.Methods methods = caLogin.methods(TenantContext.requireTenantId());
        return new CaLoginOptions(methods.mobile(), methods.certificate(), methods.vendorCode());
    }

    @PostMapping("/mobile")
    CaLoginService.MobileChallenge startMobileLogin(HttpServletRequest request, HttpServletResponse response) {
        requireSessions();
        return caLogin.startMobile(TenantContext.requireTenantId(), nonce(request, response));
    }

    @GetMapping("/mobile/{loginRequestId}")
    CaLoginResult pollMobileLogin(@PathVariable String loginRequestId, HttpServletRequest request,
                                  HttpServletResponse response) {
        requireSessions();
        Long tenantId = TenantContext.requireTenantId();
        return complete(caLogin.pollMobile(tenantId, loginRequestId, existingNonce(request)), request, response);
    }

    @PostMapping("/certificate-challenges")
    CaLoginService.CertificateChallenge startCertificateLogin(HttpServletRequest request, HttpServletResponse response) {
        requireSessions();
        return caLogin.certificateChallenge(TenantContext.requireTenantId(), nonce(request, response));
    }

    @PostMapping("/certificate")
    CaLoginResult completeCertificateLogin(@Valid @RequestBody CertificateLoginRequest body,
                                           HttpServletRequest request, HttpServletResponse response) {
        requireSessions();
        Long tenantId = TenantContext.requireTenantId();
        return complete(caLogin.verifyCertificate(tenantId, body.challengeId(), existingNonce(request),
                body.signatureValue(), body.certificate()), request, response);
    }

    private CaLoginResult complete(Outcome outcome, HttpServletRequest request, HttpServletResponse response) {
        Long tenantId = TenantContext.requireTenantId();
        Optional<Long> password = passwordAuthenticated(request, tenantId);
        String method = password.isPresent() ? LoginMethods.withPassword(outcome.method()) : outcome.method();
        if (outcome.state() == State.PENDING) return CaLoginResult.of(outcome);
        if (outcome.state() != State.CONFIRMED) {
            if (outcome.state() != State.EXPIRED) {
                record(request, tenantId, AuthenticationAuditLog.LOGIN_FAILED,
                        password.orElse(null), method, outcome.vendorCode(),
                        outcome.failureCode());
            }
            return CaLoginResult.of(outcome);
        }
        if (password.isPresent() && !password.get().equals(outcome.userId())) {
            return failed(request, tenantId, password.get(), method, outcome.vendorCode(),
                    "CA_LOGIN_SECOND_FACTOR_MISMATCH", "扫码或证书对应的账号与口令登录账号不一致");
        }
        Optional<AuthenticatedAccount> account = activeAccount(tenantId, outcome.userId());
        if (account.isEmpty()) {
            return failed(request, tenantId, outcome.userId(), method, outcome.vendorCode(),
                    "CA_LOGIN_ACCOUNT_INACTIVE", "绑定的账号不存在或已停用");
        }
        refreshLogin.issue(request, response, tenantId, account.get().id(), account.get().username(), method);
        record(request, tenantId, AuthenticationAuditLog.LOGIN_SUCCEEDED, account.get().id(), method,
                outcome.vendorCode(), null);
        return new CaLoginResult(State.CONFIRMED, null, null);
    }

    private CaLoginResult failed(HttpServletRequest request, Long tenantId, Long userId, String method,
                                 String vendorCode, String code, String message) {
        record(request, tenantId, AuthenticationAuditLog.LOGIN_FAILED, userId, method, vendorCode, code);
        return new CaLoginResult(State.FAILED, code, message);
    }

    private Optional<AuthenticatedAccount> activeAccount(Long tenantId, Long userId) {
        try {
            var reference = accounts.requireAccount(tenantId, userId);
            return accounts.findActiveAccount(tenantId, reference.username())
                    .filter(value -> value.id().equals(userId));
        } catch (BusinessException exception) {
            return Optional.empty();
        }
    }

    /** Account behind password credentials on this request (HTTP Basic), as opposed to an existing session. */
    private Optional<Long> passwordAuthenticated(HttpServletRequest request, Long tenantId) {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || authentication instanceof AnonymousAuthenticationToken
                || request.getAttribute(RefreshLoginAuthenticationFilter.SESSION_ATTRIBUTE) != null) {
            return Optional.empty();
        }
        if (authentication.getPrincipal() instanceof RhnUserDetails principal) return Optional.of(principal.userId());
        // Development in-memory users resolve to their account by name, as the execution context does.
        Optional<Long> account = accounts.findActiveAccount(tenantId, authentication.getName()).map(AuthenticatedAccount::id);
        if (account.isEmpty()) throw conflict("CA_LOGIN_ACCOUNT_INACTIVE", "口令登录账号不存在或已停用");
        return account;
    }

    private void record(HttpServletRequest request, Long tenantId, String eventType, Long userId, String method,
                        String vendorCode, String failureCode) {
        audit.record(new LoginEvent(tenantId, eventType, userId, method, vendorCode, failureCode,
                request.getRemoteAddr()));
    }

    private void requireSessions() {
        if (!refreshLogin.enabled()) {
            throw conflict("CA_LOGIN_REQUIRES_SESSION", "扫码和证书登录需要开启会话登录，请联系管理员");
        }
    }

    private String nonce(HttpServletRequest request, HttpServletResponse response) {
        String existing = existingNonce(request);
        if (existing != null) return existing;
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        response.addHeader(HttpHeaders.SET_COOKIE, ResponseCookie.from(NONCE_COOKIE, value)
                .httpOnly(true).secure(refreshLogin.cookieSecure()).sameSite("Strict")
                .path(SecondFactorFilter.CA_LOGIN_PATH).maxAge(NONCE_TTL).build().toString());
        return value;
    }

    private static String existingNonce(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie cookie : cookies) {
            if (NONCE_COOKIE.equals(cookie.getName()) && cookie.getValue() != null
                    && VALID_NONCE.matcher(cookie.getValue()).matches()) {
                return cookie.getValue();
            }
        }
        return null;
    }

    record CaLoginOptions(boolean mobile, boolean certificate, String vendorCode) {}

    record CaLoginResult(State state, String failureCode, String failureMessage) {
        static CaLoginResult of(Outcome outcome) {
            return new CaLoginResult(outcome.state(), outcome.failureCode(), outcome.failureMessage());
        }
    }

    record CertificateLoginRequest(@NotBlank @Size(max = 64) String challengeId,
                                   @NotBlank @Size(max = 4096) String signatureValue,
                                   @NotBlank @Size(max = 16384) String certificate) {}
}
