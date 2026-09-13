package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintDocumentDefinition;
import com.rhn.platform.printing.domain.PrintMediaProfile;
import com.rhn.platform.printing.domain.PrintTemplate;
import com.rhn.platform.printing.domain.PrintTemplateDraft;
import com.rhn.platform.printing.domain.PrintTemplateVersion;
import com.rhn.platform.printing.infrastructure.PrintDocumentDefinitionRepository;
import com.rhn.platform.printing.infrastructure.PrintMediaProfileRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateDraftRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateRepository;
import com.rhn.platform.printing.infrastructure.PrintTemplateVersionRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class PrintTemplateAdministrationService {
    private static final Set<String> OPEN_STATUSES = Set.of("DRAFT", "IN_REVIEW", "REJECTED");
    private final PrintDocumentDefinitionRepository definitionRepository;
    private final PrintMediaProfileRepository mediaRepository;
    private final PrintTemplateDraftRepository draftRepository;
    private final PrintTemplateRepository templateRepository;
    private final PrintTemplateVersionRepository versionRepository;
    private final PrintLayoutValidator validator;
    private final ClinicalPdfRenderer renderer;
    private final JsonCodec jsonCodec;
    private final ExecutionContextProvider contextProvider;

    public PrintTemplateAdministrationService(PrintDocumentDefinitionRepository definitionRepository,
            PrintMediaProfileRepository mediaRepository, PrintTemplateDraftRepository draftRepository,
            PrintTemplateRepository templateRepository, PrintTemplateVersionRepository versionRepository,
            PrintLayoutValidator validator, ClinicalPdfRenderer renderer, JsonCodec jsonCodec,
            ExecutionContextProvider contextProvider) {
        this.definitionRepository = definitionRepository; this.mediaRepository = mediaRepository;
        this.draftRepository = draftRepository; this.templateRepository = templateRepository;
        this.versionRepository = versionRepository; this.validator = validator; this.renderer = renderer;
        this.jsonCodec = jsonCodec; this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public CatalogView catalog() {
        ExecutionContext context = context();
        List<DocumentDefinitionView> definitions = new ArrayList<>();
        definitionRepository.findByTenantIdIsNullAndStatusOrderByCategoryAscDocumentNameAsc("ACTIVE")
                .forEach(value -> definitions.add(view(value)));
        definitionRepository.findByTenantIdAndStatusOrderByCategoryAscDocumentNameAsc(context.tenantId(), "ACTIVE")
                .forEach(value -> definitions.add(view(value)));
        List<MediaProfileView> media = new ArrayList<>();
        mediaRepository.findByTenantIdIsNullAndStatusOrderByMediaKindAscMediaNameAsc("ACTIVE")
                .forEach(value -> media.add(view(value)));
        mediaRepository.findByTenantIdAndStatusOrderByMediaKindAscMediaNameAsc(context.tenantId(), "ACTIVE")
                .forEach(value -> media.add(view(value)));
        return new CatalogView(List.copyOf(definitions), List.copyOf(media));
    }

    @Transactional(readOnly = true)
    public List<DraftView> drafts() {
        Long tenantId = context().tenantId();
        return draftRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId).stream().map(this::view).toList();
    }

    @Transactional
    public DraftView create(Long documentDefinitionId, Long mediaProfileId, String templateCode,
                            String templateName, String layoutSchema, String configJson) {
        ExecutionContext context = context();
        String code = normalizeCode(templateCode);
        if (draftRepository.existsByTenantIdAndTemplateCodeAndStatusIn(context.tenantId(), code, OPEN_STATUSES)) {
            throw conflict("PRINT_DRAFT_ALREADY_OPEN", "该模板编码已有进行中的草稿或审核单");
        }
        PrintDocumentDefinition definition = requireDefinition(documentDefinitionId, context.tenantId());
        PrintMediaProfile media = requireMedia(mediaProfileId, context.tenantId());
        validator.validate(layoutSchema, configJson, definition, media);
        PrintTemplate linked = templateRepository.findByTenantIdAndTemplateCode(context.tenantId(), code).orElse(null);
        if (linked != null && !linked.documentType().equals(definition.documentType())) {
            throw conflict("PRINT_TEMPLATE_DOCUMENT_TYPE_LOCKED", "已发布模板不能变更所属单据类型");
        }
        PrintTemplateDraft draft = new PrintTemplateDraft(context.tenantId(), linked == null ? null : linked.id(),
                definition.id(), media.id(), code, requireName(templateName), layoutSchema, configJson, context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional
    public DraftView update(Long draftId, long expectedRevision, Long documentDefinitionId, Long mediaProfileId,
                            String templateName, String layoutSchema, String configJson) {
        ExecutionContext context = context();
        PrintTemplateDraft draft = requireDraft(draftId, context.tenantId());
        PrintDocumentDefinition definition = requireDefinition(documentDefinitionId, context.tenantId());
        PrintMediaProfile media = requireMedia(mediaProfileId, context.tenantId());
        if (draft.templateId() != null) {
            PrintTemplate template = templateRepository.findById(draft.templateId()).orElseThrow();
            if (!template.documentType().equals(definition.documentType())) {
                throw conflict("PRINT_TEMPLATE_DOCUMENT_TYPE_LOCKED", "已发布模板不能变更所属单据类型");
            }
        }
        validator.validate(layoutSchema, configJson, definition, media);
        draft.update(definition.id(), media.id(), requireName(templateName), layoutSchema, configJson,
                expectedRevision, context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional
    public DraftView submit(Long draftId, long expectedRevision) {
        ExecutionContext context = context();
        PrintTemplateDraft draft = requireDraft(draftId, context.tenantId());
        validate(draft, context.tenantId());
        draft.submit(expectedRevision, context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional
    public DraftView reject(Long draftId, long expectedRevision) {
        ExecutionContext context = context();
        PrintTemplateDraft draft = requireDraft(draftId, context.tenantId());
        draft.reject(expectedRevision, context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional
    public DraftView publish(Long draftId, long expectedRevision) {
        ExecutionContext context = context();
        PrintTemplateDraft draft = requireDraft(draftId, context.tenantId());
        PrintDocumentDefinition definition = validate(draft, context.tenantId());
        PrintTemplate template = draft.templateId() == null
                ? templateRepository.findByTenantIdAndTemplateCode(context.tenantId(), draft.templateCode()).orElse(null)
                : templateRepository.findById(draft.templateId()).orElseThrow();
        boolean firstVersion = template == null;
        if (firstVersion) {
            template = templateRepository.saveAndFlush(new PrintTemplate(context.tenantId(), draft.templateCode(),
                    draft.templateName(), definition.documentType(), context.subjectId()));
        }
        if (!template.tenantId().equals(context.tenantId())) throw notFound("PRINT_TEMPLATE_NOT_FOUND", "未找到租户模板");
        int nextVersion = firstVersion ? 1 : template.currentVersion() + 1;
        PrintTemplateVersion version = versionRepository.saveAndFlush(new PrintTemplateVersion(template.id(),
                nextVersion, draft.documentDefinitionId(), draft.mediaProfileId(), draft.layoutSchema(),
                draft.configJson(), sha256(draft.configJson()), context.subjectId()));
        template.publish(draft.templateName(), definition.documentType(), nextVersion, context.subjectId());
        templateRepository.saveAndFlush(template);
        draft.publish(template.id(), version.id(), expectedRevision, context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional
    public DraftView clonePublished(Long templateId) {
        ExecutionContext context = context();
        PrintTemplate source = templateRepository.findById(templateId)
                .filter(value -> value.tenantId() == null || value.tenantId().equals(context.tenantId()))
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_NOT_FOUND", "未找到可复制的已发布模板"));
        if (draftRepository.existsByTenantIdAndTemplateCodeAndStatusIn(context.tenantId(), source.templateCode(), OPEN_STATUSES)) {
            throw conflict("PRINT_DRAFT_ALREADY_OPEN", "该模板编码已有进行中的草稿或审核单");
        }
        PrintTemplateVersion version = versionRepository.findByTemplateIdAndVersionNo(source.id(), source.currentVersion())
                .orElseThrow(() -> notFound("PRINT_TEMPLATE_VERSION_NOT_FOUND", "已发布模板版本不存在"));
        PrintTemplate tenantTemplate = source.tenantId() == null ? null : source;
        PrintTemplateDraft draft = new PrintTemplateDraft(context.tenantId(),
                tenantTemplate == null ? null : tenantTemplate.id(), version.documentDefinitionId(),
                version.mediaProfileId(), source.templateCode(), source.templateName(), version.layoutSchema(),
                version.configJson(), context.subjectId());
        return view(draftRepository.saveAndFlush(draft));
    }

    @Transactional(readOnly = true)
    public byte[] preview(Long draftId, Map<String, Object> sampleData) {
        ExecutionContext context = context();
        PrintTemplateDraft draft = requireDraft(draftId, context.tenantId());
        PrintDocumentDefinition definition = validate(draft, context.tenantId());
        return renderer.render(definition.documentType(), draft.layoutSchema(), draft.configJson(),
                sampleData == null ? Map.of() : new LinkedHashMap<>(sampleData));
    }

    private PrintDocumentDefinition validate(PrintTemplateDraft draft, Long tenantId) {
        PrintDocumentDefinition definition = requireDefinition(draft.documentDefinitionId(), tenantId);
        PrintMediaProfile media = requireMedia(draft.mediaProfileId(), tenantId);
        validator.validate(draft.layoutSchema(), draft.configJson(), definition, media);
        return definition;
    }

    private PrintTemplateDraft requireDraft(Long id, Long tenantId) {
        return draftRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("PRINT_DRAFT_NOT_FOUND", "未找到打印模板草稿"));
    }

    private PrintDocumentDefinition requireDefinition(Long id, Long tenantId) {
        return definitionRepository.findById(id)
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> value.tenantId() == null || value.tenantId().equals(tenantId))
                .orElseThrow(() -> notFound("PRINT_DOCUMENT_DEFINITION_NOT_FOUND", "未找到可用的打印单据定义"));
    }

    private PrintMediaProfile requireMedia(Long id, Long tenantId) {
        return mediaRepository.findById(id)
                .filter(value -> "ACTIVE".equals(value.status()))
                .filter(value -> value.tenantId() == null || value.tenantId().equals(tenantId))
                .orElseThrow(() -> notFound("PRINT_MEDIA_PROFILE_NOT_FOUND", "未找到可用的打印介质"));
    }

    private ExecutionContext context() { return contextProvider.requireCurrent(); }
    private String normalizeCode(String value) {
        String code = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z][A-Z0-9_]{2,99}")) {
            throw badRequest("PRINT_TEMPLATE_CODE_INVALID", "模板编码须为 3 到 100 位大写字母、数字或下划线");
        }
        return code;
    }
    private String requireName(String value) {
        String name = value == null ? "" : value.trim();
        if (name.isEmpty() || name.length() > 200) throw badRequest("PRINT_TEMPLATE_NAME_INVALID", "模板名称不能为空且不能超过 200 字");
        return name;
    }
    private String sha256(String value) {
        try { return HexFormat.of().withUpperCase().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (Exception exception) { throw new IllegalStateException("SHA-256 is unavailable", exception); }
    }

    private DocumentDefinitionView view(PrintDocumentDefinition value) {
        return new DocumentDefinitionView(value.id(), value.documentType(), value.documentName(), value.category(),
                value.layoutMode(), value.dataSchema(), value.sourceType(), value.tenantId() == null ? "PLATFORM" : "TENANT");
    }
    private MediaProfileView view(PrintMediaProfile value) {
        return new MediaProfileView(value.id(), value.mediaCode(), value.mediaName(), value.mediaKind(),
                value.widthMm(), value.heightMm(), value.orientation(), value.marginTopMm(), value.marginRightMm(),
                value.marginBottomMm(), value.marginLeftMm(), value.horizontalGapMm(), value.verticalGapMm(),
                value.columns(), value.rows(), value.dpi(), value.sensorMode(),
                value.tenantId() == null ? "PLATFORM" : "TENANT");
    }
    private DraftView view(PrintTemplateDraft value) {
        PrintDocumentDefinition definition = definitionRepository.findById(value.documentDefinitionId()).orElseThrow();
        PrintMediaProfile media = mediaRepository.findById(value.mediaProfileId()).orElseThrow();
        return new DraftView(value.id(), value.revision(), value.templateId(), value.publishedVersionId(),
                value.templateCode(), value.templateName(), value.status(), value.layoutSchema(), value.configJson(),
                view(definition), view(media), value.updatedAt(), value.updatedBy());
    }

    public record CatalogView(List<DocumentDefinitionView> documentDefinitions, List<MediaProfileView> mediaProfiles) {}
    public record DocumentDefinitionView(Long id, String documentType, String documentName, String category,
            String layoutMode, String dataSchema, String sourceType, String scope) {}
    public record MediaProfileView(Long id, String mediaCode, String mediaName, String mediaKind,
            BigDecimal widthMm, BigDecimal heightMm, String orientation, BigDecimal marginTopMm,
            BigDecimal marginRightMm, BigDecimal marginBottomMm, BigDecimal marginLeftMm,
            BigDecimal horizontalGapMm, BigDecimal verticalGapMm, int columns, int rows, int dpi,
            String sensorMode, String scope) {}
    public record DraftView(Long id, long revision, Long templateId, Long publishedVersionId,
            String templateCode, String templateName, String status, String layoutSchema, String configJson,
            DocumentDefinitionView documentDefinition, MediaProfileView mediaProfile, Instant updatedAt,
            Long updatedBy) {}
}
