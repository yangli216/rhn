package com.rhn.diagnostics.api;

public final class DiagnosticPermissions {
    private DiagnosticPermissions() {}
    public static final String ACCESS = "hasAnyAuthority('DIAGNOSTICS.ACCESS','ROLE_ADMIN')";
}
