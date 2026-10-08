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
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;

@Component
class ClinicalPdfRenderer {
    private static final Color BRAND = new Color(18, 92, 84);
    private static final Color BRAND_LIGHT = new Color(240, 248, 246);
    private static final Color BORDER = new Color(203, 213, 225);
    private static final Color BORDER_LIGHT = new Color(226, 232, 240);
    private static final Color MUTED = new Color(100, 116, 139);
    private static final Color SOFT = new Color(248, 250, 252);
    private static final Color TEXT_DARK = new Color(30, 41, 59);
    private static final Color TEXT_BLACK = new Color(15, 23, 42);
    private static final Rectangle PAGE_A5_LANDSCAPE = new org.openpdf.text.RectangleReadOnly(595.28f, 419.53f);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm")
            .withZone(ZoneId.of("Asia/Shanghai"));
    private final BaseFont cjk;
    private final ConfigurablePdfRenderer configurableRenderer;
    private final OutpatientDocumentPdfRenderer outpatientRenderer;

    ClinicalPdfRenderer(ConfigurablePdfRenderer configurableRenderer, com.rhn.shared.json.JsonCodec jsonCodec) {
        this.configurableRenderer = configurableRenderer;
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
        this.outpatientRenderer = new OutpatientDocumentPdfRenderer(cjk, jsonCodec);
    }

    byte[] render(String documentType, String layoutSchema, String configJson, Map<String, Object> snapshot) {
        if (OutpatientDocumentPdfRenderer.SCHEMA.equals(layoutSchema)) {
            return outpatientRenderer.render(documentType, configJson, snapshot);
        }
        if (configurableRenderer.supports(layoutSchema)) {
            return configurableRenderer.render(layoutSchema, configJson, snapshot);
        }
        return render(documentType, snapshot);
    }

    byte[] render(String documentType, Map<String, Object> snapshot) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            // A5 Landscape: 210mm x 148mm = 595.28pt x 419.53pt
            Document document = new Document(PAGE_A5_LANDSCAPE, 26, 26, 18, 18);
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
        addHeader(document, snapshot, "门诊病历记录单", "门诊记录");

        Map<String, Object> resident = map(snapshot.get("resident"));
        String birthDate = text(resident, "birthDate", "-");
        String age = calculateAge(birthDate);

        // 8-column high-density patient band for A5 Landscape
        PdfPTable patient = new PdfPTable(new float[]{0.9f, 1.25f, 0.65f, 0.75f, 0.65f, 0.95f, 0.95f, 1.45f});
        patient.setWidthPercentage(100);
        patient.setSpacingAfter(4);
        addInfoCell(patient, "姓名", text(resident, "fullName", "-"));
        addInfoCell(patient, "性别", gender(text(resident, "gender", "UNKNOWN")));
        addInfoCell(patient, "年龄", age);
        addInfoCell(patient, "门诊号", text(snapshot, "encounterNo", "-"));
        addInfoCell(patient, "档案号", text(resident, "healthRecordNo", "-"));
        addInfoCell(patient, "科室", text(snapshot, "departmentName", "-"));
        addInfoCell(patient, "费别", text(snapshot, "insuranceType", "自费/医保"));
        addInfoCell(patient, "就诊时间", format(snapshot.get("signedAt")));
        document.add(patient);

        Map<String, Object> content = map(snapshot.get("content"));

        // Clinical history sections
        addInlineSection(document, "主诉", text(content, "chiefComplaint", "未记录"));
        addInlineSection(document, "现病史", text(content, "presentIllness", "未记录"));

        String pastHistory = text(content, "medicalHistory", text(content, "pastHistory", "未记录"));
        String allergy = text(content, "allergyHistory", "未记录");
        addTwoColSection(document, "既往史", pastHistory, "过敏史", allergy);

        // Vital Signs compact bar
        Map<String, Object> vitalSigns = map(content.get("vitalSigns"));
        addVitalSignsBar(document, vitalSigns);

        addInlineSection(document, "体格检查", text(content, "physicalExam", "未记录"));

