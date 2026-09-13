package com.rhn.healthcore.allergy;

import com.rhn.platform.masterdata.api.MedicationTerminologyDirectory;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/allergen-terms")
class AllergenTerminologyController {
    private final MedicationTerminologyDirectory directory;
    private final ExecutionContextProvider contextProvider;

    AllergenTerminologyController(MedicationTerminologyDirectory directory,
                                  ExecutionContextProvider contextProvider) {
        this.directory = directory;
        this.contextProvider = contextProvider;
    }

    @GetMapping
    List<MedicationTerminologyDirectory.AllergenTerm> search(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String query) {
        return directory.searchAllergens(contextProvider.requireCurrent().tenantId(), category, query);
    }
}
