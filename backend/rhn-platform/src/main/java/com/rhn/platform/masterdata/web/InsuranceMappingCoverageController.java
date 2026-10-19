package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.InsuranceCoverageViews.CoverageReport;
import com.rhn.platform.masterdata.application.InsuranceMappingCoverageService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

/** 医保接入向导：标准目录对照覆盖率，只读。 */
@RestController
@RequestMapping("/api/platform/master-data/insurance-coverage")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class InsuranceMappingCoverageController {
    private final InsuranceMappingCoverageService service;

    public InsuranceMappingCoverageController(InsuranceMappingCoverageService service) { this.service = service; }

    @GetMapping
    CoverageReport report(@RequestParam(required = false) String systemCode,
                          @RequestParam(required = false) String category,
                          @RequestParam(required = false) String status,
                          @RequestParam(required = false) String query,
                          @RequestParam(required = false) LocalDate businessDate,
                          @RequestParam(defaultValue = "0") int page,
                          @RequestParam(defaultValue = "20") int size) {
        return service.report(systemCode, category, status, query, businessDate, page, size);
    }

    @GetMapping(value = "/export", produces = "text/csv;charset=UTF-8")
    ResponseEntity<byte[]> export(@RequestParam(required = false) String systemCode,
                                  @RequestParam(required = false) String category,
                                  @RequestParam(required = false) String status,
                                  @RequestParam(required = false) String query,
                                  @RequestParam(required = false) LocalDate businessDate) {
        byte[] body = service.exportCsv(systemCode, category, status, query, businessDate).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename("insurance-coverage.csv").build().toString())
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8")).body(body);
    }
}
