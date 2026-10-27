package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory;
import com.rhn.outpatient.api.OutpatientPermissions;
import com.rhn.platform.masterdata.api.ExaminationOrderSearchDirectory;
import com.rhn.platform.masterdata.api.ExaminationOrderSearchDirectory.ExaminationOrderSearchResult;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.ZoneId;

@RestController
@RequestMapping("/api/encounters/{encounterId}/service-requests")
@PreAuthorize(OutpatientPermissions.ORDERING_ACCESS)
class ExaminationOrderSearchController {
    private final EncounterDirectory encounters;
    private final ExaminationOrderSearchDirectory search;

    ExaminationOrderSearchController(EncounterDirectory encounters, ExaminationOrderSearchDirectory search) {
        this.encounters = encounters; this.search = search;
    }

    @GetMapping("/examination-search")
    @io.swagger.v3.oas.annotations.Operation(operationId = "searchOutpatientExaminationOrders")
    ExaminationOrderSearchResult search(@PathVariable Long encounterId, @RequestParam String query) {
        var encounter = encounters.requireActiveForOrdering(encounterId);
        return search.search(encounter.organizationId(), LocalDate.now(ZoneId.of("Asia/Shanghai")), query);
    }
}
