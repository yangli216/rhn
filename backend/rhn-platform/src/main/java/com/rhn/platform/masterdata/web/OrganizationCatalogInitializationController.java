package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.application.OrganizationCatalogInitializationParticipant;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform/maintenance/catalog")
@PreAuthorize("hasAuthority('MAINTENANCE.VIEW')")
public class OrganizationCatalogInitializationController {
    private final OrganizationCatalogInitializationParticipant participant;
    public OrganizationCatalogInitializationController(OrganizationCatalogInitializationParticipant participant) {
        this.participant = participant;
    }
    @GetMapping("/template")
    ResponseEntity<byte[]> template(@RequestParam(defaultValue = "CSV") String format) {
        boolean xlsx = "XLSX".equalsIgnoreCase(format);
        return ResponseEntity.ok().header("Content-Disposition", "attachment; filename=organization-catalog-template."
                        + (xlsx ? "xlsx" : "csv"))
                .contentType(MediaType.parseMediaType(xlsx
                        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=UTF-8"))
                .body(participant.template(xlsx ? "XLSX" : "CSV"));
    }
}
