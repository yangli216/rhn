package com.rhn.platform.masterdata.application;

import com.rhn.platform.masterdata.api.MasterDataCommands.MedicationCommand;
import com.rhn.platform.masterdata.api.MasterDataCommands.ServiceCommand;
import com.rhn.platform.masterdata.api.MasterDataImportViews.ImportBatchView;
import com.rhn.platform.masterdata.api.MasterDataImportViews.ImportError;
import com.rhn.platform.masterdata.api.MasterDataImportViews.ImportRowView;
import com.rhn.platform.masterdata.application.MasterDataImportFileParser.ParsedRow;
import com.rhn.platform.masterdata.application.MasterDataImportMapping.MappedRow;
import com.rhn.platform.masterdata.domain.MasterDataImportBatch;
import com.rhn.platform.masterdata.domain.MasterDataImportRow;
import com.rhn.platform.masterdata.infrastructure.MasterDataImportBatchRepository;
import com.rhn.platform.masterdata.infrastructure.MasterDataImportRowRepository;
import com.rhn.shared.api.BusinessException;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class MasterDataImportService {
    private final MasterDataImportBatchRepository batchRepository;
    private final MasterDataImportRowRepository rowRepository;
    private final MasterDataImportFileParser parser;
    private final MasterDataImportMapping mapping;
    private final MasterDataImportExecutor executor;
    private final MasterDataApplicationService masterDataService;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec jsonCodec;

    public MasterDataImportService(MasterDataImportBatchRepository batchRepository,
                                   MasterDataImportRowRepository rowRepository,
                                   MasterDataImportFileParser parser,
                                   MasterDataImportMapping mapping,
                                   MasterDataImportExecutor executor,
                                   MasterDataApplicationService masterDataService,
                                   ExecutionContextProvider contextProvider, JsonCodec jsonCodec) {
        this.batchRepository = batchRepository;
        this.rowRepository = rowRepository;
        this.parser = parser;
        this.mapping = mapping;
        this.executor = executor;
        this.masterDataService = masterDataService;
        this.contextProvider = contextProvider;
        this.jsonCodec = jsonCodec;
    }

    @Transactional
    public ImportBatchView preflight(String rawImportType, String fileName, byte[] content, String requestCode) {
        ExecutionContext context = current();
        String importType = importType(rawImportType);
        String cleanRequestCode = required(requestCode, "请求编码", 128);
        String cleanFileName = required(fileName, "文件名", 300);
        String fileHash = sha256(content);
        MasterDataImportBatch repeated = batchRepository
                .findByTenantIdAndRequestCode(context.tenantId(), cleanRequestCode).orElse(null);
        if (repeated != null) {
            if (!repeated.importType().equals(importType) || !repeated.fileHash().equals(fileHash)) {
                throw conflict("IMPORT_REQUEST_REUSED", "相同请求编码已用于其他导入文件");
            }
            return view(repeated, rows(context.tenantId(), repeated.id()));
        }

        List<ParsedRow> parsed = parser.parse(cleanFileName, content);
        MasterDataImportBatch batch = batchRepository.save(new MasterDataImportBatch(context.tenantId(),
                context.subjectId(), importType, cleanFileName, fileHash, cleanRequestCode));
        List<MappedRow> mapped = parsed.stream().map(value -> mapping.map(importType, value.values())).toList();
        Map<String, Long> codeCounts = mapped.stream().map(MappedRow::sourceKey).filter(value -> value != null)
                .collect(Collectors.groupingBy(value -> value.toUpperCase(Locale.ROOT), Collectors.counting()));
        List<MasterDataImportRow> values = new ArrayList<>();
        for (int index = 0; index < parsed.size(); index++) {
            ParsedRow source = parsed.get(index);
            MappedRow value = mapped.get(index);
            List<ImportError> errors = validatedErrors(importType, value);
            if (value.sourceKey() != null && codeCounts.getOrDefault(value.sourceKey().toUpperCase(Locale.ROOT), 0L) > 1) {
                errors.add(new ImportError("code", "DUPLICATE_IN_FILE", "文件内存在重复编码"));
            }
            MasterDataImportRow row = new MasterDataImportRow(context.tenantId(), batch.id(), source.rowNumber(),
                    jsonCodec.write(source.values()), context.subjectId());
            row.validate(jsonCodec.write(source.values()), value.sourceKey(),
                    value.normalized().isEmpty() ? null : jsonCodec.write(value.normalized()), jsonCodec.write(errors),
                    errors.isEmpty(), context.subjectId());
            values.add(row);
        }
        rowRepository.saveAll(values);
        refresh(batch, values, context.subjectId());
        return view(batch, values);
    }

    @Transactional(readOnly = true)
    public List<ImportBatchView> list() {
        Long tenantId = current().tenantId();
        return batchRepository.findTop50ByTenantIdOrderByCreatedAtDesc(tenantId).stream()
                .map(value -> view(value, List.of())).toList();
    }

    @Transactional(readOnly = true)
    public ImportBatchView get(Long batchId) {
        ExecutionContext context = current();
        MasterDataImportBatch batch = requireBatch(batchId, context.tenantId());
        return view(batch, rows(context.tenantId(), batch.id()));
    }

    @Transactional
    public ImportBatchView correctRow(Long batchId, Long rowId, long expectedRevision, Map<String, String> source) {
        ExecutionContext context = current();
        MasterDataImportBatch batch = requireMutableBatch(batchId, context.tenantId());
        MasterDataImportRow target = rowRepository.findByIdAndTenantIdAndBatchId(rowId, context.tenantId(), batch.id())
                .orElseThrow(() -> notFound("IMPORT_ROW_NOT_FOUND", "未找到导入行"));
        if (target.revision() != expectedRevision) throw conflict("IMPORT_ROW_REVISION_STALE", "导入行已被修改，请刷新后重试");
        if ("IMPORTED".equals(target.status())) throw conflict("IMPORT_ROW_ALREADY_IMPORTED", "已导入行不能修改");
        if (source == null || source.isEmpty()) throw badRequest("IMPORT_ROW_EMPTY", "修正后的导入行不能为空");

        List<MasterDataImportRow> values = rows(context.tenantId(), batch.id());
        Map<Long, Map<String, String>> sources = new LinkedHashMap<>();
        for (MasterDataImportRow row : values) {
            if (!"IMPORTED".equals(row.status())) {
                sources.put(row.id(), row.id().equals(rowId) ? cleanSource(source) : stringMap(jsonCodec.readObject(row.sourceJson())));
            }
        }
        revalidate(batch, values, sources, context.subjectId());
        batch = requireBatch(batchId, context.tenantId());
        values = rows(context.tenantId(), batch.id());
        return view(batch, values);
    }

    public ImportBatchView commit(Long batchId) {
        ExecutionContext context = current();
        MasterDataImportBatch batch = requireMutableBatch(batchId, context.tenantId());
        List<MasterDataImportRow> values = rows(context.tenantId(), batch.id());
        Map<Long, Map<String, String>> sources = values.stream().filter(row -> !"IMPORTED".equals(row.status()))
                .collect(Collectors.toMap(MasterDataImportRow::id,
                        row -> stringMap(jsonCodec.readObject(row.sourceJson())), (a, b) -> a, LinkedHashMap::new));
        revalidate(batch, values, sources, context.subjectId());
        batch = requireBatch(batchId, context.tenantId());
        if (batch.invalidRows() > 0 || batch.readyRows() == 0) {
            throw badRequest("IMPORT_BATCH_NOT_READY", "请先修正全部错误行，再提交导入");
        }
        batch.startImport(context.subjectId());
        batchRepository.saveAndFlush(batch);
        for (MasterDataImportRow row : values) {
            if (!"READY".equals(row.status())) continue;
            try {
                executor.execute(context.tenantId(), batch.id(), row.id(), batch.importType(), context.subjectId());
            } catch (BusinessException exception) {
                executor.recordFailure(context.tenantId(), batch.id(), row.id(),
                        jsonCodec.write(List.of(new ImportError("row", exception.code(), exception.getMessage()))),
                        context.subjectId());
            } catch (RuntimeException exception) {
                executor.recordFailure(context.tenantId(), batch.id(), row.id(),
                        jsonCodec.write(List.of(new ImportError("row", "IMPORT_ROW_FAILED", "导入失败，请修正后重试"))),
                        context.subjectId());
            }
        }
        values = rows(context.tenantId(), batch.id());
        batch = requireBatch(batchId, context.tenantId());
        refresh(batch, values, context.subjectId());
        return view(batch, values);
    }

    @Transactional
    public ImportBatchView cancel(Long batchId) {
        ExecutionContext context = current();
        MasterDataImportBatch batch = requireBatch(batchId, context.tenantId());
        batch.cancel(context.subjectId());
        batchRepository.saveAndFlush(batch);
        return view(batch, rows(context.tenantId(), batch.id()));
    }

    @Transactional(readOnly = true)
    public byte[] errorReceipt(Long batchId) {
        ExecutionContext context = current();
        MasterDataImportBatch batch = requireBatch(batchId, context.tenantId());
        StringBuilder csv = new StringBuilder("\ufeff行号,编码,状态,字段,错误编码,错误信息\r\n");
        for (MasterDataImportRow row : rows(context.tenantId(), batch.id())) {
            for (ImportError error : errors(row.errorsJson())) {
                csv.append(row.rowNumber()).append(',').append(csv(row.sourceKey())).append(',')
                        .append(row.status()).append(',').append(csv(error.field())).append(',')
                        .append(csv(error.code())).append(',').append(csv(error.message())).append("\r\n");
            }
        }
        return csv.toString().getBytes(StandardCharsets.UTF_8);
    }

    public byte[] template(String rawImportType, String format) {
        String importType = importType(rawImportType);
        return parser.template(importType, format, mapping.templateHeaders(importType));
    }

    private void revalidate(MasterDataImportBatch batch, List<MasterDataImportRow> rows,
                            Map<Long, Map<String, String>> sources, Long actorId) {
        Map<Long, MappedRow> mapped = sources.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> mapping.map(batch.importType(), entry.getValue()),
                        (a, b) -> a, LinkedHashMap::new));
        Map<String, Long> counts = mapped.values().stream().map(MappedRow::sourceKey).filter(value -> value != null)
                .collect(Collectors.groupingBy(value -> value.toUpperCase(Locale.ROOT), Collectors.counting()));
        for (MasterDataImportRow row : rows) {
            if ("IMPORTED".equals(row.status())) continue;
            Map<String, String> source = sources.get(row.id());
            MappedRow value = mapped.get(row.id());
            List<ImportError> errors = validatedErrors(batch.importType(), value);
            if (value.sourceKey() != null && counts.getOrDefault(value.sourceKey().toUpperCase(Locale.ROOT), 0L) > 1) {
                errors.add(new ImportError("code", "DUPLICATE_IN_FILE", "文件内存在重复编码"));
            }
            row.validate(jsonCodec.write(source), value.sourceKey(),
                    value.normalized().isEmpty() ? null : jsonCodec.write(value.normalized()), jsonCodec.write(errors),
                    errors.isEmpty(), actorId);
        }
        rowRepository.saveAllAndFlush(rows.stream().filter(row -> !"IMPORTED".equals(row.status())).toList());
        refresh(batch, rows, actorId);
    }

    private List<ImportError> validatedErrors(String importType, MappedRow value) {
        List<ImportError> errors = new ArrayList<>(value.errors());
        if (!errors.isEmpty()) return errors;
        try {
            if ("SERVICE".equals(importType)) masterDataService.validateServiceForImport((ServiceCommand) value.command());
            else masterDataService.validateMedicationForImport((MedicationCommand) value.command());
        } catch (BusinessException exception) {
            errors.add(new ImportError("row", exception.code(), exception.getMessage()));
        } catch (IllegalArgumentException exception) {
            errors.add(new ImportError("row", "DOMAIN_VALIDATION", exception.getMessage()));
        }
        return errors;
    }

    private void refresh(MasterDataImportBatch batch, List<MasterDataImportRow> values, Long actorId) {
        Map<String, Long> counts = values.stream().map(MasterDataImportRow::status)
                .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()));
        batch.refreshCounts(values.size(), count(counts, "READY"), count(counts, "INVALID"),
                count(counts, "IMPORTED"), count(counts, "FAILED"), actorId);
        batchRepository.saveAndFlush(batch);
    }

    private ImportBatchView view(MasterDataImportBatch batch, List<MasterDataImportRow> rows) {
        return new ImportBatchView(batch.id(), batch.revision(), batch.importType(), batch.fileName(), batch.fileHash(),
                batch.requestCode(), batch.status(), batch.totalRows(), batch.readyRows(), batch.invalidRows(),
                batch.importedRows(), batch.failedRows(), batch.createdAt(), batch.createdBy(), batch.updatedAt(),
                batch.updatedBy(), rows.stream().map(this::view).toList());
    }

    private ImportRowView view(MasterDataImportRow row) {
        return new ImportRowView(row.id(), row.revision(), row.rowNumber(), row.sourceKey(),
                jsonCodec.readObject(row.sourceJson()), row.normalizedJson() == null ? Map.of() : jsonCodec.readObject(row.normalizedJson()),
                errors(row.errorsJson()), row.status(), row.targetId(), row.updatedAt());
    }

    private List<ImportError> errors(String json) {
        JsonNode root = jsonCodec.readTree(json);
        List<ImportError> result = new ArrayList<>();
        for (JsonNode value : root) {
            result.add(new ImportError(value.path("field").asString(), value.path("code").asString(),
                    value.path("message").asString()));
        }
        return result;
    }

    private MasterDataImportBatch requireMutableBatch(Long id, Long tenantId) {
        MasterDataImportBatch batch = requireBatch(id, tenantId);
        if ("COMPLETED".equals(batch.status()) || "CANCELLED".equals(batch.status()) || "IMPORTING".equals(batch.status())) {
            throw conflict("IMPORT_BATCH_IMMUTABLE", "当前批次状态不允许修改或提交");
        }
        return batch;
    }

    private MasterDataImportBatch requireBatch(Long id, Long tenantId) {
        return batchRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> notFound("IMPORT_BATCH_NOT_FOUND", "未找到基础数据导入批次"));
    }

    private List<MasterDataImportRow> rows(Long tenantId, Long batchId) {
        return rowRepository.findByTenantIdAndBatchIdOrderByRowNumber(tenantId, batchId);
    }

    private ExecutionContext current() { return contextProvider.requireCurrent(); }
    private int count(Map<String, Long> values, String key) { return values.getOrDefault(key, 0L).intValue(); }
    private String importType(String value) {
        String result = required(value, "导入类型", 32).toUpperCase(Locale.ROOT);
        if (!"SERVICE".equals(result) && !"MEDICATION".equals(result)) {
            throw badRequest("IMPORT_TYPE_UNSUPPORTED", "仅支持诊疗项目或药品知识导入");
        }
        return result;
    }
    private String required(String value, String label, int max) {
        if (value == null || value.isBlank()) throw badRequest("IMPORT_PARAMETER_REQUIRED", label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw badRequest("IMPORT_PARAMETER_TOO_LONG", label + "长度不能超过" + max);
        return result;
    }
    private String sha256(byte[] value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
        catch (NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable", exception); }
    }
    private String csv(String value) {
        String safe = value == null ? "" : value;
        if (!safe.isEmpty() && (safe.charAt(0) == '=' || safe.charAt(0) == '+' || safe.charAt(0) == '-'
                || safe.charAt(0) == '@' || safe.charAt(0) == '\t' || safe.charAt(0) == '\r')) safe = "'" + safe;
        return "\"" + safe.replace("\"", "\"\"") + "\"";
    }
    private Map<String, String> cleanSource(Map<String, String> value) {
        return value.entrySet().stream().collect(Collectors.toMap(entry -> entry.getKey().trim(),
                entry -> entry.getValue() == null ? "" : entry.getValue().trim(), (a, b) -> b, LinkedHashMap::new));
    }
    private Map<String, String> stringMap(Map<String, Object> value) {
        return value.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey,
                entry -> entry.getValue() == null ? "" : String.valueOf(entry.getValue()),
                (a, b) -> b, LinkedHashMap::new));
    }
}
