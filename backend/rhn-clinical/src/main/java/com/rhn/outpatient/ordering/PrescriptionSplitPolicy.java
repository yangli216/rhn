package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.platform.configuration.api.ConfigurationDirectory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/**
 * 门诊处方分方参数：按机构/科室决定西药与中成药是否合方、输液是否单独成方以及单张处方药品种数上限。
 * 发药药房、草药整方、单列药品和输液同组原子性不受参数影响；参数缺失或字段非法时按产品默认值（分开、单列、5 种）。
 */
@Service
public class PrescriptionSplitPolicy {
    public static final String PARAMETER_KEY = "outpatient.prescription.split-policy";
    /** 《处方管理办法》第六条：每张处方不得超过 5 种药品。 */
    static final int REGULATORY_MAX_ITEMS = 5;
    static final Settings DEFAULT_SETTINGS = new Settings(false, true, REGULATORY_MAX_ITEMS);

    private final ConfigurationDirectory configuration;

    public PrescriptionSplitPolicy(ConfigurationDirectory configuration) {
        this.configuration = configuration;
    }

    Settings resolve(EncounterSnapshot encounter) {
        var configured = configuration.resolveCurrent(encounter.tenantId(), null, encounter.organizationId(),
                encounter.departmentId(), PARAMETER_KEY);
        return configured == null ? DEFAULT_SETTINGS : parse(configured.value());
    }

    static Settings parse(JsonNode value) {
        if (value == null || !value.isObject()) return DEFAULT_SETTINGS;
        boolean merge = value.path("mergeWesternAndPatent").isBoolean()
                ? value.get("mergeWesternAndPatent").asBoolean() : DEFAULT_SETTINGS.mergeWesternAndPatent();
        boolean separateInfusion = value.path("separateInfusion").isBoolean()
                ? value.get("separateInfusion").asBoolean() : DEFAULT_SETTINGS.separateInfusion();
        int maxItems = value.path("maxItemsPerPrescription").isIntegralNumber()
                && value.get("maxItemsPerPrescription").asInt() >= 1
                && value.get("maxItemsPerPrescription").asInt() <= REGULATORY_MAX_ITEMS
                ? value.get("maxItemsPerPrescription").asInt() : DEFAULT_SETTINGS.maxItemsPerPrescription();
        return new Settings(merge, separateInfusion, maxItems);
    }

    record Settings(boolean mergeWesternAndPatent, boolean separateInfusion, int maxItemsPerPrescription) {}
}
