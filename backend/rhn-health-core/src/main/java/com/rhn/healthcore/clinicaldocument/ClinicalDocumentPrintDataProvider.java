package com.rhn.healthcore.clinicaldocument;

import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.platform.organization.api.OrganizationView;
import com.rhn.platform.printing.api.PrintDataProvider;
import com.rhn.platform.printing.api.PrintDataRequest;
import com.rhn.platform.printing.api.PrintDataSnapshot;
import com.rhn.platform.printing.api.PrintTaskCodes;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
class ClinicalDocumentPrintDataProvider implements PrintDataProvider {
    private final ClinicalDocumentService clinicalDocumentService;
    private final ResidentDirectory residents;
    private final OrganizationDirectory organizations;
    private final JsonCodec jsonCodec;

    ClinicalDocumentPrintDataProvider(ClinicalDocumentService clinicalDocumentService, ResidentDirectory residents,
                                      OrganizationDirectory organizations, JsonCodec jsonCodec) {
        this.clinicalDocumentService = clinicalDocumentService; this.residents = residents;
        this.organizations = organizations; this.jsonCodec = jsonCodec;
    }

    @Override public String providerCode() { return "CLINICAL_DOCUMENT"; }

    @Override
    public PrintDataSnapshot load(PrintDataRequest request) {
        if (!PrintTaskCodes.OUTPATIENT_MEDICAL_RECORD.equals(request.taskCode())) {
            throw conflict("PRINT_TASK_SOURCE_MISMATCH", "临床文档数据提供器不支持当前打印任务");
        }
        ClinicalDocumentResponse document = clinicalDocumentService.get(request.source().sourceId());
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
        OrganizationView organization = organizations.requireOrganization(tenantId, document.organizationId());
        DepartmentView department = organizations.requireDepartment(tenantId, document.organizationId(), document.departmentId());
        ResidentDirectory.ResidentSnapshot resident = residents.requireSnapshot(document.residentId());
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("title", document.title()); payload.put("organizationName", organization.name());
        Map<String, Object> content = jsonCodec.readObject(jsonCodec.write(document.content()));
        payload.put("departmentName", department.name()); payload.put("encounterNo",
                content.getOrDefault("encounterNo", document.encounterId().toString()));
        payload.put("resident", residentMap(resident)); payload.put("content", content);
        payload.put("signedBy", version.signedBy()); payload.put("signedAt", version.signedAt());
        payload.put("signatureMeaning", version.signatureMeaning());
        payload.put("signatureEvidenceId", version.signatureEvidenceId());
        return new PrintDataSnapshot("ClinicalDocument", document.id(), document.currentVersion(),
                document.residentId(), document.encounterId(), document.organizationId(), document.departmentId(),
                "门诊病历-" + resident.fullName() + "-V" + document.currentVersion() + ".pdf", payload);
    }

    private Map<String, Object> residentMap(ResidentDirectory.ResidentSnapshot resident) {
        Map<String, Object> value = new LinkedHashMap<>(); value.put("id", resident.id());
        value.put("healthRecordNo", resident.healthRecordNo()); value.put("fullName", resident.fullName());
        value.put("gender", resident.gender()); value.put("birthDate", resident.birthDate()); value.put("phone", resident.phone());
        return value;
    }
}
