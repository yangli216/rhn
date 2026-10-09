package com.rhn.billing.application;

import com.rhn.billing.domain.ChargeItem;
import com.rhn.outpatient.api.OutpatientOrderOriginDirectory;
import com.rhn.outpatient.api.OutpatientOrderOriginDirectory.OrderOrigin;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.identityaccess.api.UserAccountReference;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.StaffDetailView;
import com.rhn.platform.organization.api.StaffView;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BillingOrderOriginResolverTest {
    private final OutpatientOrderOriginDirectory orders = mock(OutpatientOrderOriginDirectory.class);
    private final IdentityAccessDirectory users = mock(IdentityAccessDirectory.class);
    private final OrganizationDirectory organizations = mock(OrganizationDirectory.class);
    private final BillingOrderOriginResolver resolver = new BillingOrderOriginResolver(orders, users, organizations);

    @Test
    void uses_original_orderer_and_department_instead_of_dispensing_operator_or_encounter_department() {
        var charge = charge(1L, 7L, 4L, "MEDICATION_DISPENSE");
        when(charge.enteredBy()).thenReturn(99L);
        when(charge.departmentId()).thenReturn(999L);
        when(orders.findByRequestIds(10L, Set.of(7L), Set.of())).thenReturn(Map.of(7L,
                new OrderOrigin(7L, 4L, 20L, 30L, 40L, "MEDICATION")));
        var department = mock(DepartmentView.class);
        when(department.name()).thenReturn("原开单科室");
        when(organizations.requireDepartment(10L, 20L, 30L)).thenReturn(department);
        when(users.requireAccount(10L, 40L)).thenReturn(new UserAccountReference(40L, 10L, 50L, "doctor", "ACTIVE"));
        var staff = mock(StaffView.class);
        when(staff.fullName()).thenReturn("原开单医生");
        when(organizations.requireStaff(10L, 50L)).thenReturn(new StaffDetailView(staff, List.of(), List.of()));
        var result = resolver.resolve(10L, List.of(charge)).get(1L);
        assertEquals("原开单科室", result.departmentName());
        assertEquals("原开单医生", result.doctorName());
        verify(users).requireAccount(10L, 40L);
        verifyNoMoreInteractions(users);
    }

    @Test
    void missing_or_wrong_encounter_orders_do_not_fabricate_orderer_names() {
        var charge = charge(1L, 7L, 4L, "SERVICE_REQUEST");
        when(orders.findByRequestIds(10L, Set.of(), Set.of(7L))).thenReturn(Map.of());
        assertTrue(resolver.resolve(10L, List.of(charge)).isEmpty());
        when(orders.findByRequestIds(10L, Set.of(), Set.of(7L))).thenReturn(Map.of(7L,
                new OrderOrigin(7L, 999L, 20L, 30L, 40L, "LABORATORY")));
        assertTrue(resolver.resolve(10L, List.of(charge)).isEmpty());
        verifyNoInteractions(users, organizations);
    }

    @Test
    void historical_unlinked_charges_do_not_query_unrelated_request_ids() {
        var charge = charge(1L, null, 4L, "MEDICATION_DISPENSE");
        when(charge.sourceId()).thenReturn(99L);
        assertTrue(resolver.resolve(10L, List.of(charge)).isEmpty());
        verifyNoInteractions(orders, users, organizations);
    }

    private ChargeItem charge(Long id, Long requestId, Long encounterId, String sourceType) {
        var charge = mock(ChargeItem.class);
        when(charge.id()).thenReturn(id);
        when(charge.requestId()).thenReturn(requestId);
        when(charge.encounterId()).thenReturn(encounterId);
        when(charge.sourceType()).thenReturn(sourceType);
        when(charge.reversesChargeItemId()).thenReturn(null);
        return charge;
    }
}
