package com.rhn.analytics.web;

import com.rhn.analytics.api.AnalysisPage.*;
import com.rhn.analytics.application.AnalysisPageService;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import jakarta.validation.Valid;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;

@RestController
@RequestMapping("/api/analytics/pages")
@PreAuthorize("hasAuthority('PORTAL.ACCESS')")
public class AnalysisPageController {
    private final AnalysisPageService service;
    public AnalysisPageController(AnalysisPageService service){this.service=service;}
    @Operation(operationId="analyticsPagesCatalog")
    @GetMapping("/catalog") public List<Metric> catalog(){return service.catalog();}
    @Operation(operationId="analyticsPagesSources")
    @GetMapping("/sources") public List<com.rhn.shared.reporting.ReportModel.Catalog> sources(){return service.sources();}
    @Operation(operationId="analyticsPagesGenerate")
    @PostMapping("/generate") public Proposal generate(@Valid @RequestBody Generate request){return service.generate(request);}
    @Operation(operationId="analyticsPagesQuery")
    @PostMapping("/query") public Result query(@Valid @RequestBody Spec spec){return service.query(spec);}
    @Operation(operationId="analyticsPagesSave")
    @PostMapping("/saved") public Saved save(@Valid @RequestBody Spec spec){return service.save(spec);}
    @Operation(operationId="analyticsPagesSaved")
    @GetMapping("/saved") public List<Saved> saved(@RequestParam(defaultValue="false") boolean includeArchived){return service.saved(includeArchived);}
    @Operation(operationId="analyticsPagesUpdate")
    @PutMapping("/saved/{id}") public Saved update(@PathVariable Long id,@Valid @RequestBody Spec spec){return service.update(id,spec);}
    @Operation(operationId="analyticsPagesRename")
    @PostMapping("/saved/{id}/rename") public Saved rename(@PathVariable Long id,@Valid @RequestBody Rename request){return service.rename(id,request.title());}
    @Operation(operationId="analyticsPagesArchive")
    @PostMapping("/saved/{id}/archive") public Saved archive(@PathVariable Long id,@RequestBody Archive request){return service.archive(id,request.archived());}
    @Operation(operationId="analyticsPagesHistory")
    @GetMapping("/saved/{id}/history") public List<Saved> history(@PathVariable Long id){return service.history(id);}
}
