package com.rhn.ai.application;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.junit.jupiter.api.Assertions.*;

class MedicationSpecificationEvidenceTest {
    private final MedicationIntentParser parser = new MedicationIntentParser();

    @ParameterizedTest
    @ValueSource(strings = {"规格：5mg", "建议规格：5mg", "含量5mg", "strength: 5mg"})
    void explicitSpecificationsInDetailsAreNotDosesAndCannotBeDiscarded(String details) {
        var intent = parser.parse("测试药品", details + "；每次10mg 口服 QD 共1盒");
        assertNull(MedicationSpecificationEvidence.reviewReason(intent, "5.00 mg"));
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, "10mg"));
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, null));
    }

    @Test void ordinaryDoseDoesNotBecomeARequestedProductSpecification() {
        var intent = parser.parse("维生素B12片", "每次5mg 口服 QD 共1盒");
        assertNull(MedicationSpecificationEvidence.reviewReason(intent, null));
        assertNull(MedicationSpecificationEvidence.reviewReason(intent, "10mg"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"0.5mg", "5mg/mL", "0.005g", "5mg×10片", "5mg或10mg", ""})
    void doesNotDiscardDecimalPointsRatiosPackagingOrUncertainty(String specification) {
        var intent = parser.parse("测试药品", "规格：" + specification + "；每次5mg 口服 QD 共1盒");
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, "5mg"));
    }

    @Test void contradictoryNameAndDetailSpecificationsRemainUnresolved() {
        var intent = parser.parse("测试药品 5mg", "规格：10mg；每次5mg 口服 QD 共1盒");
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, "5mg"));
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, "10mg"));
    }

    @Test void equalRepeatedSpecificationsAndExactConcentrationsCanBeConfirmed() {
        var intent = parser.parse("测试药品 5.0mg", "规格：5mg；每次10mg 口服 QD 共1盒");
        assertNull(MedicationSpecificationEvidence.reviewReason(intent, "5 mg"));
        var concentration = parser.parse("测试药品", "浓度：5mg/mL；每次2mL 口服 QD 共1瓶");
        assertNull(MedicationSpecificationEvidence.reviewReason(concentration, "5.00 mg / mL"));
    }
    @ParameterizedTest
    @ValueSource(strings = {"测试药品 10mg", "测试药品（10mg）", "测试药品10mg"})
    void strengthInSourceQuoteSurvivesAReviewedNameWithoutStrength(String quotedName) {
        var intent = parser.parse("测试药品", "来源：" + quotedName + "；每次5mg 口服 QD 共1盒");
        assertNotNull(MedicationSpecificationEvidence.reviewReason(intent, "5mg"));
        assertNull(MedicationSpecificationEvidence.reviewReason(intent, "10mg"));
    }
    @Test void repeatedNamedSpecificationsAndFollowingLinesAreSeparateEvidence() {
        var repeated = parser.parse("测试药品 5mg", "测试药品 5.00mg；每次10mg 口服 QD 共1盒");
        assertNull(MedicationSpecificationEvidence.reviewReason(repeated, "5mg"));
        var line = parser.parse("测试药品", "来源：测试药品5mg\n观察病情，每次10mg 口服 QD 共1盒");
        assertNull(MedicationSpecificationEvidence.reviewReason(line, "5mg"));
    }
}
