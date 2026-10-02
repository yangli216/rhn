package com.rhn.platform.masterdata.web;

import com.rhn.platform.masterdata.api.ItemAliasCommands.ReplaceItemAliasesCommand;
import com.rhn.platform.masterdata.api.ItemAliasViews.ItemAliasView;
import com.rhn.platform.masterdata.application.ItemAliasApplicationService;
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
@RequestMapping("/api/platform/master-data/services/{catalogItemId}/aliases")
public class ItemAliasController {
    private final ItemAliasApplicationService service;

    public ItemAliasController(ItemAliasApplicationService service) { this.service = service; }

    @GetMapping
    List<ItemAliasView> list(@PathVariable Long catalogItemId) {
        return service.list(catalogItemId);
    }

    @PutMapping
    @PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
    List<ItemAliasView> replace(@PathVariable Long catalogItemId,
                                @Valid @RequestBody ReplaceItemAliasesCommand request) {
        return service.replace(catalogItemId, request.aliases());
    }
}
