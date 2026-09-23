package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.application.StandardCatalogEntryReviewService;
import com.rhn.platform.masterdata.api.StandardCatalogEntryReview.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/platform/master-data/medication-standard-catalog/editions/{editionId}/entry-reviews")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class StandardCatalogEntryReviewController {
    private final StandardCatalogEntryReviewService service;
    public StandardCatalogEntryReviewController(StandardCatalogEntryReviewService service) {this.service=service;}
    @GetMapping public EntryReviewView view(@PathVariable Long editionId) {return service.view(editionId);}
    @PostMapping("/{entryId}") public EntryReviewEvent change(@PathVariable Long editionId,@PathVariable String entryId,@RequestBody EntryReviewChange input) {return service.change(editionId,entryId,input);}
}
