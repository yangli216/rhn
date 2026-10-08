package com.rhn.platform.printing.application;

import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class OutpatientDocumentPdfRendererTest {
    private final JsonCodec json = new JsonCodec() {
        private final JsonMapper mapper = JsonMapper.builder().findAndAddModules().build();
        public String write(Object value) { return mapper.writeValueAsString(value); }
        public JsonNode readTree(String value) { return mapper.readTree(value); }
        public <T> T read(String value, Class<T> type) { return mapper.readValue(value, type); }
        @SuppressWarnings("unchecked") public Map<String, Object> readObject(String value) { return mapper.readValue(value, LinkedHashMap.class); }
    };
    private final ClinicalPdfRenderer renderer = new ClinicalPdfRenderer(new ConfigurablePdfRenderer(json), json);

    @Test void note_preserves_narrative_structured_content_and_measurements_without_editor_metadata() throws Exception {
        Map<String, Object> data = patient();
        data.put("content", note());
        byte[] pdf = render("OUTPATIENT_NOTE", data, 210, 297);
        sample("01-outpatient-note", pdf);
        try (PdfReader reader = new PdfReader(pdf)) {
            assertEquals(1, reader.getNumberOfPages());
            assertEquals(595.28, reader.getPageSize(1).getWidth(), .1);
            String text = allText(reader);
            for (String expected : List.of("头晕3天", "李明", "2026-10-03 09:35", "血氧", "辅助检查", "随访复诊", "专科评分", "42 分")) assertTrue(text.contains(expected), expected);
            assertFalse(text.contains("内部来源标记"));
            assertFalse(text.contains("987654321"));
            assertFalse(text.contains("自费/医保"));
        }
    }

    @Test void five_western_drugs_fit_a_single_a5_sheet_with_unambiguous_usage_and_signature_space() throws Exception {
        Map<String, Object> data = patient(); data.put("categoryCode", "WESTERN");
        data.put("medications", medicines(5));
        byte[] pdf = render("OUTPATIENT_PRESCRIPTION", data, 148, 210);
        sample("02-western-prescription", pdf);
        try (PdfReader reader = new PdfReader(pdf)) {
            assertEquals(1, reader.getNumberOfPages());
            assertEquals(419.53, reader.getPageSize(1).getWidth(), .1);
            String text = allText(reader);
            for (String expected : List.of("Rp.", "测试药品5", "每日一次", "口服", "药品金额", "审核", "调配", "核对", "发药", "以下空白")) assertTrue(text.contains(expected), expected);
            assertFalse(text.contains("来源："));
        }
    }

    @Test void herbal_matrix_preserves_special_directions_and_does_not_invent_formula_instructions() throws Exception {
        Map<String, Object> data = patient(); data.put("categoryCode", "HERBAL");
        List<Map<String, Object>> herbs = new ArrayList<>();
        List<String> names = List.of("柴胡", "白芍", "当归", "白术", "茯苓", "甘草", "薄荷", "生姜", "陈皮", "半夏", "桔梗", "枳壳", "党参", "黄芪", "麦冬", "五味子", "菊花", "桑叶");
        for (String name : names) herbs.add(Map.of("medicationName", name, "doseValue", 6, "doseUnit", "g", "durationValue", 7,
                "durationUnit", "剂", "routeName", "口服", "frequencyName", "每日两次", "instruction", name.equals("薄荷") ? "后下" : ""));
        data.put("medications", herbs);
        byte[] pdf = render("OUTPATIENT_PRESCRIPTION", data, 148, 210);
        sample("03-herbal-prescription", pdf);
        try (PdfReader reader = new PdfReader(pdf)) {
            assertEquals(1, reader.getNumberOfPages());
            String text = allText(reader);
            for (String expected : List.of("共 7 剂", "后下", "桑叶", "每日两次")) assertTrue(text.contains(expected), expected);
            assertFalse(text.contains("水煎服")); assertFalse(text.contains("每日1剂"));
        }
    }

    @Test void applications_keep_distinct_ordering_and_execution_departments_and_item_information() throws Exception {
        for (String type : List.of("LABORATORY_APPLICATION", "EXAMINATION_APPLICATION", "TREATMENT_APPLICATION")) {
            Map<String, Object> data = patient();
            data.put("departmentName", "LABORATORY_APPLICATION".equals(type) ? "检验科" : "EXAMINATION_APPLICATION".equals(type) ? "医学影像科" : "治疗室");
            data.put("orderingDepartmentName", "全科门诊");
            data.put("requestNo", "SQ202610030000123"); data.put("clinicalDescription", "患者头晕3天，伴间断乏力。");
            data.put("examinationPurpose", "协助评估病因"); data.put("specimenType", "静脉血");
            data.put("examinationType", "CT");
            String item = "LABORATORY_APPLICATION".equals(type) ? "血常规（五分类）" : "EXAMINATION_APPLICATION".equals(type) ? "头颅CT平扫" : "普通针刺治疗";
            data.put("items", List.of(Map.of("itemName", item, "quantityText", "1 次")));
            byte[] pdf = render(type, data, 210, 148); sample("04-" + type.toLowerCase(Locale.ROOT), pdf);
            try (PdfReader reader = new PdfReader(pdf)) {
                assertEquals(1, reader.getNumberOfPages()); String text = allText(reader);
                for (String expected : List.of("全科门诊", data.get("departmentName").toString(), item, "申请医师", "SQ202610030000123", "协助评估病因")) assertTrue(text.contains(expected), expected);
                assertFalse(text.contains("MALE"));
            }
        }
    }

    @Test void long_records_and_instructions_continue_without_losing_the_end_or_patient_identity() throws Exception {
        Map<String, Object> data = patient(); Map<String, Object> content = note();
        content.put("presentIllness", "完整病程描述，包含起病、演变及诊疗经过。".repeat(250) + "病程末尾校验");
        data.put("content", content);
        byte[] pdf = render("OUTPATIENT_NOTE", data, 210, 297); sample("05-long-note", pdf);
        try (PdfReader reader = new PdfReader(pdf)) {
            assertTrue(reader.getNumberOfPages() > 1);
            assertTrue(allText(reader).contains("病程末尾校验"));
            for (int p = 2; p <= reader.getNumberOfPages(); p++) {
                String text = new PdfTextExtractor(reader).getTextFromPage(p);
                assertTrue(text.contains("续页")); assertTrue(text.contains("林清玄"));
            }
        }
        data.remove("content"); data.put("categoryCode", "WESTERN");
        Map<String, Object> medicine = new LinkedHashMap<>(medicines(1).getFirst());
        medicine.put("instruction", "较长的药品嘱托，用于验证跨页显示与完整保存。".repeat(100) + "嘱托末尾校验");
        data.put("medications", List.of(medicine));
        byte[] longRx = render("OUTPATIENT_PRESCRIPTION", data, 148, 210); sample("06-long-prescription", longRx);
        try (PdfReader reader = new PdfReader(longRx)) {
            assertTrue(reader.getNumberOfPages() > 1); assertTrue(allText(reader).contains("嘱托末尾校验"));
            assertTrue(new PdfTextExtractor(reader).getTextFromPage(1).contains("测试药品1"),
                    "Oversized directions must not leave the first prescription page empty");
            assertTrue(new PdfTextExtractor(reader).getTextFromPage(reader.getNumberOfPages()).contains("发药"),
                    "The last page should contain the signature block, not an orphan reminder");
        }
    }

    @Test void age_is_at_document_date_and_unknown_facts_are_not_filled_from_defaults() throws Exception {
        Map<String, Object> data = patient();
        data.put("resident", Map.of("fullName", "测试婴儿", "birthDate", "2026-09-03", "gender", "UNKNOWN"));
        data.put("authoredByName", ""); data.put("medications", List.of(Map.of("medicationName", "测试药品")));
        byte[] pdf = render("OUTPATIENT_PRESCRIPTION", data, 148, 210);
        try (PdfReader reader = new PdfReader(pdf)) {
            String text = allText(reader); assertTrue(text.contains("1个月")); assertTrue(text.contains("途径未记录"));
            assertFalse(text.contains("口服")); assertFalse(text.contains("987654321"));
        }
    }

    private byte[] render(String type, Map<String, Object> data, int w, int h) {
        return renderer.render(type, OutpatientDocumentPdfRenderer.SCHEMA,
                json.write(Map.of("paper", Map.of("widthMm", w, "heightMm", h, "marginMm", 10))), data);
    }
    private Map<String, Object> patient() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("organizationName", "仁和社区卫生服务中心"); d.put("departmentName", "全科门诊");
        d.put("resident", Map.of("fullName", "林清玄", "gender", "MALE", "birthDate", "1990-05-12"));
        d.put("encounterNo", "OP20261003000123"); d.put("prescriptionNo", "RX20261003000123");
        d.put("authoredAt", "2026-10-03T01:35:00Z"); d.put("signedAt", "2026-10-03T01:35:00Z");
        d.put("authoredBy", "987654321"); d.put("signedBy", "987654321");
        d.put("authoredByName", "李明"); d.put("signedByName", "李明"); d.put("purposeText", "患者副本");
        d.put("diagnoses", List.of(Map.of("display", "原发性高血压", "code", "I10")));
        return d;
    }
    private Map<String, Object> note() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("chiefComplaint", "头晕3天"); c.put("presentIllness", "患者3天前出现间断头晕，伴乏力，自测血压偏高。休息后可缓解，无胸痛、气促。");
        c.put("medicalHistory", "高血压病史2年，既往用药情况见用药记录。"); c.put("allergyHistory", "青霉素过敏");
        c.put("physicalExam", "神志清楚，双肺呼吸音清，心律齐。"); c.put("vitalSigns", Map.of("systolic", 148, "diastolic", 92, "temperature", 36.6, "oxygenSaturation", 98));
        c.put("diagnoses", List.of(Map.of("display", "原发性高血压", "code", "I10")));
        c.put("auxiliaryExaminations", "本次已查看既往心电图报告，结果详见报告。");
        c.put("treatmentPlan", "诊疗计划引用本次就诊的结构化医嘱。"); c.put("healthEducation", "建议记录家庭血压，适量运动，低盐饮食。");
        c.put("followUp", "按接诊医师约定复诊；如出现胸痛、呼吸困难等及时就医。");
        c.put("annotations", List.of(Map.of("label", "内部来源标记")));
        c.put("structuredForm", Map.of("sections", List.of(Map.of("fields", List.of(Map.of("code", "score", "label", "专科评分", "type", "NUMBER", "unit", "分"))))));
        c.put("structuredData", Map.of("score", 42)); return c;
    }
    private List<Map<String, Object>> medicines(int count) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (int i = 1; i <= count; i++) result.add(Map.of("medicationName", "测试药品" + i, "specification", "5mg×7片/盒", "quantity", 1,
                "quantityUnit", "盒", "doseValue", 5, "doseUnit", "mg", "routeName", "口服", "frequencyName", "每日一次"));
        return result;
    }
    private String allText(PdfReader reader) throws Exception {
        StringBuilder s = new StringBuilder(); PdfTextExtractor extractor = new PdfTextExtractor(reader);
        for (int p = 1; p <= reader.getNumberOfPages(); p++) s.append(extractor.getTextFromPage(p)); return s.toString();
    }
    private void sample(String name, byte[] pdf) throws Exception {
        String path = System.getProperty("rhn.print.samples");
        if (path != null) { Files.createDirectories(Path.of(path)); Files.write(Path.of(path, name + ".pdf"), pdf); }
    }
}
