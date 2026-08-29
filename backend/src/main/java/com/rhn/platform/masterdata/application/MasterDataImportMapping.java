package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ServiceCommand;
import com.rhn.platform.masterdata.api.MasterDataImportViews.ImportError;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

@Component
class MasterDataImportMapping {
    private static final Pattern CODE = Pattern.compile("[A-Za-z][A-Za-z0-9_.-]{0,63}");
    private static final List<Field> SERVICE_FIELDS = List.of(
            field("code", "编码"), field("name", "名称"), field("unitCode", "单位编码"),
            field("orderable", "可开立"), field("chargeable", "可收费"), field("sdStatus", "状态"),
            field("validFrom", "生效日期"), field("validTo", "失效日期"), field("sdServiceType", "项目类型"),
            field("serviceSubtype", "子类型"), field("sdUsageType", "用途类型"),
            field("medicalTechnology", "医疗技术"), field("combinationItem", "组合项目"),
            field("singleOrder", "允许单开"), field("specimenType", "标本类型"),
            field("examinationType", "检查类型"), field("accountingCategory", "核算分类"),
            field("sdDuplicateRule", "重复开立规则"), field("multiSitePrice", "多部位价格"),
            field("freeSiteCount", "免费部位数"), field("maxBodySiteCount", "最大部位数"),
            field("mutualRecognitionCode", "互认编码"), field("pregnancyAlert", "孕期提醒"),
            field("attention", "注意事项"), field("examinationNotes", "检查说明"));
    private static final List<Field> MEDICATION_FIELDS = List.of(
            field("code", "编码"), field("name", "名称"), field("aliasName", "别名"),
            field("sdMedicationType", "药品类型"), field("sdDoseForm", "剂型"),
            field("preparationSpec", "制剂规格"), field("preparationUnit", "制剂单位"),
            field("strengthValue", "含量数值"), field("strengthUnit", "含量单位"),
            field("sdStorageType", "储藏方式"), field("prescriptionDrug", "处方药"),
            field("essentialDrug", "基本药物"), field("antimicrobial", "抗菌药"),
            field("sdAntimicrobialLevel", "抗菌药等级"), field("skinTestRequired", "需要皮试"),
            field("defaultDose", "默认剂量"), field("defaultDoseUnit", "默认剂量单位"),
            field("defaultRoute", "默认给药途径"), field("defaultFrequency", "默认频次"),
            field("chronicDiseaseDrug", "慢病用药"), field("singleOrder", "允许单开"),
            field("sdStatus", "状态"));

    private final JsonCodec jsonCodec;

    MasterDataImportMapping(JsonCodec jsonCodec) { this.jsonCodec = jsonCodec; }

    List<String> templateHeaders(String importType) {
        return fields(importType).stream().map(Field::label).toList();
    }

    MappedRow map(String importType, Map<String, String> source) {
        Map<String, String> canonical = canonicalize(importType, source);
        List<ImportError> errors = new ArrayList<>();
        Object command = "SERVICE".equals(importType)
                ? service(canonical, errors) : medication(canonical, errors);
        Map<String, Object> normalized = errors.isEmpty()
                ? jsonCodec.readObject(jsonCodec.write(command)) : Map.of();
        return new MappedRow(text(canonical.get("code")), normalized, command, List.copyOf(errors));
    }

    ServiceCommand serviceCommand(Map<String, Object> value) {
        return new ServiceCommand(string(value, "code"), string(value, "name"), optional(value, "unitCode"),
                bool(value, "orderable"), bool(value, "chargeable"), string(value, "status"),
                date(value, "validFrom"), date(value, "validTo"), string(value, "serviceType"),
                optional(value, "serviceSubtype"), string(value, "usageType"), bool(value, "medicalTechnology"),
                bool(value, "combinationItem"), bool(value, "singleOrder"), optional(value, "specimenType"),
                optional(value, "examinationType"), optional(value, "accountingCategory"),
                optional(value, "duplicateRule"), decimal(value, "multiSitePrice"), integer(value, "freeSiteCount"),
                integer(value, "maxBodySiteCount"), optional(value, "mutualRecognitionCode"),
                bool(value, "pregnancyAlert"), optional(value, "attention"), optional(value, "examinationNotes"));
    }

    MedicationCommand medicationCommand(Map<String, Object> value) {
        return new MedicationCommand(string(value, "code"), string(value, "name"), optional(value, "aliasName"),
                string(value, "medicationType"), optional(value, "doseForm"), optional(value, "preparationSpec"),
                optional(value, "preparationUnit"), decimal(value, "strengthValue"), optional(value, "strengthUnit"),
                optional(value, "storageType"), bool(value, "prescriptionDrug"), bool(value, "essentialDrug"),
                bool(value, "antimicrobial"), optional(value, "antimicrobialLevel"), bool(value, "skinTestRequired"),
                decimal(value, "defaultDose"), optional(value, "defaultDoseUnit"), optional(value, "defaultRoute"),
                optional(value, "defaultFrequency"), bool(value, "chronicDiseaseDrug"), bool(value, "singleOrder"),
                string(value, "status"));
    }

