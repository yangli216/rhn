package com.rhn.billing.web;

import com.rhn.billing.api.InsuranceDebugViews.*;
import com.rhn.billing.application.InsuranceDebugClaimService;
import com.rhn.billing.application.InsuranceDebugService;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

/** 医保接入向导：调试控制台。配置与记录读取使用独立权限；原始报文另需 INSURANCE_DEBUG.RAW。 */
@RestController
@RequestMapping("/api/billing/insurance/debug")
public class InsuranceDebugController {
    private final InsuranceDebugService service;
    private final InsuranceDebugClaimService claimService;

    public InsuranceDebugController(InsuranceDebugService service, InsuranceDebugClaimService claimService) {
        this.service = service; this.claimService = claimService;
    }

    @GetMapping("/settings")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.VIEW','INSURANCE_DEBUG.CONFIGURE','INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    DebugSettingsView settings() { return service.settings(); }

    @PutMapping("/settings")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.CONFIGURE','ROLE_ADMIN')")
    DebugSettingsView update(@RequestBody UpdateDebugSettings request) { return service.update(request); }

    @GetMapping("/exchanges")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.VIEW','INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    ExchangePage exchanges(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
                           @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to,
                           @RequestParam(required = false) String infno, @RequestParam(required = false) String outcome,
                           @RequestParam(required = false) String keyword, @RequestParam(defaultValue = "false") boolean failedOnly,
                           @RequestParam(required = false) String claimId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return service.exchanges(from, to, infno, outcome, keyword, failedOnly, claimId, page, size);
    }

    @GetMapping("/exchanges/{id}")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.VIEW','INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    ExchangeDetail exchange(@PathVariable String id) { return service.exchange(id); }

    @GetMapping("/claims/attention")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.VIEW','INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    List<ClaimAttentionView> attention(@RequestParam(defaultValue = "50") int limit) { return claimService.attention(limit); }

    @PostMapping("/claims/{claimId}/query")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    ClaimActionResult query(@PathVariable String claimId) { return claimService.query(claimId); }

    @PostMapping("/claims/{claimId}/reverse")
    @PreAuthorize("hasAnyAuthority('INSURANCE_DEBUG.REVERSE','ROLE_ADMIN')")
    ClaimActionResult reverse(@PathVariable String claimId, @RequestBody ReverseClaimRequest request) {
        return claimService.reverse(claimId, request);
    }
}
