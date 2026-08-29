package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MasterDataImportViews.ImportBatchView;
import com.rhn.platform.masterdata.application.MasterDataImportService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@RestController
@RequestMapping("/api/platform/master-data/imports")
public class MasterDataImportController {
    private final MasterDataImportService service;

    public MasterDataImportController(MasterDataImportService service) { this.service = service; }

    @GetMapping
    List<ImportBatchView> list() { return service.list(); }

    @GetMapping("/{batchId}")
    ImportBatchView get(@PathVariable Long batchId) { return service.get(batchId); }

    @PostMapping(value = "/preflight", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ImportBatchView preflight(@RequestParam String importType, @RequestParam String requestCode,
                              @RequestPart("file") MultipartFile file) {
        try {
            return service.preflight(importType, file.getOriginalFilename(), file.getBytes(), requestCode);
        } catch (IOException exception) {
            throw badRequest("IMPORT_FILE_READ_FAILED", "读取导入文件失败");
        }
    }

    @PutMapping("/{batchId}/rows/{rowId}")
    ImportBatchView correctRow(@PathVariable Long batchId, @PathVariable Long rowId,
                               @Valid @RequestBody CorrectRowRequest request) {
        return service.correctRow(batchId, rowId, request.expectedRevision().longValueExact(), request.values());
    }

    @PostMapping("/{batchId}/commit")
    ImportBatchView commit(@PathVariable Long batchId) { return service.commit(batchId); }

    @PostMapping("/{batchId}/cancel")
    ImportBatchView cancel(@PathVariable Long batchId) { return service.cancel(batchId); }

    @GetMapping("/{batchId}/errors.csv")
    ResponseEntity<byte[]> errors(@PathVariable Long batchId) {
        return download(service.errorReceipt(batchId), "master-data-import-errors-" + batchId + ".csv",
                "text/csv;charset=UTF-8");
    }

    @GetMapping("/template")
    ResponseEntity<byte[]> template(@RequestParam String importType,
                                    @RequestParam(defaultValue = "XLSX") String format) {
        boolean xlsx = "XLSX".equalsIgnoreCase(format);
        byte[] content = service.template(importType, xlsx ? "XLSX" : "CSV");
        return download(content, "master-data-" + importType.toLowerCase() + "-template." + (xlsx ? "xlsx" : "csv"),
                xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=UTF-8");
    }

    private ResponseEntity<byte[]> download(byte[] content, String fileName, String contentType) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(fileName, StandardCharsets.UTF_8).build().toString())
                .contentType(MediaType.parseMediaType(contentType)).body(content);
    }

    record CorrectRowRequest(@NotNull @Min(0) java.math.BigInteger expectedRevision,
                             @NotEmpty Map<String, String> values) {}
}
