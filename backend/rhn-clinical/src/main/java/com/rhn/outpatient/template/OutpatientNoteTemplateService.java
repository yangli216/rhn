package com.rhn.outpatient.template;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class OutpatientNoteTemplateService {
    static final String DOCUMENT_TYPE = "OUTPATIENT_NOTE";
    static final String CONTENT_SCHEMA = "RHN.OUTPATIENT_NOTE_TEMPLATE.V1";
    static final String DEFAULT_SPECIALTY = "GENERAL_PRACTICE";

    private final OutpatientNoteTemplateRepository repository;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    OutpatientNoteTemplateService(OutpatientNoteTemplateRepository repository,
                                  ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.repository = repository; this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    List<OutpatientNoteTemplateContracts.View> visible(String keyword, String specialtyCode) {
        ExecutionContext context = requireContext();
        List<OutpatientNoteTemplate> values = repository.findVisible(context.tenantId(), context.organizationId(),
                context.departmentId(), context.practitionerId(), specialty(specialtyCode), DOCUMENT_TYPE);
        String term = clean(keyword);
        if (term != null) {
            String normalized = term.toLowerCase(Locale.ROOT);
            values = values.stream().filter(value -> value.name().toLowerCase(Locale.ROOT).contains(normalized)
                    || value.description() != null
                    && value.description().toLowerCase(Locale.ROOT).contains(normalized)).toList();
        }
        return values.stream().map(this::view).toList();
    }

    @Transactional
    OutpatientNoteTemplateContracts.View create(OutpatientNoteTemplateContracts.SaveRequest input) {
        ExecutionContext context = requireContext();
        String scope = scope(input.scopeType());
        Long ownerId = "PERSONAL".equals(scope) ? context.practitionerId() : context.departmentId();
        String name = required(input.name(), "NOTE_TEMPLATE_NAME_REQUIRED", "病历模板名称不能为空");
        OutpatientNoteTemplateContracts.NoteContent content = normalize(input.content());
        if (empty(content)) throw badRequest("NOTE_TEMPLATE_EMPTY", "至少填写一个可复用病历段落");
        Instant now = Instant.now();
        OutpatientNoteTemplate value = new OutpatientNoteTemplate(context.tenantId(), context.organizationId(),
                context.departmentId(), scope, ownerId, specialty(input.specialtyCode()), DOCUMENT_TYPE,
                CONTENT_SCHEMA, name, clean(input.description()), jsonCodec.write(content),
                input.sortOrder() == null ? 0 : input.sortOrder(), context.subjectId(), now);
        try {
            repository.saveAndFlush(value);
        } catch (DataIntegrityViolationException error) {
            throw conflict("NOTE_TEMPLATE_NAME_DUPLICATED", "当前范围已经存在同名病历模板");
        }
        return view(value);
    }

    @Transactional
    OutpatientNoteTemplateContracts.View markUsed(Long id) {
        ExecutionContext context = requireContext();
        OutpatientNoteTemplate value = requireAccessibleLocked(id, context);
        if (!"ACTIVE".equals(value.status())) throw conflict("NOTE_TEMPLATE_INACTIVE", "病历模板已经停用");
        value.markUsed(context.subjectId(), Instant.now());
        repository.flush();
        return view(value);
    }

    @Transactional
    OutpatientNoteTemplateContracts.View update(Long id, OutpatientNoteTemplateContracts.UpdateRequest input) {
        ExecutionContext context = requireContext();
        OutpatientNoteTemplate value = requireAccessibleLocked(id, context);
        if (value.revision() != input.expectedRevision()) {
            throw conflict("NOTE_TEMPLATE_REVISION_CONFLICT", "病历模板已被更新，请刷新后重试");
        }
        String scope = scope(input.scopeType());
        Long ownerId = "PERSONAL".equals(scope) ? context.practitionerId() : context.departmentId();
        String name = required(input.name(), "NOTE_TEMPLATE_NAME_REQUIRED", "病历模板名称不能为空");
        OutpatientNoteTemplateContracts.NoteContent content = normalize(input.content());
        if (empty(content)) throw badRequest("NOTE_TEMPLATE_EMPTY", "至少填写一个可复用病历段落");
        value.update(scope, ownerId, specialty(input.specialtyCode()), name, clean(input.description()),
                jsonCodec.write(content), input.sortOrder() == null ? value.sortOrder() : input.sortOrder(),
                context.subjectId(), Instant.now());
        try {
            repository.flush();
        } catch (DataIntegrityViolationException error) {
            throw conflict("NOTE_TEMPLATE_NAME_DUPLICATED", "当前范围已经存在同名病历模板");
        }
        return view(value);
    }

    @Transactional
    OutpatientNoteTemplateContracts.View disable(Long id, long expectedRevision) {
        ExecutionContext context = requireContext();
        OutpatientNoteTemplate value = requireAccessibleLocked(id, context);
        if (value.revision() != expectedRevision) {
            throw conflict("NOTE_TEMPLATE_REVISION_CONFLICT", "病历模板已被更新，请刷新后重试");
        }
        value.disable(context.subjectId(), Instant.now());
        repository.flush();
        return view(value);
    }

    private OutpatientNoteTemplate requireAccessibleLocked(Long id, ExecutionContext context) {
        OutpatientNoteTemplate value = repository.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("NOTE_TEMPLATE_NOT_FOUND", "未找到病历模板"));
        boolean accessible = value.organizationId().equals(context.organizationId())
                && value.departmentId().equals(context.departmentId())
                && ("DEPARTMENT".equals(value.scopeType()) || value.ownerId().equals(context.practitionerId()));
        if (!accessible) throw forbidden("NOTE_TEMPLATE_FORBIDDEN", "当前工作上下文不能访问该病历模板");
        return value;
    }

    private OutpatientNoteTemplateContracts.View view(OutpatientNoteTemplate value) {
        if (!CONTENT_SCHEMA.equals(value.contentSchema())) {
            throw conflict("NOTE_TEMPLATE_SCHEMA_UNSUPPORTED", "病历模板内容版本暂不受当前系统支持");
        }
        OutpatientNoteTemplateContracts.NoteContent content = jsonCodec.read(
                value.contentJson(), OutpatientNoteTemplateContracts.NoteContent.class);
        return new OutpatientNoteTemplateContracts.View(value.id(), value.revision(), value.scopeType(),
                value.name(), value.description(), value.specialtyCode(), value.documentType(),
                value.contentSchema(), content, value.status(), value.sortOrder(), value.useCount(),
                value.lastUsedAt(), value.createdAt(), value.updatedAt());
    }

    private OutpatientNoteTemplateContracts.NoteContent normalize(
            OutpatientNoteTemplateContracts.NoteContent input) {
        if (input == null) return new OutpatientNoteTemplateContracts.NoteContent(null, null, null, null, null);
        return new OutpatientNoteTemplateContracts.NoteContent(clean(input.chiefComplaint()),
                clean(input.presentIllness()), clean(input.medicalHistory()), clean(input.physicalExam()),
                clean(input.treatmentPlan()));
    }

    private boolean empty(OutpatientNoteTemplateContracts.NoteContent content) {
        return content.chiefComplaint() == null && content.presentIllness() == null
                && content.medicalHistory() == null && content.physicalExam() == null
                && content.treatmentPlan() == null;
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null || context.practitionerId() == null) {
            throw forbidden("NOTE_TEMPLATE_WORK_CONTEXT_REQUIRED", "请先选择包含科室和执业人员的工作上下文");
        }
        return context;
    }

    private String scope(String value) {
        String result = upper(value);
        if (!List.of("PERSONAL", "DEPARTMENT").contains(result)) {
            throw badRequest("NOTE_TEMPLATE_SCOPE_INVALID", "病历模板范围仅支持个人或科室");
        }
        return result;
    }

    private String specialty(String value) {
        String result = clean(value) == null ? DEFAULT_SPECIALTY : upper(value);
        if (!result.matches("[A-Z][A-Z0-9_]{0,63}")) {
            throw badRequest("NOTE_TEMPLATE_SPECIALTY_INVALID", "专科编码格式不正确");
        }
        return result;
    }

    private String upper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }
}
