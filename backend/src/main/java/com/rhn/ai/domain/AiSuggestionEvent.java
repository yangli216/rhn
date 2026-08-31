package com.rhn.ai.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "ai_suggestion_events")
public class AiSuggestionEvent {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "suggestion_id", nullable = false) private Long suggestionId;
    @Column(name = "event_type", nullable = false) private String eventType;
    @Column(name = "status_from") private String statusFrom;
    @Column(name = "status_to") private String statusTo;
    @Column(name = "practitioner_id", nullable = false) private Long practitionerId;
    @Column(name = "user_id", nullable = false) private Long userId;
    @Column(name = "section_code") private String sectionCode;
    @Column(name = "context_hash", nullable = false) private String contextHash;
    @Column(name = "command_code", nullable = false) private String commandCode;
    private String detail;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "action_json", nullable = false) private String actionJson;
    @Column(name = "occurred_at", nullable = false) private Instant occurredAt;

    protected AiSuggestionEvent() {}

    public AiSuggestionEvent(Long tenantId, Long suggestionId, String eventType, String statusFrom, String statusTo,
                             Long practitionerId, Long userId, String sectionCode, String contextHash,
                             String commandCode, String detail, String actionJson, Instant occurredAt) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.suggestionId = suggestionId;
        this.eventType = eventType;
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.practitionerId = practitionerId;
        this.userId = userId;
        this.sectionCode = sectionCode;
        this.contextHash = contextHash;
        this.commandCode = commandCode;
        this.detail = detail;
        this.actionJson = actionJson;
        this.occurredAt = occurredAt;
    }

    public Long id() { return id; }
    public String eventType() { return eventType; }
    public String statusFrom() { return statusFrom; }
    public String statusTo() { return statusTo; }
    public String commandCode() { return commandCode; }
    public String contextHash() { return contextHash; }
    public String sectionCode() { return sectionCode; }
    public String detail() { return detail; }
    public Instant occurredAt() { return occurredAt; }
}
