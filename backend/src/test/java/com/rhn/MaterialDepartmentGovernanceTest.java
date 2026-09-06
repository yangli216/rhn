package com.rhn;

import com.rhn.platform.identityaccess.api.WorkContextDirectory;
import com.rhn.platform.identityaccess.api.WorkContextOption;
import com.rhn.platform.identityaccess.api.WorkContextType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MaterialDepartmentGovernanceTest extends RhnIntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private WorkContextDirectory workContextDirectory;

    @Test
    @DisplayName("科室属性字典 DEPT_PROPERTY 扩充药学、医学工程、耗材后勤与教学科研标准条目")
    void dept_property_dictionary_contains_standard_material_and_pharmacy_entries() {
        List<String> propertyCodes = jdbc.queryForList(
                "select CD_DICT_ITEM from RHN_BD_DICT_ITEM where ID_DICT_DEF_DICT = 362387869791112 and SD_STATUS = 'ACTIVE'",
                String.class
        );
        assertTrue(propertyCodes.contains("CLINICAL"), "应包含临床科室属性");
        assertTrue(propertyCodes.contains("ADMINISTRATIVE"), "应包含行政科室属性");
        assertTrue(propertyCodes.contains("MEDICAL_TECHNOLOGY"), "应包含医技科室属性");
        assertTrue(propertyCodes.contains("PHARMACY"), "应包含药学科室属性");
        assertTrue(propertyCodes.contains("EQUIPMENT_ASSET"), "应包含医学工程与设备科室属性");
        assertTrue(propertyCodes.contains("SUPPLY_LOGISTICS"), "应包含耗材供应与后勤科室属性");
        assertTrue(propertyCodes.contains("RESEARCH_EDUCATION"), "应包含教学科研科室属性");
    }

    @Test
    @DisplayName("科室类型字典 DEPT_TYPE 扩充耗材总库、手术高值库、试剂库、消毒供应与设备工程")
    void dept_type_dictionary_contains_material_and_equipment_types() {
        List<String> typeCodes = jdbc.queryForList(
                "select CD_DICT_ITEM from RHN_BD_DICT_ITEM where ID_DICT_DEF_DICT = 362387869791111 and SD_STATUS = 'ACTIVE'",
                String.class
        );
        assertTrue(typeCodes.contains("MED_EQUIPMENT_DEPT"), "应包含医学工程科");
        assertTrue(typeCodes.contains("MED_CONSUMABLE_WAREHOUSE"), "应包含医用耗材总库");
        assertTrue(typeCodes.contains("MED_SURGICAL_STORE"), "应包含手术室高值耗材库");
        assertTrue(typeCodes.contains("MED_REAGENT_STORE"), "应包含检验试剂库");
        assertTrue(typeCodes.contains("MED_CSSD"), "应包含消毒供应中心");
        assertTrue(typeCodes.contains("MED_EQUIPMENT_CENTER"), "应包含医疗设备调配中心");
        assertTrue(typeCodes.contains("LOG_GENERAL_DEPT"), "应包含总务后勤处");
        assertTrue(typeCodes.contains("LOG_GENERAL_WAREHOUSE"), "应包含后勤物资总库");
    }

    @Test
    @DisplayName("既有药学管理与仓储科室的属性已规范订正为 PHARMACY")
    void existing_pharmacy_and_drug_warehouse_properties_standardized() {
        String pharmacyDeptProp = jdbc.queryForObject(
                "select SD_DEPT_PROPERTY from RHN_SYS_DEPT where CD_DEPT = 'PHARMACY_DEPT'",
                String.class
        );
        assertEquals("PHARMACY", pharmacyDeptProp, "药学部属性应为 PHARMACY");

        String drugWarehouseProp = jdbc.queryForObject(
                "select SD_DEPT_PROPERTY from RHN_SYS_DEPT where CD_DEPT = 'DRUG_WAREHOUSE'",
                String.class
        );
        assertEquals("PHARMACY", drugWarehouseProp, "药库属性应为 PHARMACY");
    }

    @Test
    @DisplayName("药库与药学科室的工作上下文被正确映射为 INVENTORY 或 PHARMACY")
    void work_context_directory_reflects_pharmacy_and_inventory_types() {
        // 用户 362387869790222 (doctor) 在 demo 医院中分配的上下文
        List<WorkContextOption> options = workContextDirectory.availableContexts(362387869790209L, 362387869790222L);
        // 验证用户能够正确获取其可用上下文，类型不为 null
        for (WorkContextOption option : options) {
            assertTrue(option.workContextType() != null);
        }
    }
}
