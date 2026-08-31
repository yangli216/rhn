package com.rhn.outpatient.template;

import com.rhn.outpatient.api.OutpatientNoteFormDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class OutpatientNoteFormService implements OutpatientNoteFormDirectory {
    static final String DEFINITION_SCHEMA = "RHN.OUTPATIENT_NOTE_FORM_DEFINITION.V1";
    static final String DEFAULT_SPECIALTY = "GENERAL_PRACTICE";
    private static final Set<String> FIELD_TYPES = Set.of("TEXT", "TEXTAREA", "NUMBER", "SELECT", "BOOLEAN", "DATE");

    private final OutpatientNoteFormVersionRepository repository;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    OutpatientNoteFormService(OutpatientNoteFormVersionRepository repository,
                              ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.repository = repository; this.contextProvider = contextProvider; this.jsonCodec = jsonCodec;
    }

    @Transactional(readOnly = true)
    List<OutpatientNoteFormContracts.View> visible(String specialtyCode) {
        ExecutionContext context = requireContext();
        return repository.findPublished(context.tenantId(), context.organizationId(), context.departmentId(),
                specialty(specialtyCode)).stream().map(this::view).toList();
    }

    @Transactional
    OutpatientNoteFormContracts.View create(OutpatientNoteFormContracts.CreateRequest input) {
        ExecutionContext context = requireContext();
        String code = formCode(input.formCode());
        if (repository.lockPublished(context.tenantId(), context.organizationId(), context.departmentId(), code)
                .isPresent()) throw conflict("NOTE_FORM_ALREADY_EXISTS", "当前科室已经存在该病历表单编码");
        Definition definition = normalize(input.sections());
        OutpatientNoteFormVersion value = new OutpatientNoteFormVersion(context.tenantId(),
                context.organizationId(), context.departmentId(), code, 1, specialty(input.specialtyCode()),
                required(input.name(), "NOTE_FORM_NAME_REQUIRED", "病历表单名称不能为空"),
                clean(input.description()), DEFINITION_SCHEMA, jsonCodec.write(definition),
                context.subjectId(), Instant.now());
        try {
            return view(repository.saveAndFlush(value));
        } catch (DataIntegrityViolationException error) {
            throw conflict("NOTE_FORM_ALREADY_EXISTS", "当前科室已经存在该病历表单编码");
        }
    }

    @Transactional
    OutpatientNoteFormContracts.View revise(String rawCode, OutpatientNoteFormContracts.ReviseRequest input) {
        ExecutionContext context = requireContext();
        String code = formCode(rawCode);
        OutpatientNoteFormVersion current = repository.lockPublished(context.tenantId(), context.organizationId(),
                context.departmentId(), code)
                .orElseThrow(() -> notFound("NOTE_FORM_NOT_FOUND", "未找到当前生效的病历表单"));
        if (current.versionNumber() != input.expectedVersion()) {
            throw conflict("NOTE_FORM_VERSION_CONFLICT", "病历表单已经发布新版本，请刷新后重试");
        }
        Definition definition = normalize(input.sections());
        Instant now = Instant.now();
        current.retire(now);
        OutpatientNoteFormVersion next = new OutpatientNoteFormVersion(context.tenantId(),
                context.organizationId(), context.departmentId(), code, current.versionNumber() + 1,
                specialty(input.specialtyCode()),
                required(input.name(), "NOTE_FORM_NAME_REQUIRED", "病历表单名称不能为空"),
                clean(input.description()), DEFINITION_SCHEMA, jsonCodec.write(definition),
                context.subjectId(), now);
        return view(repository.saveAndFlush(next));
    }

    @Override
    @Transactional(readOnly = true)
    public ResolvedForm resolvePublished(Long versionId, Map<String, Object> values) {
        ExecutionContext context = requireContext();
        OutpatientNoteFormVersion version = repository.findByIdAndTenantId(versionId, context.tenantId())
                .orElseThrow(() -> notFound("NOTE_FORM_NOT_FOUND", "未找到病历表单版本"));
        if (!version.organizationId().equals(context.organizationId())
                || !version.departmentId().equals(context.departmentId())) {
            throw forbidden("NOTE_FORM_FORBIDDEN", "当前工作上下文不能使用该病历表单");
        }
        if (!"PUBLISHED".equals(version.status())) {
            throw conflict("NOTE_FORM_VERSION_RETIRED", "该病历表单版本已停用，请选择当前版本");
        }
        Definition definition = definition(version);
        Map<String, Object> normalized = validateValues(definition, values == null ? Map.of() : values);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("versionId", version.id()); snapshot.put("formCode", version.formCode());
        snapshot.put("version", version.versionNumber()); snapshot.put("name", version.name());
        snapshot.put("description", version.description()); snapshot.put("specialtyCode", version.specialtyCode());
        snapshot.put("definitionSchema", version.definitionSchema()); snapshot.put("sections", definition.sections());
        snapshot.put("publishedAt", version.publishedAt());
        return new ResolvedForm(snapshot, normalized);
    }

    private Map<String, Object> validateValues(Definition definition, Map<String, Object> values) {
        Map<String, OutpatientNoteFormContracts.Field> fields = new LinkedHashMap<>();
        definition.sections().forEach(section -> section.fields().forEach(field -> fields.put(field.code(), field)));
        String unknown = values.keySet().stream().filter(key -> !fields.containsKey(key)).findFirst().orElse(null);
        if (unknown != null) throw badRequest("NOTE_FORM_FIELD_UNKNOWN", "病历表单包含未定义字段：" + unknown);
        Map<String, Object> normalized = new LinkedHashMap<>();
        for (OutpatientNoteFormContracts.Field field : fields.values()) {
            Object raw = values.get(field.code());
            Object value = normalizeValue(field, raw);
            if (value == null) {
                if (field.required()) throw badRequest("NOTE_FORM_FIELD_REQUIRED", field.label() + "不能为空");
            } else normalized.put(field.code(), value);
        }
        return normalized;
    }

    private Object normalizeValue(OutpatientNoteFormContracts.Field field, Object raw) {
        if (raw == null) return null;
        return switch (field.type()) {
            case "TEXT", "TEXTAREA" -> {
                if (!(raw instanceof String text)) throw invalidType(field);
                String value = clean(text);
                if (value != null && field.maxLength() != null && value.length() > field.maxLength()) {
                    throw badRequest("NOTE_FORM_FIELD_TOO_LONG", field.label() + "不能超过" + field.maxLength() + "个字符");
                }
                yield value;
            }
            case "NUMBER" -> {
                if (!(raw instanceof Number)) throw invalidType(field);
                BigDecimal value;
                try { value = new BigDecimal(raw.toString()); }
                catch (NumberFormatException error) { throw invalidType(field); }
                if (field.minimum() != null && value.compareTo(field.minimum()) < 0) {
                    throw badRequest("NOTE_FORM_FIELD_OUT_OF_RANGE", field.label() + "不能小于" + field.minimum());
                }
                if (field.maximum() != null && value.compareTo(field.maximum()) > 0) {
                    throw badRequest("NOTE_FORM_FIELD_OUT_OF_RANGE", field.label() + "不能大于" + field.maximum());
                }
                yield value;
            }
            case "SELECT" -> {
                if (!(raw instanceof String text)) throw invalidType(field);
                String value = clean(text);
                if (value != null && field.options().stream().noneMatch(option -> option.value().equals(value))) {
                    throw badRequest("NOTE_FORM_FIELD_OPTION_INVALID", field.label() + "选项不在当前表单定义中");
                }
                yield value;
            }
            case "BOOLEAN" -> {
                if (!(raw instanceof Boolean)) throw invalidType(field);
                yield raw;
            }
            case "DATE" -> {
                if (!(raw instanceof String text)) throw invalidType(field);
                String value = clean(text);
                if (value != null) {
                    try { LocalDate.parse(value); }
                    catch (DateTimeParseException error) {
                        throw badRequest("NOTE_FORM_FIELD_DATE_INVALID", field.label() + "日期格式不正确");
                    }
                }
                yield value;
            }
            default -> throw new IllegalStateException("Unsupported field type " + field.type());
        };
    }

    private RuntimeException invalidType(OutpatientNoteFormContracts.Field field) {
        return badRequest("NOTE_FORM_FIELD_TYPE_INVALID", field.label() + "的数据类型不正确");
    }

    private Definition normalize(List<OutpatientNoteFormContracts.Section> input) {
        if (input == null || input.isEmpty()) throw badRequest("NOTE_FORM_SECTION_REQUIRED", "病历表单至少需要一个分区");
        Set<String> sectionCodes = new HashSet<>();
        Set<String> fieldCodes = new HashSet<>();
        int[] fieldCount = {0};
        List<OutpatientNoteFormContracts.Section> sections = input.stream().map(section -> {
            String sectionCode = lowerCode(section.code(), "NOTE_FORM_SECTION_CODE_INVALID", "表单分区编码格式不正确");
            if (!sectionCodes.add(sectionCode)) throw badRequest("NOTE_FORM_SECTION_DUPLICATED", "表单分区编码不能重复");
            if (section.fields() == null || section.fields().isEmpty()) {
                throw badRequest("NOTE_FORM_FIELD_REQUIRED", "每个表单分区至少需要一个字段");
            }
            List<OutpatientNoteFormContracts.Field> fields = section.fields().stream().map(field -> {
                fieldCount[0]++;
                String code = lowerCode(field.code(), "NOTE_FORM_FIELD_CODE_INVALID", "表单字段编码格式不正确");
                if (!fieldCodes.add(code)) throw badRequest("NOTE_FORM_FIELD_DUPLICATED", "表单字段编码不能重复");
                String type = upper(field.type());
                if (!FIELD_TYPES.contains(type)) throw badRequest("NOTE_FORM_FIELD_TYPE_INVALID", "不支持的表单字段类型");
                List<OutpatientNoteFormContracts.Option> options = normalizeOptions(field.options());
                if ("SELECT".equals(type) && options.isEmpty()) {
                    throw badRequest("NOTE_FORM_FIELD_OPTIONS_REQUIRED", "选择字段至少需要一个选项");
                }
                if (!"SELECT".equals(type) && !options.isEmpty()) {
                    throw badRequest("NOTE_FORM_FIELD_OPTIONS_UNSUPPORTED", "只有选择字段可以配置选项");
                }
                Integer maxLength = field.maxLength();
                if (List.of("TEXT", "TEXTAREA").contains(type)) {
                    if (maxLength == null) maxLength = "TEXT".equals(type) ? 200 : 1000;
                    if (maxLength < 1 || maxLength > 4000) {
                        throw badRequest("NOTE_FORM_FIELD_LENGTH_INVALID", "文本字段长度必须在1到4000之间");
                    }
                } else if (maxLength != null) {
                    throw badRequest("NOTE_FORM_FIELD_LENGTH_UNSUPPORTED", "当前字段类型不能配置文本长度");
                }
                if (!"NUMBER".equals(type) && (field.minimum() != null || field.maximum() != null)) {
                    throw badRequest("NOTE_FORM_FIELD_RANGE_UNSUPPORTED", "只有数值字段可以配置取值范围");
                }
                if (field.minimum() != null && field.maximum() != null
                        && field.minimum().compareTo(field.maximum()) > 0) {
                    throw badRequest("NOTE_FORM_FIELD_RANGE_INVALID", "数值字段最小值不能大于最大值");
                }
                return new OutpatientNoteFormContracts.Field(code,
                        required(field.label(), "NOTE_FORM_FIELD_LABEL_REQUIRED", "表单字段名称不能为空"),
                        type, field.required(), clean(field.unit()), clean(field.placeholder()), maxLength,
                        field.minimum(), field.maximum(), options);
            }).toList();
            return new OutpatientNoteFormContracts.Section(sectionCode,
                    required(section.title(), "NOTE_FORM_SECTION_TITLE_REQUIRED", "表单分区名称不能为空"),
                    clean(section.description()), fields);
        }).toList();
        if (fieldCount[0] > 40) throw badRequest("NOTE_FORM_FIELDS_TOO_MANY", "单个病历表单最多支持40个字段");
        return new Definition(sections);
    }

    private List<OutpatientNoteFormContracts.Option> normalizeOptions(List<OutpatientNoteFormContracts.Option> input) {
        if (input == null) return List.of();
        Set<String> values = new HashSet<>();
        List<OutpatientNoteFormContracts.Option> result = new ArrayList<>();
        for (OutpatientNoteFormContracts.Option option : input) {
            String value = required(option.value(), "NOTE_FORM_OPTION_VALUE_REQUIRED", "选项值不能为空");
            if (!values.add(value)) throw badRequest("NOTE_FORM_OPTION_DUPLICATED", "选择字段的选项值不能重复");
            result.add(new OutpatientNoteFormContracts.Option(value,
                    required(option.label(), "NOTE_FORM_OPTION_LABEL_REQUIRED", "选项名称不能为空")));
        }
        return List.copyOf(result);
    }

    private OutpatientNoteFormContracts.View view(OutpatientNoteFormVersion value) {
        Definition definition = definition(value);
        return new OutpatientNoteFormContracts.View(value.id(), value.formCode(), value.versionNumber(),
                value.specialtyCode(), value.name(), value.description(), value.definitionSchema(),
                definition.sections(), value.status(), value.publishedBy(), value.publishedAt());
    }

    private Definition definition(OutpatientNoteFormVersion value) {
        if (!DEFINITION_SCHEMA.equals(value.definitionSchema())) {
            throw conflict("NOTE_FORM_SCHEMA_UNSUPPORTED", "病历表单定义版本暂不受当前系统支持");
        }
        return jsonCodec.read(value.definitionJson(), Definition.class);
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.organizationId() == null || context.departmentId() == null) {
            throw forbidden("NOTE_FORM_WORK_CONTEXT_REQUIRED", "请先选择机构和科室工作上下文");
        }
        return context;
    }

    private String formCode(String value) {
        String result = upper(value);
        if (!result.matches("[A-Z][A-Z0-9_]{0,63}")) {
            throw badRequest("NOTE_FORM_CODE_INVALID", "病历表单编码格式不正确");
        }
        return result;
    }

    private String specialty(String value) {
        String result = clean(value) == null ? DEFAULT_SPECIALTY : upper(value);
        if (!result.matches("[A-Z][A-Z0-9_]{0,63}")) {
            throw badRequest("NOTE_FORM_SPECIALTY_INVALID", "专科编码格式不正确");
        }
        return result;
    }

    private String lowerCode(String value, String code, String message) {
        String result = clean(value);
        if (result == null || !result.matches("[a-z][A-Za-z0-9]{0,63}")) throw badRequest(code, message);
        return result;
    }

    private String upper(String value) { return value == null ? "" : value.trim().toUpperCase(Locale.ROOT); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null) throw badRequest(code, message); return result;
    }

    private record Definition(List<OutpatientNoteFormContracts.Section> sections) {}
}
