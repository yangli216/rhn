package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/outpatient/note-templates")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class OutpatientNoteTemplateController {
    private final OutpatientNoteTemplateService service;
    OutpatientNoteTemplateController(OutpatientNoteTemplateService service) { this.service = service; }

    @GetMapping
    List<OutpatientNoteTemplateContracts.View> list(@RequestParam(required = false) String keyword,
                                                     @RequestParam(required = false) String specialtyCode) {
        return service.visible(keyword, specialtyCode);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OutpatientNoteTemplateContracts.View create(
            @Valid @RequestBody OutpatientNoteTemplateContracts.SaveRequest input) {
        return service.create(input);
    }

    @PutMapping("/{id}")
    OutpatientNoteTemplateContracts.View update(@PathVariable Long id,
            @Valid @RequestBody OutpatientNoteTemplateContracts.UpdateRequest input) {
        return service.update(id, input);
    }

    @PostMapping("/{id}/use")
    OutpatientNoteTemplateContracts.View use(@PathVariable Long id) { return service.markUsed(id); }

    @PostMapping("/{id}/disable")
    OutpatientNoteTemplateContracts.View disable(@PathVariable Long id,
            @Valid @RequestBody OutpatientNoteTemplateContracts.RevisionRequest input) {
        return service.disable(id, input.expectedRevision());
    }
}
