package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ItemAliasCommands.ReplaceItemAliasesCommand;
import com.rhn.platform.masterdata.api.MedicationAliasViews.MedicationAliasView;
import com.rhn.platform.masterdata.application.MedicationAliasApplicationService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform/master-data/medications/{medicationId}/aliases")
public class MedicationAliasController {
    private final MedicationAliasApplicationService service;

    public MedicationAliasController(MedicationAliasApplicationService service) { this.service = service; }

    @GetMapping
    List<MedicationAliasView> list(@PathVariable Long medicationId) {
        return service.list(medicationId);
    }

    @PutMapping
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    List<MedicationAliasView> replace(@PathVariable Long medicationId,
                                      @Valid @RequestBody ReplaceItemAliasesCommand request) {
        return service.replace(medicationId, request.aliases());
    }
}
