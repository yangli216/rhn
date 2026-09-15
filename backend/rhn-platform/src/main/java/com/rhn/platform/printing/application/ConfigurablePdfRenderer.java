package com.rhn.platform.printing.application;

import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.Image;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.Rectangle;
import org.openpdf.text.pdf.Barcode128;
import org.openpdf.text.pdf.BaseFont;
import org.openpdf.text.pdf.ColumnText;
import org.openpdf.text.pdf.PdfContentByte;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.awt.Color;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
class ConfigurablePdfRenderer {
    static final String FLOW_SCHEMA = "RHN_PRINT_FLOW_V1";
    static final String CANVAS_SCHEMA = "RHN_PRINT_CANVAS_V1";
    private static final Pattern TOKEN = Pattern.compile("\\{\\{([A-Za-z0-9_.-]+)}}");
    private static final float POINTS_PER_MM = 72f / 25.4f;
    private static final Color BORDER = new Color(180, 190, 190);
    private static final Color MUTED = new Color(85, 100, 100);
    private final JsonCodec jsonCodec;
    private final BaseFont cjk;

    ConfigurablePdfRenderer(JsonCodec jsonCodec) {
        this.jsonCodec = jsonCodec;
        try (var stream = ConfigurablePdfRenderer.class.getClassLoader()
                .getResourceAsStream("fonts/ttf/NotoSansSC/NotoSansSC-Regular.ttf")) {
            if (stream == null) throw new IllegalStateException("Bundled Noto Sans SC font is missing");
            this.cjk = BaseFont.createFont("NotoSansSC-Regular.ttf", BaseFont.IDENTITY_H,
                    BaseFont.EMBEDDED, true, stream.readAllBytes(), null);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot initialize configurable PDF renderer", exception);
        }
    }

    boolean supports(String layoutSchema) {
        return FLOW_SCHEMA.equals(layoutSchema) || CANVAS_SCHEMA.equals(layoutSchema);
    }

    byte[] render(String layoutSchema, String configJson, Map<String, Object> snapshot) {
        Map<String, Object> config = jsonCodec.readObject(configJson);
        return FLOW_SCHEMA.equals(layoutSchema) ? renderFlow(config, snapshot) : renderCanvas(config, snapshot);
    }

