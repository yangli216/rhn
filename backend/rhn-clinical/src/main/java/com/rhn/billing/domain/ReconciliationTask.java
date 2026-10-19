package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.time.*;
@Entity @Table(name="RHN_BIL_RECON_TASK")
public class ReconciliationTask {
 @Id @Column(name="ID_RECON_TASK") private Long id;
 @Version @Column(name="REVISION") private long revision;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="ID_ORG_CRED",nullable=false) private Long credentialOrganizationId;
 @Column(name="CD_PAY_METHOD",nullable=false) private String paymentMethodCode;
 @Column(name="CD_ADAPTER",nullable=false) private String adapterCode;
 @Column(name="CD_MERCH_SCOPE",nullable=false) private String merchantScope;
 @Column(name="ID_MERCH",nullable=false) private String merchantId;
 @Column(name="CD_ENV",nullable=false) private String environment;
 @Column(name="ID_APP",nullable=false) private String appId;
 @Column(name="DA_BIZ",nullable=false) private LocalDate businessDate;
 @Column(name="CD_CCY",nullable=false) private String currencyCode;
 @Column(name="SD_STATUS",nullable=false) private String status;
 @Column(name="QTY_ATTEMPT",nullable=false) private int attempt;
 @Column(name="NUM_CLAIM",nullable=false) private long claimToken;
 @Column(name="DT_NEXT",nullable=false) private Instant nextAttemptAt;
 @Column(name="DT_LEASE") private Instant leaseUntil;
 @Column(name="DT_CMPLD") private Instant completedAt;
 @Column(name="DES_ERROR") private String errorMessage;
 @Column(name="CD_ERROR") private String errorCode;
 @Column(name="ID_RECON_FILE") private Long latestFileId;
 @Column(name="ID_USER_CREATED",nullable=false) private Long createdBy;
 @Column(name="DT_CREATED",nullable=false) private Instant createdAt;
 @Column(name="CD_REQUEST",nullable=false) private String requestCode;
 protected ReconciliationTask(){}
 public ReconciliationTask(Long tenant,Long org,String method,String adapter,String scope,String merchant,String environment,String app,LocalDate date,String currency,Long actor,String request){
  id=GlobalIds.next();tenantId=tenant;credentialOrganizationId=org;paymentMethodCode=method;adapterCode=adapter;merchantScope=scope;merchantId=merchant;this.environment=environment;appId=app;businessDate=date;currencyCode=currency;createdBy=actor;createdAt=Instant.now();status="QUEUED";nextAttemptAt=createdAt;requestCode=request;
 }
 public boolean claim(Instant now){if(nextAttemptAt.isAfter(now)||"RUNNING".equals(status)&&leaseUntil!=null&&leaseUntil.isAfter(now)||!java.util.Set.of("QUEUED","RETRY_WAIT","WAITING_STATEMENT","RUNNING").contains(status))return false;status="RUNNING";leaseUntil=now.plusSeconds(300);claimToken++;attempt++;return true;}
 public boolean owns(long token){return "RUNNING".equals(status)&&claimToken==token&&leaseUntil!=null&&leaseUntil.isAfter(Instant.now());}
 public void finished(Long file){completedAt=Instant.now();errorMessage=null;status="COMPLETED";latestFileId=file;leaseUntil=null;errorCode=null;}
 public void failed(String safeCode,String safeMessage,boolean retry,boolean waiting){errorMessage=safeMessage;status=retry?(waiting?"WAITING_STATEMENT":"RETRY_WAIT"):"FAILED";errorCode=safeCode;leaseUntil=null;nextAttemptAt=Instant.now().plusSeconds(Math.min(3600,60L*(1L<<Math.min(attempt,5))));}
 public void retry(Instant now){if("RUNNING".equals(status)&&leaseUntil!=null&&leaseUntil.isAfter(now))throw new IllegalStateException("任务正在处理");status="QUEUED";nextAttemptAt=now;claimToken++;}
 public Instant completedAt(){return completedAt;} public String errorMessage(){return errorMessage;}
 public Long id(){return id;} public long revision(){return revision;} public Long tenantId(){return tenantId;} public Long credentialOrganizationId(){return credentialOrganizationId;}
 public String paymentMethodCode(){return paymentMethodCode;} public String adapterCode(){return adapterCode;} public String merchantScope(){return merchantScope;} public String merchantId(){return merchantId;} public String environment(){return environment;} public String appId(){return appId;}
 public LocalDate businessDate(){return businessDate;} public String currencyCode(){return currencyCode;} public String status(){return status;} public int attempt(){return attempt;} public long claimToken(){return claimToken;}
 public Instant nextAttemptAt(){return nextAttemptAt;} public Long latestFileId(){return latestFileId;} public Long createdBy(){return createdBy;} public String errorCode(){return errorCode;} public String requestCode(){return requestCode;} public Instant createdAt(){return createdAt;}
}
