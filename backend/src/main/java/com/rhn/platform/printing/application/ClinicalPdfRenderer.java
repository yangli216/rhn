package com.rhn.platform.printing.application;

import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.BaseFont;
import org.openpdf.text.pdf.ColumnText;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfPageEventHelper;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.awt.Color;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@Component
class ClinicalPdfRenderer {
    private static final Color BRAND = new Color(24, 105, 96);
    private static final Color BORDER = new Color(197, 213, 211);
    private static final Color MUTED = new Color(92, 112, 110);
    private static final Color SOFT = new Color(239, 247, 246);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(ZoneId.of("Asia/Shanghai"));
    private final BaseFont cjk;

    ClinicalPdfRenderer() {
        try {
            try (var stream = ClinicalPdfRenderer.class.getClassLoader()
                    .getResourceAsStream("fonts/ttf/NotoSansSC/NotoSansSC-Regular.ttf")) {
                if (stream == null) throw new IllegalStateException("Bundled Noto Sans SC font is missing");
                this.cjk = BaseFont.createFont("NotoSansSC-Regular.ttf", BaseFont.IDENTITY_H,
                        BaseFont.EMBEDDED, true, stream.readAllBytes(), null);
            }
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot initialize Simplified Chinese PDF font", exception);
        }
    }

