package com.rhn.outpatient.template;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;

@Entity
@Table(name = "RHN_META_OP_NOTE_FORM_VER")
class OutpatientNoteFormVersion {
    @Id @Column(name = "ID_OP_NOTE_FORM_VER") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "ID_DEPT", nullable = false) private Long departmentId;
    @Column(name = "CD_FORM", nullable = false) private String formCode;
    @Column(name = "CD_VER_NUMBER", nullable = false) private int versionNumber;
    @Column(name = "CD_SPECLTY", nullable = false) private String specialtyCode;
    @Column(name = "NA_FORM", nullable = false) private String name;
    @Column(name = "DES_OP_NOTE_FORM_VER") private String description;
    @Column(name = "JSON_DEF_SCHEMA", nullable = false) private String definitionSchema;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "JSON_DEF", nullable = false) private String definitionJson;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "ID_USER_PUBLISD", nullable = false) private Long publishedBy;
    @Column(name = "DT_PUBLISD", nullable = false) private Instant publishedAt;
    @Column(name = "DT_RETIRED") private Instant retiredAt;

    protected OutpatientNoteFormVersion() {}

    OutpatientNoteFormVersion(Long tenantId, Long organizationId, Long departmentId, String formCode,
                              int versionNumber, String specialtyCode, String name, String description,
                              String definitionSchema, String definitionJson, Long actorId, Instant now) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId;
        this.departmentId = departmentId; this.formCode = formCode; this.versionNumber = versionNumber;
        this.specialtyCode = specialtyCode; this.name = name; this.description = description;
        this.definitionSchema = definitionSchema; this.definitionJson = definitionJson;
        this.status = "PUBLISHED"; this.publishedBy = actorId; this.publishedAt = now;
    }

    void retire(Instant now) { status = "RETIRED"; retiredAt = now; }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String formCode() { return formCode; }
    int versionNumber() { return versionNumber; }
    String specialtyCode() { return specialtyCode; }
    String name() { return name; }
    String description() { return description; }
    String definitionSchema() { return definitionSchema; }
    String definitionJson() { return definitionJson; }
    String status() { return status; }
    Long publishedBy() { return publishedBy; }
    Instant publishedAt() { return publishedAt; }
    Instant retiredAt() { return retiredAt; }
}
