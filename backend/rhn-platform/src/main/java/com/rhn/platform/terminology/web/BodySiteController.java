package com.rhn.platform.terminology.web;

import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.terminology.api.BodySiteDirectory.BodySite;
import com.rhn.platform.terminology.application.BodySiteService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/platform/terminology/body-sites")
public class BodySiteController {
    private final BodySiteService service;

    public BodySiteController(BodySiteService service) {
        this.service = service;
    }

    @GetMapping
    List<BodySite> listBodySites(@RequestParam(required = false) LocalDate at) {
        return service.listBodySites(TenantContext.requireTenantId(), at == null ? LocalDate.now() : at);
    }

    @PutMapping("/{conceptId}/parents")
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    BodySite replaceBodySiteParents(@PathVariable Long conceptId, @Valid @RequestBody BodySiteParentsRequest request) {
        return service.replaceParents(TenantContext.requireTenantId(), conceptId, request.parentConceptIds());
    }

    record BodySiteParentsRequest(@NotNull List<@NotNull Long> parentConceptIds) {}
}
