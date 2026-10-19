package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation;
import com.rhn.billing.domain.ReconciliationBatch;
import com.rhn.shared.context.*;
import org.springframework.stereotype.Component;
import static com.rhn.shared.api.BusinessErrors.*;

@Component
public class ReconciliationAccess {
 private final ExecutionContextProvider contexts;private final com.rhn.platform.organization.api.OrganizationDirectory organizations;
 public ReconciliationAccess(ExecutionContextProvider contexts,com.rhn.platform.organization.api.OrganizationDirectory organizations){this.contexts=contexts;this.organizations=organizations;}
 public ExecutionContext require(String permission){var c=contexts.requireCurrent();if(!c.hasAuthority(permission)&&!c.hasAuthority("ROLE_ADMIN"))throw forbidden("RECON_PERMISSION_REQUIRED","当前账号无此支付对账权限");if(!c.hasWorkContext())throw forbidden("RECON_WORK_CONTEXT_REQUIRED","请先选择工作机构");return c;}
 public ExecutionContext organization(String permission,Long org){var c=require(permission);if(org==null||!c.canAccessOrganization(org)&&!"TENANT".equals(c.dataScopeType())&&!c.hasAuthority("ROLE_ADMIN"))throw forbidden("RECON_ORGANIZATION_FORBIDDEN","不能维护未授权机构的对账策略");organizations.requireOrganization(c.tenantId(),org);return c;}
 public void batch(ReconciliationBatch batch,ExecutionContext c){if(!batch.tenantId().equals(c.tenantId())||!batch.organizationId().equals(c.organizationId()))throw forbidden("RECON_ORGANIZATION_FORBIDDEN","不能访问其他机构的对账结果");}
 public boolean merchantReader(ExecutionContext c){return c.hasAuthority("ROLE_ADMIN")||c.hasAuthority(PaymentReconciliation.MERCHANT_READ)&&"TENANT".equals(c.dataScopeType());}
 public void requireMerchant(ExecutionContext c){if(!merchantReader(c))throw forbidden("RECON_MERCHANT_SCOPE_REQUIRED","商户全账与未归属流水需要商户范围财务授权");}
}
