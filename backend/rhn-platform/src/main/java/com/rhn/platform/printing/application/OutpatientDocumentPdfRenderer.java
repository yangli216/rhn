package com.rhn.platform.printing.application;

import com.rhn.shared.json.JsonCodec;
import org.openpdf.text.*;
import org.openpdf.text.pdf.*;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.List;

/** Paper-first outpatient documents. V1 and institution-authored layouts remain independently renderable. */
final class OutpatientDocumentPdfRenderer {
    static final String SCHEMA = "RHN_OUTPATIENT_DOCUMENT_V2";
    static final Set<String> TYPES = Set.of("OUTPATIENT_NOTE", "OUTPATIENT_PRESCRIPTION",
            "LABORATORY_APPLICATION", "EXAMINATION_APPLICATION", "TREATMENT_APPLICATION");
    private static final float MM = 72f / 25.4f;
    private static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZONE);
    private final BaseFont base;
    private final JsonCodec json;

    OutpatientDocumentPdfRenderer(BaseFont base, JsonCodec json) { this.base = base; this.json = json; }

    byte[] render(String type, String configJson, Map<String, Object> source) {
        if (!TYPES.contains(type)) throw new IllegalArgumentException("Unsupported outpatient document: " + type);
        Map<String, Object> config = json.readObject(configJson);
        Map<String, Object> paper = map(config.get("paper"));
        Map<String, Object> data = json.readObject(json.write(source));
        float width = decimal(paper.get("widthMm"), 210) * MM;
        float height = decimal(paper.get("heightMm"), 297) * MM;
        float margin = decimal(paper.get("marginMm"), 10) * MM;
        Document doc = new Document(new Rectangle(width, height), margin, margin, margin, Math.max(margin, 32));
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            writer.setPageEvent(new RunningMatter(data, type));
            doc.addTitle(title(type, data));
            doc.addCreator("RHN Controlled Printing Service");
            doc.open();
            heading(doc, text(data, "organizationName", "医疗机构"), 15);
            heading(doc, title(type, data), 18);
            identity(doc, data, type);
            if ("OUTPATIENT_NOTE".equals(type)) note(doc, data);
            else if ("OUTPATIENT_PRESCRIPTION".equals(type)) prescription(doc, data);
            else application(doc, data, type);
            doc.close();
            return out.toByteArray();
        } catch (Exception exception) {
            throw new IllegalStateException("Outpatient document rendering failed", exception);
        } finally { if (doc.isOpen()) doc.close(); }
    }

    private String title(String type, Map<String, Object> data) {
        return switch (type) {
            case "OUTPATIENT_NOTE" -> "门诊病历";
            case "OUTPATIENT_PRESCRIPTION" -> herbal(data) ? "中药饮片处方笺"
                    : "CHINESE_PATENT".equals(text(data, "categoryCode", "")) ? "中成药处方笺" : "门诊处方笺";
            case "LABORATORY_APPLICATION" -> "检验申请单";
            case "EXAMINATION_APPLICATION" -> "检查申请单";
            default -> "治疗申请单";
        };
    }

    private void identity(Document doc, Map<String, Object> data, String type) throws DocumentException {
        Map<String, Object> resident = map(data.get("resident"));
        boolean note = "OUTPATIENT_NOTE".equals(type);
        boolean rx = "OUTPATIENT_PRESCRIPTION".equals(type);
        String date = text(data, note ? "signedAt" : "authoredAt", "");
        row(doc, new float[]{2, 1, 1}, "姓名：" + text(resident, "fullName", "未记录"),
                "性别：" + gender(text(resident, "gender", "")), "年龄：" + age(resident, date));
        row(doc, new float[]{1}, "门诊号：" + text(data, "encounterNo", "未记录"));
        if (!note) row(doc, new float[]{1}, (rx ? "处方号：" : "申请单号：")
                + text(data, rx ? "prescriptionNo" : "requestNo", "未记录"));
        row(doc, new float[]{1, 1}, "科别：" + text(data, "orderingDepartmentName", text(data, "departmentName", "未记录")),
                (note ? "记录时间：" : "开具时间：") + date(date));
        if (rx) row(doc, new float[]{1, 1}, "费别：" + text(data, "insuranceType", "未记录"),
                "体重：" + measure(data.get("weightKg"), "kg"));
        rule(doc);
    }

    private void note(Document doc, Map<String, Object> data) throws DocumentException {
        Map<String, Object> c = map(data.get("content"));
        section(doc, "主诉", text(c, "chiefComplaint", "未记录"));
        section(doc, "现病史", text(c, "presentIllness", "未记录"));
        section(doc, "既往史", text(c, "medicalHistory", text(c, "pastHistory", "未记录")));
        section(doc, "过敏史", text(c, "allergyHistory", "未记录"));
        optionalSection(doc, "用药史", text(c, "medicationHistory", ""));
        Map<String, Object> vitals = new LinkedHashMap<>(c);
        vitals.putAll(map(c.get("vitalSigns")));
        List<String> measures = new ArrayList<>();
        if (vitals.get("systolic") != null || vitals.get("diastolic") != null)
            measures.add("血压 " + number(vitals.get("systolic")) + "/" + number(vitals.get("diastolic")) + " mmHg");
        String[][] fields = {{"temperature", "体温", "℃"}, {"pulseRate", "脉搏", "次/分"},
                {"respiratoryRate", "呼吸", "次/分"}, {"oxygenSaturation", "血氧", "%"},
                {"heightCm", "身高", "cm"}, {"weightKg", "体重", "kg"}};
        for (String[] f : fields) if (vitals.get(f[0]) != null) measures.add(f[1] + " " + measure(vitals.get(f[0]), f[2]));
        optionalSection(doc, "生命体征", String.join("；", measures));
        section(doc, "体格检查", text(c, "physicalExam", "未记录"));
        optionalSection(doc, "辅助检查", text(c, "auxiliaryExaminations", ""));
        section(doc, "临床诊断", diagnoses(c));
        optionalSection(doc, "处理意见", text(c, "treatmentPlan", ""));
        optionalSection(doc, "健康宣教", text(c, "healthEducation", ""));
        optionalSection(doc, "随访复诊", text(c, "followUp", ""));
        structured(doc, c);
        PdfPTable sign = table(1, 1);
        sign.setSpacingBefore(14);
        sign.setKeepTogether(true);
        sign.addCell(plain("医师：" + signer(data, "signedBy"), 10.5f, false));
        sign.addCell(plain("签署时间：" + date(data.get("signedAt")), 9, false));
        doc.add(sign);
    }

    private void prescription(Document doc, Map<String, Object> data) throws DocumentException {
        section(doc, "临床诊断", diagnoses(data));
        optionalSection(doc, "治法治则", text(data, "treatmentPrinciple", ""));
        Paragraph rp = new Paragraph("Rp.", font(19, true));
        rp.setSpacingBefore(5); rp.setSpacingAfter(6); doc.add(rp);
        List<Map<String, Object>> items = list(data.get("medications")).stream().map(OutpatientDocumentPdfRenderer::map).toList();
        if (herbal(data)) herbs(doc, items);
        else {
            int i = 0;
            for (Map<String, Object> item : items) {
                PdfPTable medicine = table(1);
                medicine.setKeepTogether(true); medicine.setSpacingAfter(6);
                PdfPTable name = table(3.5f, 1);
                PdfPCell nameCell = plain("", 11, true);
                Phrase nameAndSpec = new Phrase();
                nameAndSpec.add(new Chunk(++i + ". " + text(item, "medicationName", "药品名称未记录"), font(11, true)));
                nameAndSpec.add(new Chunk("  " + text(item, "specification", "规格未记录"), font(9, false)));
                nameCell.setPhrase(nameAndSpec); name.addCell(nameCell);
                PdfPCell quantity = plain("× " + measure(item.get("quantity"), text(item, "quantityUnit", "（单位未记录）")), 10.5f, true);
                quantity.setHorizontalAlignment(Element.ALIGN_RIGHT); name.addCell(quantity);
                medicine.addCell(nested(name));
                medicine.addCell(plain("用法：每次 " + measure(item.get("doseValue"), text(item, "doseUnit", "（单位未记录）"))
                        + "，" + route(item) + "，" + frequency(item) + duration(item), 10, false));
                if (!text(item, "instruction", "").isBlank()) medicine.addCell(plain("嘱托：" + text(item, "instruction", ""), 9.5f, false));
                medicine.setTotalWidth(doc.right() - doc.left());
                medicine.calculateHeights(true);
                // An item larger than a whole page must begin immediately, not leave an empty first page.
                if (medicine.getTotalHeight() > doc.top() - doc.bottom()) medicine.setKeepTogether(false);
                doc.add(medicine);
            }
        }
        if (items.isEmpty()) section(doc, "药品", "未记录药品明细");
        Paragraph end = new Paragraph("—— 以下空白 ——", font(8.5f, false));
        end.setAlignment(Element.ALIGN_CENTER); end.setSpacingBefore(3); end.setSpacingAfter(8); doc.add(end);
        optionalSection(doc, "处方备注", text(data, "note", ""));
        PdfPTable signatures = table(1, 1);
        signatures.setKeepTogether(true); signatures.setSpacingBefore(10);
        signatures.addCell(plain("医师：" + signer(data, "authoredBy"), 10, false));
        signatures.addCell(plain("药品金额：" + (data.get("totalAmount") == null ? "________ 元" : number(data.get("totalAmount")) + " 元"), 10, false));
        signatures.addCell(plain("审核：____________", 10, false));
        signatures.addCell(plain("调配：____________", 10, false));
        signatures.addCell(plain("核对：____________", 10, false));
        signatures.addCell(plain("发药：____________", 10, false));
        doc.add(signatures);
    }

    private void herbs(Document doc, List<Map<String, Object>> items) throws DocumentException {
        String commonRoute = common(items, "routeName", "routeCode");
        String commonFrequency = common(items, "frequencyName", "frequencyCode");
        String commonInstruction = common(items, "instruction", "instruction");
        String count = common(items, "durationValue", "durationValue");
        boolean doses = !count.isBlank() && items.stream().allMatch(i -> Set.of("剂", "DOSE").contains(text(i, "durationUnit", "")));
        PdfPTable grid = table(1, 1, 1);
        for (Map<String, Object> item : items) {
            String value = text(item, "medicationName", "未记录") + "  " + measure(item.get("doseValue"), text(item, "doseUnit", "（单位未记录）"));
            if (commonInstruction.isBlank() && !text(item, "instruction", "").isBlank()) value += "\n（" + text(item, "instruction", "") + "）";
            if (commonRoute.isBlank()) value += "\n" + route(item);
            if (commonFrequency.isBlank()) value += "\n" + frequency(item);
            if (!doses) value += duration(item);
            PdfPCell herb = plain(value, 10, false);
            herb.setPaddingBottom(9); grid.addCell(herb);
        }
        grid.completeRow(); doc.add(grid);
        if (doses) section(doc, "剂数", "共 " + count + " 剂");
        List<String> directions = new ArrayList<>();
        if (!commonRoute.isBlank()) directions.add(commonRoute);
        if (!commonFrequency.isBlank()) directions.add(commonFrequency);
        if (!commonInstruction.isBlank()) directions.add(commonInstruction);
        optionalSection(doc, "用法", String.join("；", directions));
    }

    private void application(Document doc, Map<String, Object> data, String type) throws DocumentException {
        section(doc, "临床诊断", diagnoses(data));
        optionalSection(doc, "病情摘要", text(data, "clinicalSummary", text(data, "clinicalDescription", "")));
        optionalSection(doc, "申请目的", text(data, "examinationPurpose", text(data, "reason", "")));
        PdfPTable items = table(4, 1);
        items.setSpacingBefore(5); items.setSpacingAfter(8); items.setHeaderRows(1);
        for (String label : List.of("申请项目", "数量")) {
            PdfPCell cell = plain(label, 10, true); cell.setBorder(Rectangle.BOTTOM); cell.setBorderWidth(.6f); items.addCell(cell);
        }
        List<?> rows = list(data.get("items"));
        if (rows.isEmpty()) rows = List.of(data);
        for (Object value : rows) {
            Map<String, Object> item = map(value);
            items.addCell(plain(text(item, "itemName", "未记录"), 11, true));
            items.addCell(plain(text(item, "quantityText", "未记录"), 10, false));
        }
        doc.add(items);
        if ("LABORATORY_APPLICATION".equals(type)) section(doc, "标本类型", text(data, "specimenType", "未记录"));
        if ("EXAMINATION_APPLICATION".equals(type)) optionalSection(doc, "检查类别", text(data, "examinationType", ""));
        section(doc, "执行科室", text(data, "departmentName", "未记录"));
        PdfPTable sign = table(1, 1);
        sign.setKeepTogether(true); sign.setSpacingBefore(12);
        sign.addCell(plain("申请医师：" + signer(data, "authoredBy"), 10, false));
        sign.addCell(plain("执行/采集：____________", 10, false));
        PdfPCell tip = plain("请凭本单至相应科室办理；准备事项以执行科室告知为准。", 8, false);
        tip.setColspan(2); tip.setPaddingTop(8); sign.addCell(tip);
        doc.add(sign);
    }

    private void structured(Document doc, Map<String, Object> c) throws DocumentException {
        Map<String, Object> form = map(c.get("structuredForm"));
        Map<String, Object> values = map(c.get("structuredData"));
        for (Object s : list(form.get("sections"))) {
            for (Object f : list(map(s).get("fields"))) {
                Map<String, Object> field = map(f); Object value = values.get(text(field, "code", ""));
                if (value == null || value.toString().isBlank()) continue;
                String display = value.toString();
                if ("BOOLEAN".equals(text(field, "type", ""))) display = Boolean.parseBoolean(display) ? "是" : "否";
                for (Object o : list(field.get("options"))) {
                    Map<String, Object> option = map(o);
                    if (value.toString().equals(text(option, "value", ""))) display = text(option, "label", display);
                }
                section(doc, text(field, "label", "记录"), display + " " + text(field, "unit", ""));
            }
        }
    }

    private void heading(Document doc, String text, float size) throws DocumentException {
        Paragraph p = new Paragraph(text, font(size, true)); p.setAlignment(Element.ALIGN_CENTER);
        p.setLeading(size * 1.3f); p.setSpacingAfter(size == 18 ? 10 : 3); doc.add(p);
    }
    private void section(Document doc, String label, String text) throws DocumentException {
        Paragraph p = new Paragraph(); p.setLeading(0, 1.5f);
        p.add(new Chunk(label + "：", font(10.5f, true))); p.add(new Chunk(text, font(10.5f, false)));
        p.setSpacingAfter(5); doc.add(p);
    }
    private void optionalSection(Document doc, String label, String value) throws DocumentException {
        if (!value.isBlank() && !"-".equals(value)) section(doc, label, value);
    }
    private void row(Document doc, float[] widths, String... values) throws DocumentException {
        PdfPTable row = table(widths);
        for (String value : values) row.addCell(plain(value, 9.5f, false));
        doc.add(row);
    }
    private void rule(Document doc) throws DocumentException {
        PdfPTable rule = table(1); rule.setSpacingBefore(3); rule.setSpacingAfter(8);
        PdfPCell line = plain("", 1, false); line.setFixedHeight(1); line.setBorder(Rectangle.BOTTOM); line.setBorderWidth(.7f);
        rule.addCell(line); doc.add(rule);
    }
    private PdfPTable table(float... widths) {
        PdfPTable table = new PdfPTable(widths); table.setWidthPercentage(100);
        table.setSplitLate(false); table.setSplitRows(true); return table;
    }
    private PdfPCell plain(String text, float size, boolean bold) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font(size, bold))); cell.setBorder(Rectangle.NO_BORDER);
        cell.setPaddingLeft(0); cell.setPaddingRight(6); cell.setPaddingTop(0); cell.setPaddingBottom(2);
        cell.setLeading(0, 1.25f); return cell;
    }
    private PdfPCell nested(PdfPTable table) { PdfPCell cell = new PdfPCell(table); cell.setBorder(Rectangle.NO_BORDER); cell.setPadding(0); return cell; }
    private Font font(float size, boolean bold) { return new Font(base, size, bold ? Font.BOLD : Font.NORMAL, Color.BLACK); }
    private static boolean herbal(Map<String, Object> data) { return Set.of("HERBAL", "HERBAL_MED").contains(text(data, "categoryCode", "")); }
    private static String route(Map<String, Object> item) { return text(item, "routeName", text(item, "routeCode", "途径未记录")); }
    private static String frequency(Map<String, Object> item) { return text(item, "frequencyName", text(item, "frequencyCode", "频次未记录")); }
    private static String duration(Map<String, Object> item) { return item.get("durationValue") == null ? "" : "；疗程 " + measure(item.get("durationValue"), text(item, "durationUnit", "（单位未记录）")); }
    private static String common(List<Map<String, Object>> items, String key, String fallback) {
        if (items.isEmpty()) return "";
        String value = text(items.getFirst(), key, text(items.getFirst(), fallback, ""));
        return items.stream().allMatch(i -> value.equals(text(i, key, text(i, fallback, "")))) ? value : "";
    }
    private static String diagnoses(Map<String, Object> data) {
        List<?> values = list(data.get("diagnoses"));
        if (values.isEmpty()) values = list(map(data.get("documentInfo")).get("diagnoses"));
        return values.isEmpty() ? text(data, "diagnosis", "未记录") : String.join("；", values.stream()
                .map(OutpatientDocumentPdfRenderer::map).map(d -> text(d, "display", "未记录")).toList());
    }
    private static String signer(Map<String, Object> data, String field) {
        String name = text(data, field + "Name", "");
        if (!name.isBlank()) return name;
        String raw = text(data, field, "");
        return raw.isBlank() || raw.matches("\\d+") ? "____________" : raw;
    }
    private static String gender(String raw) { return switch (raw) { case "MALE", "男" -> "男"; case "FEMALE", "女" -> "女"; default -> "未记录"; }; }
    private static String age(Map<String, Object> resident, String at) {
        try {
            LocalDate birth = LocalDate.parse(text(resident, "birthDate", ""));
            if (at.length() < 10) return "未记录";
            LocalDate when = LocalDate.parse(date(at).substring(0, 10));
            if (birth.isAfter(when)) return "未记录";
            Period age = Period.between(birth, when);
            if (age.getYears() > 0) return age.getYears() + "岁";
            if (age.getMonths() > 0) return age.getMonths() + "个月";
            return age.getDays() + "天";
        } catch (RuntimeException ignored) { return "未记录"; }
    }
    private static String date(Object value) {
        if (value == null || value.toString().isBlank()) return "未记录";
        try { return DATE_TIME.format(Instant.parse(value.toString())); }
        catch (RuntimeException ignored) { return value.toString(); }
    }
    private static String measure(Object value, String unit) { return value == null ? "未记录" : number(value) + " " + unit; }
    private static String number(Object value) { try { return new BigDecimal(value.toString()).stripTrailingZeros().toPlainString(); } catch (RuntimeException ignored) { return "未记录"; } }
    private static float decimal(Object value, float fallback) { try { return Float.parseFloat(value.toString()); } catch (RuntimeException ignored) { return fallback; } }
    @SuppressWarnings("unchecked") private static Map<String, Object> map(Object value) { return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of(); }
    private static List<?> list(Object value) { return value instanceof List<?> l ? l : List.of(); }
    private static String text(Map<String, Object> data, String key, String fallback) { Object v = data.get(key); return v == null || v.toString().isBlank() ? fallback : v.toString(); }

    private final class RunningMatter extends PdfPageEventHelper {
        private final Map<String, Object> data;
        private final String type;
        RunningMatter(Map<String, Object> data, String type) { this.data = data; this.type = type; }
        @Override public void onEndPage(PdfWriter writer, Document doc) {
            String patient = text(map(data.get("resident")), "fullName", "未记录");
            String identifier = text(data, "OUTPATIENT_PRESCRIPTION".equals(type) ? "prescriptionNo"
                    : "OUTPATIENT_NOTE".equals(type) ? "encounterNo" : "requestNo", "");
            String reference = patient + "  " + identifier;
            if (writer.getPageNumber() > 1) ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_LEFT,
                    new Phrase(title(type, data) + "（续页）  " + reference, font(8, false)), doc.left(), doc.top() + 10, 0);
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_LEFT,
                    new Phrase(reference, font(7, false)), doc.left(), 16, 0);
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_RIGHT,
                    new Phrase(text(data, "purposeText", "") + "  第 " + writer.getPageNumber() + " 页", font(7, false)), doc.right(), 16, 0);
        }
    }
}
