package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="RHN_BIL_RECON_ATTEMPT")
public class ReconciliationAttempt {
 @Id @Column(name="ID_RECON_ATTEMPT") private Long id;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="ID_RECON_TASK",nullable=false) private Long taskId;
 @Column(name="NUM_ATTEMPT",nullable=false) private int attempt;
 @Column(name="NUM_CLAIM",nullable=false) private long claimToken;
 @Column(name="SD_STATUS",nullable=false) private String status;
 @Column(name="DT_STARTED",nullable=false) private Instant startedAt;
 @Column(name="DT_FINSH") private Instant finishedAt;
 @Column(name="CD_ERROR") private String errorCode;
 @Column(name="DES_ERROR") private String errorMessage;
 @Column(name="ID_RECON_FILE") private Long fileId;
 protected ReconciliationAttempt(){}
 public ReconciliationAttempt(Long tenant,Long task,int attempt,long token){id=GlobalIds.next();tenantId=tenant;taskId=task;this.attempt=attempt;claimToken=token;status="RUNNING";startedAt=Instant.now();}
 public void evidence(Long file){fileId=file;}
 public void finish(String status,Long file,String code,String message){this.status=status;if(file!=null)fileId=file;errorCode=code;errorMessage=message;finishedAt=Instant.now();}
 public int attempt(){return attempt;} public long claimToken(){return claimToken;} public String status(){return status;} public Instant startedAt(){return startedAt;} public Instant finishedAt(){return finishedAt;} public String errorCode(){return errorCode;} public String errorMessage(){return errorMessage;} public Long fileId(){return fileId;}
}
