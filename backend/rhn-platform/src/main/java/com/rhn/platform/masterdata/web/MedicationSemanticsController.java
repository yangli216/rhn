package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.MedicationSemanticDirectory.*;
import com.rhn.platform.masterdata.application.MedicationSemanticsService;
import com.rhn.platform.masterdata.infrastructure.ClinicalSemanticHistory.Version;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data")
public class MedicationSemanticsController {
    private final MedicationSemanticsService service;
    public MedicationSemanticsController(MedicationSemanticsService service) { this.service = service; }

    @GetMapping("/medication-ingredients")
    public List<Ingredient> ingredients() { return service.ingredients(); }

    @PostMapping("/medication-ingredients")
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public Ingredient create(@Valid @RequestBody IngredientInput value) {
        return service.createIngredient(value.code(), value.display(), value.system(), value.systemVersion(), value.source());
    }

    @GetMapping("/medications/{id}/composition")
    public Composition composition(@PathVariable Long id) { return service.composition(id); }

    @PutMapping("/medications/{id}/composition")
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    public Composition save(@PathVariable Long id, @RequestBody Composition value) { return service.saveComposition(id, value); }

    @GetMapping("/medications/{id}/semantic-history")
    public List<Version> history(@PathVariable Long id) { return service.medicationHistory(id); }

    public record IngredientInput(@NotBlank @Size(max=64) String code, @NotBlank @Size(max=160) String display,
                                  @NotBlank @Size(max=160) String system, @NotBlank @Size(max=64) String systemVersion,
                                  @NotBlank @Size(max=256) String source) {}
}
