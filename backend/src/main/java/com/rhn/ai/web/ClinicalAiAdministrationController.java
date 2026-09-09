package com.rhn.ai.web;

import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationTestRequest;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationTestResult;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.ConfigurationView;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.Scope;
import com.rhn.ai.api.ClinicalAiAdministrationContracts.UpdateRequest;
import com.rhn.ai.application.ClinicalAiAdministrationService;
import com.rhn.shared.api.BusinessException;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/administration/configuration")
@PreAuthorize("hasAuthority(T(com.rhn.ai.api.ClinicalAiConfigurationPermissions).MANAGE)")
public class ClinicalAiAdministrationController {
    private final ClinicalAiAdministrationService service;

    public ClinicalAiAdministrationController(ClinicalAiAdministrationService service) {
        this.service = service;
    }

    @GetMapping
    ConfigurationView configuration(@RequestParam(defaultValue = "TENANT") String scope) {
        return service.configuration(parseScope(scope));
    }

    @PutMapping
    ConfigurationView update(@Valid @RequestBody UpdateRequest request) {
        return service.update(request);
    }

    @PostMapping("/test")
    ConfigurationTestResult test(@Valid @RequestBody ConfigurationTestRequest request) {
        return service.test(request);
    }

    private Scope parseScope(String scope) {
        try {
            return Scope.valueOf(scope.trim().toUpperCase());
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new BusinessException("AI_CONFIGURATION_SCOPE_RESTRICTED",
                    "AI 参数仅允许平台和租户作用域", HttpStatus.BAD_REQUEST);
        }
    }
}
