package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.DiagnosticTemplateDirectory.*;
import com.rhn.platform.masterdata.application.DiagnosticTemplateService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/operations/services/{serviceId}/report-templates")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class DiagnosticTemplateController {
    private final DiagnosticTemplateService templates;
    public DiagnosticTemplateController(DiagnosticTemplateService templates) { this.templates = templates; }
    @GetMapping List<TemplateView> history(@PathVariable Long serviceId) { return templates.history(serviceId); }
    @PostMapping TemplateView publish(@PathVariable Long serviceId, @RequestBody PublishCommand input) {
        return templates.publish(serviceId, input);
    }
}
