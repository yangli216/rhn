package com.rhn.pharmacy.web;

import com.rhn.pharmacy.api.PharmacyViews.DispenseRouteView;
import com.rhn.pharmacy.application.DispenseRouteApplicationService;
import com.rhn.pharmacy.application.DispenseRouteApplicationService.RouteCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
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

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/pharmacy/dispense-routes")
@PreAuthorize("hasAnyAuthority('PHARMACY_ROUTE.READ','PHARMACY_ROUTE.MANAGE','ROLE_ADMIN')")
public class DispenseRouteController {
    private final DispenseRouteApplicationService service;

    public DispenseRouteController(DispenseRouteApplicationService service) { this.service = service; }

    @GetMapping
    List<DispenseRouteView> list(@RequestParam Long organizationId) { return service.list(organizationId); }

    @PostMapping
    @PreAuthorize("hasAnyAuthority('PHARMACY_ROUTE.MANAGE','ROLE_ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    DispenseRouteView create(@Valid @RequestBody RouteRequest input) { return service.create(input.command()); }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyAuthority('PHARMACY_ROUTE.MANAGE','ROLE_ADMIN')")
    DispenseRouteView update(@PathVariable Long id, @Valid @RequestBody UpdateRouteRequest input) {
        return service.update(id, input.expectedRevision(), input.command());
    }

    record RouteRequest(
            @NotNull Long organizationId,
            @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9_-]*") String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "OUTPATIENT|EMERGENCY|INPATIENT|HOME_CARE") String careSetting,
            Long sourceDepartmentId, @Size(max = 32) String medicationType,
            @NotNull Long targetStockSiteId, boolean active,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @Size(max = 1000) String description) {
        RouteCommand command() { return new RouteCommand(organizationId, code, name, sourceDepartmentId,
                medicationType, careSetting, targetStockSiteId, active, validFrom, validTo, description); }
    }

    record UpdateRouteRequest(
            @NotNull Long expectedRevision, @NotNull Long organizationId,
            @NotBlank @Size(max = 64) @Pattern(regexp = "[A-Za-z0-9][A-Za-z0-9_-]*") String code,
            @NotBlank @Size(max = 200) String name,
            @NotBlank @Pattern(regexp = "OUTPATIENT|EMERGENCY|INPATIENT|HOME_CARE") String careSetting,
            Long sourceDepartmentId, @Size(max = 32) String medicationType,
            @NotNull Long targetStockSiteId, boolean active,
            @NotNull LocalDate validFrom, LocalDate validTo,
            @Size(max = 1000) String description) {
        RouteCommand command() { return new RouteCommand(organizationId, code, name, sourceDepartmentId,
                medicationType, careSetting, targetStockSiteId, active, validFrom, validTo, description); }
    }
}
