package com.rhn.billing.web;

import com.rhn.billing.api.InsuranceReadinessViews.ReadinessReport;
import com.rhn.billing.application.InsuranceReadinessService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 医保接入向导：上线前配置体检，只读且不调用外部医保平台。 */
@RestController
@RequestMapping("/api/billing/insurance/readiness")
@PreAuthorize("hasAuthority('MASTER_DATA.MANAGE')")
public class InsuranceReadinessController {
    private final InsuranceReadinessService service;

    public InsuranceReadinessController(InsuranceReadinessService service) { this.service = service; }

    @GetMapping
    ReadinessReport check() { return service.check(); }
}
