package com.rhn.healthcore.allergy;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/residents/{residentId}/allergies")
class AllergyController {
    private final AllergyService service;

    AllergyController(AllergyService service) { this.service = service; }

    @GetMapping
    List<AllergyResponse> list(@PathVariable Long residentId,
                               @RequestParam(defaultValue = "true") boolean activeOnly) {
        return service.list(residentId, activeOnly);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    AllergyResponse record(@PathVariable Long residentId, @Valid @RequestBody RecordAllergyRequest request) {
        return service.record(residentId, request);
    }

    @PostMapping("/{allergyId}/inactivate")
    AllergyResponse inactivate(@PathVariable Long residentId, @PathVariable Long allergyId,
                               @Valid @RequestBody InactivateAllergyRequest request) {
        return service.inactivate(residentId, allergyId, request);
    }
}
