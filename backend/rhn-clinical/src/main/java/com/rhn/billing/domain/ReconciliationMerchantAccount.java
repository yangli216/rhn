package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
@Entity @Table(name="RHN_BIL_RECON_ACCT")
public class ReconciliationMerchantAccount {
 @Id @Column(name="ID_RECON_ACCT") private Long id;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="CD_MERCH_SCOPE",nullable=false) private String merchantScope;
 protected ReconciliationMerchantAccount(){}
 public ReconciliationMerchantAccount(Long tenant,String scope){id=GlobalIds.next();tenantId=tenant;merchantScope=scope;}
 public Long id(){return id;} public Long tenantId(){return tenantId;} public String merchantScope(){return merchantScope;}
}
