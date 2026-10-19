package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.api.StaleRevisionException;
import jakarta.persistence.*;
import java.time.*;
@Entity @Table(name="RHN_BIL_RECON_POLICY")
public class ReconciliationPolicy {
 @Id @Column(name="ID_RECON_POLICY") private Long id;
 @Version @Column(name="REVISION") private long revision;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="ID_ORG",nullable=false) private Long organizationId;
 @Column(name="CD_PAY_METHOD",nullable=false) private String paymentMethodCode;
 @Column(name="CD_MERCH_SCOPE",nullable=false) private String merchantScope;
 @Column(name="FL_AUTO",nullable=false) private boolean autoEnabled;
 @Column(name="TM_FETCH",nullable=false) private String fetchTime;
 @Column(name="QTY_BKFILL",nullable=false) private int backfillDays;
 @Column(name="ID_USER_UPDATED",nullable=false) private Long updatedBy;
 @Column(name="DT_UPDATED",nullable=false) private Instant updatedAt;
 @Column(name="DES_SCHED_ERROR") private String scheduleError;
 @Column(name="DT_SCHED_ERROR") private Instant scheduleErrorAt;
 public void scheduleError(String message){if(java.util.Objects.equals(scheduleError,message))return;scheduleError=message;scheduleErrorAt=message==null?null:Instant.now();}
 public String scheduleError(){return scheduleError;} public Instant scheduleErrorAt(){return scheduleErrorAt;}
 protected ReconciliationPolicy(){}
 public ReconciliationPolicy(Long t,Long o,String method,String scope){id=GlobalIds.next();tenantId=t;organizationId=o;paymentMethodCode=method;merchantScope=scope;}
 public void update(long expected,boolean auto,String time,int days,Long actor){if(revision!=expected)throw new StaleRevisionException(revision);autoEnabled=auto;fetchTime=LocalTime.parse(time).toString();backfillDays=days;updatedBy=actor;updatedAt=Instant.now();}
 public Long id(){return id;} public long revision(){return revision;} public Long tenantId(){return tenantId;} public Long organizationId(){return organizationId;}
 public String paymentMethodCode(){return paymentMethodCode;} public String merchantScope(){return merchantScope;} public boolean autoEnabled(){return autoEnabled;}
 public String fetchTime(){return fetchTime;} public int backfillDays(){return backfillDays;} public Long updatedBy(){return updatedBy;}
}
