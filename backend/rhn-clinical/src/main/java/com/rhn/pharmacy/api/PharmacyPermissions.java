package com.rhn.pharmacy.api;

/** Method-security expressions for pharmacy and warehouse capabilities. */
public final class PharmacyPermissions {
    public static final String WAREHOUSE_READ =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.READ','ROLE_ADMIN')";
    public static final String WAREHOUSE_RECEIVE =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.RECEIVE','ROLE_ADMIN')";
    public static final String WAREHOUSE_ISSUE =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.ISSUE','ROLE_ADMIN')";
    public static final String WAREHOUSE_TRANSFER =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.TRANSFER','ROLE_ADMIN')";
    public static final String WAREHOUSE_COUNT =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.COUNT','ROLE_ADMIN')";
    public static final String WAREHOUSE_ADJUST =
            "hasAnyAuthority('PHARMACY_WAREHOUSE.ADJUST','ROLE_ADMIN')";
    public static final String PHARMACY_DISPENSE =
            "hasAnyAuthority('PHARMACY.DISPENSE','ROLE_ADMIN')";

    private PharmacyPermissions() {}
}
