package com.rhn.platform.printing.application;

import com.rhn.platform.printing.domain.PrintDocumentDefinition;
import com.rhn.platform.printing.domain.PrintMediaProfile;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
class PrintLayoutValidator {
    private static final Set<String> CANVAS_TYPES = Set.of("text", "line", "box", "barcode");
    private static final Set<String> FLOW_TYPES = Set.of("fieldGrid", "section", "table", "signature", "text");
    private static final Set<String> ALIGNMENTS = Set.of("", "LEFT", "CENTER", "RIGHT");
    private final JsonCodec jsonCodec;

    PrintLayoutValidator(JsonCodec jsonCodec) { this.jsonCodec = jsonCodec; }

    Map<String, Object> validate(String layoutSchema, String configJson, PrintDocumentDefinition definition,
                                 PrintMediaProfile media) {
        String expectedSchema = "CANVAS".equals(definition.layoutMode())
                ? ConfigurablePdfRenderer.CANVAS_SCHEMA : ConfigurablePdfRenderer.FLOW_SCHEMA;
        if (!expectedSchema.equals(layoutSchema)) {
            throw badRequest("PRINT_LAYOUT_MODE_MISMATCH", "布局协议与单据定义的布局模式不一致");
        }
        if (configJson == null || configJson.isBlank() || configJson.length() > 200_000) {
            throw badRequest("PRINT_LAYOUT_CONFIG_INVALID", "模板配置不能为空且不能超过 200KB");
        }
        Map<String, Object> config;
        try { config = jsonCodec.readObject(configJson); }
        catch (RuntimeException exception) {
            throw badRequest("PRINT_LAYOUT_JSON_INVALID", "模板配置不是有效的 JSON 对象");
        }
        Map<String, Object> paper = map(config.get("paper"));
        double width = decimal(paper.get("widthMm"), -1);
        double height = decimal(paper.get("heightMm"), -1);
        if (Math.abs(width - media.widthMm().doubleValue()) > 0.11
                || (media.heightMm() != null && Math.abs(height - media.heightMm().doubleValue()) > 0.11)) {
            throw badRequest("PRINT_LAYOUT_MEDIA_MISMATCH", "模板纸张尺寸必须与所选介质一致");
        }
        if (ConfigurablePdfRenderer.CANVAS_SCHEMA.equals(layoutSchema)) validateCanvas(config, width, height);
        else validateFlow(config);
        return config;
    }

    private void validateCanvas(Map<String, Object> config, double pageWidth, double pageHeight) {
        if (pageHeight < 20) throw badRequest("PRINT_CANVAS_HEIGHT_REQUIRED", "画布模板必须设置有效纸张高度");
        List<?> elements = list(config.get("elements"));
        if (elements.isEmpty() || elements.size() > 200) {
            throw badRequest("PRINT_CANVAS_ELEMENTS_INVALID", "画布必须包含 1 到 200 个元素");
        }
        for (int index = 0; index < elements.size(); index++) {
            Map<String, Object> element = map(elements.get(index));
            String type = text(element.get("type"));
            if (!CANVAS_TYPES.contains(type)) invalid(index, "包含不支持的元素类型");
            double x = decimal(element.get("xMm"), -1);
            double y = decimal(element.get("yMm"), -1);
            double width = decimal(element.get("widthMm"), -1);
            double height = decimal(element.get("heightMm"), -1);
            if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > pageWidth + 0.01
                    || y + height > pageHeight + 0.01) invalid(index, "超出纸张物理边界");
            if ("text".equals(type)) {
                double fontSize = decimal(element.get("fontSize"), 9);
                if (fontSize < 5 || fontSize > 72) invalid(index, "字号必须在 5 到 72 磅之间");
                if (!ALIGNMENTS.contains(text(element.get("align")))) invalid(index, "对齐方式不受支持");
            }
            if ("barcode".equals(type) && (width < 20 || height < 8)) {
                invalid(index, "一维码区域至少需要 20mm x 8mm");
            }
            rejectExecutableText(element);
        }
    }

    private void validateFlow(Map<String, Object> config) {
        List<?> blocks = list(config.get("blocks"));
        if (blocks.isEmpty() || blocks.size() > 100) {
            throw badRequest("PRINT_FLOW_BLOCKS_INVALID", "流式模板必须包含 1 到 100 个内容块");
        }
        for (int index = 0; index < blocks.size(); index++) {
            Map<String, Object> block = map(blocks.get(index));
            String type = text(block.get("type"));
            if (!FLOW_TYPES.contains(type)) invalid(index, "包含不支持的内容块类型");
            if ("fieldGrid".equals(type)) {
                int columns = integer(block.get("columns"), 2);
                if (columns < 1 || columns > 4 || list(block.get("fields")).size() > 40) {
                    invalid(index, "字段栅格列数或字段数超出限制");
                }
            }
            if ("table".equals(type)) {
                List<?> columns = list(block.get("columns"));
                if (columns.isEmpty() || columns.size() > 12) invalid(index, "表格列数必须在 1 到 12 之间");
            }
            rejectExecutableText(block);
        }
    }

    private void rejectExecutableText(Map<String, Object> value) {
        String serialized = value.toString().toLowerCase();
        if (serialized.contains("<script") || serialized.contains("javascript:")
                || serialized.contains("select * ") || serialized.contains("${")) {
            throw badRequest("PRINT_LAYOUT_EXECUTABLE_CONTENT", "模板不允许包含脚本、SQL 或表达式代码");
        }
    }

    private void invalid(int index, String message) {
        throw badRequest("PRINT_LAYOUT_ELEMENT_INVALID", "第 " + (index + 1) + " 个布局元素" + message);
    }

    private String text(Object value) { return value == null ? "" : value.toString(); }
    private int integer(Object value, int fallback) {
        try { return value == null ? fallback : Integer.parseInt(value.toString()); }
        catch (NumberFormatException ignored) { return fallback; }
    }
    private double decimal(Object value, double fallback) {
        try { return value == null ? fallback : new BigDecimal(value.toString()).doubleValue(); }
        catch (NumberFormatException ignored) { return fallback; }
    }
    private List<?> list(Object value) { return value instanceof List<?> values ? values : List.of(); }
    @SuppressWarnings("unchecked")
    private Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> values ? (Map<String, Object>) values : Map.of();
    }
}
