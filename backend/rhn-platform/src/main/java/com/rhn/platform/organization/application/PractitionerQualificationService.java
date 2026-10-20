package com.rhn.platform.organization.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.organization.api.PractitionerQualificationDirectory;
import com.rhn.platform.organization.api.PractitionerQualificationView;
import com.rhn.platform.organization.domain.PractitionerQualification;
import com.rhn.platform.organization.infrastructure.OrganizationChangeStore;
import com.rhn.platform.organization.infrastructure.PractitionerQualificationRepository;
import com.rhn.platform.organization.infrastructure.PractitionerRepository;
import com.rhn.shared.api.RevisionGuard;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.*;

@Service
public class PractitionerQualificationService implements PractitionerQualificationDirectory {
    static final String PROFESSIONAL_TITLE = "PRACT_PROF_TITLE";
    static final String PRACTICE_CATEGORY = "PRACT_CATEGORY";
    static final String ANTIMICROBIAL_LEVEL = "BD_ANTIMICROBIAL_LEVEL";
    private final PractitionerQualificationRepository qualifications;
    private final PractitionerRepository people;
    private final DictionaryDirectory dictionaries;
    private final ExecutionContextProvider contexts;
    private final OrganizationChangeStore changes;

    public PractitionerQualificationService(PractitionerQualificationRepository qualifications, PractitionerRepository people,
                                            DictionaryDirectory dictionaries, ExecutionContextProvider contexts,
                                            OrganizationChangeStore changes) {
        this.qualifications = qualifications;
        this.people = people;
        this.dictionaries = dictionaries;
        this.contexts = contexts;
        this.changes = changes;
    }

    /** {@code expectedRevision} is null for the first registration and the current revision afterwards. */
    public record QualificationCommand(@Min(0) Long expectedRevision,
                                       @Size(max = 64) String sdProfessionalTitle, @Size(max = 64) String sdPracticeCategory,
                                       @Size(max = 64) String practiceCertificateCode, @Size(max = 64) String qualificationCertificateCode,
                                       @Size(max = 64) String insurancePractitionerCode, boolean prescribing,
                                       boolean narcoticPrescribing, @Size(max = 64) String sdAntimicrobialLevel) {}

    @Override
    @Transactional(readOnly = true)
    public PractitionerQualificationView qualification(Long tenantId, Long practitionerId) {
        requirePractitioner(tenantId, practitionerId);
        return qualifications.findByTenantIdAndPractitionerId(tenantId, practitionerId).map(PractitionerQualificationService::view)
                .orElseGet(() -> PractitionerQualificationView.unregistered(practitionerId));
    }

    @Transactional(readOnly = true)
    public PractitionerQualificationView qualification(Long practitionerId) {
        return qualification(contexts.requireCurrent().tenantId(), practitionerId);
    }

    @Transactional
    public PractitionerQualificationView save(Long practitionerId, QualificationCommand command) {
        var context = contexts.requireCurrent();
        Long tenantId = context.tenantId();
        requirePractitioner(tenantId, practitionerId);
        String title = dictionary(tenantId, PROFESSIONAL_TITLE, command.sdProfessionalTitle(), "职称");
        String category = dictionary(tenantId, PRACTICE_CATEGORY, command.sdPracticeCategory(), "执业类别");
        String antimicrobial = dictionary(tenantId, ANTIMICROBIAL_LEVEL, command.sdAntimicrobialLevel(), "抗菌药物处方级别");
        if (!command.prescribing() && (command.narcoticPrescribing() || antimicrobial != null)) {
            throw badRequest("PRESCRIBING_RIGHT_REQUIRED", "麻醉与第一类精神药品处方权、抗菌药物处方级别需先具有普通处方权");
        }
        var existing = qualifications.findByTenantIdAndPractitionerId(tenantId, practitionerId);
        if (existing.isEmpty() && command.expectedRevision() != null || existing.isPresent() && command.expectedRevision() == null) {
            throw conflict("QUALIFICATION_REVISION_CONFLICT", "执业资质已被其他用户修改，请刷新后重试");
        }
        PractitionerQualificationView before = existing.map(PractitionerQualificationService::view)
                .orElseGet(() -> PractitionerQualificationView.unregistered(practitionerId));
        return RevisionGuard.supply("QUALIFICATION_REVISION_CONFLICT", "执业资质已被其他用户修改，请刷新后重试", () -> {
            PractitionerQualification qualification = existing.orElseGet(() -> new PractitionerQualification(tenantId, practitionerId, context.subjectId()));
            if (command.expectedRevision() != null) qualification.requireRevision(command.expectedRevision());
            qualification.update(title, category, Strings.trimToNull(command.practiceCertificateCode()),
                    Strings.trimToNull(command.qualificationCertificateCode()), Strings.trimToNull(command.insurancePractitionerCode()),
                    command.prescribing(), command.narcoticPrescribing(), antimicrobial, context.subjectId());
            PractitionerQualificationView after;
            try {
                after = view(qualifications.saveAndFlush(qualification));
            } catch (DataIntegrityViolationException exception) {
                throw conflict("QUALIFICATION_REVISION_CONFLICT", "执业资质已被其他用户修改，请刷新后重试");
            }
            changes.record("PRACTITIONER", practitionerId, "UPDATE_QUALIFICATION", before, after, "维护执业资质");
            return after;
        });
    }

    static PractitionerQualificationView view(PractitionerQualification value) {
        return new PractitionerQualificationView(value.practitionerId(), true, value.revision(), value.professionalTitle(),
                value.practiceCategory(), value.practiceCertificateCode(), value.qualificationCertificateCode(),
                value.insurancePractitionerCode(), value.prescribing(), value.narcoticPrescribing(), value.antimicrobialLevel(),
                value.updatedAt());
    }

    private void requirePractitioner(Long tenantId, Long practitionerId) {
        if (people.findByIdAndTenantId(practitionerId, tenantId).isEmpty()) throw notFound("PRACTITIONER_NOT_FOUND", "人员不存在");
    }

    private String dictionary(Long tenantId, String code, String value, String label) {
        String normalized = Strings.trimToNull(value);
        if (normalized == null) return null;
        if (dictionaries.resolveActiveItems(tenantId, code).stream().noneMatch(item -> normalized.equals(item.code()))) {
            throw badRequest("DICTIONARY_ITEM_INVALID", "请选择有效的" + label);
        }
        return normalized;
    }
}
