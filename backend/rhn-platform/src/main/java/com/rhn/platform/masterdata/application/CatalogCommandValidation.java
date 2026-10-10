package com.rhn.platform.masterdata.application;

import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ServiceCommand;
import com.rhn.platform.masterdata.api.MasterDataDictionaryCodes;
import com.rhn.platform.masterdata.api.OrderFrequencyDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;

/** Dictionary, route/frequency and medication safety validation; no persistence or transaction ownership. */
@Service
class CatalogCommandValidation {
    private final DictionaryDirectory dictionaryDirectory;
    private final OrderFrequencyDirectory orderFrequencyDirectory;
    private final MedicationRouteDirectory medicationRouteDirectory;
    private final ExecutionContextProvider contextProvider;
    CatalogCommandValidation(DictionaryDirectory dictionaries, OrderFrequencyDirectory frequencies,
            MedicationRouteDirectory routes, ExecutionContextProvider contexts) {
        this.dictionaryDirectory = dictionaries;
        this.orderFrequencyDirectory = frequencies;
        this.medicationRouteDirectory = routes;
        this.contextProvider = contexts;
    }
    void validateService(ServiceCommand command) {
        requireCode(MasterDataDictionaryCodes.SERVICE_TYPE, command.serviceType());
        requireCode(MasterDataDictionaryCodes.SERVICE_USE, command.usageType());
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (!blank(command.duplicateRule())) {
            requireCode(MasterDataDictionaryCodes.SERVICE_DUPLICATE_RULE, command.duplicateRule());
        }
        if (!command.singleOrder() && command.orderable() && !command.combinationItem()) {
            throw badRequest("SERVICE_SINGLE_ORDER_CONFLICT", "非单开项目不能作为普通独立开立项");
        }
    }

