package com.rhn.platform.masterdata.api;

import java.time.Instant;
import java.util.List;
import java.util.Map;

public final class MasterDataImportViews {
    private MasterDataImportViews() {}

    public record ImportError(String field, String code, String message) {}

    public record ImportRowView(
            Long id, long revision, int rowNumber, String sourceKey, Map<String, Object> source,
            Map<String, Object> normalized, List<ImportError> errors, String status, Long targetId,
            Instant updatedAt) {}

    public record ImportBatchView(
            Long id, long revision, String importType, String fileName, String fileHash, String requestCode,
            String status, int totalRows, int readyRows, int invalidRows, int importedRows, int failedRows,
            Instant createdAt, Long createdBy, Instant updatedAt, Long updatedBy, List<ImportRowView> rows) {}
}
