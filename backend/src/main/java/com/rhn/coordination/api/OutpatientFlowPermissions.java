package com.rhn.coordination.api;

public final class OutpatientFlowPermissions {
    private OutpatientFlowPermissions() {}

    public static final String ACCESS =
            "hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')";
}
