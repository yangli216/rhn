package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.application.StandardMedicationCatalogService;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** The same read-only reference edition is shared by authenticated tenants. */
@RestController
@RequestMapping("/api/platform/master-data/medication-standard-catalog")
public class StandardMedicationCatalogController {
    private final StandardMedicationCatalogService service;
    private final ExecutionContextProvider contextProvider;

    public StandardMedicationCatalogController(StandardMedicationCatalogService service, ExecutionContextProvider contextProvider) {
        this.service = service;
        this.contextProvider = contextProvider;
    }

    @GetMapping("/summary")
    public JsonNode summary() {
        contextProvider.requireCurrent();
        return service.summary();
    }

    @GetMapping
    public PageResult<JsonNode> search(@RequestParam(defaultValue = "") String query,
            @RequestParam(defaultValue = "") String medicationType,
            @RequestParam(defaultValue = "") String state,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        contextProvider.requireCurrent();
        return service.search(query, medicationType, state, page, size);
    }

    @GetMapping("/{id}")
    public JsonNode detail(@PathVariable String id) {
        contextProvider.requireCurrent();
        return service.detail(id);
    }
}