        // Diagnoses (bold & highlighted)
        List<?> diagnoses = list(content.get("diagnoses"));
        String diagnosisText = diagnoses.isEmpty()
                ? text(content, "diagnosis", text(snapshot, "diagnosis", "未记录"))
                : diagnoses.stream().map(value -> {
                    Map<String, Object> item = map(value);
                    String primaryTag = "PRIMARY".equalsIgnoreCase(text(item, "type", "")) ? " [主]" : "";
                    return text(item, "display", "-") + "（" + text(item, "code", "-") + "）" + primaryTag;
                }).reduce((left, right) -> left + "；" + right).orElse("未记录");
        addHighlightedSection(document, "初步诊断", diagnosisText);

        addInlineSection(document, "诊疗计划", text(content, "treatmentPlan", "按本次门诊医嘱执行。"));

        String education = text(content, "healthEducation", "");
        String followUp = text(content, "followUp", "");
        if (!education.isBlank() || !followUp.isBlank()) {
            addTwoColSection(document, "健康宣教", education.isBlank() ? "遵医嘱服药与复诊" : education,
                    "随访复诊", followUp.isBlank() ? "必要时随诊" : followUp);
        }

        renderStructuredNote(document, content);

        // Doctor electronic signature & legal evidence
        PdfPTable signature = new PdfPTable(new float[]{1f, 2.2f, 1f, 2.2f, 1f, 2.2f});
        signature.setWidthPercentage(100);
        signature.setSpacingBefore(8);
        addLabelValue(signature, "接诊医师", text(snapshot, "signedByName", text(snapshot, "signedBy", "-")));
        addLabelValue(signature, "签署时间", format(snapshot.get("signedAt")));
        addLabelValue(signature, "病历版本", "V" + text(snapshot, "sourceVersion", "-"));
        addLabelValue(signature, "签署含义", text(snapshot, "signatureMeaning", "接诊医师签署"));
        addLabelValue(snapshot.containsKey("signatureEvidenceId") ? signature : null,
                "签名存证", text(snapshot, "signatureEvidenceId", "-"));
        document.add(signature);

