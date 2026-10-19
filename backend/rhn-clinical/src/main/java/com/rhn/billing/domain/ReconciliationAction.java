package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="RHN_BIL_RECON_ACTION")
public class ReconciliationAction {
 @Id @Column(name="ID_RECON_ACTION") private Long id;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="CD_COMMAND",nullable=false) private String commandCode;
 @Column(name="TXT_INPUT_HASH",nullable=false) private String inputHash;
 @Column(name="SD_ACTION",nullable=false) private String action;
 @Column(name="ID_TARGET",nullable=false) private Long targetId;
 @Column(name="ID_ACTOR",nullable=false) private Long actorId;
 @Column(name="DES_REASON") private String reason;
 @Column(name="DT_CREATED",nullable=false) private Instant createdAt;
 @Column(name="SD_STATUS",nullable=false) private String status="COMPLETED";
 @Lob @Column(name="TXT_RESULT") private String result;
 @Column(name="DT_LEASE") private Instant leaseUntil;
 public void begin(){status="PROCESSING";leaseUntil=Instant.now().plusSeconds(120);}
 public void completed(String result){status="COMPLETED";this.result=result;leaseUntil=null;}
 public String status(){return status;} public String result(){return result;} public boolean expired(){return leaseUntil==null||leaseUntil.isBefore(Instant.now());}
 protected ReconciliationAction(){}
 public ReconciliationAction(Long tenant,String command,String hash,String action,Long target,Long actor,String reason){id=GlobalIds.next();tenantId=tenant;commandCode=command;inputHash=hash;this.action=action;targetId=target;actorId=actor;this.reason=reason;createdAt=Instant.now();}
 public String inputHash(){return inputHash;} public String action(){return action;} public Long targetId(){return targetId;} public Long actorId(){return actorId;}
}
