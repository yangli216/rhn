package com.rhn.outpatient.encounter;

import com.rhn.platform.terminology.api.TerminologyDirectory;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.json.JsonCodec;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.Set;

/** Captured terminology facts; absence of a diagnosis domain is not evidence of western medicine. */
record DiagnosisTerminology(Long conceptId, String systemCode, String systemVersion,
                            String diagnosisDomain, String code, String display, String managementJson) {
    static DiagnosisTerminology resolve(Long tenantId, Long conceptId, String domain, String code, String display,
                                        TerminologyDirectory terminology, JsonCodec json) {
        return resolve(tenantId, conceptId, domain, code, display, null, terminology, json);
    }

    static DiagnosisTerminology resolve(Long tenantId, Long conceptId, String domain, String code, String display,
                                        String codeSystem, TerminologyDirectory terminology, JsonCodec json) {
        String system = com.rhn.shared.text.Strings.trimToNull(codeSystem);
        if (domain != null && !Set.of("WESTERN_MEDICINE", "TCM_DISEASE", "TCM_SYNDROME").contains(domain)) {
            throw new BusinessException("DIAGNOSIS_DOMAIN_INVALID", "诊断体系无效", HttpStatus.BAD_REQUEST);
        }
        if (conceptId == null) {
            return new DiagnosisTerminology(null, system, null, domain, code.trim(), display.trim(),
                    json.write(DiagnosisManagementSnapshot.unconfirmed()));
        }
        var value = terminology.requireDisease(tenantId, conceptId, LocalDate.now());
        if (system != null && !system.equals(value.systemCode())) {
            throw new BusinessException("DIAGNOSIS_SYSTEM_MISMATCH", "编码体系与所选疾病术语不一致", HttpStatus.BAD_REQUEST);
        }
        if (domain != null && !domain.equals(value.diagnosisDomain())) {
            throw new BusinessException("DIAGNOSIS_DOMAIN_MISMATCH", "诊断体系与所选疾病术语不一致", HttpStatus.BAD_REQUEST);
        }
        return new DiagnosisTerminology(value.conceptId(), value.systemCode(), value.systemVersion(),
                value.diagnosisDomain(), value.code(), value.display(),
                json.write(DiagnosisManagementSnapshot.confirmed(value.managementPrograms())));
    }

    String terminologyKey() { return identityKey(conceptId, systemCode, diagnosisDomain, code); }

    static String identityKey(Long conceptId, String systemCode, String domain, String code) {
        if (conceptId != null) return "CONCEPT:" + conceptId;
        return "CODE:" + part(com.rhn.shared.text.Strings.trimToNull(systemCode)) + part(domain)
                + part(code.trim().toUpperCase(java.util.Locale.ROOT));
    }

    private static String part(String value) { return value == null ? "-1:" : value.length() + ":" + value; }
}
