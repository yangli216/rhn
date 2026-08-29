package com.rhn.healthcore.clinicaldocument;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintReceipt;
import com.rhn.platform.printing.api.PrintRequest;
import com.rhn.platform.printing.api.PrintingService;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
class ClinicalDocumentPrintService {
    private final ClinicalDocumentService clinicalDocumentService;
    private final ResidentDirectory residentDirectory;
    private final OrganizationDirectory organizationDirectory;
    private final PrintingService printingService;
    private final JsonCodec jsonCodec;

    ClinicalDocumentPrintService(ClinicalDocumentService clinicalDocumentService,
                                 ResidentDirectory residentDirectory,
                                 OrganizationDirectory organizationDirectory,
                                 PrintingService printingService, JsonCodec jsonCodec) {
        this.clinicalDocumentService = clinicalDocumentService; this.residentDirectory = residentDirectory;
        this.organizationDirectory = organizationDirectory; this.printingService = printingService;
        this.jsonCodec = jsonCodec;
    }

    PrintReceipt print(Long documentId, PrintAction action) {
        ClinicalDocumentResponse document = clinicalDocumentService.get(documentId);
        if (!"OUTPATIENT_NOTE".equals(document.documentType())) {
            throw conflict("PRINT_DOCUMENT_TYPE_UNSUPPORTED", "当前临床文档类型暂不支持打印");
        }
        if (!"SIGNED".equals(document.status())) {
            throw conflict("PRINT_SOURCE_NOT_FINAL", "只有已签署的门诊病历可以生成正式打印文件");
        }
        ClinicalDocumentResponse.VersionView version = document.history().stream()
                .filter(item -> item.version() == document.currentVersion()
                        && item.signedAt() != null && item.signatureEvidenceId() != null)
                .findFirst().orElseThrow(() -> conflict("PRINT_SOURCE_NOT_FINAL", "病历当前版本缺少签署证据"));
        Long tenantId = TenantContext.requireTenantId();
        OrganizationView organization = organizationDirectory.requireOrganization(tenantId, document.organizationId());
        DepartmentView department = organizationDirectory.requireDepartment(tenantId, document.organizationId(), document.departmentId());
        ResidentDirectory.ResidentSnapshot resident = residentDirectory.requireSnapshot(document.residentId());
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", document.title()); snapshot.put("organizationName", organization.name());
        Map<String, Object> content = jsonCodec.readObject(jsonCodec.write(document.content()));
        snapshot.put("departmentName", department.name()); snapshot.put("encounterNo",
                content.getOrDefault("encounterNo", document.encounterId().toString()));
        snapshot.put("resident", residentMap(resident)); snapshot.put("content", content);
        snapshot.put("signedBy", version.signedBy()); snapshot.put("signedAt", version.signedAt());
        snapshot.put("signatureMeaning", version.signatureMeaning()); snapshot.put("signatureEvidenceId", version.signatureEvidenceId());
        return printingService.generate(new PrintRequest("ClinicalDocument", document.id(), document.currentVersion(),
                "OUTPATIENT_NOTE", document.residentId(), document.encounterId(), document.organizationId(),
                document.departmentId(), action.purpose(), action.copies(),
                "门诊病历-" + resident.fullName() + "-V" + document.currentVersion() + ".pdf", snapshot));
    }

    private Map<String, Object> residentMap(ResidentDirectory.ResidentSnapshot resident) {
        Map<String, Object> value = new LinkedHashMap<>(); value.put("id", resident.id());
        value.put("healthRecordNo", resident.healthRecordNo()); value.put("fullName", resident.fullName());
        value.put("gender", resident.gender()); value.put("birthDate", resident.birthDate()); value.put("phone", resident.phone());
        return value;
    }

    record PrintAction(String purpose, int copies) {}
}