    void validateMedication(MedicationCommand command) {
        requireCode(MasterDataDictionaryCodes.MEDICATION_TYPE, command.medicationType());
        boolean western = "WESTERN".equals(command.medicationType());
        boolean herbal = "HERBAL".equals(command.medicationType());
        boolean vaccine = "VACCINE".equals(command.medicationType());
        if (!blank(command.doseForm())) requireCode(MasterDataDictionaryCodes.DOSE_FORM, command.doseForm());
        if (!blank(command.storageType())) requireCode(MasterDataDictionaryCodes.STORAGE_TYPE, command.storageType());
        if (!blank(command.antimicrobialLevel())) {
            requireCode(MasterDataDictionaryCodes.ANTIMICROBIAL_LEVEL, command.antimicrobialLevel());
        }
        requireCode(MasterDataDictionaryCodes.STATUS, command.status());
        if (command.strengthValue() != null && blank(command.strengthUnit())) {
            throw badRequest("MEDICATION_STRENGTH_UNIT_REQUIRED", "填写药品含量时必须同时填写含量单位");
        }
        requirePair(command.defaultDose(), command.defaultDoseUnit(), "MEDICATION_DEFAULT_DOSE_UNIT_REQUIRED",
                "填写默认剂量时必须同时填写剂量单位");
        if (!command.antimicrobial() && !blank(command.antimicrobialLevel())) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_LEVEL_CONFLICT", "非抗菌药物不能设置抗菌药等级");
        }
        if (command.antimicrobial() && blank(command.antimicrobialLevel())) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_LEVEL_REQUIRED", "抗菌药物必须设置分级管理等级");
        }
        if (!western && (command.antimicrobial() || !blank(command.antimicrobialLevel()))) {
            throw badRequest("MEDICATION_ANTIMICROBIAL_TYPE_INVALID", "仅西药和化学药可维护抗菌药物及抗菌药等级");
        }
        if (!western && command.skinTestRequired()) {
            throw badRequest("MEDICATION_SKIN_TEST_TYPE_INVALID", "仅西药和化学药可维护药品皮试属性");
        }
        if (command.antimicrobial()) {
            if (command.antimicrobialMaxDays() != null
                    && (command.antimicrobialMaxDays() < 1 || command.antimicrobialMaxDays() > 90)) {
                throw badRequest("MEDICATION_ANTIMICROBIAL_MAX_DAYS_INVALID", "抗菌药门诊疗程上限应为 1 至 90 天");
            }
            if ("SPECIAL".equals(command.antimicrobialLevel()) && antimicrobialOutpatientAllowed(command)) {
                throw badRequest("MEDICATION_SPECIAL_ANTIMICROBIAL_OUTPATIENT_INVALID", "特殊使用级抗菌药不得配置为门诊常规可用");
            }
            if ("SPECIAL".equals(command.antimicrobialLevel()) && !antimicrobialConsultationRequired(command)) {
                throw badRequest("MEDICATION_SPECIAL_ANTIMICROBIAL_CONSULT_REQUIRED", "特殊使用级抗菌药必须配置会诊或审批要求");
            }
        }
        if (command.skinTestRequired()) {
            if (blank(command.skinTestMethod()) || blank(command.skinTestSolutionMode())
                    || command.skinTestObservationMinutes() == null || command.skinTestResultValidityHours() == null) {
                throw badRequest("MEDICATION_SKIN_TEST_CONFIGURATION_REQUIRED", "需皮试药品必须明确维护皮试方式、试液方式、观察时长和结果有效期");
            }
            if (!Set.of("INTRADERMAL", "PRICK", "OTHER").contains(skinTestMethod(command))) {
                throw badRequest("MEDICATION_SKIN_TEST_METHOD_INVALID", "皮试方式不正确");
            }
            if (!Set.of("ORIGINAL_SOLUTION", "DILUTED_SOLUTION").contains(skinTestSolutionMode(command))) {
                throw badRequest("MEDICATION_SKIN_TEST_SOLUTION_MODE_INVALID", "皮试液配置方式不正确");
            }
            if (skinTestObservationMinutes(command) < 1 || skinTestObservationMinutes(command) > 120) {
                throw badRequest("MEDICATION_SKIN_TEST_OBSERVATION_INVALID", "皮试观察时长应为 1 至 120 分钟");
            }
            if (skinTestResultValidityHours(command) < 1 || skinTestResultValidityHours(command) > 8760) {
                throw badRequest("MEDICATION_SKIN_TEST_VALIDITY_INVALID", "皮试结果有效期应为 1 至 8760 小时");
            }
        }
        if (herbal && (command.strengthValue() != null || !blank(command.strengthUnit()))) {
            throw badRequest("MEDICATION_HERBAL_STRENGTH_INVALID", "草药饮片不维护制剂含量，请使用炮制规格和默认剂量");
        }
        if ((herbal || vaccine) && command.chronicDiseaseDrug()) {
            throw badRequest("MEDICATION_CHRONIC_TYPE_INVALID", "草药饮片和疫苗不维护慢病用药属性");
        }
        if (vaccine && !blank(command.defaultFrequency())) {
            throw badRequest("MEDICATION_VACCINE_FREQUENCY_INVALID", "疫苗接种程序应通过类型扩展属性维护，不能使用普通给药频次");
        }
    }

    void requirePair(Object value, String unit, String code, String message) {
        if ((value == null) != blank(unit)) throw badRequest(code, message);
    }

    boolean antimicrobialOutpatientAllowed(MedicationCommand command) {
        if (!command.antimicrobial()) return false;
        if (command.antimicrobialOutpatientAllowed() != null) return command.antimicrobialOutpatientAllowed();
        return !"SPECIAL".equals(command.antimicrobialLevel());
    }

    boolean antimicrobialConsultationRequired(MedicationCommand command) {
        if (!command.antimicrobial()) return false;
        if (command.antimicrobialConsultationRequired() != null) return command.antimicrobialConsultationRequired();
        return "SPECIAL".equals(command.antimicrobialLevel());
    }

    boolean antimicrobialEmergencyAllowed(MedicationCommand command) {
        return command.antimicrobial() && Boolean.TRUE.equals(command.antimicrobialEmergencyAllowed());
    }

    Integer antimicrobialMaxDays(MedicationCommand command) {
        return command.antimicrobial() && antimicrobialOutpatientAllowed(command)
                ? command.antimicrobialMaxDays() : null;
    }

    String skinTestMethod(MedicationCommand command) {
        return command.skinTestRequired() ? defaultIfBlank(command.skinTestMethod(), null) : null;
    }

    String skinTestSolutionMode(MedicationCommand command) {
        return command.skinTestRequired() ? defaultIfBlank(command.skinTestSolutionMode(), null) : null;
    }

    Integer skinTestObservationMinutes(MedicationCommand command) {
        return command.skinTestRequired()
                ? command.skinTestObservationMinutes() : null;
    }

    Integer skinTestResultValidityHours(MedicationCommand command) {
        return command.skinTestRequired()
                ? command.skinTestResultValidityHours() : null;
    }

    String skinTestInstructions(MedicationCommand command) {
        return command.skinTestRequired() ? Strings.trimToNull(command.skinTestInstructions()) : null;
    }

    String defaultIfBlank(String value, String defaultValue) {
        return blank(value) ? defaultValue : value.trim().toUpperCase(Locale.ROOT);
    }

    OrderFrequencyDirectory.FrequencySnapshot resolveMedicationFrequency(ExecutionContext context,
            String code, Long organizationId) {
        if (blank(code)) return null;
        Long org = organizationId == null ? context.organizationId() : organizationId;
        return orderFrequencyDirectory.requireActive(context.tenantId(), code, org, context.departmentId(),
                "OUTPATIENT", "MEDICATION", LocalDate.now());
    }

    MedicationRouteDirectory.RouteSnapshot resolveMedicationRoute(ExecutionContext context, String code) {
        if (blank(code)) return null;
        return medicationRouteDirectory.requireActive(context.tenantId(), code, "MASTER_DATA", LocalDate.now());
    }

    void requireCode(String dictionary, String code) {
        if (blank(code) || dictionaryDirectory.resolveActiveItems(current().tenantId(), dictionary).stream()
                .noneMatch(value -> value.code().equals(code))) {
            throw badRequest("MASTER_DATA_CODE_INVALID", "代码 " + code + " 不属于字典 " + dictionary);
        }
    }
    private boolean blank(String value) { return value == null || value.isBlank(); }
    private ExecutionContext current() { return contextProvider.requireCurrent(); }
}
