package com.rhn.platform.printing.api;

/** Stable business identifiers. Layout, paper and renderer changes must not change these codes. */
public final class PrintTaskCodes {
    public static final String OUTPATIENT_MEDICAL_RECORD = "OP.MEDICAL_RECORD.PRINT";
    public static final String OUTPATIENT_WESTERN_PRESCRIPTION = "OP.PRESCRIPTION.WESTERN.PRINT";
    public static final String LABORATORY_APPLICATION = "OP.APPLICATION.LAB.PRINT";
    public static final String EXAMINATION_APPLICATION = "OP.APPLICATION.EXAM.PRINT";
    public static final String TREATMENT_APPLICATION = "OP.APPLICATION.TREATMENT.PRINT";
    public static final String ORAL_MEDICATION_CARD = "TREATMENT.ORAL_MEDICATION_CARD.PRINT";
    public static final String INFUSION_LABEL = "TREATMENT.INFUSION_LABEL.PRINT";
    public static final String INFUSION_PATROL_CARD = "TREATMENT.INFUSION_PATROL_CARD.PRINT";
    public static final String OUTPATIENT_REGISTRATION_TICKET = "OP.REGISTRATION.TICKET.PRINT";

    private PrintTaskCodes() {}
}
