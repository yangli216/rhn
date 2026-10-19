package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds; import jakarta.persistence.*; import java.time.Instant;
@Entity @Table(name="RHN_BIL_RECON_ITEM_EVT")
public class ReconciliationItemEvent {
 @Id @Column(name = "ID_RECON_ITEM_EVT") private Long id; @Column(name = "ID_TNT") private Long tenantId; @Column(name = "ID_RECON_ITEM") private Long reconciliationItemId;
 @Column(name = "SD_EVT_TYPE") private String eventType; @Column(name = "SD_STATUS_FROM") private String statusFrom; @Column(name = "SD_STATUS_TO") private String statusTo;
 @Column(name = "CD_COMMAND") private String commandCode; @Column(name = "ID_ACTOR") private Long actorId; @Column(name = "DES_REASON") private String reason; @Column(name = "DT_OCCRD") private Instant occurredAt;
 @Column(name="TXT_INPUT_HASH") private String inputHash;
 public ReconciliationItemEvent fingerprint(String hash){inputHash=hash;return this;}
 public String inputHash(){return inputHash;} public String eventType(){return eventType;} public String statusTo(){return statusTo;} public String reason(){return reason;} public Long actorId(){return actorId;} public Instant occurredAt(){return occurredAt;}
 protected ReconciliationItemEvent(){} public ReconciliationItemEvent(Long t,Long item,String event,String from,String to,String command,Long actor,String reason){
  id=GlobalIds.next();tenantId=t;reconciliationItemId=item;eventType=event;statusFrom=from;statusTo=to;commandCode=command;actorId=actor;this.reason=reason;occurredAt=Instant.now();}
}
