package com.rhn;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Seeded base data must only use active items of the dictionary its column is bound to. Runs on the full test
 * baseline (platform metadata, development hospital and all migrations), so new seed scripts cannot reintroduce
 * values outside the dictionaries.
 */
class DictionaryConformanceTest extends RhnIntegrationTestSupport {
    private record Binding(String table, String column, String dictionary) {}

    private static final List<Binding> BINDINGS = List.of(
            new Binding("RHN_BD_SVC_ITEM", "SD_SVC_TYPE", "BD_SERVICE_TYPE"),
            new Binding("RHN_BD_SVC_ITEM", "SD_SVC_SUBTYPE", "BD_SERVICE_SUBTYPE"),
            new Binding("RHN_BD_SVC_ITEM", "SD_USAGE_TYPE", "BD_SERVICE_USE"),
            new Binding("RHN_BD_SVC_ITEM", "SD_ACCTG_CAT", "BD_ACCOUNTING_CATEGORY"),
            new Binding("RHN_BD_SVC_ITEM", "SD_DUP_RULE", "BD_SERVICE_DUPLICATE_RULE"),
            new Binding("RHN_BD_SVC_ITEM", "SD_SPEC_TYPE", "BD_SPECIMEN_TYPE"),
            new Binding("RHN_BD_SVC_ITEM", "SD_EXAM_TYPE", "BD_EXAM_TYPE"),
            new Binding("RHN_BD_LAB_SVC", "SD_LAB_METHOD", "BD_LAB_METHOD"),
            new Binding("RHN_BD_SVC_VAR", "SD_METHOD_TYPE", "BD_SERVICE_VARIANT_METHOD"),
            new Binding("RHN_BD_MED", "SD_MED_TYPE", "BD_MEDICATION_TYPE"),
            new Binding("RHN_BD_MED", "SD_STORAGE_TYPE", "BD_STORAGE_TYPE"),
            new Binding("RHN_BD_MED", "DOSE_FORM", "BD_DOSE_FORM"),
            new Binding("RHN_BD_MED_HERBAL", "SD_NATURE_TYPE", "BD_HERBAL_NATURE"),
            new Binding("RHN_BD_MED_HERBAL", "SD_PROCSG_METHOD", "BD_HERBAL_PROCESSING"),
            new Binding("RHN_BD_SUPPLY_ITEM", "SD_MATL_TYPE", "BD_SUPPLY_MATERIAL"),
            new Binding("RHN_BD_SUPPLY_ITEM", "SD_DEVICE_CLASS", "BD_DEVICE_CLASS"),
            new Binding("RHN_BD_CONCEPT", "SD_CONCEPT_TYPE", "BD_CONCEPT_TYPE"),
            new Binding("RHN_BD_CONCEPT_ALIAS", "SD_ALIAS_TYPE", "BD_ALIAS_TYPE"),
            new Binding("RHN_SYS_PRACT", "SD_GENDER", "PRACT_GENDER"),
            new Binding("RHN_SYS_DEPT", "SD_DEPT_TYPE", "DEPT_TYPE"),
            new Binding("RHN_SYS_DEPT", "SD_DEPT_PROP", "DEPT_PROPERTY"),
            new Binding("RHN_SYS_ORG", "SD_ORG_KIND", "ORG_KIND"),
            new Binding("RHN_SYS_ORG", "SD_ORG_TYPE", "ORG_TYPE"),
            new Binding("RHN_SYS_ORG_CAP", "SD_CAP_TYPE", "ORG_CAPABILITY_TYPE"),
            new Binding("RHN_SYS_DEPT_CAP", "SD_CAP_TYPE", "ORG_CAPABILITY_TYPE"),
            new Binding("RHN_PI_PAT_IDENT", "CD_IDENT_SYS", "PI_RESIDENT_IDENTIFIER_SYSTEM"),
            new Binding("RHN_PI_PAT_RELATED_PERSON", "CD_RELSHIP", "PI_RELATED_PERSON_RELATIONSHIP"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_NATLTY", "PI_NATIONALITY"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_ETHNIC", "PI_ETHNICITY"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_EDUC", "PI_EDUCATION_LEVEL"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_OCCUPN", "PI_OCCUPATION_TYPE"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_RESDNCY_TYPE", "PI_RESIDENCY_TYPE"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_MARITAL_STATUS", "PI_MARITAL_STATUS"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_BLOOD_TYPE", "PI_BLOOD_TYPE"),
            new Binding("RHN_PI_PAT_DEMO_PROF", "CD_RH_TYPE", "PI_RH_TYPE"));

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void seeded_values_are_active_items_of_their_dictionaries() {
        List<String> violations = new ArrayList<>();
        for (Binding binding : BINDINGS) {
            jdbc.queryForList("""
                    select distinct v.%2$s from %1$s v
                    where v.%2$s is not null and not exists (
                      select 1 from RHN_BD_DICT_ITEM i join RHN_BD_DICT_DEF d on d.ID_DICT_DEF = i.ID_DICT_DEF_DICT
                      where d.SD_SCOPE_TYPE = 'PLATFORM' and d.CD_DICT_DEF = ? and d.SD_STATUS = 'ACTIVE'
                        and i.SD_STATUS = 'ACTIVE' and i.CD_DICT_ITEM = v.%2$s)
                    """.formatted(binding.table(), binding.column()), String.class, binding.dictionary())
                    .forEach(value -> violations.add(binding.table() + "." + binding.column() + "=" + value
                            + " not in " + binding.dictionary()));
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void retired_dictionaries_stay_retired_and_departments_share_the_organization_capability_vocabulary() {
        assertThat(jdbc.queryForList("""
                select CD_DICT_DEF from RHN_BD_DICT_DEF where SD_SCOPE_TYPE = 'PLATFORM' and SD_STATUS = 'ACTIVE'
                and CD_DICT_DEF in ('ORG_DEPARTMENT_TYPE', 'PI_IDENTIFIER_TYPE', 'DEPT_CAPABILITY_TYPE', 'COMMON_YES_NO',
                  'COMMON_ENABLE_STATUS', 'COMMON_VALIDITY_STATUS', 'COMMON_VISIBILITY_STATUS')
                """, String.class)).isEmpty();
        assertThat(jdbc.queryForObject("""
                select count(*) from RHN_BD_DICT_CHG where CD_REQ = 'v1.129.2:dictionary-content-governance'
                """, Integer.class)).isPositive();
    }
    @Test
    void atc_classes_form_a_complete_hierarchy_and_every_western_class_mapping_reaches_a_substance() {
        assertThat(jdbc.queryForList("""
                select c.CD_CONCEPT from RHN_BD_CLASS_CONCEPT c join RHN_BD_CLASS_SYSTEM s on s.ID_CLASS_SYSTEM = c.ID_CLASS_SYSTEM
                left join RHN_BD_CLASS_CONCEPT p on p.ID_CLASS_CONCEPT = c.ID_PARENT
                where s.CD_CLASS_SYSTEM = 'ATC' and (
                  (c.QTY_LEVEL = 1 and c.ID_PARENT is not null)
                  or (c.QTY_LEVEL > 1 and (p.ID_CLASS_CONCEPT is null or p.QTY_LEVEL <> c.QTY_LEVEL - 1
                      or c.CD_CONCEPT not like p.CD_CONCEPT || '%'
                      or c.CLASS_PATH not like replace(p.CLASS_PATH, ' ' || p.NA_CONCEPT, '') || '/' || c.CD_CONCEPT || ' %')))
                """, String.class)).isEmpty();
        assertThat(jdbc.queryForList("""
                select m.ID_MED from RHN_BD_MED_CLASS_MAP m join RHN_BD_CLASS_CONCEPT c on c.ID_CLASS_CONCEPT = m.ID_CLASS_CONCEPT
                join RHN_BD_CLASS_SYSTEM s on s.ID_CLASS_SYSTEM = c.ID_CLASS_SYSTEM
                where s.CD_CLASS_SYSTEM = 'ATC' and c.QTY_LEVEL <> 5
                """, Long.class)).isEmpty();
        assertThat(jdbc.queryForObject("""
                select count(distinct m.ID_MED) from RHN_BD_MED_CLASS_MAP m join RHN_BD_CLASS_CONCEPT c
                on c.ID_CLASS_CONCEPT = m.ID_CLASS_CONCEPT join RHN_BD_CLASS_SYSTEM s on s.ID_CLASS_SYSTEM = c.ID_CLASS_SYSTEM
                where s.CD_CLASS_SYSTEM = 'ATC'
                """, Integer.class)).isEqualTo(7);
        assertThat(jdbc.queryForObject("""
                select count(*) from INFORMATION_SCHEMA.COLUMNS
                where TABLE_NAME = 'RHN_BD_MED_WESTERN' and COLUMN_NAME = 'SD_THERAP_CLASS'
                """, Integer.class)).as("self-coded therapeutic class replaced by ATC").isZero();
    }

    @Test
    void rebuilt_gender_storage_and_active_terminology_use_the_four_standard_codes() {
        for (String table : List.of("RHN_PI_PAT", "RHN_SYS_PRACT", "RHN_OP_TRIAGE_REC")) {
            assertThat(jdbc.queryForList("select distinct SD_GENDER from " + table
                    + " where SD_GENDER is not null", String.class)).isSubsetOf("0", "1", "2", "9");
        }
        assertThat(jdbc.queryForList("""
                select c.CD_CONCEPT from RHN_BD_CONCEPT c join RHN_BD_CODE_SYSTEM cs
                on cs.ID_CODE_SYSTEM = c.ID_CODE_SYSTEM where cs.CD_CODE_SYSTEM = 'RHN.COMMON.CS.GENDER'
                and c.SD_STATUS = 'ACTIVE' order by c.CD_CONCEPT
                """, String.class)).containsExactly("0", "1", "2", "9");

    }

}