    private ServiceCommand service(Map<String, String> value, List<ImportError> errors) {
        String code = required(value, "code", "编码", 64, errors);
        if (code != null && !CODE.matcher(code).matches()) error(errors, "code", "CODE_FORMAT", "编码必须以字母开头，只能包含字母、数字、点、下划线和连字符");
        String name = required(value, "name", "名称", 300, errors);
        LocalDate validFrom = requiredDate(value, "validFrom", "生效日期", errors);
        LocalDate validTo = optionalDate(value, "validTo", "失效日期", errors);
        if (validFrom != null && validTo != null && validTo.isBefore(validFrom)) error(errors, "validTo", "DATE_RANGE", "失效日期不能早于生效日期");
        return new ServiceCommand(code, name, optional(value, "unitCode", 64, errors),
                requiredBoolean(value, "orderable", "可开立", errors),
                requiredBoolean(value, "chargeable", "可收费", errors),
                required(value, "sdStatus", "状态", 32, errors), validFrom, validTo,
                required(value, "sdServiceType", "项目类型", 64, errors),
                optional(value, "serviceSubtype", 64, errors),
                required(value, "sdUsageType", "用途类型", 32, errors),
                requiredBoolean(value, "medicalTechnology", "医疗技术", errors),
                requiredBoolean(value, "combinationItem", "组合项目", errors),
                requiredBoolean(value, "singleOrder", "允许单开", errors),
                optional(value, "specimenType", 64, errors), optional(value, "examinationType", 64, errors),
                optional(value, "accountingCategory", 64, errors), optional(value, "sdDuplicateRule", 64, errors),
                optionalDecimal(value, "multiSitePrice", "多部位价格", false, errors),
                optionalInteger(value, "freeSiteCount", "免费部位数", 0, errors),
                optionalInteger(value, "maxBodySiteCount", "最大部位数", 1, errors),
                optional(value, "mutualRecognitionCode", 128, errors),
                requiredBoolean(value, "pregnancyAlert", "孕期提醒", errors),
                optional(value, "attention", 2000, errors), optional(value, "examinationNotes", 2000, errors));
    }

    private MedicationCommand medication(Map<String, String> value, List<ImportError> errors) {
        String code = required(value, "code", "编码", 64, errors);
        if (code != null && !CODE.matcher(code).matches()) error(errors, "code", "CODE_FORMAT", "编码必须以字母开头，只能包含字母、数字、点、下划线和连字符");
        return new MedicationCommand(code, required(value, "name", "名称", 300, errors),
                optional(value, "aliasName", 300, errors),
                required(value, "sdMedicationType", "药品类型", 32, errors),
                optional(value, "sdDoseForm", 64, errors), optional(value, "preparationSpec", 300, errors),
                optional(value, "preparationUnit", 64, errors),
                optionalDecimal(value, "strengthValue", "含量数值", true, errors),
                optional(value, "strengthUnit", 64, errors), optional(value, "sdStorageType", 32, errors),
                requiredBoolean(value, "prescriptionDrug", "处方药", errors),
                requiredBoolean(value, "essentialDrug", "基本药物", errors),
                requiredBoolean(value, "antimicrobial", "抗菌药", errors),
                optional(value, "sdAntimicrobialLevel", 64, errors),
                requiredBoolean(value, "skinTestRequired", "需要皮试", errors),
                optionalDecimal(value, "defaultDose", "默认剂量", true, errors),
                optional(value, "defaultDoseUnit", 64, errors), optional(value, "defaultRoute", 64, errors),
                optional(value, "defaultFrequency", 64, errors),
                requiredBoolean(value, "chronicDiseaseDrug", "慢病用药", errors),
                requiredBoolean(value, "singleOrder", "允许单开", errors),
                required(value, "sdStatus", "状态", 32, errors));
    }

    private Map<String, String> canonicalize(String importType, Map<String, String> source) {
        List<Field> fields = fields(importType);
        Map<String, String> result = new LinkedHashMap<>();
        for (Field field : fields) {
            String value = source.entrySet().stream()
                    .filter(entry -> field.matches(entry.getKey()))
                    .map(Map.Entry::getValue).findFirst().orElse("");
            result.put(field.name(), value == null ? "" : value.trim());
        }
        return result;
    }

