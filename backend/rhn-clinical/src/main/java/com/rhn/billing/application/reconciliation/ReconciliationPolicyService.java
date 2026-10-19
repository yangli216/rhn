package com.rhn.billing.application.reconciliation;

import com.rhn.billing.api.PaymentReconciliation.*;
import com.rhn.billing.application.ReconciliationAdapterRegistry;
import com.rhn.billing.domain.*;
import com.rhn.billing.infrastructure.*;
import com.rhn.platform.dictionary.api.DictionaryBinding;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.api.StaleRevisionException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;
import static com.rhn.billing.api.PaymentReconciliation.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class ReconciliationPolicyService {
 private final ReconciliationAccess access;
 private final ReconciliationAdapterRegistry adapters;
 private final ReconciliationPolicyRepository policies;
 private final ReconciliationMerchantAccountRepository accounts;
 public ReconciliationPolicyService(ReconciliationAccess access,ReconciliationAdapterRegistry adapters,ReconciliationPolicyRepository policies,ReconciliationMerchantAccountRepository accounts){this.access=access;this.adapters=adapters;this.policies=policies;this.accounts=accounts;}
 @Transactional(readOnly=true)
 public List<PaymentReconciliationChannelView> catalog(){var c=access.require(READ);return adapters.capabilities().stream().map(cap->{
  try{var scope=adapters.require(cap.paymentMethodCode()).merchantScope(c.tenantId(),c.organizationId());return new PaymentReconciliationChannelView(cap,true,mask(scope.merchantId()),null);}
  catch(RuntimeException e){return new PaymentReconciliationChannelView(cap,false,null,"当前机构未配置可读取的渠道商户身份，请先维护支付渠道");}
 }).toList();}
 @Transactional(readOnly=true)
 public PaymentReconciliationPolicyView get(String method){return getFor(access.require(READ).organizationId(),method);}
 @Transactional(readOnly=true) public PaymentReconciliationPolicyView getFor(Long org,String method){var c=access.organization(READ,org);var cap=adapters.require(method).statementCapability();var p=policies.findByTenantIdAndOrganizationIdAndPaymentMethodCode(c.tenantId(),org,method).orElse(null);return view(p,cap);}
 @Transactional
 public PaymentReconciliationPolicyView save(String method,long expected,boolean auto,String time,int days){return saveFor(access.require(RUN).organizationId(),method,expected,auto,time,days);}
 @Transactional public PaymentReconciliationPolicyView saveFor(Long org,String method,long expected,boolean auto,String time,int days){var c=access.organization(RUN,org);var adapter=adapters.require(method);var cap=adapter.statementCapability();
  LocalTime fetch;try{fetch=LocalTime.parse(time);}catch(Exception e){throw badRequest("RECON_POLICY_TIME_INVALID","请输入有效的拉取时刻");}
  if(fetch.isBefore(LocalTime.parse(cap.availableAfter()))||days<1||days>Math.min(90,cap.historyDays()))throw badRequest("RECON_POLICY_INVALID","拉取时刻早于渠道出账建议时刻，或补拉天数超出允许范围");
  var scope=adapter.merchantScope(c.tenantId(),org);registerAccount(c.tenantId(),scope.fingerprint());
  var existing=policies.findByTenantIdAndOrganizationIdAndPaymentMethodCode(c.tenantId(),org,method).orElse(null);
  if((existing==null?-1:existing.revision())!=expected)throw new StaleRevisionException(existing==null?-1L:existing.revision());
  var p=ensureBinding(c.tenantId(),org,method,scope.fingerprint(),c.subjectId());p.update(p.revision(),auto,time,days,c.subjectId());policies.saveAndFlush(p);return view(p,cap);
 }
 public ReconciliationPolicy ensureBinding(Long tenant,Long org,String method,String scope,Long actor){
  registerAccount(tenant,scope);
  var p=policies.findByTenantIdAndOrganizationIdAndPaymentMethodCode(tenant,org,method).orElse(null);
  if(p==null){p=new ReconciliationPolicy(tenant,org,method,scope);p.update(0,false,"11:00",7,actor);return policies.saveAndFlush(p);}
  if(!p.merchantScope().equals(scope))throw conflict("RECON_MERCHANT_BINDING_CHANGED","当前商户身份与历史对账绑定不一致，需要单独迁移");return p;
 }
 public void registerAccount(Long tenant,String scope){var account=accounts.findByMerchantScope(scope).orElse(null);if(account==null)account=accounts.saveAndFlush(new ReconciliationMerchantAccount(tenant,scope));if(!account.tenantId().equals(tenant))throw conflict("RECON_CROSS_TENANT_MERCHANT","当前收款商户已用于其他租户，必须先完成账单隔离迁移");}
 private PaymentReconciliationPolicyView view(ReconciliationPolicy p,StatementCapability cap){return new PaymentReconciliationPolicyView(p==null?-1:p.revision(),cap.paymentMethodCode(),p!=null&&p.autoEnabled(),p==null?"11:00":p.fetchTime(),p==null?7:p.backfillDays(),cap.zoneId(),cap.availableAfter(),Math.min(90,cap.historyDays()),p==null?null:p.scheduleError(),p==null?null:p.scheduleErrorAt());}
 private String mask(String s){return s.length()<=4?"****":"****"+s.substring(s.length()-4);}
 public record PaymentReconciliationChannelView(StatementCapability capability,boolean configured,String merchantLabel,String unavailableReason){}
 public record PaymentReconciliationPolicyView(long revision,@DictionaryBinding("PAY_METHOD")String paymentMethodCode,boolean autoEnabled,String fetchTime,int backfillDays,String zoneId,String availableAfter,int maximumBackfillDays,String scheduleError,Instant scheduleErrorAt){}
}
