package com.rhn.platform.printing.application;

import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;
import tools.jackson.databind.JsonNode;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ClinicalPdfRendererTest {

    private ClinicalPdfRenderer renderer;

    @BeforeEach
    void setUp() {
        ConfigurablePdfRenderer configurableRenderer = new ConfigurablePdfRenderer(new DummyJsonCodec());
        renderer = new ClinicalPdfRenderer(configurableRenderer);
    }

    @Test
    void outpatient_note_renders_a5_landscape() throws Exception {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", "门诊病历");
        snapshot.put("organizationName", "社区卫生服务中心");
        snapshot.put("departmentName", "全科门诊");
        snapshot.put("encounterNo", "ENC20261002001");
        snapshot.put("signedBy", "1001");
        snapshot.put("signedByName", "王医生");
        snapshot.put("signedAt", Instant.now().toString());
        snapshot.put("sourceVersion", "1");
        snapshot.put("signatureMeaning", "接诊医师签署");

        Map<String, Object> resident = new LinkedHashMap<>();
        resident.put("fullName", "张三");
        resident.put("gender", "MALE");
        resident.put("birthDate", "1988-05-12");
        resident.put("healthRecordNo", "HRN330102001");
        snapshot.put("resident", resident);

        Map<String, Object> content = new LinkedHashMap<>();
        content.put("chiefComplaint", "头痛眩晕3天");
        content.put("annotations", List.of(Map.of("field", "chiefComplaint", "text", "3天",
                "source", "TEMPLATE", "kind", "VARIABLE", "label", "内部模板变量来源标记")));
        content.put("presentIllness", "患者3天前出现间断性头晕，伴颈项强痛，自测血压偏高。");
        content.put("medicalHistory", "原发性高血压病史2年。");
        content.put("allergyHistory", "青霉素过敏");
        content.put("physicalExam", "BP 148/92 mmHg，心肺听诊未见异常，神经系统查体无阳性体征。");
        content.put("vitalSigns", Map.of(
                "systolic", 148,
                "diastolic", 92,
                "temperature", 36.6,
                "pulseRate", 78,
                "respiratoryRate", 18
        ));
        content.put("diagnoses", List.of(
                Map.of("code", "I10", "display", "原发性高血压", "type", "PRIMARY")
        ));
        content.put("treatmentPlan", "低盐低脂饮食，监测家庭血压，遵医嘱按时服药。");
        snapshot.put("content", content);

        byte[] pdf = renderer.render("OUTPATIENT_NOTE", null, null, snapshot);
        assertNotNull(pdf);
        assertTrue(pdf.length > 1000);

        PdfReader reader = new PdfReader(pdf);
        Rectangle pageSize = reader.getPageSize(1);
        // A5 landscape: width 595.28pt, height 419.53pt
        assertEquals(595.28f, pageSize.getWidth(), 1.0f);
        assertEquals(419.53f, pageSize.getHeight(), 1.0f);

        String text = new PdfTextExtractor(reader).getTextFromPage(1);
        assertTrue(text.contains("门诊病历记录单"));
        assertTrue(text.contains("张三"));
        assertTrue(text.contains("头痛眩晕3天"));
        assertFalse(text.contains("内部模板变量来源标记"));
        assertFalse(text.contains("TEMPLATE"));
        assertTrue(text.contains("原发性高血压"));
        assertTrue(text.contains("王医生"));
        reader.close();
    }

    @Test
    void western_prescription_renders_a5_landscape() throws Exception {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", "门诊处方笺");
        snapshot.put("categoryCode", "WESTERN");
        snapshot.put("organizationName", "第一人民医院");
        snapshot.put("departmentName", "全科门诊");
        snapshot.put("encounterNo", "ENC20261002002");
        snapshot.put("prescriptionNo", "RX202610020001");
        snapshot.put("authoredAt", Instant.now().toString());
        snapshot.put("authoredBy", "1002");
        snapshot.put("authoredByName", "李医师");
        snapshot.put("note", "遵医嘱按时服药");

        Map<String, Object> resident = new LinkedHashMap<>();
        resident.put("fullName", "李四");
        resident.put("gender", "FEMALE");
        resident.put("birthDate", "1995-08-20");
        snapshot.put("resident", resident);

        snapshot.put("diagnoses", List.of(
                Map.of("code", "I10", "display", "高血压病", "primary", true)
        ));

        snapshot.put("medications", List.of(
                Map.of(
                        "medicationName", "苯磺酸氨氯地平片",
                        "productName", "络活喜",
                        "specification", "5mg*7片/盒",
                        "quantity", 1,
                        "quantityUnit", "盒",
                        "doseValue", 5,
                        "doseUnit", "mg",
                        "routeCode", "口服",
                        "frequencyCode", "QD",
                        "instruction", "每日清晨一次"
                )
        ));

        byte[] pdf = renderer.render("OUTPATIENT_PRESCRIPTION", null, null, snapshot);
        assertNotNull(pdf);

        PdfReader reader = new PdfReader(pdf);
        Rectangle pageSize = reader.getPageSize(1);
        assertEquals(595.28f, pageSize.getWidth(), 1.0f);
        assertEquals(419.53f, pageSize.getHeight(), 1.0f);

        String text = new PdfTextExtractor(reader).getTextFromPage(1);
        assertTrue(text.contains("门诊处方笺"));
        assertTrue(text.contains("苯磺酸氨氯地平片"));
        assertTrue(text.contains("Rp."));
        assertTrue(text.contains("李四"));
        assertTrue(text.contains("李医师"));
        assertTrue(text.contains("以下空白"));
        assertTrue(text.contains("审方药师"));
        reader.close();
    }

    @Test
    void herbal_prescription_renders_a5_landscape_with_matrix() throws Exception {
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("title", "中药饮片处方笺");
        snapshot.put("categoryCode", "HERBAL");
        snapshot.put("organizationName", "市中医院");
        snapshot.put("departmentName", "国医堂/中医内科");
        snapshot.put("encounterNo", "ENC20261002003");
        snapshot.put("prescriptionNo", "HRX202610020001");
        snapshot.put("authoredAt", Instant.now().toString());
        snapshot.put("authoredBy", "1003");
        snapshot.put("authoredByName", "赵国医");
        snapshot.put("treatmentPrinciple", "疏肝解郁，健脾养血");

        Map<String, Object> resident = new LinkedHashMap<>();
        resident.put("fullName", "王五");
        resident.put("gender", "FEMALE");
        resident.put("birthDate", "1975-03-15");
        snapshot.put("resident", resident);

        snapshot.put("diagnoses", List.of(
                Map.of("code", "BNP010", "display", "郁证（肝气不舒证）", "primary", true)
        ));

        // 8 味经典中药饮片
        snapshot.put("medications", List.of(
                Map.of("medicationName", "柴胡", "doseValue", 10, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "炒白芍", "doseValue", 12, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "当归", "doseValue", 10, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "炒白术", "doseValue", 12, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "茯苓", "doseValue", 15, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "炙甘草", "doseValue", 6, "doseUnit", "g", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "生姜", "doseValue", 3, "doseUnit", "片", "durationValue", 7, "instruction", "水煎服"),
                Map.of("medicationName", "薄荷", "doseValue", 6, "doseUnit", "g", "durationValue", 7, "instruction", "后下")
        ));

        byte[] pdf = renderer.render("OUTPATIENT_PRESCRIPTION", null, null, snapshot);
        assertNotNull(pdf);

        PdfReader reader = new PdfReader(pdf);
        Rectangle pageSize = reader.getPageSize(1);
        assertEquals(595.28f, pageSize.getWidth(), 1.0f);
        assertEquals(419.53f, pageSize.getHeight(), 1.0f);

        String text = new PdfTextExtractor(reader).getTextFromPage(1);
        assertTrue(text.contains("中药饮片处方笺"));
        assertTrue(text.contains("柴胡"));
        assertTrue(text.contains("薄荷"));
        assertTrue(text.contains("后下"));
        assertTrue(text.contains("共 7 剂"));
        assertTrue(text.contains("水煎服"));
        assertTrue(text.contains("赵国医"));
        assertTrue(text.contains("中药审方"));
        reader.close();
    }

    private static final class DummyJsonCodec implements JsonCodec {
        @Override public String write(Object value) { return "{}"; }
        @Override public JsonNode readTree(String value) { return null; }
        @Override public <T> T read(String value, Class<T> type) { return null; }
        @Override public Map<String, Object> readObject(String value) { return Map.of(); }
    }
}
