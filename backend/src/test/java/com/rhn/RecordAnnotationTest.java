package com.rhn;

import com.rhn.outpatient.api.RecordAnnotation;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class RecordAnnotationTest {
    private RecordAnnotation mark(Integer start, String text) {
        return new RecordAnnotation("presentIllness", text, start, "TEMPLATE", "VARIABLE",
                "symptom.cough.duration", "咳嗽病程", null, null, false);
    }
    @Test void ambiguous_and_stale_anchors_never_mark_another_occurrence() {
        var content = Map.of("presentIllness", "咳嗽3天，用药3天");
        assertTrue(RecordAnnotation.anchored(List.of(mark(null, "3天"), mark(3, "3天")), content, false).isEmpty());
        assertEquals(2, RecordAnnotation.anchored(List.of(mark(2, "3天")), content, false).getFirst().start());
    }
    @Test void saving_confirms_metadata_without_rewriting_text_or_losing_source() {
        var content = Map.of("presentIllness", "咳嗽3天");
        var saved = RecordAnnotation.anchored(List.of(mark(null, "3天")), content, true).getFirst();
        assertTrue(saved.confirmed());
        assertEquals("TEMPLATE", saved.source());
        assertEquals("咳嗽3天", content.get("presentIllness"));
    }
    @Test void invalid_hints_do_not_block_saving_the_document() {
        assertTrue(RecordAnnotation.anchored(List.of(mark(0, "旧文本")), Map.of("presentIllness", "新文本"), true).isEmpty());
    }
    @Test void inference_excludes_presets_but_keeps_explicit_facts_and_saved_confirmation() {
        var content = Map.of("presentIllness", "咳嗽5天，无胸痛");
        var preset = new RecordAnnotation("presentIllness", content.get("presentIllness"), 0,
                "TEMPLATE", "PRESET", null, null, null, null, false);
        var voice = new RecordAnnotation("presentIllness", "咳嗽5天", 0,
                "VOICE", "FACT", null, null, "咳嗽五天了", null, false);
        assertEquals("咳嗽5天", RecordAnnotation.evidence(content, List.of(preset, voice)).get("presentIllness"));
        assertEquals(content, RecordAnnotation.evidence(content, RecordAnnotation.anchored(List.of(preset), content, true)));
        assertEquals("咳嗽5天，无胸痛", content.get("presentIllness"));
    }
    @Test void an_ai_fact_label_alone_does_not_make_it_patient_evidence() {
        var content = Map.of("presentIllness", "无胸痛");
        var ai = new RecordAnnotation("presentIllness", "无胸痛", 0, "AI", "FACT", null, null, null, null, false);
        assertEquals("", RecordAnnotation.evidence(content, List.of(ai)).get("presentIllness"));
    }
}
