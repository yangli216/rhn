package com.rhn.platform.masterdata.api;

import com.rhn.platform.organization.api.DepartmentView;
import org.junit.jupiter.api.Test;
import java.time.LocalDate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ServiceExecutionDepartmentPolicyTest {
    private final LocalDate date = LocalDate.of(2026, 10, 8);
    private DepartmentView department(long id, long organization, String type, String status, boolean virtual, LocalDate until) {
        return new DepartmentView(id, 0, organization, null, null, "arbitrary", "任意名称", null, null,
                type, "MEDICAL_TECHNOLOGY", "MEDICAL_TECHNOLOGY_DEPARTMENT", virtual, 0, status,
                LocalDate.of(2026, 1, 1), until, null, null);
    }
    private DepartmentView department(long id, String type) { return department(id, 1L, type, "ACTIVE", false, null); }
    @Test void configuredDepartmentWinsWithoutNameGuessing() {
        var result = ServiceExecutionDepartmentPolicy.resolve("LABORATORY", null, 2L, 1L,
                List.of(department(1, "30"), department(2, "32.05")), date);
        assertEquals(2L, result.departmentId()); assertEquals("CONFIGURED", result.source());
    }
    @Test void unresolvedExplicitConfigurationIsNotSilentlyReplaced() {
        var result = ServiceExecutionDepartmentPolicy.resolve("LABORATORY", null, 99L, 1L, List.of(department(1, "30")), date);
        assertNull(result.departmentId()); assertEquals("CONFIGURATION_INVALID", result.source());
    }
    @Test void laboratoryUsesGeneralLabBeforeSpecialtyLabs() {
        var result = ServiceExecutionDepartmentPolicy.resolve("LABORATORY", null, null, 1L,
                List.of(department(1, "30"), department(2, "30.03")), date);
        assertEquals(1L, result.departmentId());
    }
    @Test void examsPreferMatchingModalityThenGeneralImaging() {
        var departments = List.of(department(1, "32"), department(2, "32.05"), department(3, "32.06"));
        assertEquals(2L, ServiceExecutionDepartmentPolicy.resolve("EXAMINATION", "ULTRASOUND", null, 1L, departments, date).departmentId());
        assertEquals(3L, ServiceExecutionDepartmentPolicy.resolve("EXAMINATION", "ECG", null, 1L, departments, date).departmentId());
        assertEquals(1L, ServiceExecutionDepartmentPolicy.resolve("EXAMINATION", "CT", null, 1L, departments, date).departmentId());
    }
    @Test void doesNotRouteCtToAnUltrasoundDepartmentOrChooseAnAmbiguousFirstDepartment() {
        assertEquals("MISSING", ServiceExecutionDepartmentPolicy.resolve("EXAMINATION", "CT", null, 1L,
                List.of(department(2, "32.05")), date).source());
        assertEquals("AMBIGUOUS", ServiceExecutionDepartmentPolicy.resolve("LABORATORY", null, null, 1L,
                List.of(department(1, "30"), department(2, "30")), date).source());
    }
    @Test void excludesForeignInactiveVirtualExpiredAndFutureDepartments() {
        var future = new DepartmentView(6L, 0, 1L, null, null, "F", "未来科室", null, null,
                "30", null, null, false, 0, "ACTIVE", date.plusDays(1), null, null, null);
        var result = ServiceExecutionDepartmentPolicy.resolve("LABORATORY", null, null, 1L, List.of(
                department(1, 2, "30", "ACTIVE", false, null), department(2, 1, "30", "INACTIVE", false, null),
                department(3, 1, "30", "ACTIVE", true, null), department(4, 1, "30", "ACTIVE", false, date.minusDays(1)), future), date);
        assertNull(result.departmentId()); assertEquals("MISSING", result.source());
    }
}
