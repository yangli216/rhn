package com.rhn.healthcore.validation;

import com.rhn.healthcore.api.ClinicalValidationDirectory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinical-safety")
public class ClinicalValidationController {
    private final ClinicalValidationDirectory validation;

    public ClinicalValidationController(ClinicalValidationDirectory validation) {
        this.validation = validation;
    }

    @GetMapping("/vital-sign-rules")
    ClinicalValidationDirectory.VitalValidationProfile vitalSignRules() {
        return validation.vitalSignsProfile();
    }
}
