package com.rhn.ai.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationProductView;
import com.rhn.platform.masterdata.api.MasterDataViews.PackageView;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Resolves Medication -> Product -> Package without silently selecting among multiple valid candidates. */
@Service
public class MedicationCandidateMatchingService {
    private final OutpatientPrescriptionInventoryDirectory inventory;

    public MedicationCandidateMatchingService(OutpatientPrescriptionInventoryDirectory inventory) {
        this.inventory = inventory;
    }

    public Result match(long tenantId, long organizationId, long departmentId,
                        MedicationIntentParser.ParsedMedication intent) {
        if (intent == null || blank(intent.medicationName())) {
            return Result.unavailable("未识别到药品通用名");
        }
        List<OutpatientPrescriptionInventoryDirectory.OrderableMedicationView> medications = inventory
                .findOrderableMedications(tenantId, organizationId, departmentId, intent.medicationName()).stream()
                .filter(value -> "ACTIVE".equals(value.sdStatus()))
                .filter(value -> matchesMedication(intent.medicationName(), value))
                .toList();
        if (medications.isEmpty()) {
            String stem = extractMedicationStem(intent.medicationName());
            if (stem != null && !stem.isBlank() && !stem.equals(intent.medicationName())) {
                medications = inventory.findOrderableMedications(tenantId, organizationId, departmentId, stem).stream()
                        .filter(value -> "ACTIVE".equals(value.sdStatus()))
                        .filter(value -> matchesMedication(intent.medicationName(), value))
                        .toList();
            }
        }
        if (medications.isEmpty()) return Result.unavailable("当前机构可开药目录没有通用名精确匹配项");
        if (medications.size() > 1) return Result.ambiguous("MEDICATION", medications.size());
        var medication = medications.getFirst();

        List<MedicationProductView> products = medication.products() == null ? List.of()
                : medication.products().stream().filter(value -> value.orderable() && value.stocked()
                && "ACTIVE".equals(value.sdStatus())).toList();
        if (products.isEmpty()) return Result.unavailable("匹配到通用药品，但当前机构没有可开立产品");
        List<MedicationProductView> exactProducts = products.stream()
                .filter(value -> containsEither(intent.productHint(), value.name())
                        || containsEither(intent.productHint(), value.tradeName())
                        || exact(intent.productHint(), value.code())).toList();
        if (!exactProducts.isEmpty()) products = exactProducts;
        if (products.size() > 1) return Result.ambiguous("PRODUCT", products.size());
        var product = products.getFirst();

        List<PackageView> packages = product.packages() == null ? List.of()
                : product.packages().stream().filter(value -> "ACTIVE".equals(value.sdStatus())).toList();
        List<PackageView> packageMatches = blank(intent.quantityUnit()) ? packages : packages.stream()
                .filter(value -> exact(intent.quantityUnit(), value.unitCode())
                        || exact(intent.quantityUnit(), value.unitName())).toList();
        if (packageMatches.isEmpty()) return Result.unavailable("产品没有与数量单位匹配的有效包装");
        if (packageMatches.size() > 1) return Result.ambiguous("PACKAGE", packageMatches.size());
        var itemPackage = packageMatches.getFirst();
        var availability = inventory.inspectMedicationAvailability(tenantId, organizationId, departmentId,
                product.id(), itemPackage.id());
        if (availability == null || !availability.routeConfigured() || !availability.stockItemConfigured()
                || availability.availableBaseQuantity() == null || availability.availableBaseQuantity().signum() <= 0) {
            return Result.unavailable("匹配产品在当前门诊药房不可开立或无可用库存");
        }
        List<String> missing = new ArrayList<>();
        if (intent.doseValue() == null || intent.doseUnit() == null) missing.add("剂量");
        if (intent.routeCode() == null) missing.add("途径");
        if (intent.frequencyCode() == null) missing.add("频次");
        if (intent.quantity() == null || intent.quantityUnit() == null) missing.add("数量");
        if (!missing.isEmpty()) {
            return new Result(Status.NEEDS_REVIEW, medication, product, itemPackage,
                    "已唯一匹配目录，但缺少" + String.join("、", missing), List.of());
        }
        return new Result(Status.UNIQUE_MATCH, medication, product, itemPackage,
                "Medication、Product、Package 与库存均唯一匹配", List.of());
    }

