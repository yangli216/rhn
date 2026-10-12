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
}
