package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.StandardCatalogEditionContracts.*;
import com.rhn.platform.masterdata.api.StandardCatalogReview;
import com.rhn.platform.masterdata.application.StandardCatalogEditionService;
import com.rhn.shared.api.PageResult;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.access.prepost.PreAuthorize;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping("/api/platform/master-data/medication-standard-catalog/editions")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class StandardCatalogEditionController {
    private final StandardCatalogEditionService service;
    public StandardCatalogEditionController(StandardCatalogEditionService service) {this.service=service;}
    @GetMapping("/runtime") public Edition runtime() {return service.current();}
    @GetMapping public PageResult<Edition> list(@RequestParam(defaultValue="0") int page) {return service.list(page);}
    @PostMapping public Detail register(@RequestBody Import input) {return service.register(input);}
    @GetMapping("/{id}") public Detail detail(@PathVariable Long id,@RequestParam(defaultValue="0") int reviewPage) {return service.detail(id,reviewPage);}
    @GetMapping("/{id}/original") public Original original(@PathVariable Long id) {return service.original(id);}
    @GetMapping("/{id}/content") public JsonNode content(@PathVariable Long id) {return service.content(id);}
    @GetMapping("/{id}/comparison") public Comparison compare(@PathVariable Long id,@RequestParam(defaultValue="0") Long base,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="ALL") String group) {return service.compare(id,base,page,group);}
    @GetMapping("/{id}/dependencies") public Dependencies dependencies(@PathVariable Long id,@RequestParam(defaultValue="0") int page) {return service.dependencies(id,page);}
    @PostMapping("/{id}/source-review") public Detail review(@PathVariable Long id,@RequestBody StandardCatalogReview.Change input) {return service.review(id,input);}
}