    private boolean exact(String left, String right) {
        return !blank(left) && !blank(right) && normalized(left).equals(normalized(right));
    }
    private boolean matchesMedication(String intentName, OutpatientPrescriptionInventoryDirectory.OrderableMedicationView value) {
        if (exact(intentName, value.name()) || exact(intentName, value.code())) {
            return true;
        }
        if (!blank(value.aliasName())) {
            for (String alias : value.aliasName().split("[,，;；\\s]+")) {
                if (exact(intentName, alias)) return true;
            }
        }
        return matchesCompoundDosageForm(intentName, value.name());
    }

    private static final java.util.regex.Pattern COMPOUND_FORM_PATTERN =
            java.util.regex.Pattern.compile("^(.*?)[（\\(](.*?)[）\\)]$");

    private boolean matchesCompoundDosageForm(String intentName, String catalogName) {
        if (blank(intentName) || blank(catalogName)) return false;
        var matcher = COMPOUND_FORM_PATTERN.matcher(catalogName.trim());
        if (!matcher.matches()) return false;
        String baseName = matcher.group(1).trim();
        String formPart = matcher.group(2).trim();
        if (baseName.isBlank() || formPart.isBlank()) return false;

        String normIntent = normalized(intentName);
        String normBase = normalized(baseName);
        if (!normIntent.startsWith(normBase)) return false;

        String intentSuffix = normIntent.substring(normBase.length());
        if (intentSuffix.isBlank()) return false;

        String[] forms = formPart.split("[,，、/\\s]+");
        for (String form : forms) {
            String normForm = normalized(form);
            if (normForm.isBlank()) continue;
            if (intentSuffix.equals(normForm)
                    || intentSuffix.equals(normForm.replaceAll("剂$", ""))
                    || (normForm + "剂").equals(intentSuffix)) {
                return true;
            }
        }
        return false;
    }

    private static final java.util.regex.Pattern DOSAGE_FORM_SUFFIX = java.util.regex.Pattern.compile(
            "(?:胶囊剂|胶囊|片剂|片|口服溶液|口服液|颗粒剂|颗粒|混悬滴剂|混悬液|糖浆剂|糖浆|滴剂|注射液|注射用冻干粉针|冻干粉针|注射剂"
                    + "|软膏剂|软膏|乳膏剂|乳膏|凝胶剂|凝胶|滴眼液|滴鼻液|喷雾剂|吸入气雾剂|气雾剂|栓剂|栓|贴膏剂|贴膏|贴剂|散剂|散|洗剂)$");

    private String extractMedicationStem(String medicationName) {
        if (blank(medicationName)) return null;
        String trimmed = medicationName.trim();
        String stem = DOSAGE_FORM_SUFFIX.matcher(trimmed).replaceFirst("").trim();
        return (stem.length() >= 2 && !stem.equals(trimmed)) ? stem : null;
    }

    private boolean contains(String source, String candidate) {
        return !blank(source) && !blank(candidate) && normalized(source).contains(normalized(candidate));
    }
    private boolean containsEither(String left, String right) {
        return contains(left, right) || contains(right, left);
    }
    private String normalized(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[\\p{P}\\p{Z}\\s]+", "");
    }
    private boolean blank(String value) { return value == null || value.isBlank(); }

    public enum Status { UNIQUE_MATCH, NEEDS_REVIEW, AMBIGUOUS, UNAVAILABLE }

    public record Result(Status status,
                         OutpatientPrescriptionInventoryDirectory.OrderableMedicationView medication,
                         MedicationProductView product, PackageView itemPackage,
                         String evidence, List<String> candidates) {
        static Result unavailable(String evidence) {
            return new Result(Status.UNAVAILABLE, null, null, null, evidence, List.of());
        }
        static Result ambiguous(String level, int count) {
            return new Result(Status.AMBIGUOUS, null, null, null,
                    level + " 层存在 " + count + " 个候选，禁止自动选择", List.of());
        }
    }
}
