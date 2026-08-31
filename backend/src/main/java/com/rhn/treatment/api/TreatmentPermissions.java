package com.rhn.treatment.api;

public final class TreatmentPermissions {
    private TreatmentPermissions() {}

    public static final String ACCESS = "hasAnyAuthority('TREATMENT.ACCESS','ROLE_ADMIN')";
}
