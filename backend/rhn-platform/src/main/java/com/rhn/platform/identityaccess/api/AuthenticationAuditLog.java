package com.rhn.platform.identityaccess.api;

/**
 * Login outcomes in the identity audit trail ({@code RHN_AUD_IAM_AUTH_EVT}). Details never carry
 * passwords, certificates, signature values or challenge content.
 */
public interface AuthenticationAuditLog {
    String LOGIN_SUCCEEDED = "LOGIN_SUCCEEDED";
    String LOGIN_FAILED = "LOGIN_FAILED";
    String SECOND_FACTOR_EXEMPTED = "LOGIN_SECOND_FACTOR_EXEMPTED";

    void record(LoginEvent event);

    /**
     * @param userId     the account when known; recorded as the actor only for successful logins
     * @param method     {@code PASSWORD}, {@code MOBILE}, {@code CERTIFICATE} or {@code PASSWORD+<CA method>}
     * @param vendorCode CA vendor for CA methods
     */
    record LoginEvent(Long tenantId, String eventType, Long userId, String method, String vendorCode,
                      String failureCode, String clientAddress) {}
}
