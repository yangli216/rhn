package com.rhn.outpatient.template;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
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
@RequestMapping("/api/outpatient/note-forms")
@PreAuthorize("hasAnyAuthority('OUTPATIENT_RECEPTION.ACCESS','ROLE_ADMIN')")
class OutpatientNoteFormController {
    private final OutpatientNoteFormService service;
    OutpatientNoteFormController(OutpatientNoteFormService service) { this.service = service; }

    @GetMapping
    List<OutpatientNoteFormContracts.View> list(
            @RequestParam(required = false) String specialtyCode) {
        return service.visible(specialtyCode);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    OutpatientNoteFormContracts.View create(
            @Valid @RequestBody OutpatientNoteFormContracts.CreateRequest input) {
        return service.create(input);
    }

    @PostMapping("/{formCode}/versions")
    @ResponseStatus(HttpStatus.CREATED)
    OutpatientNoteFormContracts.View revise(@PathVariable String formCode,
            @Valid @RequestBody OutpatientNoteFormContracts.ReviseRequest input) {
        return service.revise(formCode, input);
    }
}
