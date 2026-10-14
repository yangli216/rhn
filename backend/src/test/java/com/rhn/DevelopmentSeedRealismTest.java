package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Cross-domain checks for the fictional hospital, independent of application test mutations. */
class DevelopmentSeedRealismTest extends RhnIntegrationTestSupport {
    @Autowired JdbcTemplate jdbc;

    @Test
    void patient_identity_birth_gender_and_guardians_are_consistent() {
        int[] weights = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
        for (var row : jdbc.queryForList("select NA_FULL, ID_NATL, SD_GENDER, DA_BIRTH from RHN_PI_PAT where ID_NATL is not null")) {
            String nationalId = (String) row.get("ID_NATL");
            assertThat(nationalId).matches("[0-9]{17}[0-9X]");
            int sum = 0;
            for (int i = 0; i < weights.length; i++) sum += (nationalId.charAt(i) - '0') * weights[i];
            assertThat(nationalId.charAt(17)).isEqualTo("10X98765432".charAt(sum % 11));
            assertThat(row.get("DA_BIRTH").toString().replace("-", "")).isEqualTo(nationalId.substring(6, 14));
            if (List.of("1", "2").contains(row.get("SD_GENDER"))) {
                assertThat(row.get("SD_GENDER")).isEqualTo((nationalId.charAt(16) - '0') % 2 == 1 ? "1" : "2");
            }
        }
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_PI_PAT p where p.DA_BIRTH > date '2008-10-14'
                and not exists (select 1 from RHN_PI_PAT_RELATED_PERSON g where g.ID_PAT = p.ID_PAT
                  and g.FG_GUARD_FLAG = true and g.SD_STATUS = 'ACTIVE' and g.DA_VALID_FROM >= p.DA_BIRTH)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select CD_OCCUPN from RHN_PI_PAT_DEMO_PROF where ID_PAT = 362387869900103",
                String.class)).isNull();
    }

    @Test
    void hospital_departments_and_capabilities_belong_to_the_same_organization() {
        assertThat(jdbc.queryForObject("select CD_TZ from RHN_SYS_ORG where ID_ORG = 362387869790211", String.class))
                .isEqualTo("Asia/Shanghai");
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_SYS_DEPT child join RHN_SYS_DEPT parent on parent.ID_DEPT = child.ID_DEPT_PARENT
                where child.ID_ORG <> parent.ID_ORG or child.ID_TNT <> parent.ID_TNT
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForList("select distinct SD_CAP_TYPE from RHN_SYS_ORG_CAP where ID_ORG = 362387869790211",
                String.class)).contains("OUTPATIENT", "INPATIENT", "NURSING", "PHARMACY", "LABORATORY", "IMAGING");
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_SYS_DEPT d where d.ID_ORG = 362387869790211 and d.SD_STATUS = 'ACTIVE'
                and not exists (select 1 from RHN_SYS_DEPT_CAP c where c.ID_DEPT = d.ID_DEPT and c.SD_STATUS = 'ACTIVE')
                """, Integer.class)).isZero();
    }

    @Test
    void catalog_imports_do_not_invent_administration_parameters() {
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_MED where CD_MED like 'MED-2026-%'
                  and (DEFAULT_FREQ is not null or ID_ORDER_FREQ_DEFAULT is not null)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_MED where CD_MED like 'MED-2026-%'
                  and (DOSE_FORM like '%INJECTION%' or DOSE_FORM like 'POWDER_FOR_%')
                  and (DEFAULT_ROUTE is not null or ID_CONCEPT_DEFAULT_ROUTE is not null)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForList("""
                select DEFAULT_ROUTE from RHN_BD_MED where CD_MED in ('DRUG-VB1-INJ', 'DEMO-DRUG-FLU-VAC')
                """, String.class)).containsExactlyInAnyOrder("IM", "IM");
        assertThat(jdbc.queryForObject("select SD_STATUS from RHN_BD_MED where CD_MED = 'MED-2026-T108-03'",
                String.class)).isEqualTo("RETIRED");
        assertThat(jdbc.queryForList("""
                select DEFAULT_ROUTE from RHN_BD_MED where CD_MED in ('MED-2026-W460', 'MED-2026-W463-01', 'MED-2026-W463-02')
                """, String.class)).containsExactlyInAnyOrder("NASAL", "NASAL", "NASAL");
        assertThat(jdbc.queryForObject("select DEFAULT_ROUTE from RHN_BD_MED where CD_MED = 'MED-2026-W352-03'",
                String.class)).isNull();
    }

    @Test
    void fictional_products_do_not_claim_placeholder_regulatory_approvals() {
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_MED_PRODUCT where ID_TNT = 362387869790209
                  and (CD_APRVL is not null or DA_APRVL_FROM is not null or DA_APRVL_TO is not null)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_MED_PRODUCT where ID_TNT = 362387869790209
                  and (DES_INSTR is null or DES_INSTR not like '%演示产品%')
                """, Integer.class)).isZero();
    }
}
