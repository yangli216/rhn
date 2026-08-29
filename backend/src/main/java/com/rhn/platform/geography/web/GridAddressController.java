package com.rhn.platform.geography.web;

import com.rhn.platform.geography.api.GridAddressNodeView;
import com.rhn.platform.geography.application.GridAddressApplicationService;
import com.rhn.platform.geography.domain.GridAddressLevel;
import com.rhn.platform.geography.domain.GridAddressStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
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
@RequestMapping("/api/platform/grid-addresses")
public class GridAddressController {
    private final GridAddressApplicationService service;

    public GridAddressController(GridAddressApplicationService service) { this.service = service; }

    @GetMapping
    List<GridAddressNodeView> list(@RequestParam(required = false) Integer maxLevel,
                                   @RequestParam(required = false) String query,
                                   @RequestParam(defaultValue = "false") boolean includeInactive) {
        return service.list(maxLevel, query, includeInactive);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    GridAddressNodeView create(@Valid @RequestBody CreateGridAddressRequest request) {
        return service.create(request.parentId(), request.level(), request.code(), request.name(), request.shortName(),
                request.pinyinCode(), request.sortOrder());
    }

    @PutMapping("/{id}")
    GridAddressNodeView update(@PathVariable Long id, @Valid @RequestBody UpdateGridAddressRequest request) {
        return service.update(id, request.expectedRevision(), request.parentId(), request.name(), request.shortName(),
                request.pinyinCode(), request.sortOrder());
    }

    @PostMapping("/{id}/status")
    GridAddressNodeView status(@PathVariable Long id, @Valid @RequestBody GridAddressStatusRequest request) {
        return service.changeStatus(id, request.expectedRevision(), request.status());
    }

    public record CreateGridAddressRequest(Long parentId, @NotNull GridAddressLevel level,
            @NotBlank @Size(max = 32) String code, @NotBlank @Size(max = 120) String name,
            @Size(max = 120) String shortName, @NotBlank @Size(max = 64) String pinyinCode,
            @Min(0) @Max(999999) int sortOrder) {}
    public record UpdateGridAddressRequest(@Min(0) long expectedRevision, Long parentId,
            @NotBlank @Size(max = 120) String name, @Size(max = 120) String shortName,
            @NotBlank @Size(max = 64) String pinyinCode, @Min(0) @Max(999999) int sortOrder) {}
    public record GridAddressStatusRequest(@Min(0) long expectedRevision, @NotNull GridAddressStatus status) {}
}