    private List<Field> fields(String type) {
        if ("SERVICE".equals(type)) return SERVICE_FIELDS;
        if ("MEDICATION".equals(type)) return MEDICATION_FIELDS;
        throw new IllegalArgumentException("不支持的导入类型");
    }

    private String required(Map<String, String> value, String key, String label, int max, List<ImportError> errors) {
        String result = text(value.get(key));
        if (result == null) { error(errors, key, "REQUIRED", label + "不能为空"); return null; }
        if (result.length() > max) error(errors, key, "MAX_LENGTH", label + "长度不能超过" + max);
        return result;
    }

    private String optional(Map<String, String> value, String key, int max, List<ImportError> errors) {
        String result = text(value.get(key));
        if (result != null && result.length() > max) error(errors, key, "MAX_LENGTH", "字段长度不能超过" + max);
        return result;
    }

    private boolean requiredBoolean(Map<String, String> value, String key, String label, List<ImportError> errors) {
        String raw = text(value.get(key));
        if (raw == null) { error(errors, key, "REQUIRED", label + "不能为空"); return false; }
        return switch (raw.toUpperCase(Locale.ROOT)) {
            case "TRUE", "1", "Y", "YES", "是" -> true;
            case "FALSE", "0", "N", "NO", "否" -> false;
            default -> { error(errors, key, "BOOLEAN_FORMAT", label + "必须填写是/否、Y/N、1/0或true/false"); yield false; }
        };
    }

    private LocalDate requiredDate(Map<String, String> value, String key, String label, List<ImportError> errors) {
        String raw = text(value.get(key));
        if (raw == null) { error(errors, key, "REQUIRED", label + "不能为空"); return null; }
        return parseDate(raw, key, label, errors);
    }

    private LocalDate optionalDate(Map<String, String> value, String key, String label, List<ImportError> errors) {
        String raw = text(value.get(key)); return raw == null ? null : parseDate(raw, key, label, errors);
    }

    private LocalDate parseDate(String raw, String key, String label, List<ImportError> errors) {
        try { return LocalDate.parse(raw.replace('/', '-')); }
        catch (DateTimeParseException exception) { error(errors, key, "DATE_FORMAT", label + "必须使用 yyyy-MM-dd 格式"); return null; }
    }

    private BigDecimal optionalDecimal(Map<String, String> value, String key, String label, boolean positive,
                                       List<ImportError> errors) {
        String raw = text(value.get(key));
        if (raw == null) return null;
        try {
            BigDecimal result = new BigDecimal(raw);
            if (positive ? result.signum() <= 0 : result.signum() < 0) {
                error(errors, key, "NUMBER_RANGE", label + (positive ? "必须大于0" : "不能小于0"));
            }
            return result;
        } catch (NumberFormatException exception) { error(errors, key, "NUMBER_FORMAT", label + "必须是数字"); return null; }
    }

    private Integer optionalInteger(Map<String, String> value, String key, String label, int minimum,
                                    List<ImportError> errors) {
        String raw = text(value.get(key));
        if (raw == null) return null;
        try {
            int result = Integer.parseInt(raw);
            if (result < minimum) error(errors, key, "NUMBER_RANGE", label + "不能小于" + minimum);
            return result;
        } catch (NumberFormatException exception) { error(errors, key, "INTEGER_FORMAT", label + "必须是整数"); return null; }
    }

    private void error(List<ImportError> errors, String field, String code, String message) {
        errors.add(new ImportError(field, code, message));
    }

    private static String text(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static Field field(String name, String label) { return new Field(name, label, Set.of(name, label)); }
    private static String string(Map<String, Object> value, String key) { return String.valueOf(value.get(key)); }
    private static String optional(Map<String, Object> value, String key) {
        Object result = value.get(key); return result == null ? null : String.valueOf(result);
    }
    private static boolean bool(Map<String, Object> value, String key) { return Boolean.TRUE.equals(value.get(key)); }
    private static LocalDate date(Map<String, Object> value, String key) {
        Object result = value.get(key); return result == null ? null : LocalDate.parse(String.valueOf(result));
    }
    private static BigDecimal decimal(Map<String, Object> value, String key) {
        Object result = value.get(key); return result == null ? null : new BigDecimal(String.valueOf(result));
    }
    private static Integer integer(Map<String, Object> value, String key) {
        Object result = value.get(key); return result == null ? null : Integer.valueOf(String.valueOf(result));
    }

    record MappedRow(String sourceKey, Map<String, Object> normalized, Object command, List<ImportError> errors) {}
    private record Field(String name, String label, Set<String> aliases) {
        boolean matches(String raw) { return raw != null && aliases.stream().anyMatch(value -> value.equalsIgnoreCase(raw.trim())); }
    }
}
