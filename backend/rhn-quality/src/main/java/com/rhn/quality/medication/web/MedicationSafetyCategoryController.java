package com.rhn.quality.medication.web;

import com.rhn.quality.medication.api.MedicationSafetyCategoryContracts.*;
import com.rhn.quality.medication.application.MedicationSafetyCategoryService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quality/medication-safety/categories")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class MedicationSafetyCategoryController {
    private final MedicationSafetyCategoryService service;

    public MedicationSafetyCategoryController(MedicationSafetyCategoryService service) {
        this.service = service;
    }

    @GetMapping
    public List<CategoryView> list(
            @RequestParam(required = false) String query,
            @RequestParam(required = false) String ruleKind
    ) {
        return service.listCategories(query, ruleKind);
    }

    @GetMapping("/{id}")
    public CategoryView get(@PathVariable Long id) {
        return service.getCategory(id);
    }

    @PostMapping
    public CategoryView create(@RequestBody CreateCategoryRequest request) {
        return service.createCategory(request);
    }

    @PutMapping("/{id}")
    public CategoryView update(@PathVariable Long id, @RequestBody UpdateCategoryRequest request) {
        return service.updateCategory(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.deleteCategory(id);
    }

    @GetMapping("/{id}/members")
    public List<MemberView> listMembers(
            @PathVariable Long id,
            @RequestParam(required = false) String query
    ) {
        return service.listMembers(id, query);
    }

    @PostMapping("/{id}/members")
    public int addMembers(@PathVariable Long id, @RequestBody AddMembersRequest request) {
        return service.addMembers(id, request);
    }

    @DeleteMapping("/{id}/members/{memberId}")
    public void removeMember(@PathVariable Long id, @PathVariable Long memberId) {
        service.removeMember(id, memberId);
    }

    @GetMapping("/by-medication")
    public List<MedicationTagView> listTags(
            @RequestParam(required = false) Long medicationId,
            @RequestParam(required = false) String name
    ) {
        return service.listTagsForMedication(medicationId, name);
    }

    @GetMapping("/standard-catalog-categories")
    public List<StandardCatalogCategorySummary> listStandardCatalogCategories() {
        return service.listStandardCatalogCategories();
    }

    @GetMapping("/standard-catalog-candidates")
    public List<MemberItem> searchStandardCatalogCandidates(
            @RequestParam(required = false) String major,
            @RequestParam String sub,
            @RequestParam(required = false, defaultValue = "false") Boolean systemicOnly,
            @RequestParam(required = false) Long excludeCategoryId
    ) {
        return service.searchMedicationsByStandardCatalog(major, sub, systemicOnly, excludeCategoryId);
    }

    @PostMapping("/{id}/import-from-catalog")
    public CatalogImportResult importFromCatalog(
            @PathVariable Long id,
            @RequestBody CatalogImportRequest request
    ) {
        return service.importFromCatalog(id, request);
    }
}
