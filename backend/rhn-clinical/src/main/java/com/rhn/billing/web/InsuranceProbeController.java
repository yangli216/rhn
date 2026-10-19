package com.rhn.billing.web;

import com.rhn.billing.api.InsuranceProbeViews.ProbeCapability;
import com.rhn.billing.api.InsuranceProbeViews.ProbeRequest;
import com.rhn.billing.api.InsuranceProbeViews.ProbeStepResult;
import com.rhn.billing.application.InsuranceProbeService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 医保接入向导：接口联通探测。会向医保网关发出真实报文，须独立权限；步骤路径进入平台审计日志。 */
@RestController
@RequestMapping("/api/billing/insurance/probe")
@PreAuthorize("hasAuthority('INSURANCE_PROBE.EXECUTE')")
public class InsuranceProbeController {
    private final InsuranceProbeService service;

    public InsuranceProbeController(InsuranceProbeService service) { this.service = service; }

    @GetMapping("/capability")
    ProbeCapability capability() { return service.capability(); }

    @PostMapping("/steps/{step}")
    ProbeStepResult run(@PathVariable String step, @RequestBody(required = false) ProbeRequest request) { return service.run(step, request); }
}
