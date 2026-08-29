package com.rhn.platform.masterdata.application;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Component
class MasterDataImportFileParser {
    static final int MAX_FILE_BYTES = 5 * 1024 * 1024;
    static final int MAX_ROWS = 2000;
    static final int MAX_COLUMNS = 100;

    List<ParsedRow> parse(String fileName, byte[] content) {
        if (content == null || content.length == 0) throw badRequest("IMPORT_FILE_EMPTY", "导入文件不能为空");
        if (content.length > MAX_FILE_BYTES) throw badRequest("IMPORT_FILE_TOO_LARGE", "导入文件不能超过5MB");
        String lower = fileName == null ? "" : fileName.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".csv")) return parseCsv(content);
        if (lower.endsWith(".xlsx")) return parseXlsx(content);
        throw badRequest("IMPORT_FILE_TYPE_UNSUPPORTED", "仅支持 .csv 或 .xlsx 文件");
    }

    byte[] template(String importType, String format, List<String> headers) {
        if ("XLSX".equalsIgnoreCase(format)) return xlsxTemplate(importType, headers);
        String csv = "\ufeff" + headers.stream().map(this::quoteCsv).reduce((a, b) -> a + "," + b).orElse("") + "\r\n";
        return csv.getBytes(StandardCharsets.UTF_8);
    }

    private List<ParsedRow> parseXlsx(byte[] content) {
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(content))) {
            if (workbook.getNumberOfSheets() == 0) throw badRequest("IMPORT_SHEET_MISSING", "工作簿不包含工作表");
            Sheet sheet = workbook.getSheetAt(0);
            Row headerRow = sheet.getRow(sheet.getFirstRowNum());
            if (headerRow == null) throw badRequest("IMPORT_HEADER_MISSING", "导入文件缺少表头");
            int columns = Math.min(headerRow.getLastCellNum(), MAX_COLUMNS + 1);
            if (columns <= 0) throw badRequest("IMPORT_HEADER_MISSING", "导入文件缺少表头");
            if (columns > MAX_COLUMNS) throw badRequest("IMPORT_TOO_MANY_COLUMNS", "导入文件最多支持100列");
            DataFormatter formatter = new DataFormatter(Locale.ROOT);
            List<String> headers = new ArrayList<>();
            for (int column = 0; column < columns; column++) {
                String header = formatter.formatCellValue(headerRow.getCell(column)).trim();
                if (header.isEmpty()) throw badRequest("IMPORT_HEADER_BLANK", "第" + (column + 1) + "列表头不能为空");
                if (headers.contains(header)) throw badRequest("IMPORT_HEADER_DUPLICATE", "表头重复：" + header);
                headers.add(header);
            }
            List<ParsedRow> result = new ArrayList<>();
            for (int index = headerRow.getRowNum() + 1; index <= sheet.getLastRowNum(); index++) {
                Row row = sheet.getRow(index);
                if (row == null) continue;
                Map<String, String> values = new LinkedHashMap<>();
                boolean hasValue = false;
                for (int column = 0; column < columns; column++) {
                    Cell cell = row.getCell(column);
                    if (cell != null && cell.getCellType() == org.apache.poi.ss.usermodel.CellType.FORMULA) {
                        throw badRequest("IMPORT_FORMULA_NOT_ALLOWED", "导入数据不能包含公式，请粘贴为值后重试");
                    }
                    String value = cell == null ? "" : formatter.formatCellValue(cell).trim();
                    values.put(headers.get(column), value);
                    hasValue |= !value.isEmpty();
                }
                if (hasValue) result.add(new ParsedRow(index + 1, values));
                if (result.size() > MAX_ROWS) throw badRequest("IMPORT_TOO_MANY_ROWS", "单个批次最多支持2000行数据");
            }
            return result;
        } catch (org.apache.poi.EncryptedDocumentException exception) {
            throw badRequest("IMPORT_FILE_ENCRYPTED", "不支持加密的 Excel 文件");
        } catch (java.io.IOException | RuntimeException exception) {
            if (exception instanceof com.rhn.shared.api.BusinessException businessException) throw businessException;
            throw badRequest("IMPORT_FILE_INVALID", "无法解析 Excel 文件，请使用系统模板重新保存");
        }
    }

    private List<ParsedRow> parseCsv(byte[] content) {
        String text = new String(content, StandardCharsets.UTF_8);
        if (text.startsWith("\ufeff")) text = text.substring(1);
        List<List<String>> records = csvRecords(text);
        if (records.isEmpty()) throw badRequest("IMPORT_HEADER_MISSING", "导入文件缺少表头");
        List<String> headers = records.getFirst().stream().map(String::trim).toList();
        if (headers.size() > MAX_COLUMNS) throw badRequest("IMPORT_TOO_MANY_COLUMNS", "导入文件最多支持100列");
        if (headers.stream().anyMatch(String::isEmpty)) throw badRequest("IMPORT_HEADER_BLANK", "表头不能为空");
        if (headers.stream().distinct().count() != headers.size()) throw badRequest("IMPORT_HEADER_DUPLICATE", "导入文件存在重复表头");
        List<ParsedRow> result = new ArrayList<>();
        for (int index = 1; index < records.size(); index++) {
            List<String> record = records.get(index);
            Map<String, String> values = new LinkedHashMap<>();
            boolean hasValue = false;
            for (int column = 0; column < headers.size(); column++) {
                String value = column < record.size() ? record.get(column).trim() : "";
                values.put(headers.get(column), value);
                hasValue |= !value.isEmpty();
            }
            if (hasValue) result.add(new ParsedRow(index + 1, values));
            if (result.size() > MAX_ROWS) throw badRequest("IMPORT_TOO_MANY_ROWS", "单个批次最多支持2000行数据");
        }
        return result;
    }

    private List<List<String>> csvRecords(String text) {
        List<List<String>> records = new ArrayList<>();
        List<String> record = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < text.length(); index++) {
            char value = text.charAt(index);
            if (quoted) {
                if (value == '"' && index + 1 < text.length() && text.charAt(index + 1) == '"') {
                    field.append('"'); index++;
                } else if (value == '"') quoted = false;
                else field.append(value);
            } else if (value == '"' && field.isEmpty()) quoted = true;
            else if (value == ',') { record.add(field.toString()); field.setLength(0); }
            else if (value == '\n' || value == '\r') {
                if (value == '\r' && index + 1 < text.length() && text.charAt(index + 1) == '\n') index++;
                record.add(field.toString()); field.setLength(0); records.add(record); record = new ArrayList<>();
            } else field.append(value);
        }
        if (quoted) throw badRequest("IMPORT_CSV_QUOTE_INVALID", "CSV 文件存在未闭合的引号");
        if (!field.isEmpty() || !record.isEmpty()) { record.add(field.toString()); records.add(record); }
        while (!records.isEmpty() && records.getLast().stream().allMatch(String::isBlank)) records.removeLast();
        return records;
    }

    private byte[] xlsxTemplate(String importType, List<String> headers) {
        try (Workbook workbook = new org.apache.poi.xssf.usermodel.XSSFWorkbook();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("SERVICE".equals(importType) ? "诊疗项目" : "药品知识");
            Row row = sheet.createRow(0);
            var font = workbook.createFont(); font.setBold(true);
            var style = workbook.createCellStyle(); style.setFont(font);
            for (int index = 0; index < headers.size(); index++) {
                Cell cell = row.createCell(index); cell.setCellValue(headers.get(index)); cell.setCellStyle(style);
                sheet.setColumnWidth(index, Math.min(30, Math.max(12, headers.get(index).length() * 2 + 4)) * 256);
            }
            sheet.createFreezePane(0, 1);
            workbook.write(output);
            return output.toByteArray();
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("生成导入模板失败", exception);
        }
    }

    private String quoteCsv(String value) { return "\"" + value.replace("\"", "\"\"") + "\""; }

    record ParsedRow(int rowNumber, Map<String, String> values) {}
}
