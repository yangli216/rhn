package com.rhn.platform.terminology.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TerminologyCodePolicyTest {

    @Test
    void accepts_registered_domains_and_separates_resource_kinds() {
        assertThat(TerminologyCodePolicy.requireCodeSystemCode(
                "RHN.COMMON.CS.GENDER", TerminologyScope.PRODUCT))
                .isEqualTo("RHN.COMMON.CS.GENDER");
        assertThat(TerminologyCodePolicy.requireCodeSystemCode(
                "ICD10CN.VIS.CS.DIAGNOSIS", TerminologyScope.PRODUCT))
                .isEqualTo("ICD10CN.VIS.CS.DIAGNOSIS");
        assertThat(TerminologyCodePolicy.requireValueSetCode(
                "RHN.PI.VS.RESIDENT.GENDER", TerminologyScope.TENANT))
                .isEqualTo("RHN.PI.VS.RESIDENT.GENDER");
        assertThat(TerminologyCodePolicy.requireValueSetCode(
                "LOCAL.EX.VS.OUTPATIENT_PRESCRIPTION.ROUTE", TerminologyScope.TENANT))
                .isEqualTo("LOCAL.EX.VS.OUTPATIENT_PRESCRIPTION.ROUTE");
    }

    @Test
    void rejects_ambiguous_malformed_and_versioned_resource_keys() {
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "RHN.GENDER", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "rhn.common.cs.gender", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "RHN.VIS.CS.STATUS", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("必须包含业务对象");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "RHN.VIS.CS.ENCOUNTER_STATUS_V2", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能包含版本号");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireValueSetCode(
                "RHN.UNKNOWN.VS.RESIDENT.GENDER", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void enforces_product_and_tenant_ownership_boundaries() {
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "RHN.VIS.CS.DIAGNOSIS", TerminologyScope.TENANT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("LOCAL OWNER");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireCodeSystemCode(
                "LOCAL.VIS.CS.DIAGNOSIS", TerminologyScope.PRODUCT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("租户作用域");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireValueSetCode(
                "ICD10CN.VIS.VS.OUTPATIENT.DIAGNOSIS", TerminologyScope.TENANT))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("同名 RHN 值域");
    }

    @Test
    void preserves_external_concept_codes_but_governs_rhn_codes() {
        assertThat(TerminologyCodePolicy.requireConceptCode(
                "ICD10CN.VIS.CS.DIAGNOSIS", "A00.0"))
                .isEqualTo("A00.0");
        assertThat(TerminologyCodePolicy.requireConceptCode(
                "LOCAL.VIS.CS.DIAGNOSIS", "Legacy-01"))
                .isEqualTo("Legacy-01");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireConceptCode(
                "RHN.COMMON.CS.GENDER", "male"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("大写字母");
    }

    @Test
    void uses_calendar_versions_for_rhn_and_local_resources() {
        assertThat(TerminologyCodePolicy.requireVersion("RHN.COMMON.CS.GENDER", "2026.08"))
                .isEqualTo("2026.08");
        assertThat(TerminologyCodePolicy.requireVersion("LOCAL.VIS.CS.DIAGNOSIS", "2026.08.1"))
                .isEqualTo("2026.08.1");
        assertThat(TerminologyCodePolicy.requireVersion("ICD10CN.VIS.CS.DIAGNOSIS", "official-2025"))
                .isEqualTo("official-2025");
        assertThatThrownBy(() -> TerminologyCodePolicy.requireVersion(
                "RHN.COMMON.CS.GENDER", "1.0"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("YYYY.MM");
    }
}
