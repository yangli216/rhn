package com.rhn.platform.cryptography.web;

import com.rhn.platform.cryptography.infrastructure.ca.development.DevelopmentCaAdapter;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.tenant.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * Development-only stand-ins for the phone app and UKey middleware on the login page, before anyone is
 * authenticated. The account must already hold a development certificate (issued after a password login
 * through {@code POST /api/crypto/dev-ca/enrollments}); the UKey stand-in signs login challenges only.
 * Registered with {@code rhn.crypto.ca.development.enabled=true}, which compliance enforcement refuses.
 */
@RestController
@RequestMapping("/api/crypto/dev-ca/public")
@ConditionalOnProperty(prefix = "rhn.crypto.ca.development", name = "enabled", havingValue = "true")
public class DevelopmentCaLoginSimulatorController {
    private static final String LOGIN_CHALLENGE_PREFIX = "RHN-CA-LOGIN-1\n";
    private final DevelopmentCaAdapter adapter;
    private final IdentityAccessDirectory accounts;

    public DevelopmentCaLoginSimulatorController(DevelopmentCaAdapter adapter, IdentityAccessDirectory accounts) {
        this.adapter = adapter;
        this.accounts = accounts;
    }

    @PostMapping("/mobile-logins/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void confirmDevelopmentMobileLogin(@Valid @RequestBody MobileLoginRequest request) {
        String externalSignerId = signer(request.username());
        try {
            adapter.confirmLogin(externalRequestId(request.qrContent()), externalSignerId);
        } catch (IllegalStateException exception) {
            throw conflict("CA_DEVELOPMENT_LOGIN_UNAVAILABLE", "该二维码已失效或已处理");
        }
    }

    @PostMapping("/mobile-logins/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void rejectDevelopmentMobileLogin(@Valid @RequestBody MobileLoginRequest request) {
        try {
            adapter.rejectLogin(externalRequestId(request.qrContent()));
        } catch (IllegalStateException exception) {
            throw conflict("CA_DEVELOPMENT_LOGIN_UNAVAILABLE", "该二维码已失效或已处理");
        }
    }

    /** Simulates the UKey middleware signing a login challenge with the account's development key. */
    @PostMapping("/token-signatures")
    DevelopmentCaAdapter.ClientSigned signDevelopmentLoginChallenge(@Valid @RequestBody TokenSignatureRequest request) {
        byte[] toBeSigned;
        try {
            toBeSigned = Base64.getDecoder().decode(request.toBeSigned());
        } catch (IllegalArgumentException exception) {
            throw badRequest("CA_DEVELOPMENT_CHALLENGE_INVALID", "待签数据格式无效");
        }
        if (!new String(toBeSigned, StandardCharsets.UTF_8).startsWith(LOGIN_CHALLENGE_PREFIX)) {
            throw badRequest("CA_DEVELOPMENT_CHALLENGE_INVALID", "开发 UKey 只签登录挑战");
        }
        return adapter.signLocally(signer(request.username()), toBeSigned);
    }

    private String signer(String username) {
        Long userId = accounts.findActiveAccount(TenantContext.requireTenantId(), username)
                .orElseThrow(() -> conflict("CA_DEVELOPMENT_ACCOUNT_UNAVAILABLE", "账号不存在或已停用"))
                .id();
        return adapter.issuedSigner(userId).orElseThrow(() -> conflict("CA_SIGNER_NOT_ENROLLED",
                "该账号尚未签发开发证书：请先用口令登录，在“我的 CA 证书”中签发后再试"));
    }

    private static String externalRequestId(String qrContent) {
        if (!qrContent.startsWith(DevelopmentCaAdapter.LOGIN_QR_PREFIX)) {
            throw badRequest("CA_DEVELOPMENT_QR_INVALID", "不是开发 CA 登录二维码");
        }
        return qrContent.substring(DevelopmentCaAdapter.LOGIN_QR_PREFIX.length());
    }

    record MobileLoginRequest(@NotBlank @Size(max = 200) String qrContent, @Size(max = 100) String username) {}

    record TokenSignatureRequest(@NotBlank @Size(max = 100) String username,
                                 @NotBlank @Size(max = 4096) String toBeSigned) {}
}
