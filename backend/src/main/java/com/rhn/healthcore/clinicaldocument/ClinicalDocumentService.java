package com.rhn.healthcore.clinicaldocument;

import com.rhn.healthcore.api.ClinicalDocumentDirectory;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.eventing.api.DomainEventPublisher;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.cryptography.api.CryptographicEvidenceService;
import com.rhn.platform.cryptography.api.EvidenceReceipt;
import com.rhn.platform.cryptography.api.ProtectionProfile;
import com.rhn.platform.cryptography.api.ProtectionRequest;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class ClinicalDocumentService implements ClinicalDocumentDirectory {
    private final ClinicalDocumentRepository documentRepository;
    private final ClinicalDocumentVersionRepository versionRepository;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final DomainEventPublisher eventPublisher;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider executionContextProvider;
    private final CryptographicEvidenceService cryptographicEvidenceService;

    public ClinicalDocumentService(ClinicalDocumentRepository documentRepository,
                                   ClinicalDocumentVersionRepository versionRepository,
                                   ResidentDirectory residentDirectory,
                                   OrganizationDirectory organizationDirectory,
                                   DomainEventPublisher eventPublisher,
                                   JsonCodec jsonCodec,
                                   ExecutionContextProvider executionContextProvider,
                                   CryptographicEvidenceService cryptographicEvidenceService) {
        this.documentRepository = documentRepository;
        this.versionRepository = versionRepository;
        this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory;
        this.eventPublisher = eventPublisher;
        this.jsonCodec = jsonCodec;
        this.executionContextProvider = executionContextProvider;
        this.cryptographicEvidenceService = cryptographicEvidenceService;
    }

    @Transactional
    public ClinicalDocumentResponse create(Long residentId, Long encounterId, Long organizationId,
                                           Long departmentId, String documentType, String title,
                                           String contentSchema, JsonNode content, String changeReason) {
        Long tenantId = TenantContext.requireTenantId();
        Long canonicalResidentId = residentDirectory.resolveCanonicalResidentId(residentId);
        validateOrganization(tenantId, organizationId, departmentId);
        ClinicalDocument document = documentRepository.save(new ClinicalDocument(tenantId, canonicalResidentId,
                encounterId, organizationId, departmentId, documentType, title, actor()));
        saveProtectedVersion(document, 1, serialize(content), contentSchema, "CREATE", changeReason);
        return toResponse(document);
    }

    @Override
    @Transactional
    public Long upsertEncounterDraft(Long residentId, Long encounterId, Long organizationId, Long departmentId,
                                     String documentType, String title, String contentSchema,
                                     Map<String, Object> content, String changeReason) {
        Long tenantId = TenantContext.requireTenantId();
        Long canonicalResidentId = residentDirectory.resolveCanonicalResidentId(residentId);
        validateOrganization(tenantId, organizationId, departmentId);
        ClinicalDocument document = documentRepository
                .findByTenantIdAndEncounterIdAndDocumentType(tenantId, encounterId, documentType)
                .orElse(null);
        if (document == null) {
            document = documentRepository.save(new ClinicalDocument(tenantId, canonicalResidentId, encounterId,
                    organizationId, departmentId, documentType, title, actor()));
            saveProtectedVersion(document, 1, serialize(content), contentSchema, "CREATE", changeReason);
        } else {
            int nextVersion = document.addDraftVersion(document.currentVersion(), false);
            saveProtectedVersion(document, nextVersion, serialize(content), contentSchema, "UPDATE", changeReason);
        }
        return document.id();
    }

    @Transactional
    public ClinicalDocumentResponse updateDraft(Long documentId, int expectedCurrentVersion,
                                                String contentSchema, JsonNode content, String changeReason) {
        ClinicalDocument document = requireDocument(documentId);
        int nextVersion = document.addDraftVersion(expectedCurrentVersion, false);
        saveProtectedVersion(document, nextVersion, serialize(content), contentSchema, "UPDATE", changeReason);
        return toResponse(document);
    }

    @Transactional
    public ClinicalDocumentResponse amend(Long documentId, int expectedCurrentVersion,
                                          String contentSchema, JsonNode content, String changeReason) {
        ClinicalDocument document = requireDocument(documentId);
        int nextVersion = document.addDraftVersion(expectedCurrentVersion, true);
        saveProtectedVersion(document, nextVersion, serialize(content), contentSchema, "AMENDMENT", changeReason);
        return toResponse(document);
    }

    @Transactional
    public ClinicalDocumentResponse sign(Long documentId, int expectedCurrentVersion, String signatureMeaning) {
        ClinicalDocument document = requireDocument(documentId);
        ClinicalDocumentVersion version = requireVersion(document, expectedCurrentVersion);
        cryptographicEvidenceService.requireValid(version.integrityEvidenceId(), contentBytes(version.contentJson()));
        document.sign(expectedCurrentVersion);
        EvidenceReceipt signatureEvidence = cryptographicEvidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_SIGNATURE, "ClinicalDocumentVersion", version.id(),
                (long) version.versionNumber(), "SIGN", version.contentSchema(), contentBytes(version.contentJson()),
                Map.of("documentId", document.id().toString(),
                        "documentVersion", Integer.toString(version.versionNumber()),
                        "signatureMeaning", signatureMeaning)));
        version.sign(actor(), signatureMeaning, signatureEvidence);
        documentRepository.flush();
        eventPublisher.publish(document.tenantId(), document.organizationId(), "CLINICAL_DOCUMENT_SIGNED", 1,
                "ClinicalDocument", document.id(), document.version(), document.residentId(), Instant.now(), Map.of(
                        "summary", "临床文档已签署：" + document.title(),
                        "documentType", document.documentType(),
                        "documentVersion", expectedCurrentVersion,
                        "actorId", executionContextProvider.requireCurrent().subjectId(),
                        "signatureMeaning", signatureMeaning));
        return toResponse(document);
    }

    @Transactional
    public ClinicalDocumentResponse archive(Long documentId) {
        ClinicalDocument document = requireDocument(documentId);
        document.archive();
        documentRepository.flush();
        eventPublisher.publish(document.tenantId(), document.organizationId(), "CLINICAL_DOCUMENT_ARCHIVED", 1,
                "ClinicalDocument", document.id(), document.version(), document.residentId(), Instant.now(), Map.of(
                        "summary", "临床文档已归档：" + document.title(),
                        "documentType", document.documentType()));
        return toResponse(document);
    }

    @Transactional(readOnly = true)
    public ClinicalDocumentResponse get(Long documentId) {
        return toResponse(requireDocument(documentId));
    }

    @Transactional(readOnly = true)
    public List<ClinicalDocumentResponse> byResident(Long residentId) {
        Long tenantId = TenantContext.requireTenantId();
        Long canonicalResidentId = residentDirectory.resolveCanonicalResidentId(residentId);
        return documentRepository.findByTenantIdAndResidentIdOrderByUpdatedAtDesc(tenantId, canonicalResidentId)
                .stream().filter(this::accessible).map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<ClinicalDocumentResponse> byEncounter(Long encounterId) {
        Long tenantId = TenantContext.requireTenantId();
        return documentRepository.findByTenantIdAndEncounterIdOrderByUpdatedAtDesc(tenantId, encounterId)
                .stream().filter(this::accessible).map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public void requireSignedEncounterDocument(Long encounterId, String documentType) {
        ClinicalDocument document = documentRepository.findByTenantIdAndEncounterIdAndDocumentType(
                        TenantContext.requireTenantId(), encounterId, documentType)
                .filter(this::accessible)
                .orElseThrow(() -> conflict("DOCUMENT_SIGNATURE_REQUIRED", "完成就诊前必须先保存并签署门诊病历"));
        if (document.status() != ClinicalDocumentStatus.SIGNED) {
            throw conflict("DOCUMENT_SIGNATURE_REQUIRED", "完成就诊前必须签署门诊病历当前版本");
        }
    }

    private ClinicalDocumentResponse toResponse(ClinicalDocument document) {
        List<ClinicalDocumentVersion> versions = versionRepository
                .findByDocumentIdOrderByVersionNumberDesc(document.id());
        ClinicalDocumentVersion current = versions.stream()
                .filter(version -> version.versionNumber() == document.currentVersion())
                .findFirst().orElseThrow(() -> new IllegalStateException("Clinical document version is missing"));
        return new ClinicalDocumentResponse(document.id(), document.residentId(), document.encounterId(),
                document.organizationId(), document.departmentId(), document.documentType(), document.title(),
                document.status().name(), document.currentVersion(), parse(current.contentJson()),
                current.contentSchema(), document.createdBy(), document.createdAt(), document.updatedAt(),
                versions.stream().map(version -> new ClinicalDocumentResponse.VersionView(
                        version.versionNumber(), version.changeType(), version.changeReason(), version.createdBy(),
                        version.createdAt(), version.signedBy(), version.signedAt(), version.signatureMeaning(),
                        version.contentDigestAlgorithm(), version.contentDigest(), version.integrityEvidenceId(),
                        version.signatureEvidenceId()))
                        .toList());
    }

    private ClinicalDocument requireDocument(Long documentId) {
        ClinicalDocument document = documentRepository.findByIdAndTenantId(documentId, TenantContext.requireTenantId())
                .orElseThrow(() -> notFound("CLINICAL_DOCUMENT_NOT_FOUND", "未找到临床文档"));
        if (!accessible(document)) throw forbidden("CLINICAL_DOCUMENT_FORBIDDEN", "无权访问当前工作上下文之外的临床文档");
        return document;
    }

    private ClinicalDocumentVersion requireVersion(ClinicalDocument document, int versionNumber) {
        return versionRepository.findByDocumentIdAndVersionNumber(document.id(), versionNumber)
                .orElseThrow(() -> notFound("CLINICAL_DOCUMENT_VERSION_NOT_FOUND", "未找到临床文档版本"));
    }

    private void validateOrganization(Long tenantId, Long organizationId, Long departmentId) {
        if (departmentId != null && organizationId == null) {
            throw badRequest("ORGANIZATION_REQUIRED", "提供部门时必须同时提供机构");
        }
        if (departmentId != null) organizationDirectory.requireDepartment(tenantId, organizationId, departmentId);
        else if (organizationId != null) organizationDirectory.requireOrganization(tenantId, organizationId);
    }

    private String serialize(Object value) {
        return jsonCodec.write(value);
    }

    private JsonNode parse(String value) {
        return jsonCodec.readTree(value);
    }

    private ClinicalDocumentVersion saveProtectedVersion(ClinicalDocument document, int versionNumber,
                                                           String contentJson, String contentSchema,
                                                           String changeType, String changeReason) {
        ClinicalDocumentVersion version = new ClinicalDocumentVersion(document.tenantId(), document.id(),
                versionNumber, contentJson, contentSchema, changeType, changeReason, actor());
        EvidenceReceipt integrityEvidence = cryptographicEvidenceService.protect(new ProtectionRequest(
                ProtectionProfile.CLINICAL_DOCUMENT_CONTENT, "ClinicalDocumentVersion", version.id(),
                (long) versionNumber, changeType, contentSchema, contentBytes(contentJson),
                Map.of("documentId", document.id().toString(),
                        "documentVersion", Integer.toString(versionNumber),
                        "documentType", document.documentType())));
        version.protect(integrityEvidence);
        ClinicalDocumentVersion saved = versionRepository.save(version);
        publishSignatureReady(document, versionNumber);
        return saved;
    }

    private void publishSignatureReady(ClinicalDocument document, int versionNumber) {
        if (document.encounterId() == null || document.organizationId() == null || document.departmentId() == null) return;
        ExecutionContext context = executionContextProvider.requireCurrent();
        eventPublisher.publish(document.tenantId(), document.organizationId(),
                "CLINICAL_DOCUMENT_READY_FOR_SIGNATURE", 1, "ClinicalDocument", document.id(),
                document.version(), null, Instant.now(), Map.of(
                        "summary", "待签署：" + document.title(),
                        "documentType", document.documentType(),
                        "documentVersion", versionNumber,
                        "residentId", document.residentId(),
                        "encounterId", document.encounterId(),
                        "departmentId", document.departmentId(),
                        "actorId", context.subjectId()));
    }

    private boolean accessible(ClinicalDocument document) {
        ExecutionContext context = executionContextProvider.requireCurrent();
        if (!context.hasWorkContext() || document.organizationId() == null) return true;
        return context.canAccessOrganization(document.organizationId())
                && (document.departmentId() == null || context.canAccessDepartment(document.departmentId()));
    }

    private byte[] contentBytes(String contentJson) {
        return contentJson.getBytes(StandardCharsets.UTF_8);
    }

    private String actor() {
        return executionContextProvider.requireCurrent().actor();
    }
}
