package com.rhn.platform.printing.application;

import com.rhn.shared.json.JsonCodec;
import org.junit.jupiter.api.Test;
import org.openpdf.text.pdf.PdfReader;
import org.openpdf.text.pdf.parser.PdfTextExtractor;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class DiagnosticReportPdfRendererTest {

    @Test
    void standard_laboratory_report_a4_renders_complete_indicators_ranges_flags_and_dual_signatures() throws Exception {
        JsonCodec json = mock(JsonCodec.class);
        Map<String, Object> labLayout = Map.of(
                "paper", Map.of("widthMm", 210, "heightMm", 297, "marginMm", 12),
                "title", "检验报告",
                "subtitle", "{{organizationName}} · {{departmentName}}",
                "blocks", List.of(
                        Map.of("type", "fieldGrid", "columns", 2, "fields", List.of(
                                Map.of("label", "姓名", "path", "resident.fullName"),
                                Map.of("label", "健康档案号", "path", "resident.healthRecordNo"),
                                Map.of("label", "性别", "path", "resident.gender"),
                                Map.of("label", "出生日期", "path", "resident.birthDate"),
                                Map.of("label", "报告编号", "path", "reportNo"),
                                Map.of("label", "报告版本", "path", "reportVersion")
                        )),
                        Map.of("type", "table", "path", "items", "columns", List.of(
                                Map.of("label", "指标", "path", "name", "width", 3),
                                Map.of("label", "结果", "path", "value", "width", 2),
                                Map.of("label", "单位", "path", "unit", "width", 2),
                                Map.of("label", "参考区间", "path", "range", "width", 3),
                                Map.of("label", "标志", "path", "flag", "width", 1)
                        )),
                        Map.of("type", "text", "title", "结果说明", "path", "conclusion"),
                        Map.of("type", "text", "title", "更正原因", "path", "correctionReason"),
                        Map.of("type", "signature", "leftLabel", "检验者", "leftPath", "authorName",
                                "rightLabel", "审核者", "rightPath", "signerName"),
                        Map.of("type", "text", "title", "签发时间", "path", "issuedAt")
                ),
                "footer", true
        );
        when(json.readObject("lab_layout")).thenReturn(labLayout);
        var renderer = new ConfigurablePdfRenderer(json);

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("organizationName", "演示中心医院");
        snapshot.put("departmentName", "医学检验科");
        snapshot.put("reportNo", "LAB-20261015-001");
        snapshot.put("reportVersion", 1);
        snapshot.put("authorName", "张检验师");
        snapshot.put("signerName", "李主管技师");
        snapshot.put("issuedAt", "2026-10-15 08:30:00");
        snapshot.put("conclusion", "白细胞计数偏高，提示细菌性感染可能，请结合临床。");
        snapshot.put("correctionReason", null); // 初始报告无更正原因，应自动跳过空块

        Map<String, Object> resident = new LinkedHashMap<>();
        resident.put("fullName", "王大明");
        resident.put("gender", "男");
        resident.put("birthDate", "1980-05-20");
        resident.put("healthRecordNo", "HRN2026001099");
        snapshot.put("resident", resident);

        List<Map<String, Object>> items = List.of(
                Map.of("name", "白细胞计数 (WBC)", "value", "12.80", "unit", "10^9/L", "range", "3.50～9.50", "flag", "↑"),
                Map.of("name", "红细胞计数 (RBC)", "value", "4.65", "unit", "10^12/L", "range", "4.30～5.80", "flag", "正常"),
                Map.of("name", "血红蛋白测定 (HGB)", "value", "145", "unit", "g/L", "range", "130～175", "flag", "正常"),
                Map.of("name", "血小板计数 (PLT)", "value", "22", "unit", "10^9/L", "range", "125～350", "flag", "*危"),
                Map.of("name", "中性粒细胞比率 (NEUT%)", "value", "82.5", "unit", "%", "range", "40.0～75.0", "flag", "↑")
        );
        snapshot.put("items", items);

        byte[] pdf = renderer.render("RHN_PRINT_FLOW_V1", "lab_layout", snapshot);
        assertNotNull(pdf);
        assertTrue(pdf.length > 500);

        try (PdfReader reader = new PdfReader(pdf)) {
            var extractor = new PdfTextExtractor(reader);
            String fullText = extractor.getTextFromPage(1);
            assertTrue(fullText.contains("检验报告"));
            assertTrue(fullText.contains("演示中心医院 · 医学检验科"));
            assertTrue(fullText.contains("王大明"));
            assertTrue(fullText.contains("HRN2026001099"));
            assertTrue(fullText.contains("白细胞计数 (WBC)"));
            assertTrue(fullText.contains("12.80"));
            assertTrue(fullText.contains("10^9/L"));
            assertTrue(fullText.contains("3.50～9.50"));
            assertTrue(fullText.contains("↑"));
            assertTrue(fullText.contains("血小板计数 (PLT)"));
            assertTrue(fullText.contains("白细胞计数偏高，提示细菌性感染可能"));
            assertFalse(fullText.contains("更正原因"));
            assertTrue(fullText.contains("检验者"));
            assertTrue(fullText.contains("张检验师"));
            assertTrue(fullText.contains("审核者"));
            assertTrue(fullText.contains("李主管技师"));
            assertTrue(fullText.contains("签发时间：2026-10-15 08:30:00"));
        }
    }

    @Test
    void standard_examination_report_a4_renders_two_stage_text_and_embedded_images() throws Exception {
        JsonCodec json = mock(JsonCodec.class);
        Map<String, Object> examLayout = Map.of(
                "paper", Map.of("widthMm", 210, "heightMm", 297, "marginMm", 12),
                "title", "检查报告",
                "subtitle", "{{organizationName}} · {{departmentName}}",
                "blocks", List.of(
                        Map.of("type", "fieldGrid", "columns", 2, "fields", List.of(
                                Map.of("label", "姓名", "path", "resident.fullName"),
                                Map.of("label", "健康档案号", "path", "resident.healthRecordNo"),
                                Map.of("label", "性别", "path", "resident.gender"),
                                Map.of("label", "报告编号", "path", "reportNo")
                        )),
                        Map.of("type", "section", "title", "检查所见", "path", "findings"),
                        Map.of("type", "section", "title", "检查结论", "path", "conclusion"),
                        Map.of("type", "images", "title", "关键图像", "path", "images", "maxHeightMm", 100),
                        Map.of("type", "signature", "leftLabel", "报告医师", "leftPath", "authorName",
                                "rightLabel", "审核医师", "rightPath", "signerName")
                ),
                "footer", true
        );
        when(json.readObject("exam_layout")).thenReturn(examLayout);
        var renderer = new ConfigurablePdfRenderer(json);

        var stream = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(300, 200, BufferedImage.TYPE_INT_RGB), "png", stream);
        byte[] bytes = stream.toByteArray();
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("organizationName", "演示中心医院");
        snapshot.put("departmentName", "医学影像科");
        snapshot.put("reportNo", "EXAM-20261015-002");
        snapshot.put("authorName", "赵影像医师");
        snapshot.put("signerName", "钱主任医师");
        snapshot.put("findings", "胸廓对称，肋骨走形自然。双肺纹理清晰，走行未见明显异常。心影大小形态在正常范围内。双侧膈面光整，肋膈角锐利。");
        snapshot.put("conclusion", "胸部正位片未见明显活动性病变。心肺膈未见异常。");

        Map<String, Object> resident = new LinkedHashMap<>();
        resident.put("fullName", "李淑芬");
        resident.put("gender", "女");
        resident.put("healthRecordNo", "HRN2026002088");
        snapshot.put("resident", resident);

        snapshot.put("images", List.of(
                Map.of("contentBase64", Base64.getEncoder().encodeToString(bytes),
                        "contentHash", hash,
                        "caption", "胸部正位标准切面 DR-1")
        ));

        byte[] pdf = renderer.render("RHN_PRINT_FLOW_V1", "exam_layout", snapshot);
        assertNotNull(pdf);
        assertTrue(pdf.length > 500);

        try (PdfReader reader = new PdfReader(pdf)) {
            var extractor = new PdfTextExtractor(reader);
            String fullText = extractor.getTextFromPage(1);
            assertTrue(fullText.contains("检查报告"));
            assertTrue(fullText.contains("演示中心医院 · 医学影像科"));
            assertTrue(fullText.contains("李淑芬"));
            assertTrue(fullText.contains("检查所见"));
            assertTrue(fullText.contains("双肺纹理清晰"));
            assertTrue(fullText.contains("检查结论"));
            assertTrue(fullText.contains("胸部正位片未见明显活动性病变"));
            assertTrue(fullText.contains("关键图像"));
            assertTrue(fullText.contains("胸部正位标准切面 DR-1"));
            assertTrue(fullText.contains("报告医师"));
            assertTrue(fullText.contains("赵影像医师"));
            assertTrue(fullText.contains("审核医师"));
            assertTrue(fullText.contains("钱主任医师"));
        }
    }
}
