package com.rhn.billing.application;

import com.rhn.platform.identityaccess.api.IdentityAccessDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.api.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/** Resolves the recorded finalizer; never substitutes the invoice creator or current operator. */
@Component
public class BillingCashierResolver {
    private final IdentityAccessDirectory users;
    private final OrganizationDirectory organizations;
    public BillingCashierResolver(IdentityAccessDirectory users, OrganizationDirectory organizations) {
        this.users = users; this.organizations = organizations;
    }
    public record Cashier(String name, String username) {}
    public Cashier resolve(Long tenantId, Long id) {
        if (id == null) return new Cashier(null, null);
        String name = null, username = null;
        try {
            var account = users.requireAccount(tenantId, id);
            username = account.username();
            if (account.practitionerId() != null) name = organizations.requireStaff(tenantId, account.practitionerId()).practitioner().fullName();
        } catch (BusinessException error) { if (error.status() != HttpStatus.NOT_FOUND) throw error; }
        return new Cashier(name, username);
    }

    /** A currently active holder of a billing position in the organization, together with the account to attribute settlements to. */
    public record BillingStaff(Long userId, String name, String username, String positionName) {}

    /** Accounts of practitioners with an active billing-position assignment in the organization on the given date. */
    public java.util.List<BillingStaff> activeBillingStaff(Long tenantId, Long organizationId, java.time.LocalDate onDate) {
        var staff = organizations.activeStaffByPositionType(tenantId, organizationId, "BILLING", onDate);
        var byPractitioner = new java.util.HashMap<Long, com.rhn.platform.organization.api.PositionStaffRef>();
        staff.forEach(value -> byPractitioner.put(value.practitionerId(), value));
        return users.findAccountsByPractitioners(tenantId, byPractitioner.keySet()).stream()
                .filter(account -> "ACTIVE".equals(account.status()))
                .map(account -> new BillingStaff(account.id(), byPractitioner.get(account.practitionerId()).practitionerName(),
                        account.username(), byPractitioner.get(account.practitionerId()).positionName())).toList();
    }
}