        addEvidence(document, snapshot, "提示：本病历记录仅作为本次门诊医疗文书凭证，请妥善保管。复诊时请出示。");
    }

    private void renderPrescription(Document document, Map<String, Object> snapshot) throws Exception {
        if (isHerbalPrescription(snapshot)) {
            renderHerbalPrescription(document, snapshot);
        } else {
            renderWesternPrescription(document, snapshot);
        }
    }

    private boolean isHerbalPrescription(Map<String, Object> snapshot) {
        String category = text(snapshot, "categoryCode", "");
        if ("HERBAL".equalsIgnoreCase(category) || "HERBAL_MED".equalsIgnoreCase(category)) return true;
        String title = text(snapshot, "title", "");
        if (title.contains("草药") || title.contains("中药")) return true;
        String note = text(snapshot, "note", "");
        if (note.contains("门诊草药处方") || note.contains("草药饮片专方")) return true;
        List<?> items = list(snapshot.get("medications"));
        if (!items.isEmpty()) {
            boolean allHerbal = items.stream().allMatch(v -> {
                Map<String, Object> m = map(v);
                String cat = text(m, "categoryCode", text(m, "medicationType", ""));
                return "HERBAL".equalsIgnoreCase(cat) || "HERBAL_MED".equalsIgnoreCase(cat);
            });
            if (allHerbal) return true;
        }
        return false;
    }

    /**
     * 国内主流三甲西药/中成药处方笺（A5 横向）
     */
    private void renderWesternPrescription(Document document, Map<String, Object> snapshot) throws Exception {
        String category = text(snapshot, "categoryCode", "");
        String headingTitle = "CHINESE_PATENT".equalsIgnoreCase(category) ? "中成药处方笺" : "门诊处方笺";
        addHeader(document, snapshot, headingTitle, "普通处方");

        Map<String, Object> resident = map(snapshot.get("resident"));
        String birthDate = text(resident, "birthDate", "-");
        String age = calculateAge(birthDate);

        // 患者基本信息与诊断栏
        PdfPTable patient = new PdfPTable(new float[]{0.8f, 1.3f, 0.6f, 0.7f, 0.6f, 0.9f, 0.8f, 1.3f, 0.8f, 1.3f, 0.8f, 1.6f});
        patient.setWidthPercentage(100);
        patient.setSpacingAfter(4);
        addInfoCell(patient, "姓名", text(resident, "fullName", "-"));
        addInfoCell(patient, "性别", gender(text(resident, "gender", "UNKNOWN")));
        addInfoCell(patient, "年龄", age);
        addInfoCell(patient, "费别", text(snapshot, "insuranceType", "自费/医保"));
        addInfoCell(patient, "科室", text(snapshot, "departmentName", "-"));
        addInfoCell(patient, "开具时间", format(snapshot.get("authoredAt")));
        document.add(patient);

        // 诊断信息（处方核心法定要素）
        String diagnosisDisplay = resolvePrescriptionDiagnosis(snapshot);
        PdfPTable diagTable = new PdfPTable(new float[]{1.0f, 9.0f});
        diagTable.setWidthPercentage(100);
        diagTable.setSpacingAfter(4);
        PdfPCell diagLabel = cell("临床诊断", font(8, Font.BOLD, BRAND));
        diagLabel.setBackgroundColor(SOFT); diagLabel.setPadding(4.5f); diagLabel.setBorderColor(BORDER);
        diagTable.addCell(diagLabel);
        PdfPCell diagValue = cell(diagnosisDisplay, font(8.5f, Font.BOLD, TEXT_BLACK));
        diagValue.setPadding(4.5f); diagValue.setBorderColor(BORDER);
        diagTable.addCell(diagValue);
        document.add(diagTable);

        // Rp. 醒目加粗标志
        Paragraph rp = new Paragraph("Rp.", font(15, Font.BOLD, BRAND));
        rp.setSpacingBefore(2); rp.setSpacingAfter(3);
        document.add(rp);

        // 西成药药品明细表格 (5 列)
        PdfPTable medications = new PdfPTable(new float[]{0.45f, 3.0f, 1.15f, 1.8f, 0.95f});
        medications.setWidthPercentage(100);
        medications.setHeaderRows(1);
        for (String heading : List.of("序号", "药品通用名称 / 规格", "单次剂量", "用法（途径 / 频次）", "数量")) {
            PdfPCell cell = cell(heading, font(8.5f, Font.BOLD, Color.WHITE));
            cell.setBackgroundColor(BRAND); cell.setPadding(5);
            cell.setHorizontalAlignment(heading.equals("序号") ? Element.ALIGN_CENTER : Element.ALIGN_LEFT);
            medications.addCell(cell);
        }

        List<?> items = list(snapshot.get("medications"));
        int index = 1;
        for (Object value : items) {
            Map<String, Object> item = map(value);
            medications.addCell(bodyCell(Integer.toString(index++), Element.ALIGN_CENTER));

            String name = text(item, "medicationName", "-");
            String product = text(item, "productName", "");
            String spec = text(item, "specification", "-");
            String medNameAndSpec = name + "\n规格：" + spec + (product.isBlank() || product.equals(name) ? "" : "（" + product + "）");
            medications.addCell(bodyCell(medNameAndSpec, Element.ALIGN_LEFT));

            String dose = item.get("doseValue") == null ? "-" : number(item.get("doseValue")) + " " + text(item, "doseUnit", "");
            medications.addCell(bodyCell("每次 " + dose, Element.ALIGN_LEFT));

            String route = text(item, "routeName", text(item, "routeCode", ""));
            String freq = text(item, "frequencyName", text(item, "frequencyCode", ""));
            String usage = (route.isBlank() ? "途径未记录" : route) + " · " + (freq.isBlank() ? "频次未记录" : freq);
            String instruction = text(item, "instruction", "");
            medications.addCell(bodyCell(usage + (instruction.isBlank() ? "" : "\n" + instruction), Element.ALIGN_LEFT));

            String quantity = number(item.get("quantity")) + " " + text(item, "quantityUnit", "");
            medications.addCell(bodyCell(quantity, Element.ALIGN_CENTER));
        }

        if (items.isEmpty()) {
            PdfPCell empty = bodyCell("无药品明细", Element.ALIGN_CENTER);
            empty.setColspan(5); medications.addCell(empty);
        } else {
            // 以下空白截断行（国家处方规范）
            PdfPCell blank = cell("——（以下空白）——", font(8, Font.NORMAL, MUTED));
            blank.setColspan(5); blank.setPadding(4); blank.setBorderColor(BORDER_LIGHT);
            blank.setHorizontalAlignment(Element.ALIGN_CENTER);
            medications.addCell(blank);
        }
        document.add(medications);

        // 处方特别说明（如有）
        String note = text(snapshot, "note", "");
        if (!note.isBlank() && !"无".equals(note)) {
            addInlineSection(document, "处方备注", note);
        }

        // 《处方管理办法》法定四签与药房审核栏
        PdfPTable signature = new PdfPTable(new float[]{1f, 1.8f, 1f, 1.8f, 1f, 1.8f, 1f, 1.8f});
        signature.setWidthPercentage(100);
        signature.setSpacingBefore(6);
        addLabelValue(signature, "开方医师", text(snapshot, "authoredByName", text(snapshot, "authoredBy", "-")));
        addLabelValue(signature, "审方药师", "");
        addLabelValue(signature, "调配药师", "");
        addLabelValue(signature, "核对/发药", "");
        document.add(signature);

        // 处方属性栏（处方号、项数、效期）
        PdfPTable infoBar = new PdfPTable(new float[]{1f, 2.2f, 1f, 1.4f, 1f, 1.8f, 1f, 1.8f});
        infoBar.setWidthPercentage(100);
        infoBar.setSpacingBefore(3);
        addLabelValue(infoBar, "处方编号", text(snapshot, "prescriptionNo", "-"));
        addLabelValue(infoBar, "药品项数", items.size() + " 项");
        addLabelValue(infoBar, "处方效期", "开具当日有效");
        addLabelValue(infoBar, "处方状态", "已提交");
        document.add(infoBar);

        addEvidence(document, snapshot, "注意事项：1. 处方开具当日有效；2. 请遵医嘱按时按量服药；3. 取药时请仔细当面核对药品及数量。");
    }

    /**
     * 国内主流三甲中药饮片处方笺（草药方 A5 横向）
     */
    private void renderHerbalPrescription(Document document, Map<String, Object> snapshot) throws Exception {
        addHeader(document, snapshot, "中药饮片处方笺", "草药处方");

        Map<String, Object> resident = map(snapshot.get("resident"));
        String birthDate = text(resident, "birthDate", "-");
        String age = calculateAge(birthDate);

        // 患者基本信息
        PdfPTable patient = new PdfPTable(new float[]{0.8f, 1.3f, 0.6f, 0.7f, 0.6f, 0.9f, 0.8f, 1.3f, 0.8f, 1.3f, 0.8f, 1.6f});
        patient.setWidthPercentage(100);
        patient.setSpacingAfter(4);
        addInfoCell(patient, "姓名", text(resident, "fullName", "-"));
        addInfoCell(patient, "性别", gender(text(resident, "gender", "UNKNOWN")));
        addInfoCell(patient, "年龄", age);
        addInfoCell(patient, "费别", text(snapshot, "insuranceType", "自费/医保"));
        addInfoCell(patient, "科室", text(snapshot, "departmentName", "-"));
        addInfoCell(patient, "开具时间", format(snapshot.get("authoredAt")));
        document.add(patient);

        // 中医特色诊断与治法治则栏
        String diagnosisDisplay = resolvePrescriptionDiagnosis(snapshot);
        PdfPTable diagTable = new PdfPTable(new float[]{1.0f, 6.0f, 1.0f, 3.0f});
        diagTable.setWidthPercentage(100);
        diagTable.setSpacingAfter(4);
        PdfPCell diagLabel = cell("中医诊断", font(8, Font.BOLD, BRAND));
        diagLabel.setBackgroundColor(SOFT); diagLabel.setPadding(4.5f); diagLabel.setBorderColor(BORDER);
        diagTable.addCell(diagLabel);
        PdfPCell diagValue = cell(diagnosisDisplay, font(8.5f, Font.BOLD, TEXT_BLACK));
        diagValue.setPadding(4.5f); diagValue.setBorderColor(BORDER);
        diagTable.addCell(diagValue);
        PdfPCell treatLabel = cell("治法治则", font(8, Font.NORMAL, MUTED));
        treatLabel.setBackgroundColor(SOFT); treatLabel.setPadding(4.5f); treatLabel.setBorderColor(BORDER);
        diagTable.addCell(treatLabel);
        PdfPCell treatValue = cell(text(snapshot, "treatmentPrinciple", "未记录"), font(8.5f, Font.NORMAL, TEXT_DARK));
        treatValue.setPadding(4.5f); treatValue.setBorderColor(BORDER);
        diagTable.addCell(treatValue);
        document.add(diagTable);

        // Rp. 标志
        Paragraph rp = new Paragraph("Rp.", font(15, Font.BOLD, BRAND));
        rp.setSpacingBefore(2); rp.setSpacingAfter(3);
        document.add(rp);

        // 4 列草药饮片网格矩阵 (Herbal Matrix Grid)
        List<?> items = list(snapshot.get("medications"));
        PdfPTable matrix = new PdfPTable(new float[]{1f, 1f, 1f, 1f});
        matrix.setWidthPercentage(100);

        int count = 0;
        String totalDoses = commonHerbalDoseCount(items);

        for (Object value : items) {
            Map<String, Object> item = map(value);
            String name = text(item, "medicationName", "-");
            String dose = item.get("doseValue") == null ? "" : number(item.get("doseValue")) + text(item, "doseUnit", "（单位未记录）");
            String instruction = text(item, "instruction", "");

            // Preserve each saved direction verbatim; one herb's instructions must not become the whole formula's.
            String frequency = text(item, "frequencyName", text(item, "frequencyCode", ""));
            String route = text(item, "routeName", text(item, "routeCode", ""));
            String displayCellText = name + "  " + dose
                    + (route.isBlank() ? "" : "\n途径：" + route)
                    + (frequency.isBlank() ? "" : "\n频次：" + frequency)
                    + (instruction.isBlank() ? "" : "\n" + instruction);
            if (totalDoses == null && item.get("durationValue") != null) {
                displayCellText += "\n疗程：" + number(item.get("durationValue")) + text(item, "durationUnit", "（单位未记录）");
            }

            PdfPCell cell = cell(displayCellText, font(9, Font.BOLD, TEXT_BLACK));
            cell.setPadding(6f);
            cell.setBorderColor(BORDER_LIGHT);
            cell.setBackgroundColor((count / 4) % 2 == 0 ? Color.WHITE : SOFT);
            matrix.addCell(cell);
            count++;
        }

        // 补齐 4 的倍数空白格
        while (count % 4 != 0) {
            PdfPCell empty = cell("", font(9, Font.NORMAL, TEXT_BLACK));
            empty.setPadding(6f); empty.setBorderColor(BORDER_LIGHT);
            empty.setBackgroundColor((count / 4) % 2 == 0 ? Color.WHITE : SOFT);
            matrix.addCell(empty);
            count++;
        }

        // 饮片以下空白结束行
        PdfPCell blank = cell("——（以下空白）——", font(8, Font.NORMAL, MUTED));
        blank.setColspan(4); blank.setPadding(4); blank.setBorderColor(BORDER_LIGHT);
        blank.setHorizontalAlignment(Element.ALIGN_CENTER);
        matrix.addCell(blank);
        document.add(matrix);

        // 草药煎服法与总剂数核心横幅卡片
        PdfPTable banner = new PdfPTable(1);
        banner.setWidthPercentage(100);
        banner.setSpacingBefore(5); banner.setSpacingAfter(4);
        String bannerText = (totalDoses == null ? "剂数未统一记录" : "共 " + totalDoses + " 剂") + " · 用法见各药品明细";
        PdfPCell bannerCell = cell(bannerText, font(10, Font.BOLD, BRAND));
        bannerCell.setBackgroundColor(BRAND_LIGHT);
        bannerCell.setBorderColor(BRAND);
        bannerCell.setPadding(6);
        bannerCell.setHorizontalAlignment(Element.ALIGN_CENTER);
        banner.addCell(bannerCell);
        document.add(banner);

        // 中药房法定四签栏
        PdfPTable signature = new PdfPTable(new float[]{1f, 1.8f, 1f, 1.8f, 1f, 1.8f, 1f, 1.8f});
        signature.setWidthPercentage(100);
        signature.setSpacingBefore(4);
        addLabelValue(signature, "开方医师", text(snapshot, "authoredByName", text(snapshot, "authoredBy", "-")));
        addLabelValue(signature, "中药审方", "");
        addLabelValue(signature, "中药调配", "");
        addLabelValue(signature, "核对/发药", "");
        document.add(signature);

        // 处方属性栏（处方号、味数、剂数、效期）
        PdfPTable infoBar = new PdfPTable(new float[]{1f, 2.2f, 1f, 1.4f, 1f, 1.4f, 1f, 1.8f});
        infoBar.setWidthPercentage(100);
        infoBar.setSpacingBefore(3);
        addLabelValue(infoBar, "处方编号", text(snapshot, "prescriptionNo", "-"));
        addLabelValue(infoBar, "饮片味数", items.size() + " 味");
        addLabelValue(infoBar, "总剂数", totalDoses == null ? "见明细" : totalDoses + " 剂");
        addLabelValue(infoBar, "处方效期", "开具当日有效");
        document.add(infoBar);

        addEvidence(document, snapshot, "用药须知：请严格按处方记录的用法、频次及各药品嘱托执行。");
    }

    private String commonHerbalDoseCount(List<?> items) {
        String common = null;
        for (Object value : items) {
            Map<String, Object> item = map(value);
            String unit = text(item, "durationUnit", "");
            if (item.get("durationValue") == null || !("剂".equals(unit) || "DOSE".equalsIgnoreCase(unit))) return null;
            String count = number(item.get("durationValue"));
            if (common != null && !common.equals(count)) return null;
            common = count;
        }
        return common;
    }

    private String resolvePrescriptionDiagnosis(Map<String, Object> snapshot) {
        List<?> diagnoses = list(snapshot.get("diagnoses"));
        if (!diagnoses.isEmpty()) {
            return diagnoses.stream().map(value -> {
                Map<String, Object> item = map(value);
                String code = text(item, "code", "");
                String display = text(item, "display", "-");
                return code.isBlank() ? display : display + " (" + code + ")";
            }).reduce((l, r) -> l + "；" + r).orElse("临床诊断未记录");
        }
        if (snapshot.containsKey("diagnosis") && !text(snapshot, "diagnosis", "").isBlank()) {
            return text(snapshot, "diagnosis", "");
        }
        Map<String, Object> content = map(snapshot.get("content"));
        if (content.containsKey("diagnosis") && !text(content, "diagnosis", "").isBlank()) {
            return text(content, "diagnosis", "");
        }
        String note = text(snapshot, "note", "");
        if (note.contains("关联诊断：")) {
            for (String line : note.split("\n")) {
                if (line.startsWith("关联诊断：")) {
                    return line.substring("关联诊断：".length()).trim();
                }
            }
        }
        return "临床诊断未记录";
    }

    private void addHeader(Document document, Map<String, Object> snapshot, String title, String badgeText) throws Exception {
        Paragraph organization = new Paragraph(text(snapshot, "organizationName", "医疗机构"), font(10.5f, Font.BOLD, BRAND));
        organization.setAlignment(Element.ALIGN_CENTER);
        document.add(organization);

        Paragraph heading = new Paragraph(title, font(16, Font.BOLD, TEXT_BLACK));
        heading.setAlignment(Element.ALIGN_CENTER);
        heading.setSpacingBefore(1); heading.setSpacingAfter(2);
        document.add(heading);

        // 顶栏副标与徽章栏（左侧副标，右侧徽章）
        PdfPTable subHeader = new PdfPTable(new float[]{3f, 4f, 3f});
        subHeader.setWidthPercentage(100);
        subHeader.setSpacingAfter(4);

        PdfPCell leftCell = cell("受控输出 · " + text(snapshot, "purposeText", "正式副本"), font(7.5f, Font.NORMAL, MUTED));
        leftCell.setBorder(Rectangle.NO_BORDER); leftCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        subHeader.addCell(leftCell);

        PdfPCell centerCell = cell("", font(7.5f, Font.NORMAL, MUTED));
        centerCell.setBorder(Rectangle.NO_BORDER);
        subHeader.addCell(centerCell);

        String tag = badgeText.isBlank() ? "正式文书" : badgeText;
        PdfPCell rightCell = cell("【 " + tag + " 】", font(8, Font.BOLD, BRAND));
        rightCell.setBorder(Rectangle.NO_BORDER);
        rightCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        rightCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        subHeader.addCell(rightCell);

        document.add(subHeader);

        // 细横线分割
        PdfPTable divider = new PdfPTable(1);
        divider.setWidthPercentage(100);
        divider.setSpacingAfter(4);
        PdfPCell line = cell("", font(1, Font.NORMAL, BRAND));
        line.setBackgroundColor(BRAND); line.setFixedHeight(1.5f); line.setBorder(Rectangle.NO_BORDER);
        divider.addCell(line);
        document.add(divider);
    }

    private void addInfoCell(PdfPTable table, String label, String value) {
        PdfPCell labelCell = cell(label, font(8, Font.NORMAL, MUTED));
        labelCell.setBackgroundColor(SOFT); labelCell.setPadding(4f); labelCell.setBorderColor(BORDER);
        labelCell.setHorizontalAlignment(Element.ALIGN_CENTER); labelCell.setVerticalAlignment(Element.ALIGN_MIDDLE);

        PdfPCell valueCell = cell(value, font(8.5f, Font.NORMAL, TEXT_DARK));
        valueCell.setPadding(4f); valueCell.setBorderColor(BORDER);
        valueCell.setVerticalAlignment(Element.ALIGN_MIDDLE);

        table.addCell(labelCell); table.addCell(valueCell);
    }

    private void addLabelValue(PdfPTable table, String label, String value) {
        if (table == null) return;
        PdfPCell labelCell = cell(label, font(8, Font.NORMAL, MUTED));
        labelCell.setBackgroundColor(SOFT); labelCell.setPadding(4f); labelCell.setBorderColor(BORDER);
        PdfPCell valueCell = cell(value, font(8.5f, Font.NORMAL, TEXT_DARK));
        valueCell.setPadding(4f); valueCell.setBorderColor(BORDER);
        table.addCell(labelCell); table.addCell(valueCell);
    }

    private void addInlineSection(Document document, String title, String content) throws Exception {
        PdfPTable table = new PdfPTable(new float[]{1.0f, 9.0f});
        table.setWidthPercentage(100);
        table.setSpacingAfter(3);
        PdfPCell labelCell = cell(title, font(8.5f, Font.BOLD, BRAND));
        labelCell.setBackgroundColor(SOFT); labelCell.setPadding(4.5f); labelCell.setBorderColor(BORDER);
        labelCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(labelCell);

        PdfPCell bodyCell = cell(content, font(8.5f, Font.NORMAL, TEXT_DARK));
        bodyCell.setPadding(4.5f); bodyCell.setBorderColor(BORDER);
        table.addCell(bodyCell);
        document.add(table);
    }

    private void addTwoColSection(Document document, String title1, String content1, String title2, String content2) throws Exception {
        PdfPTable table = new PdfPTable(new float[]{1.0f, 4.0f, 1.0f, 4.0f});
        table.setWidthPercentage(100);
        table.setSpacingAfter(3);
        PdfPCell label1 = cell(title1, font(8.5f, Font.BOLD, BRAND));
        label1.setBackgroundColor(SOFT); label1.setPadding(4.5f); label1.setBorderColor(BORDER);
        table.addCell(label1);
        PdfPCell body1 = cell(content1, font(8.5f, Font.NORMAL, TEXT_DARK));
        body1.setPadding(4.5f); body1.setBorderColor(BORDER);
        table.addCell(body1);

        PdfPCell label2 = cell(title2, font(8.5f, Font.BOLD, BRAND));
        label2.setBackgroundColor(SOFT); label2.setPadding(4.5f); label2.setBorderColor(BORDER);
        table.addCell(label2);
        PdfPCell body2 = cell(content2, font(8.5f, Font.NORMAL, TEXT_DARK));
        body2.setPadding(4.5f); body2.setBorderColor(BORDER);
        table.addCell(body2);
        document.add(table);
    }

    private void addHighlightedSection(Document document, String title, String content) throws Exception {
        PdfPTable table = new PdfPTable(new float[]{1.0f, 9.0f});
        table.setWidthPercentage(100);
        table.setSpacingAfter(3);
        PdfPCell labelCell = cell(title, font(9, Font.BOLD, Color.WHITE));
        labelCell.setBackgroundColor(BRAND); labelCell.setPadding(4.5f); labelCell.setBorderColor(BRAND);
        labelCell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(labelCell);

        PdfPCell bodyCell = cell(content, font(9, Font.BOLD, TEXT_BLACK));
        bodyCell.setPadding(4.5f); bodyCell.setBorderColor(BORDER);
        table.addCell(bodyCell);
        document.add(table);
    }

    private void addVitalSignsBar(Document document, Map<String, Object> values) throws Exception {
        java.util.ArrayList<String> parts = new java.util.ArrayList<>();
        if (values.get("systolic") != null && values.get("diastolic") != null) {
            parts.add("血压 " + text(values, "systolic", "-") + "/" + text(values, "diastolic", "-") + " mmHg");
        }
        appendMeasure(parts, values, "temperature", "体温", "℃");
        appendMeasure(parts, values, "pulseRate", "脉搏", "次/分");
        appendMeasure(parts, values, "respiratoryRate", "呼吸", "次/分");
        appendMeasure(parts, values, "oxygenSaturation", "血氧", "%");
        appendMeasure(parts, values, "heightCm", "身高", "cm");
        appendMeasure(parts, values, "weightKg", "体重", "kg");

        String display = parts.isEmpty() ? "未测量记录" : String.join("   |   ", parts);
        addInlineSection(document, "生命体征", display);
    }

    private void appendMeasure(List<String> parts, Map<String, Object> values,
                               String key, String label, String unit) {
        if (values.get(key) != null) parts.add(label + " " + number(values.get(key)) + " " + unit);
    }

    private void renderStructuredNote(Document document, Map<String, Object> content) throws Exception {
        Map<String, Object> form = map(content.get("structuredForm"));
        if (form.isEmpty()) return;
        Map<String, Object> values = map(content.get("structuredData"));
        String formName = text(form, "name", "结构化专科记录");
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
                addInlineSection(document, formName + " · " + text(section, "title", "记录"), String.join("  ；  ", lines));
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

    private void addEvidence(Document document, Map<String, Object> snapshot, String legalNotice) throws Exception {
        PdfPTable footerTable = new PdfPTable(1);
        footerTable.setWidthPercentage(100);
        footerTable.setSpacingBefore(5);

        String evidenceText = "来源：" + text(snapshot, "sourceType", "-") + " / "
                + text(snapshot, "sourceId", "-") + " / V" + text(snapshot, "sourceVersion", "-")
                + "    打印时间：" + DATE_TIME.format(Instant.now());
        PdfPCell evidenceCell = cell(evidenceText, font(7, Font.NORMAL, MUTED));
        evidenceCell.setBorder(Rectangle.NO_BORDER);
        footerTable.addCell(evidenceCell);

        if (legalNotice != null && !legalNotice.isBlank()) {
            PdfPCell noticeCell = cell(legalNotice, font(7, Font.NORMAL, MUTED));
            noticeCell.setBorder(Rectangle.NO_BORDER);
            noticeCell.setPaddingTop(2);
            footerTable.addCell(noticeCell);
        }
        document.add(footerTable);
    }

    private String calculateAge(String birthDate) {
        if (birthDate == null || birthDate.isBlank() || "-".equals(birthDate)) return "-";
        try {
            java.time.LocalDate birth = java.time.LocalDate.parse(birthDate.trim());
            java.time.Period period = java.time.Period.between(birth, java.time.LocalDate.now());
            if (period.getYears() > 0) return period.getYears() + " 岁";
            if (period.getMonths() > 0) return period.getMonths() + " 个月";
            return Math.max(1, period.getDays()) + " 天";
        } catch (Exception ignored) {
            return "-";
        }
    }

    private PdfPCell bodyCell(String value, int alignment) {
        PdfPCell cell = cell(value, font(8f, Font.NORMAL, TEXT_DARK));
        cell.setPadding(4f); cell.setBorderColor(BORDER);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE); cell.setHorizontalAlignment(alignment);
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
        try { return DATE_TIME.format(Instant.parse(value.toString())); }
        catch (DateTimeParseException ignored) { return value.toString(); }
    }
    private String number(Object value) {
        if (value == null) return "-";
        try { return new BigDecimal(value.toString()).stripTrailingZeros().toPlainString(); } catch (Exception ignored) { return value.toString(); }
    }
    private String gender(String value) { return switch (value) { case "MALE", "男" -> "男"; case "FEMALE", "女" -> "女"; default -> "未知"; }; }

    private static final class PageFooter extends PdfPageEventHelper {
        private final Font font;
        private PageFooter(BaseFont baseFont) { this.font = new Font(baseFont, 7.5f, Font.NORMAL, MUTED); }
        @Override public void onEndPage(PdfWriter writer, Document document) {
            Rectangle page = document.getPageSize();
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_LEFT,
                    new Phrase("RHN 智慧医疗平台 · 受控医疗文书 · 请遵医嘱", font), document.left(), 7, 0);
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_RIGHT,
                    new Phrase("第 " + writer.getPageNumber() + " 页", font), page.getRight() - document.rightMargin(), 7, 0);
        }
    }
}
