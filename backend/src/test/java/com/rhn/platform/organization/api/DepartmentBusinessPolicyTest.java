package com.rhn.platform.organization.api;

import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.assertThat;

class DepartmentBusinessPolicyTest {
    private DepartmentView department(String type,String property) {
        return new com.rhn.platform.organization.domain.Department(1L,2L,null,"D","测试科室",null,null,type,property,false,0,LocalDate.of(2026,1,1),null,3L).toView();
    }
    @Test void pharmacy_property_alone_does_not_create_inventory_site() {
        var group=DepartmentBusinessPolicy.describe(department("MED_PHARMACY","PHARMACY"));
        assertThat(group.suggestedCapabilityTypes()).contains("PHARMACY");
        assertThat(group.runtimeUses().stream().filter(use -> use.code().equals("PHARMACY")).findFirst().orElseThrow().classificationMatches()).isFalse();
        var outpatient=DepartmentBusinessPolicy.describe(department("MED_PHARMACY_OUTPATIENT","PHARMACY"));
        assertThat(outpatient.runtimeUses().stream().filter(use -> use.code().equals("PHARMACY")).findFirst().orElseThrow().classificationMatches()).isTrue();
    }
    @Test void classifications_follow_current_runtime_consumers_and_report_inconsistency() {
        var laboratory=DepartmentBusinessPolicy.describe(department("30.03","CLINICAL"));
        assertThat(laboratory.suggestedCapabilityTypes()).contains("OUTPATIENT","LABORATORY");
        assertThat(laboratory.warnings()).anyMatch(message -> message.contains("医技科室"));
        assertThat(DepartmentBusinessPolicy.describe(department("MED_LAB_UNKNOWN","MEDICAL_TECHNOLOGY")).suggestedCapabilityTypes()).doesNotContain("LABORATORY");
    }
    @Test void nonclinical_properties_preserve_structural_semantics() {
        assertThat(department("MED_PHARMACY","PHARMACY").sdOrgType()).isEqualTo("MEDICAL_TECHNOLOGY_DEPARTMENT");
        assertThat(department("LOG_GENERAL_DEPT","SUPPLY_LOGISTICS").sdOrgType()).isEqualTo("MEDICAL_TECHNOLOGY_DEPARTMENT");
        assertThat(department("ADM_RESEARCH","RESEARCH_EDUCATION").sdOrgType()).isEqualTo("ADMINISTRATIVE_DEPARTMENT");
    }
    @Test void unsupported_examination_subtype_requires_explicit_service_configuration() {
        var intervention=DepartmentBusinessPolicy.describe(department("32.09","MEDICAL_TECHNOLOGY"));
        assertThat(intervention.suggestedCapabilityTypes()).contains("IMAGING");
        assertThat(intervention.runtimeUses().stream().filter(use -> use.code().equals("IMAGING")).findFirst().orElseThrow().classificationMatches()).isFalse();
        assertThat(intervention.warnings()).anyMatch(message -> message.contains("明确配置执行科室"));
        assertThat(DepartmentBusinessPolicy.describe(department("32.02","MEDICAL_TECHNOLOGY")).runtimeUses().stream()
                .filter(use -> use.code().equals("IMAGING")).findFirst().orElseThrow().classificationMatches()).isTrue();
    }
}
