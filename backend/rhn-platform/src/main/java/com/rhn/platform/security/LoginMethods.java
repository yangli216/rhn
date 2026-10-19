package com.rhn.platform.security;

/**
 * How a login session was established. A CA login (phone app confirmation or UKey) already combines
 * possession of the certificate with the PIN or biometric unlocking it, so it counts as multi-factor.
 */
final class LoginMethods {
    static final String PASSWORD = "PASSWORD";
    static final String MOBILE = "MOBILE";
    static final String CERTIFICATE = "CERTIFICATE";

    private LoginMethods() {
    }

    static String withPassword(String caMethod) {
        return PASSWORD + "+" + caMethod;
    }

    static boolean multiFactor(String method) {
        return method != null && !method.isBlank() && !PASSWORD.equals(method);
    }
}
