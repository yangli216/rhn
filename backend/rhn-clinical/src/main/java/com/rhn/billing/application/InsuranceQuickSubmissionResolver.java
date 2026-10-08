package com.rhn.billing.application;

import com.rhn.billing.domain.PatientAccount;
import com.rhn.healthcore.api.EncounterDiagnosisDirectory;
import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.json.JsonCodec;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Objects;

import static com.rhn.shared.api.BusinessErrors.conflict;

@Component
@EnableConfigurationProperties(InsuranceQuickSubmissionProperties.class)
class InsuranceQuickSubmissionResolver {
    private final InsuranceQuickSubmissionProperties properties;
    private final EncounterDirectory encounters;
    private final EncounterDiagnosisDirectory diagnoses;
    private final OrganizationDirectory organizations;
    private final JsonCodec json;

    InsuranceQuickSubmissionResolver(InsuranceQuickSubmissionProperties properties, EncounterDirectory encounters,
                                     EncounterDiagnosisDirectory diagnoses, OrganizationDirectory organizations, JsonCodec json) {
        this.properties = properties; this.encounters = encounters; this.diagnoses = diagnoses;
        this.organizations = organizations; this.json = json;
    }

    Visit visit(PatientAccount account) {
        if (!"OUTPATIENT".equals(account.accountType()) || account.encounterId() == null) {
            throw conflict("INSURANCE_OUTPATIENT_ENCOUNTER_REQUIRED", "快捷医保预结算需要已接诊的门诊就诊记录");
        }
        var service = encounters.requireOrganizationAccessibleService(account.encounterId());
        var encounter = service.encounter();
        if (!Objects.equals(encounter.tenantId(), account.tenantId())
                || !Objects.equals(encounter.residentId(), account.residentId())
                || !Objects.equals(encounter.organizationId(), account.organizationId())
                || !Objects.equals(encounter.departmentId(), account.departmentId())
                || !Objects.equals(encounter.id(), account.encounterId())) {
            throw conflict("INSURANCE_ENCOUNTER_MISMATCH", "医保就诊与患者费用账户不一致");
        }
        if (!("IN_PROGRESS".equals(encounter.status()) || "COMPLETED".equals(encounter.status()))
                || service.startedAt() == null || blank(encounter.clinicianId())) {
            throw conflict("INSURANCE_ENCOUNTER_INCOMPLETE", "医保预结算缺少已接诊医师或真实就诊时间");
        }
        return new Visit(encounter.clinicianId(), service.startedAt(), service.completedAt(), serviceDate(account, service.startedAt()));
    }

    LocalDate serviceDate(PatientAccount account, Instant startedAt) {
        if (startedAt == null) throw conflict("INSURANCE_SERVICE_TIME_REQUIRED", "医保预结算缺少真实就诊开始时间");
        var organization = organizations.requireOrganization(account.tenantId(), account.organizationId());
        ZoneId zone;
        try { zone = ZoneId.of(organization.timezoneCode()); }
        catch (RuntimeException exception) { throw conflict("INSURANCE_TIMEZONE_REQUIRED", "机构时区未正确维护，无法核实就诊日期"); }
        return startedAt.atZone(zone).toLocalDate();
    }

    Submission resolve(PatientAccount account, Visit visit, String insuranceType, String requestedRegion) {
        var registrations = properties.registrations().stream()
                .filter(r -> Objects.equals(r.tenantId(), account.tenantId())
                        && Objects.equals(r.organizationId(), account.organizationId())
                        && Objects.equals(r.departmentId(), account.departmentId())
                        && insuranceType.equalsIgnoreCase(r.insuranceTypeCode())
                        && (blank(requestedRegion) || requestedRegion.trim().equals(r.regionCode())))
                .toList();
        if (registrations.size() != 1) throw conflict("INSURANCE_REGISTRATION_UNCONFIRMED",
                "当前机构、科室和险种的医保注册资料缺失或不唯一，请维护真实统筹区、机构及科室编码");
        var registration = registrations.getFirst();
        String region = required(registration.regionCode(), "统筹区编码", 64);
        String organizationCode = required(registration.organizationCode(), "机构医保编码", 128);
        String departmentCode = required(registration.departmentCode(), "科室医保编码", 128);
        String practitionerCode = required(registration.practitionerCodes().get(visit.clinician()), "接诊医师医保编码", 128);
        String system = required(registration.insuranceSystemCode(), "医保目录体系", 128);
        var facts = diagnoses.findActiveDiagnoses(account.tenantId(), account.encounterId(), "ENCOUNTER");
        if (facts == null || facts.isEmpty() || facts.stream().anyMatch(d -> d == null
                || !Objects.equals(d.encounterId(), account.encounterId()) || !"ENCOUNTER".equals(d.diagnosisStage())
                || !"ACTIVE".equals(d.diagnosisStatus()) || !"CONFIRMED".equals(d.verificationStatus())
                || blank(d.code()) || blank(d.display()) || blank(d.diagnosisType()))
                || facts.stream().noneMatch(d -> "PRIMARY".equals(d.diagnosisType()))) {
            throw conflict("INSURANCE_DIAGNOSES_UNCONFIRMED", "医保预结算需要已确认的本次就诊诊断及主诊断，请先完成诊断核实");
        }
        var canonical = facts.stream().sorted(Comparator.comparing(EncounterDiagnosisDirectory.DiagnosisSnapshot::code)
                .thenComparing(EncounterDiagnosisDirectory.DiagnosisSnapshot::diagnosisType)
                .thenComparing(d -> String.valueOf(d.id()))).toList();
        String digest;
        try {
            digest = "SHA256-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(json.write(canonical).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable", exception); }
        return new Submission(region, organizationCode, departmentCode, practitionerCode, system, digest);
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static String required(String value, String label, int max) {
        if (blank(value) || value.trim().length() > max) throw conflict("INSURANCE_REGISTRATION_UNCONFIRMED", label + "未正确维护，请核实真实医保注册资料");
        return value.trim();
    }
    record Visit(String clinician, Instant startedAt, Instant completedAt, LocalDate serviceDate) {}
    record Submission(String regionCode, String organizationCode, String departmentCode, String practitionerCode,
                      String insuranceSystemCode, String diagnosisDigest) {}
}
