package com.rhn.ai.application;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.rhn.outpatient.api.RecordAnnotation;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class RecordExpansionMarkCapTest {
    private static RecordAnnotation mark(String field, String text, String source, String kind) {
        return new RecordAnnotation(field, text, null, source, kind, "k." + text, null, null, null, null);
    }

    @Test
    void dropsAiMarksOnHealthEducationAndFollowUp() {
        var result = ClinicalAssistantApplicationService.capRecommendationMarks(List.of(
                mark("healthEducation", "多饮水", "AI", "IMPORTANT"),
                mark("followUp", "3天后复诊", "AI", "VARIABLE"),
                mark("physicalExam", "咽部无充血", "AI", "IMPORTANT")));
        assertEquals(1, result.size());
        assertEquals("physicalExam", result.get(0).field());
    }

    @Test
    void capsThreePerFieldInOrderOfAppearance() {
        var input = new ArrayList<RecordAnnotation>();
        for (int i = 1; i <= 5; i++) input.add(mark("physicalExam", "体征" + i, "AI", "IMPORTANT"));
        var result = ClinicalAssistantApplicationService.capRecommendationMarks(input);
        assertEquals(List.of("体征1", "体征2", "体征3"), result.stream().map(RecordAnnotation::text).toList());
    }

    @Test
    void capsEightInTotalInOrderOfAppearance() {
        var input = new ArrayList<RecordAnnotation>();
        for (String field : List.of("physicalExam", "presentIllness", "medicalHistory"))
            for (int i = 1; i <= 3; i++) input.add(mark(field, field + i, "AI", "IMPORTANT"));
        input.add(mark("allergyHistory", "否认过敏史", "AI", "IMPORTANT"));
        var result = ClinicalAssistantApplicationService.capRecommendationMarks(input);
        assertEquals(8, result.size());
        assertEquals("medicalHistory2", result.get(7).text());
    }

    @Test
    void conflictAndNonAiMarksAreNeverDroppedOrCounted() {
        var input = new ArrayList<RecordAnnotation>();
        input.add(mark("followUp", "冲突", "AI", "CONFLICT"));
        input.add(mark("healthEducation", "口述", "VOICE", "FACT"));
        input.add(mark("followUp", "上下文", "CONTEXT", "FACT"));
        input.add(mark("physicalExam", "医生", "DOCTOR", "FACT"));
        for (int i = 1; i <= 10; i++) input.add(mark("physicalExam", "AI" + i, "AI", "IMPORTANT"));
        for (int i = 1; i <= 4; i++) input.add(mark("presentIllness", "V" + i, "VOICE", "FACT"));
        input.add(mark("presentIllness", "另一冲突", "AI", "CONFLICT"));
        var result = ClinicalAssistantApplicationService.capRecommendationMarks(input);
        assertEquals(4 + 3 + 4 + 1, result.size());
        assertTrue(result.stream().anyMatch(m -> "冲突".equals(m.text())));
        assertEquals(3, result.stream().filter(m -> "AI".equals(m.source()) && "IMPORTANT".equals(m.kind())).count());
    }

    @Test
    void nullSafe() {
        assertEquals(null, ClinicalAssistantApplicationService.capRecommendationMarks(null));
    }
}
