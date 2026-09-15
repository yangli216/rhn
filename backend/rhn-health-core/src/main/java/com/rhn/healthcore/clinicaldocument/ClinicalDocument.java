package com.rhn.healthcore.clinicaldocument;

import com.rhn.shared.api.BusinessException;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import org.springframework.http.HttpStatus;

import java.time.Instant;

@Entity
@Table(name = "RHN_VIS_CLIN_DOC")
class ClinicalDocument {
    @Id
    @Column(name = "ID_CLIN_DOC") private Long id;
    @Column(name = "ID_TNT", nullable = false)
    private Long tenantId;
    @Column(name = "ID_PAT", nullable = false)
    private Long residentId;
    @Column(name = "ID_ENC")
    private Long encounterId;
    @Column(name = "ID_ORG")
    private Long organizationId;
    @Column(name = "ID_DEPT")
    private Long departmentId;
    @Column(name = "SD_DOC_TYPE", nullable = false)
    private String documentType;
    @Column(name = "CD_INSTANCE_KEY", nullable = false)
    private String instanceKey;
    @Column(name = "NA_TITLE", nullable = false)
    private String title;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false)
    private ClinicalDocumentStatus status;
    @Column(name = "SN_CURRENT_VER", nullable = false)
    private int currentVersion;
    @Column(name = "ID_USER_CREATED", nullable = false)
    private String createdBy;
    @Column(name = "DT_CREATED", nullable = false)
    private Instant createdAt;
    @Column(name = "DT_UPDATED", nullable = false)
    private Instant updatedAt;
    @Version
    @Column(name = "REVISION") private long version;

    protected ClinicalDocument() {
    }

    ClinicalDocument(Long tenantId, Long residentId, Long encounterId, Long organizationId,
                     Long departmentId, String documentType, String instanceKey, String title, String actor) {
        this.id = com.rhn.shared.id.GlobalIds.next();
        this.tenantId = tenantId;
        this.residentId = residentId;
        this.encounterId = encounterId;
        this.organizationId = organizationId;
        this.departmentId = departmentId;
        this.documentType = documentType;
        this.instanceKey = instanceKey;
        this.title = title;
        this.status = ClinicalDocumentStatus.DRAFT;
        this.currentVersion = 1;
        this.createdBy = actor;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    int addDraftVersion(int expectedCurrentVersion, boolean amendment) {
        requireExpectedVersion(expectedCurrentVersion);
        if (amendment) {
            if (status != ClinicalDocumentStatus.SIGNED) {
                throw conflict("DOCUMENT_NOT_SIGNED", "只有已签署文档可以发起修订");
            }
            status = ClinicalDocumentStatus.AMENDMENT_IN_PROGRESS;
        } else if (status != ClinicalDocumentStatus.DRAFT
                && status != ClinicalDocumentStatus.AMENDMENT_IN_PROGRESS) {
            throw conflict("DOCUMENT_NOT_EDITABLE", "当前文档状态不允许更新草稿");
        }
        currentVersion += 1;
        updatedAt = Instant.now();
        return currentVersion;
    }

    void sign(int expectedCurrentVersion) {
        requireExpectedVersion(expectedCurrentVersion);
        if (status != ClinicalDocumentStatus.DRAFT
                && status != ClinicalDocumentStatus.AMENDMENT_IN_PROGRESS) {
            throw conflict("DOCUMENT_NOT_SIGNABLE", "当前文档状态不允许签署");
        }
        status = ClinicalDocumentStatus.SIGNED;
        updatedAt = Instant.now();
    }

    void archive() {
        if (status == ClinicalDocumentStatus.ARCHIVED) {
            throw conflict("DOCUMENT_ALREADY_ARCHIVED", "临床文档已经归档");
        }
        status = ClinicalDocumentStatus.ARCHIVED;
        updatedAt = Instant.now();
    }

    private void requireExpectedVersion(int expected) {
        if (expected != currentVersion) {
            throw conflict("DOCUMENT_VERSION_CONFLICT", "临床文档已被更新，请刷新后重试");
        }
    }

    private BusinessException conflict(String code, String message) {
        return new BusinessException(code, message, HttpStatus.CONFLICT);
    }

    Long id() { return id; }
    Long tenantId() { return tenantId; }
    Long residentId() { return residentId; }
    Long encounterId() { return encounterId; }
    Long organizationId() { return organizationId; }
    Long departmentId() { return departmentId; }
    String documentType() { return documentType; }
    String instanceKey() { return instanceKey; }
    String title() { return title; }
    ClinicalDocumentStatus status() { return status; }
    int currentVersion() { return currentVersion; }
    String createdBy() { return createdBy; }
    Instant createdAt() { return createdAt; }
    Instant updatedAt() { return updatedAt; }
    long version() { return version; }
}
