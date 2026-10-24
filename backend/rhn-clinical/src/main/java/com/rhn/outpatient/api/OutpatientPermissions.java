package com.rhn.outpatient.api;

/** 门诊业务接口的权限表达式；权限集在选定工作上下文后由 WorkContextAuthorizationFilter 替换。 */
public final class OutpatientPermissions {
    private OutpatientPermissions() {}

    /** 就诊读写：挂号台与医生站均可访问。 */
    public static final String ENCOUNTER_ACCESS =
            "hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','OUTPATIENT_REGISTRATION.ACCESS','ROLE_ADMIN')";

    /** 医嘱开立、签署、作废与处方打印：仅医生站。 */
    public static final String ORDERING_ACCESS =
            "hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')";

    /** 排班与号源维护。 */
    public static final String SCHEDULING_ACCESS =
            "hasAnyAuthority('OUTPATIENT_SCHEDULING.ACCESS','ROLE_ADMIN')";

    /** 预约管理：排班台与挂号台共用。 */
    public static final String APPOINTMENT_ACCESS =
            "hasAnyAuthority('OUTPATIENT_SCHEDULING.ACCESS','OUTPATIENT_REGISTRATION.ACCESS','ROLE_ADMIN')";

    /** 挂号收费意向。 */
    public static final String REGISTRATION_BILLING_ACCESS =
            "hasAnyAuthority('BILLING.ACCESS','OUTPATIENT_REGISTRATION.ACCESS','ROLE_ADMIN')";
}
