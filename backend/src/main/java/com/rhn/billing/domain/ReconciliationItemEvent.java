package com.rhn.billing.domain;
import com.rhn.shared.id.GlobalIds; import jakarta.persistence.*; import java.time.Instant;
@Entity @Table(name="reconciliation_item_events")
public class ReconciliationItemEvent {
 @Id private Long id; @Column(name="tenant_id") private Long tenantId; @Column(name="reconciliation_item_id") private Long reconciliationItemId;
 @Column(name="event_type") private String eventType; @Column(name="status_from") private String statusFrom; @Column(name="status_to") private String statusTo;
 @Column(name="command_code") private String commandCode; @Column(name="actor_id") private Long actorId; private String reason; @Column(name="occurred_at") private Instant occurredAt;
 protected ReconciliationItemEvent(){} public ReconciliationItemEvent(Long t,Long item,String event,String from,String to,String command,Long actor,String reason){
  id=GlobalIds.next();tenantId=t;reconciliationItemId=item;eventType=event;statusFrom=from;statusTo=to;commandCode=command;actorId=actor;this.reason=reason;occurredAt=Instant.now();}
}
