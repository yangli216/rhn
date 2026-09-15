package com.rhn.inpatient.api;

public final class InpatientPermissions {
    public static final String ACCESS = "hasAnyAuthority('INPATIENT.ACCESS','ROLE_ADMIN')";

    private InpatientPermissions() {
    }
}
