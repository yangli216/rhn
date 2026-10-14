package com.rhn;

import com.rhn.platform.masterdata.api.ServiceCatalogDirectory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Guards V1_129_0/V1_129_1: one standard item per service name, coded subtypes and routable examination types. */
class ServiceCatalogStandardizationTest extends RhnIntegrationTestSupport {
    private static final long TENANT = 362387869790209L;
    private static final long ORGANIZATION = 362387869790211L;
    private static final long NATIONAL_GLUCOSE = 362387890000297L;
    private static final long NATIONAL_URINALYSIS = 362387890000274L;

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    ServiceCatalogDirectory services;

    @Test
    void active_services_have_one_item_per_name_so_exact_matching_stays_deterministic() {
        assertThat(jdbc.queryForList("""
                select item.NA_CATALOG_ITEM from RHN_BD_CATALOG_ITEM item
                join RHN_BD_SVC_ITEM service on service.ID_CATALOG_ITEM = item.ID_CATALOG_ITEM
                where item.SD_STATUS = 'ACTIVE'
                group by item.ID_TNT, service.SD_SVC_TYPE, item.NA_CATALOG_ITEM having count(*) > 1
                """, String.class)).isEmpty();
        assertThat(jdbc.queryForList("""
                select SD_STATUS from RHN_BD_CATALOG_ITEM
                where CD_CATALOG_ITEM in ('SRV-GLU', 'DEMO-LAB-URINE', 'DEMO-EXAM-HEAD-CT', 'DEMO-TREAT-NEB')
                """, String.class)).containsOnly("RETIRED");
    }

    @Test
    void laboratory_and_examination_subtypes_are_codes_and_examinations_are_routable() {
        assertThat(jdbc.queryForList("""
                select distinct service.SD_SVC_SUBTYPE from RHN_BD_SVC_ITEM service
                join RHN_BD_CATALOG_ITEM item on item.ID_CATALOG_ITEM = service.ID_CATALOG_ITEM
                where item.SD_STATUS = 'ACTIVE' and service.SD_SVC_TYPE in ('LABORATORY', 'EXAMINATION')
                """, String.class)).isSubsetOf(List.of("HEMATOLOGY", "BIOCHEMISTRY", "IMMUNOASSAY", "MICROBIOLOGY",
                "MOLECULAR", "RADIOGRAPHY", "CT", "MRI", "ULTRASOUND"));
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_SVC_ITEM service
                join RHN_BD_CATALOG_ITEM item on item.ID_CATALOG_ITEM = service.ID_CATALOG_ITEM
                where item.SD_STATUS = 'ACTIVE' and service.SD_SVC_TYPE = 'EXAMINATION' and service.SD_EXAM_TYPE is null
                """, Integer.class)).isZero();
    }

    @Test
    void national_consultation_fees_are_visit_services_and_outpatient_ones_are_schedulable() {
        assertThat(jdbc.queryForList("""
                select item.CD_CATALOG_ITEM || ':' || service.SD_SVC_SUBTYPE || ':' || service.SD_USAGE_TYPE
                from RHN_BD_SVC_ITEM service join RHN_BD_CATALOG_ITEM item on item.ID_CATALOG_ITEM = service.ID_CATALOG_ITEM
                where item.CD_CATALOG_ITEM in ('11020000100', '11020000501', '11020000104')
                order by item.CD_CATALOG_ITEM
                """, String.class)).containsExactly("11020000100:OUTPATIENT_VISIT:OUTPATIENT",
                "11020000104:诊查费:OUTPATIENT", "11020000501:INPATIENT_VISIT:INPATIENT");
        Long outpatientFee = jdbc.queryForObject(
                "select ID_CATALOG_ITEM from RHN_BD_CATALOG_ITEM where CD_CATALOG_ITEM = '11020000100'", Long.class);
        assertThat(services.requireSchedulableOutpatientService(TENANT, ORGANIZATION, outpatientFee, LocalDate.now()))
                .isNotNull();
    }

    @Test
    void retired_demo_items_hand_their_order_sets_and_specimen_rules_to_the_standard_items() {
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_ITEM_GRP_MEMBER
                where ID_CATALOG_ITEM in (362387869795102, 362387871000202, 362387871000204, 362387871000205)
                """, Integer.class)).isZero();
        assertThat(jdbc.queryForObject(
                "select count(*) from RHN_BD_ITEM_GRP_MEMBER where ID_CATALOG_ITEM in (?, ?)",
                Integer.class, NATIONAL_GLUCOSE, NATIONAL_URINALYSIS)).isEqualTo(2);
        assertThat(jdbc.queryForList("""
                select service.SD_SPEC_TYPE || ':' || specimen.SD_STATUS from RHN_BD_SVC_ITEM service
                join RHN_EX_LAB_SVC_SPEC specimen on specimen.ID_CATALOG_ITEM = service.ID_CATALOG_ITEM
                where service.ID_CATALOG_ITEM in (?, ?) order by service.ID_CATALOG_ITEM
                """, String.class, NATIONAL_URINALYSIS, NATIONAL_GLUCOSE)).containsExactly("URINE:ACTIVE", "SERUM:ACTIVE");
    }
}
