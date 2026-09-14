package com.rhn.treatment.api;

public final class TreatmentPermissions {
    private TreatmentPermissions() {}

    public static final String ACCESS = "hasAnyAuthority('TREATMENT.ACCESS','OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')";
}