    private byte[] renderFlow(Map<String, Object> config, Map<String, Object> snapshot) {
        Map<String, Object> paper = map(config.get("paper"));
        float width = mm(decimal(paper.get("widthMm"), 210));
        float height = mm(decimal(paper.get("heightMm"), 297));
        float top = mm(decimal(paper.get("marginTopMm"), decimal(paper.get("marginMm"), 12)));
        float right = mm(decimal(paper.get("marginRightMm"), decimal(paper.get("marginMm"), 12)));
        float bottom = mm(decimal(paper.get("marginBottomMm"), decimal(paper.get("marginMm"), 12)));
        float left = mm(decimal(paper.get("marginLeftMm"), decimal(paper.get("marginMm"), 12)));
        Document document = new Document(new Rectangle(width, height), left, right, top, bottom);
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            PdfWriter.getInstance(document, output);
            document.addTitle(template(config, "title", snapshot, "临床单据"));
            document.addCreator("RHN Configurable Printing Service");
            document.open();
            Paragraph title = new Paragraph(template(config, "title", snapshot, "临床单据"), font(18, true, Color.BLACK));
            title.setAlignment(Element.ALIGN_CENTER);
            title.setSpacingAfter(10);
            document.add(title);
            String subtitle = template(config, "subtitle", snapshot, "");
            if (!subtitle.isBlank()) {
                Paragraph value = new Paragraph(subtitle, font(9, false, MUTED));
                value.setAlignment(Element.ALIGN_CENTER);
                value.setSpacingAfter(8);
                document.add(value);
            }
            for (Object blockValue : list(config.get("blocks"))) {
                renderFlowBlock(document, map(blockValue), snapshot);
            }
            if (bool(config.get("footer"), false)) {
                Paragraph footer = new Paragraph("模板受控输出  ·  " + value(snapshot, "printEvidenceText", ""),
                        font(7, false, MUTED));
                footer.setSpacingBefore(10);
                footer.setAlignment(Element.ALIGN_CENTER);
                document.add(footer);
            }
            document.close();
            return output.toByteArray();
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Configurable flow PDF rendering failed", exception);
        } finally {
            if (document.isOpen()) document.close();
        }
    }

    private void renderFlowBlock(Document document, Map<String, Object> block,
                                 Map<String, Object> snapshot) throws Exception {
        String type = text(block.get("type"));
        if ("fieldGrid".equals(type)) {
            int columns = integer(block.get("columns"), 2);
            PdfPTable table = new PdfPTable(columns * 2);
            table.setWidthPercentage(100);
            table.setSpacingAfter(8);
            int count = 0;
            for (Object fieldValue : list(block.get("fields"))) {
                Map<String, Object> field = map(fieldValue);
                addCell(table, text(field.get("label")), true);
                addCell(table, template(field, "template", snapshot,
                        value(snapshot, text(field.get("path")), "-")), false);
                count++;
            }
            while (count++ % columns != 0) {
                addCell(table, "", true);
                addCell(table, "", false);
            }
            document.add(table);
            return;
        }
        if ("section".equals(type)) {
            Paragraph heading = new Paragraph(text(block.get("title")), font(10, true, Color.BLACK));
            heading.setSpacingBefore(5);
            heading.setSpacingAfter(4);
            document.add(heading);
            PdfPTable table = new PdfPTable(1);
            table.setWidthPercentage(100);
            PdfPCell cell = new PdfPCell(new Phrase(template(block, "template", snapshot,
                    value(snapshot, text(block.get("path")), "-")), font(9, false, Color.BLACK)));
            cell.setPadding(7);
            cell.setBorderColor(BORDER);
            table.addCell(cell);
            table.setSpacingAfter(8);
            document.add(table);
            return;
        }
        if ("table".equals(type)) {
            List<?> columns = list(block.get("columns"));
            float[] widths = new float[columns.size()];
            for (int index = 0; index < columns.size(); index++) {
                widths[index] = (float) decimal(map(columns.get(index)).get("width"), 1);
            }
            PdfPTable table = new PdfPTable(widths);
            table.setWidthPercentage(100);
            table.setHeaderRows(1);
            for (Object columnValue : columns) addCell(table, text(map(columnValue).get("label")), true);
            List<?> rows = list(resolve(snapshot, text(block.get("path"))));
            for (Object rowValue : rows) {
                Map<String, Object> row = map(rowValue);
                for (Object columnValue : columns) {
                    Map<String, Object> column = map(columnValue);
                    addCell(table, template(column, "template", row,
                            value(row, text(column.get("path")), "-")), false);
                }
            }
            if (rows.isEmpty()) {
                PdfPCell empty = new PdfPCell(new Phrase("暂无记录", font(9, false, MUTED)));
                empty.setColspan(Math.max(1, columns.size()));
                empty.setPadding(8);
                empty.setHorizontalAlignment(Element.ALIGN_CENTER);
                empty.setBorderColor(BORDER);
                table.addCell(empty);
            }
            table.setSpacingAfter(8);
            document.add(table);
            return;
        }
        if ("signature".equals(type)) {
            PdfPTable table = new PdfPTable(new float[]{1, 2, 1, 2});
            table.setWidthPercentage(100);
            addCell(table, text(block.get("leftLabel")), true);
            addCell(table, value(snapshot, text(block.get("leftPath")), ""), false);
            addCell(table, text(block.get("rightLabel")), true);
            addCell(table, value(snapshot, text(block.get("rightPath")), ""), false);
            table.setSpacingBefore(5);
            document.add(table);
            return;
        }
        if ("text".equals(type)) {
            Paragraph paragraph = new Paragraph(template(block, "template", snapshot,
                    text(block.get("text"))), font((float) decimal(block.get("fontSize"), 9),
                    bool(block.get("bold"), false), Color.BLACK));
            paragraph.setSpacingAfter((float) decimal(block.get("spacingAfter"), 6));
            document.add(paragraph);
        }
    }

    private byte[] renderCanvas(Map<String, Object> config, Map<String, Object> snapshot) {
        Map<String, Object> paper = map(config.get("paper"));
        float width = mm(decimal(paper.get("widthMm"), 80));
        float height = mm(decimal(paper.get("heightMm"), 55));
        Document document = new Document(new Rectangle(width, height), 0, 0, 0, 0);
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            PdfWriter writer = PdfWriter.getInstance(document, output);
            document.addCreator("RHN Configurable Printing Service");
            document.open();
            PdfContentByte canvas = writer.getDirectContent();
            for (Object elementValue : list(config.get("elements"))) {
                renderCanvasElement(canvas, height, map(elementValue), snapshot);
            }
            document.close();
            return output.toByteArray();
        } catch (RuntimeException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Configurable canvas PDF rendering failed", exception);
        } finally {
            if (document.isOpen()) document.close();
        }
    }

    private void renderCanvasElement(PdfContentByte canvas, float pageHeight, Map<String, Object> element,
                                     Map<String, Object> snapshot) throws Exception {
        String type = text(element.get("type"));
        float x = mm(decimal(element.get("xMm"), 0));
        float yTop = pageHeight - mm(decimal(element.get("yMm"), 0));
        float width = mm(decimal(element.get("widthMm"), 20));
        float height = mm(decimal(element.get("heightMm"), 6));
        float yBottom = yTop - height;
        if ("line".equals(type)) {
            canvas.moveTo(x, yTop);
            canvas.lineTo(x + width, yTop - height);
            canvas.stroke();
            return;
        }
        if ("box".equals(type)) {
            canvas.rectangle(x, yBottom, width, height);
            canvas.stroke();
            return;
        }
        if ("barcode".equals(type)) {
            String code = value(snapshot, text(element.get("path")), "");
            if (code.isBlank()) return;
            Barcode128 barcode = new Barcode128();
            barcode.setCode(code);
            barcode.setBarHeight(Math.max(8, height - (bool(element.get("showText"), false) ? 8 : 0)));
            barcode.setX(0.8f);
            barcode.setFont(bool(element.get("showText"), false) ? cjk : null);
            barcode.setSize(6);
            Image image = barcode.createImageWithBarcode(canvas, Color.BLACK, Color.BLACK);
            image.scaleAbsolute(width, height);
            image.setAbsolutePosition(x, yBottom);
            canvas.addImage(image);
            return;
        }
        if (!"text".equals(type)) return;
        if (bool(element.get("border"), false)) {
            canvas.setColorStroke(BORDER);
            canvas.rectangle(x, yBottom, width, height);
            canvas.stroke();
        }
        String content = template(element, "template", snapshot, text(element.get("text")));
        float fontSize = (float) decimal(element.get("fontSize"), 9);
        int align = switch (text(element.get("align"))) {
            case "CENTER" -> Element.ALIGN_CENTER;
            case "RIGHT" -> Element.ALIGN_RIGHT;
            default -> Element.ALIGN_LEFT;
        };
        float padding = mm(decimal(element.get("paddingMm"), 0.8));
        ColumnText column = new ColumnText(canvas);
        column.setSimpleColumn(new Phrase(content, font(fontSize, bool(element.get("bold"), false), Color.BLACK)),
                x + padding, yBottom + padding, x + width - padding, yTop - padding,
                fontSize * 1.2f, align);
        column.go();
    }

    private void addCell(PdfPTable table, String value, boolean label) {
        PdfPCell cell = new PdfPCell(new Phrase(value == null ? "" : value,
                font(label ? 8 : 9, label, label ? MUTED : Color.BLACK)));
        cell.setPadding(6);
        cell.setBorderColor(BORDER);
        if (label) cell.setBackgroundColor(new Color(244, 247, 247));
        table.addCell(cell);
    }

    private String template(Map<String, Object> config, String key, Map<String, Object> data, String fallback) {
        String source = text(config.get(key));
        if (source.isBlank()) return fallback == null ? "" : fallback;
        Matcher matcher = TOKEN.matcher(source);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) matcher.appendReplacement(result,
                Matcher.quoteReplacement(value(data, matcher.group(1), "")));
        matcher.appendTail(result);
        return result.toString();
    }

    private String value(Map<String, Object> data, String path, String fallback) {
        Object resolved = resolve(data, path);
        if (resolved == null) return fallback;
        String value = resolved.toString();
        return value.isBlank() ? fallback : value;
    }

    private Object resolve(Object root, String path) {
        if (root == null || path == null || path.isBlank()) return null;
        Object current = root;
        for (String part : path.split("\\.")) {
            if (!(current instanceof Map<?, ?> values)) return null;
            current = values.get(part);
        }
        return current;
    }

    private Font font(float size, boolean bold, Color color) {
        return new Font(cjk, size, bold ? Font.BOLD : Font.NORMAL, color);
    }

    private float mm(double value) { return (float) value * POINTS_PER_MM; }
    private boolean bool(Object value, boolean fallback) {
        return value == null ? fallback : Boolean.parseBoolean(value.toString());
    }
    private int integer(Object value, int fallback) {
        try { return value == null ? fallback : Integer.parseInt(value.toString()); }
        catch (NumberFormatException ignored) { return fallback; }
    }
    private double decimal(Object value, double fallback) {
        try { return value == null ? fallback : new BigDecimal(value.toString()).setScale(3, RoundingMode.HALF_UP).doubleValue(); }
        catch (NumberFormatException ignored) { return fallback; }
    }
    private String text(Object value) { return value == null ? "" : value.toString(); }
    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> values) return new LinkedHashMap<>((Map<String, Object>) values);
        return Map.of();
    }
    private List<?> list(Object value) {
        return value instanceof List<?> values ? values : List.of();
    }
}
