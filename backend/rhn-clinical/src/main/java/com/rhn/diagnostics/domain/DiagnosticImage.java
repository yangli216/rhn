package com.rhn.diagnostics.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Base64;

/** Immutable image content. Removing a draft image never removes a signed version's evidence. */
@Entity
@Table(name = "RHN_EX_DIAG_IMAGE")
public class DiagnosticImage {
    @Id @Column(name = "ID_DIAG_IMAGE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_DIAG_EXEC_TASK", nullable = false) private Long taskId;
    @Column(name = "CD_CMD", nullable = false) private String commandId;
    @Column(name = "HASH_CONTENT", nullable = false) private String contentHash;
    @Column(name = "SD_MEDIA_TYPE", nullable = false) private String mediaType;
    @Column(name = "NUM_BYTES", nullable = false) private long byteSize;
    @Column(name = "NUM_WIDTH", nullable = false) private int width;
    @Column(name = "NUM_HEIGHT", nullable = false) private int height;
    @Column(name = "DES_CAPTION") private String caption;
    @Column(name = "FG_DRAFT", nullable = false) private boolean draftActive;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "CONTENT_BASE64", nullable = false) private String contentBase64;

    protected DiagnosticImage() {}

    public DiagnosticImage(Long tenantId, Long taskId, String commandId, String contentHash,
                           String mediaType, byte[] bytes, int width, int height, String caption, Long actor) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.taskId = taskId;
        this.commandId = commandId; this.contentHash = contentHash; this.mediaType = mediaType;
        this.byteSize = bytes.length; this.width = width; this.height = height; this.caption = caption;
        this.draftActive = true; this.createdAt = Instant.now(); this.createdBy = actor;
        this.contentBase64 = Base64.getEncoder().encodeToString(bytes);
    }

    public void removeFromDraft() { draftActive = false; }
    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long taskId() { return taskId; }
    public String contentHash() { return contentHash; }
    public String mediaType() { return mediaType; }
    public long byteSize() { return byteSize; }
    public int width() { return width; }
    public int height() { return height; }
    public String caption() { return caption; }
    public boolean draftActive() { return draftActive; }
    public Instant createdAt() { return createdAt; }
    public Long createdBy() { return createdBy; }
    public byte[] content() { return Base64.getDecoder().decode(contentBase64); }
}
