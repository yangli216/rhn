package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.application.StandardMedicationCatalogService;
import com.rhn.platform.masterdata.application.StandardMedicationOnboardingService;
import com.rhn.platform.masterdata.application.StandardCatalogReviewService;
import com.rhn.platform.masterdata.api.StandardCatalogReview;
import com.rhn.platform.masterdata.api.MasterDataViews.MedicationView;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import com.rhn.shared.api.PageResult;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

/** Shared reference edition with tenant-specific operational provenance. */
@RestController
@RequestMapping("/api/platform/master-data/medication-standard-catalog")
public class StandardMedicationCatalogController {
    private final StandardMedicationCatalogService service;
    private final ExecutionContextProvider contextProvider;
    private final StandardMedicationOnboardingService onboarding;
    private final StandardCatalogReviewService reviews;

    public StandardMedicationCatalogController(StandardMedicationCatalogService service, ExecutionContextProvider contextProvider,
            StandardMedicationOnboardingService onboarding, StandardCatalogReviewService reviews) {
        this.reviews = reviews;
        this.onboarding = onboarding;
        this.service = service;
        this.contextProvider = contextProvider;
    }

    @GetMapping("/specifications/{id}/medications")
    public List<MedicationView> standardMedicationCandidates(
            @PathVariable String id, @RequestParam(required = false) Long organizationId) {
        return onboarding.candidates(id, organizationId);
    }

    @PostMapping("/specifications/{id}/medications")
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public MedicationView saveStandardMedication(@PathVariable String id,
            @Valid @RequestBody StandardMedicationSetupRequest request,
            @RequestParam(required = false) Long organizationId) {
        return onboarding.save(id, request.medicationId(), request.expectedRevision(), request.medication().command(), organizationId);
    }
    record StandardMedicationSetupRequest(Long medicationId, @Min(0) Long expectedRevision,
            @Valid @NotNull MasterDataController.MedicationRequest medication) {}

    @GetMapping("/summary")
    public JsonNode summary() {
        return reviews.summary(contextProvider.requireCurrent().tenantId());
    }

    @GetMapping("/source-review")
    public StandardCatalogReview.View sourceReview(@RequestParam(defaultValue = "0") int historyPage) { return reviews.view(historyPage); }

    @PostMapping("/source-review")
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public StandardCatalogReview.View sourceReview(@RequestBody StandardCatalogReview.Change input) { return reviews.change(input); }

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
        var context = contextProvider.requireCurrent();
        var detail = (tools.jackson.databind.node.ObjectNode) service.detail(id);
        detail.set("source", reviews.summary(context.tenantId()).path("source"));
        return detail;
    }

    @GetMapping("/source-document")
    public org.springframework.http.ResponseEntity<org.springframework.core.io.Resource> sourceDocument() {
        contextProvider.requireCurrent();
        var resource = new org.springframework.core.io.ClassPathResource("catalogs/national-essential-medications-2026.pdf");
        if (!resource.exists()) {
            throw com.rhn.shared.api.BusinessErrors.notFound("STANDARD_CATALOG_DOCUMENT_NOT_FOUND", "官方原件文档不存在");
        }
        return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_TYPE, "application/pdf")
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"national-essential-medications-2026.pdf\"")
                .header(org.springframework.http.HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .eTag("25671de0d85d12e409d79764d48865522e03122d8e9c1b0957a7ad1c8bf97e8e")
                .body(resource);
    }
}
