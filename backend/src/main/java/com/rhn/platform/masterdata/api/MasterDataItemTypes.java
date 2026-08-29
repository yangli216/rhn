package com.rhn.platform.masterdata.api;

import java.util.Map;

public final class MasterDataItemTypes {
    private MasterDataItemTypes() {}

    public static final long CATALOG_ITEM = 362387869797001L;
    public static final long SERVICE = 362387869797002L;
    public static final long SERVICE_LAB_TEST = 362387869797003L;
    public static final long SERVICE_EXAMINATION = 362387869797004L;
    public static final long SERVICE_PROCEDURE = 362387869797005L;
    public static final long SERVICE_TREATMENT = 362387869797006L;
    public static final long MEDICATION_PRODUCT = 362387869797007L;
    public static final long MEDICATION = 362387869797011L;
    public static final long MEDICATION_WESTERN = 362387869797012L;
    public static final long MEDICATION_CHINESE_PATENT = 362387869797013L;
    public static final long MEDICATION_HERBAL = 362387869797014L;
    public static final long MEDICATION_VACCINE = 362387869797015L;
    public static final long MEDICATION_ETHNIC = 362387869797016L;
    public static final long MEDICATION_IN_HOUSE = 362387869797017L;
    public static final long SUPPLY = 362387869801001L;
    public static final long SUPPLY_CONSUMABLE = 362387869801002L;
    public static final long SUPPLY_DEVICE = 362387869801003L;

    private static final Map<String, Long> SERVICE_TYPES = Map.of(
            "LABORATORY", SERVICE_LAB_TEST,
            "EXAMINATION", SERVICE_EXAMINATION,
            "PROCEDURE", SERVICE_PROCEDURE,
            "TREATMENT", SERVICE_TREATMENT
    );
    private static final Map<String, Long> MEDICATION_TYPES = Map.of(
            "WESTERN", MEDICATION_WESTERN,
            "CHINESE_PATENT", MEDICATION_CHINESE_PATENT,
            "HERBAL", MEDICATION_HERBAL,
            "VACCINE", MEDICATION_VACCINE,
            "ETHNIC", MEDICATION_ETHNIC,
            "IN_HOUSE", MEDICATION_IN_HOUSE
    );

    public static long forService(String serviceType) {
        return SERVICE_TYPES.getOrDefault(serviceType, SERVICE);
    }

    public static long forMedication(String medicationType) {
        return MEDICATION_TYPES.getOrDefault(medicationType, MEDICATION);
    }

    public static long forSupply(String supplyType) {
        return "DEVICE".equals(supplyType) ? SUPPLY_DEVICE : SUPPLY_CONSUMABLE;
    }
}
