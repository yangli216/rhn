package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="RHN_BIL_RECON_FILE")
public class ReconciliationStatementFile {
 @Id @Column(name="ID_RECON_FILE") private Long id;
 @Column(name="ID_TNT",nullable=false) private Long tenantId;
 @Column(name="ID_RECON_TASK",nullable=false) private Long taskId;
 @Column(name="NUM_ATTEMPT",nullable=false) private int attempt;
 @Column(name="TXT_SHA",nullable=false) private String sha256;
 @Lob @Column(name="TXT_CIPHER",nullable=false) private String encryptedFiles;
 @Column(name="CD_PARSER",nullable=false) private String parserVersion;
 @Column(name="CD_RULE",nullable=false) private String ruleVersion;
 @Column(name="TXT_LOCAL_HASH",nullable=false) private String localSnapshotHash;
 @Column(name="TXT_PROOF",nullable=false) private String proof;
 @Column(name="DT_CREATED",nullable=false) private Instant createdAt;
 @Column(name="FL_CMPL",nullable=false) private boolean complete;
 protected ReconciliationStatementFile(){}
 public ReconciliationStatementFile(Long tenant,Long task,int attempt,String sha,String parser,String localHash,String proof){id=GlobalIds.next();tenantId=tenant;taskId=task;this.attempt=attempt;sha256=sha;parserVersion=parser;ruleVersion="TRADE-1";localSnapshotHash=localHash;this.proof=proof;createdAt=Instant.now();}
 public void setEncryptedFiles(String ciphertext){encryptedFiles=ciphertext;}
 public void snapshot(String hash){if(complete)throw new IllegalStateException("证据已发布");localSnapshotHash=hash;}
 public void complete(){complete=true;}
 public Long id(){return id;} public Long tenantId(){return tenantId;} public Long taskId(){return taskId;} public int attempt(){return attempt;} public String sha256(){return sha256;}
 public String encryptedFiles(){return encryptedFiles;} public String parserVersion(){return parserVersion;} public String ruleVersion(){return ruleVersion;} public String localSnapshotHash(){return localSnapshotHash;} public Instant createdAt(){return createdAt;} public String proof(){return proof;} public boolean isComplete(){return complete;}
}
