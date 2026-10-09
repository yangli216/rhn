package com.rhn.billing.application;

import com.rhn.billing.api.BillingViews.ChargeOrderingView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.outpatient.api.OutpatientOrderOriginDirectory;
import com.rhn.outpatient.api.OutpatientOrderOriginDirectory.OrderOrigin;
import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.*;

/** Display original requester facts, never the dispensing or charge-entry operator. */
@Component
public class BillingOrderOriginResolver {
    private final OutpatientOrderOriginDirectory orders;
    private final IdentityAccessDirectory users;
    private final OrganizationDirectory organizations;

    public BillingOrderOriginResolver(OutpatientOrderOriginDirectory orders, IdentityAccessDirectory users,
                                      OrganizationDirectory organizations) {
        this.orders = orders; this.users = users; this.organizations = organizations;
    }

    public Map<Long, ChargeOrderingView> resolve(Long tenantId, List<ChargeItem> charges) {
        Set<Long> medicationIds = new HashSet<>(), serviceIds = new HashSet<>();
        Map<Long, Long> requestByCharge = new HashMap<>();
        for (ChargeItem charge : charges) {
            Long id = charge.requestId();
            if (id == null && charge.sourceType() != null && Set.of("MEDICATION_REQUEST", "SERVICE_REQUEST").contains(charge.sourceType())) id = charge.sourceId();
            if (id == null) continue;
            if (charge.sourceType() != null && charge.sourceType().startsWith("MEDICATION")) medicationIds.add(id);
            else if (charge.sourceType() != null && charge.sourceType().startsWith("SERVICE")) serviceIds.add(id);
            else continue;
            requestByCharge.put(charge.id(), id);
        }
        // 冲销沿用原收费关联的开单来源，不把冲销处理人当作开单医生。
        for (ChargeItem charge : charges) if (!requestByCharge.containsKey(charge.id())) {
            Long request = requestByCharge.get(charge.reversesChargeItemId());
            if (request != null) requestByCharge.put(charge.id(), request);
        }
        if (medicationIds.isEmpty() && serviceIds.isEmpty()) return Map.of();
        Map<Long, OrderOrigin> origins = orders.findByRequestIds(tenantId, medicationIds, serviceIds);
        Map<OrderingIdentity, ChargeOrderingView> resolvedNames = new HashMap<>();
        Map<Long, ChargeOrderingView> result = new HashMap<>();
        for (ChargeItem charge : charges) {
            Long requestId = requestByCharge.get(charge.id());
            if (requestId == null) continue;
            OrderOrigin origin = origins.get(requestId);
            if (origin == null || !Objects.equals(origin.encounterId(), charge.encounterId())) continue;
            var identity = new OrderingIdentity(origin.organizationId(), origin.departmentId(), origin.authorUserId(), origin.serviceType());
            result.put(charge.id(), resolvedNames.computeIfAbsent(identity, id -> display(tenantId, origin)));
        }
        return result;
    }

    private record OrderingIdentity(Long organizationId, Long departmentId, Long authorId, String serviceType) {}

    private ChargeOrderingView display(Long tenantId, OrderOrigin origin) {
        String departmentName = null, doctorName = null;
        Long practitionerId = null;
        if (origin.organizationId() != null && origin.departmentId() != null) {
            try {
                departmentName = organizations.requireDepartment(tenantId, origin.organizationId(), origin.departmentId()).name();
            } catch (BusinessException error) { if (error.status() != HttpStatus.NOT_FOUND) throw error; }
        }
        if (origin.authorUserId() != null) {
            try {
                practitionerId = users.requireAccount(tenantId, origin.authorUserId()).practitionerId();
                if (practitionerId != null) doctorName = organizations.requireStaff(tenantId, practitionerId).practitioner().fullName();
            } catch (BusinessException error) { if (error.status() != HttpStatus.NOT_FOUND) throw error; }
        }
        return new ChargeOrderingView(origin.departmentId(), departmentName, practitionerId, doctorName, origin.serviceType());
    }
}
