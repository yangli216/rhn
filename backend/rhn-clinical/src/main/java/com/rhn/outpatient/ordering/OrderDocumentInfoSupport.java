package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;
import java.util.HashSet;
import java.util.List;
import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
class OrderDocumentInfoSupport {
    private final JsonCodec json;
    private final EncounterDirectory encounters;
    OrderDocumentInfoSupport(JsonCodec json, EncounterDirectory encounters) {
        this.json = json; this.encounters = encounters;
    }
    OrderDocumentInfo read(String value) {
        return value == null ? OrderDocumentInfo.empty() : json.read(value, OrderDocumentInfo.class);
    }
    String validateAndWrite(Long tenantId, Long encounterId, OrderDocumentInfo input, boolean prescription) {
        var available = encounters.requireForPharmacy(tenantId, encounterId).diagnoses();
        var seen = new HashSet<String>();
        var diagnoses = input.diagnoses().stream().map(link -> {
            var diagnosis = available.stream().filter(d -> d.code().equals(link.code()))
                    .findFirst().orElseThrow(() -> badRequest("ORDER_DOCUMENT_DIAGNOSIS_INVALID", "关联诊断必须来自本次已保存的就诊诊断"));
            if (!seen.add(link.code())) throw badRequest("ORDER_DOCUMENT_DIAGNOSIS_DUPLICATE", "关联诊断不能重复");
            return new OrderDocumentInfo.DiagnosisLink(diagnosis.code(), diagnosis.display(), link.primary());
        }).toList();
        if (!diagnoses.isEmpty() && diagnoses.stream().filter(OrderDocumentInfo.DiagnosisLink::primary).count() != 1) {
            throw badRequest("ORDER_DOCUMENT_PRIMARY_REQUIRED", "请选择一个单据主要诊断");
        }
        if (!prescription && input.externalPrescription()) {
            throw badRequest("ORDER_DOCUMENT_TYPE_INVALID", "只有处方可以设置外配标记");
        }
        if (prescription && clean(input.examinationPurpose()) != null) {
            throw badRequest("ORDER_DOCUMENT_TYPE_INVALID", "处方不包含检查目的");
        }
        return json.write(new OrderDocumentInfo(diagnoses, input.externalPrescription(),
                clean(input.specialDisease()), clean(input.examinationPurpose())));
    }
    String printSummary(String jsonValue) {
        var info = read(jsonValue);
        var lines = new java.util.ArrayList<String>();
        if (!info.diagnoses().isEmpty()) lines.add("关联诊断：" + info.diagnoses().stream()
                .map(d -> d.display() + (d.primary() ? "（主要）" : ""))
                .collect(java.util.stream.Collectors.joining("、")));
        if (info.externalPrescription()) lines.add("外配处方标记：是");
        if (clean(info.specialDisease()) != null) lines.add("门诊特病：" + info.specialDisease());
        if (clean(info.examinationPurpose()) != null) lines.add("检查目的：" + info.examinationPurpose());
        return String.join("\n", lines);
    }
    String appendSummary(String text, String jsonValue) {
        String summary = printSummary(jsonValue);
        return summary.isBlank() ? text : (clean(text) == null ? summary : text + "\n" + summary);
    }

    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
}
