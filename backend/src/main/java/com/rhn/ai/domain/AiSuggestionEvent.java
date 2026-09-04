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
@Table(name = "RHN_AI_SUGGEST_EVT")
public class AiSuggestionEvent {
    @Id @Column(name = "ID_AI_SUGGEST_EVT") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_AI_SUGGEST", nullable = false) private Long suggestionId;
    @Column(name = "SD_EVT_TYPE", nullable = false) private String eventType;
    @Column(name = "SD_STATUS_FROM") private String statusFrom;
    @Column(name = "SD_STATUS_TO") private String statusTo;
    @Column(name = "ID_PRACT", nullable = false) private Long practitionerId;
    @Column(name = "ID_USER", nullable = false) private Long userId;
    @Column(name = "CD_SECTION") private String sectionCode;
    @Column(name = "HASH_CONTEXT", nullable = false) private String contextHash;
    @Column(name = "CD_COMMAND", nullable = false) private String commandCode;
    @Column(name = "DES_DETAIL") private String detail;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_ACTION", nullable = false) private String actionJson;
    @Column(name = "DT_OCCURRED", nullable = false) private Instant occurredAt;

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
