package com.rhn.platform.identityaccess.application;

import com.rhn.platform.identityaccess.api.WorkContextOption;
import com.rhn.platform.identityaccess.api.WorkContextType;
import com.rhn.platform.identityaccess.infrastructure.AuthorityProjectionRepository;
import com.rhn.platform.identityaccess.infrastructure.WorkContextProjectionRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorkContextServiceTest {

    @Test
    @DisplayName("仓储类科室（耗材库、试剂库、手术高值库、药库等）投影为 INVENTORY，药房与药事管理投影为 PHARMACY")
    void projects_department_types_and_properties_to_correct_context_types() {
        WorkContextProjectionRepository repo = mock(WorkContextProjectionRepository.class);
        AuthorityProjectionRepository authRepo = mock(AuthorityProjectionRepository.class);

        List<WorkContextProjectionRepository.Row> rows = List.of(
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 201L, "医用耗材总库",
                        "MED_CONSUMABLE_WAREHOUSE", "SUPPLY_LOGISTICS",
                        "DEPARTMENT", "ROLE_INVENTORY_STAFF"
                ),
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 202L, "手术室高值耗材库",
                        "MED_SURGICAL_STORE", "SUPPLY_LOGISTICS",
                        "DEPARTMENT", "ROLE_INVENTORY_STAFF"
                ),
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 203L, "检验试剂库",
                        "MED_REAGENT_STORE", "SUPPLY_LOGISTICS",
                        "DEPARTMENT", "ROLE_INVENTORY_STAFF"
                ),
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 204L, "中心药库",
                        "MED_PHARMACY_WAREHOUSE", "PHARMACY",
                        "DEPARTMENT", "ROLE_PHARMACY_STAFF"
                ),
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 205L, "门诊药房",
                        "MED_PHARMACY_OUTPATIENT", "PHARMACY",
                        "DEPARTMENT", "ROLE_PHARMACY_STAFF"
                ),
                new WorkContextProjectionRepository.Row(
                        100L, "测试医院", 206L, "全科门诊",
                        "MED_GENERAL_CLINIC", "CLINICAL",
                        "DEPARTMENT", "ROLE_DOCTOR"
                )
        );

        when(repo.findAvailable(eq(1L), eq(2L))).thenReturn(rows);
        when(authRepo.findAuthoritiesForContext(eq(1L), eq(2L), any(), any(), any()))
                .thenReturn(List.of("OP_ACCESS"));

        WorkContextService service = new WorkContextService(repo, authRepo);
        List<WorkContextOption> options = service.availableContexts(1L, 2L);

        assertEquals(6, options.size());

        // 医用耗材总库 -> INVENTORY
        assertEquals(WorkContextType.INVENTORY, options.get(0).workContextType());
        // 手术室高值耗材库 -> INVENTORY
        assertEquals(WorkContextType.INVENTORY, options.get(1).workContextType());
        // 检验试剂库 -> INVENTORY
        assertEquals(WorkContextType.INVENTORY, options.get(2).workContextType());
        // 中心药库 -> INVENTORY (warehouse 优先识别为仓储)
        assertEquals(WorkContextType.INVENTORY, options.get(3).workContextType());
        // 门诊药房 -> PHARMACY
        assertEquals(WorkContextType.PHARMACY, options.get(4).workContextType());
        // 全科门诊 -> CLINICAL
        assertEquals(WorkContextType.CLINICAL, options.get(5).workContextType());
    }
}