    byte[] render(String documentType, Map<String, Object> snapshot) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            Document document = new Document(PageSize.A4, 51, 51, 56, 48);
            PdfWriter writer = PdfWriter.getInstance(document, output);
            writer.setPageEvent(new PageFooter(cjk));
            document.addTitle(text(snapshot, "title", documentType));
            document.addCreator("RHN Controlled Printing Service");
            document.open();
            if ("OUTPATIENT_NOTE".equals(documentType)) renderNote(document, snapshot);
            else if ("OUTPATIENT_PRESCRIPTION".equals(documentType)) renderPrescription(document, snapshot);
            else throw new IllegalArgumentException("Unsupported print document type: " + documentType);
            document.close();
            return output.toByteArray();
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("PDF rendering failed", exception);
        }
    }

    private void renderNote(Document document, Map<String, Object> snapshot) throws Exception {
        addHeader(document, snapshot, "门诊病历");
        Map<String, Object> resident = map(snapshot.get("resident"));
        PdfPTable patient = infoTable();
        addInfo(patient, "姓名", text(resident, "fullName", "-"));
        addInfo(patient, "性别", gender(text(resident, "gender", "UNKNOWN")));
        addInfo(patient, "出生日期", text(resident, "birthDate", "-"));
        addInfo(patient, "健康档案号", text(resident, "healthRecordNo", "-"));
        addInfo(patient, "就诊号", text(snapshot, "encounterNo", "-"));
        addInfo(patient, "就诊科室", text(snapshot, "departmentName", "-"));
        document.add(patient);

        Map<String, Object> content = map(snapshot.get("content"));
        addSection(document, "主诉", text(content, "chiefComplaint", "未记录"));
        addSection(document, "现病史", text(content, "presentIllness", "未记录"));
        addSection(document, "既往史", text(content, "medicalHistory", "未记录"));
        Map<String, Object> vitalSigns = map(content.get("vitalSigns"));
        addSection(document, "生命体征", vitalSigns(vitalSigns));
        addSection(document, "查体所见", text(content, "physicalExam", "未记录"));
        List<?> diagnoses = list(content.get("diagnoses"));
        String diagnosisText = diagnoses.isEmpty() ? "未记录" : diagnoses.stream().map(value -> {
            Map<String, Object> item = map(value);
            return text(item, "display", "-") + "（" + text(item, "code", "-") + "）";
        }).reduce((left, right) -> left + "；" + right).orElse("未记录");
        addSection(document, "诊断", diagnosisText);
        addSection(document, "诊疗计划", text(content, "treatmentPlan", "按本次门诊医嘱执行。"));
        renderStructuredNote(document, content);

        PdfPTable signature = new PdfPTable(new float[]{1, 2.4f, 1, 2.4f});
        signature.setWidthPercentage(100);
        signature.setSpacingBefore(18);
        addLabelValue(signature, "签署人", text(snapshot, "signedBy", "-"));
        addLabelValue(signature, "签署时间", format(snapshot.get("signedAt")));
        addLabelValue(signature, "文档版本", "V" + text(snapshot, "sourceVersion", "-"));
        addLabelValue(signature, "签署含义", text(snapshot, "signatureMeaning", "-"));
        document.add(signature);
        addEvidence(document, snapshot);
    }

    private String vitalSigns(Map<String, Object> values) {
        java.util.ArrayList<String> parts = new java.util.ArrayList<>();
        parts.add("血压 " + text(values, "systolic", "-") + "/" + text(values, "diastolic", "-") + " mmHg");
        appendMeasure(parts, values, "temperature", "体温", "℃");
        appendMeasure(parts, values, "pulseRate", "脉搏", "次/分");
        appendMeasure(parts, values, "respiratoryRate", "呼吸", "次/分");
        appendMeasure(parts, values, "oxygenSaturation", "血氧", "%");
        appendMeasure(parts, values, "heightCm", "身高", "cm");
        appendMeasure(parts, values, "weightKg", "体重", "kg");
        return String.join("    ", parts);
    }

    private void appendMeasure(List<String> parts, Map<String, Object> values,
                               String key, String label, String unit) {
        if (values.get(key) != null) parts.add(label + " " + number(values.get(key)) + " " + unit);
    }

    private void renderStructuredNote(Document document, Map<String, Object> content) throws Exception {
        Map<String, Object> form = map(content.get("structuredForm"));
        if (form.isEmpty()) return;
        Map<String, Object> values = map(content.get("structuredData"));
        String prefix = text(form, "name", "结构化记录") + " · V" + text(form, "version", "-");
        for (Object sectionValue : list(form.get("sections"))) {
            Map<String, Object> section = map(sectionValue);
            java.util.ArrayList<String> lines = new java.util.ArrayList<>();
            for (Object fieldValue : list(section.get("fields"))) {
                Map<String, Object> field = map(fieldValue);
                Object raw = values.get(text(field, "code", ""));
                if (raw == null || raw.toString().isBlank()) continue;
                lines.add(text(field, "label", "字段") + "：" + structuredValue(field, raw));
            }
            if (!lines.isEmpty()) {
                addSection(document, prefix + " / " + text(section, "title", "补充记录"), String.join("\n", lines));
                prefix = text(form, "name", "结构化记录");
            }
        }
    }

    private String structuredValue(Map<String, Object> field, Object raw) {
        String type = text(field, "type", "TEXT");
        String value;
        if ("BOOLEAN".equals(type)) value = Boolean.parseBoolean(raw.toString()) ? "是" : "否";
        else if ("SELECT".equals(type)) value = list(field.get("options")).stream()
                .map(this::map).filter(option -> raw.toString().equals(text(option, "value", "")))
                .map(option -> text(option, "label", raw.toString())).findFirst().orElse(raw.toString());
        else value = raw.toString();
        String unit = text(field, "unit", "");
        return unit.isBlank() ? value : value + " " + unit;
    }

    private void renderPrescription(Document document, Map<String, Object> snapshot) throws Exception {
        addHeader(document, snapshot, "门诊处方");
        Map<String, Object> resident = map(snapshot.get("resident"));
        PdfPTable patient = infoTable();
        addInfo(patient, "姓名", text(resident, "fullName", "-"));
        addInfo(patient, "性别", gender(text(resident, "gender", "UNKNOWN")));
        addInfo(patient, "出生日期", text(resident, "birthDate", "-"));
        addInfo(patient, "处方号", text(snapshot, "prescriptionNo", "-"));
        addInfo(patient, "开方科室", text(snapshot, "departmentName", "-"));
        addInfo(patient, "开具时间", format(snapshot.get("authoredAt")));
        document.add(patient);

        Paragraph rp = new Paragraph("Rp.", font(18, Font.BOLD, BRAND));
        rp.setSpacingBefore(14); rp.setSpacingAfter(8); document.add(rp);
        PdfPTable medications = new PdfPTable(new float[]{0.55f, 2.5f, 1.15f, 1.3f, 1.3f});
        medications.setWidthPercentage(100);
        medications.setHeaderRows(1);
        for (String heading : List.of("序号", "药品", "规格 / 数量", "单次剂量", "用法")) {
            PdfPCell cell = cell(heading, font(9, Font.BOLD, Color.WHITE));
            cell.setBackgroundColor(BRAND); cell.setPadding(7); medications.addCell(cell);
        }
        List<?> items = list(snapshot.get("medications"));
        int index = 1;
        for (Object value : items) {
            Map<String, Object> item = map(value);
            medications.addCell(bodyCell(Integer.toString(index++), Element.ALIGN_CENTER));
            String name = text(item, "medicationName", "-");
            String product = text(item, "productName", "");
            medications.addCell(bodyCell(product.isBlank() ? name : name + "\n" + product, Element.ALIGN_LEFT));
            String spec = text(item, "specification", "-");
            String quantity = number(item.get("quantity")) + " " + text(item, "quantityUnit", "");
            medications.addCell(bodyCell(spec + "\n" + quantity, Element.ALIGN_LEFT));
            String dose = item.get("doseValue") == null ? "-" : number(item.get("doseValue")) + " " + text(item, "doseUnit", "");
            medications.addCell(bodyCell(dose, Element.ALIGN_LEFT));
            String usage = String.join(" / ", List.of(text(item, "routeCode", ""), text(item, "frequencyCode", "")))
                    .replaceAll("^ / | / $", "");
            String instruction = text(item, "instruction", "");
            medications.addCell(bodyCell((usage.isBlank() ? "遵医嘱" : usage) + (instruction.isBlank() ? "" : "\n" + instruction), Element.ALIGN_LEFT));
        }
        if (items.isEmpty()) {
            PdfPCell empty = bodyCell("无药品明细", Element.ALIGN_CENTER); empty.setColspan(5); medications.addCell(empty);
        }
        document.add(medications);
        addSection(document, "处方备注", text(snapshot, "note", "无"));

        PdfPTable signature = new PdfPTable(new float[]{1, 2.4f, 1, 2.4f});
        signature.setWidthPercentage(100); signature.setSpacingBefore(16);
        addLabelValue(signature, "开方医生", text(snapshot, "authoredByName", text(snapshot, "authoredBy", "-")));
        addLabelValue(signature, "提交时间", format(snapshot.get("submittedAt")));
        addLabelValue(signature, "药品项数", Integer.toString(items.size()));
        addLabelValue(signature, "处方状态", "已提交");
        document.add(signature);
        addEvidence(document, snapshot);
    }

    private void addHeader(Document document, Map<String, Object> snapshot, String title) throws Exception {
        Paragraph organization = new Paragraph(text(snapshot, "organizationName", "医疗机构"), font(10, Font.NORMAL, MUTED));
        organization.setAlignment(Element.ALIGN_CENTER); document.add(organization);
        Paragraph heading = new Paragraph(title, font(22, Font.BOLD, new Color(24, 45, 43)));
        heading.setAlignment(Element.ALIGN_CENTER); heading.setSpacingBefore(3); heading.setSpacingAfter(4); document.add(heading);
        Paragraph marker = new Paragraph("受控输出 · " + text(snapshot, "purposeText", "正式副本"), font(8, Font.NORMAL, BRAND));
        marker.setAlignment(Element.ALIGN_CENTER); marker.setSpacingAfter(13); document.add(marker);
    }

    private PdfPTable infoTable() { PdfPTable table = new PdfPTable(new float[]{1, 2, 1, 2}); table.setWidthPercentage(100); return table; }

    private void addInfo(PdfPTable table, String label, String value) { addLabelValue(table, label, value); }

    private void addLabelValue(PdfPTable table, String label, String value) {
        PdfPCell labelCell = cell(label, font(8, Font.NORMAL, MUTED));
        labelCell.setBackgroundColor(SOFT); labelCell.setPadding(7); labelCell.setBorderColor(BORDER);
        PdfPCell valueCell = cell(value, font(9, Font.NORMAL, Color.BLACK));
        valueCell.setPadding(7); valueCell.setBorderColor(BORDER);
        table.addCell(labelCell); table.addCell(valueCell);
    }

    private void addSection(Document document, String title, String content) throws Exception {
        Paragraph heading = new Paragraph(title, font(10, Font.BOLD, BRAND));
        heading.setSpacingBefore(14); heading.setSpacingAfter(5); document.add(heading);
        PdfPTable table = new PdfPTable(1); table.setWidthPercentage(100);
        PdfPCell body = cell(content, font(10, Font.NORMAL, new Color(35, 52, 50)));
        body.setPadding(10); body.setBorderColor(BORDER); body.setLeading(5, 1.35f); table.addCell(body); document.add(table);
    }

    private void addEvidence(Document document, Map<String, Object> snapshot) throws Exception {
        Paragraph evidence = new Paragraph("来源标识：" + text(snapshot, "sourceType", "-") + " / "
                + text(snapshot, "sourceId", "-") + " / V" + text(snapshot, "sourceVersion", "-")
                + "    生成时间：" + DATE_TIME.format(Instant.now()), font(7, Font.NORMAL, MUTED));
        evidence.setSpacingBefore(14); document.add(evidence);
    }

    private PdfPCell bodyCell(String value, int alignment) {
        PdfPCell cell = cell(value, font(8.5f, Font.NORMAL, new Color(35, 52, 50)));
        cell.setPadding(7); cell.setBorderColor(BORDER); cell.setVerticalAlignment(Element.ALIGN_MIDDLE); cell.setHorizontalAlignment(alignment);
        return cell;
    }

    private PdfPCell cell(String value, Font font) { return new PdfPCell(new Phrase(value == null ? "" : value, font)); }
    private Font font(float size, int style, Color color) { return new Font(cjk, size, style, color); }

    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) { return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of(); }
    private List<?> list(Object value) { return value instanceof List<?> list ? list : List.of(); }
    private String text(Map<String, Object> map, String key, String fallback) {
        Object value = map.get(key); return value == null || value.toString().isBlank() ? fallback : value.toString();
    }
    private String format(Object value) {
        if (value == null || value.toString().isBlank()) return "-";
        try { return DATE_TIME.format(Instant.parse(value.toString())); } catch (Exception ignored) { return value.toString(); }
    }
    private String number(Object value) {
        if (value == null) return "-";
        try { return new BigDecimal(value.toString()).stripTrailingZeros().toPlainString(); } catch (Exception ignored) { return value.toString(); }
    }
    private String gender(String value) { return switch (value) { case "MALE" -> "男"; case "FEMALE" -> "女"; default -> "未知"; }; }

    private static final class PageFooter extends PdfPageEventHelper {
        private final Font font;
        private PageFooter(BaseFont baseFont) { this.font = new Font(baseFont, 7, Font.NORMAL, MUTED); }
        @Override public void onEndPage(PdfWriter writer, Document document) {
            Rectangle page = document.getPageSize();
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_LEFT,
                    new Phrase("RHN 受控打印文件", font), document.left(), 26, 0);
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_RIGHT,
                    new Phrase("第 " + writer.getPageNumber() + " 页", font), page.getRight() - document.rightMargin(), 26, 0);
        }
    }
}
