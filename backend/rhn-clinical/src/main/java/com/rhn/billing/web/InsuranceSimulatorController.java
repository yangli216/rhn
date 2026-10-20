package com.rhn.billing.web;

import com.rhn.billing.application.InsuranceSimulatorService;
import com.rhn.billing.application.InsuranceSimulatorService.SimulatorView;
import io.swagger.v3.oas.annotations.Hidden;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 医保联调模拟场景开关与测试人员清单；仅供联调环境的前端判断是否显示模拟入口，不进入对外 OpenAPI 契约。 */
@Hidden
@RestController
@RequestMapping("/api/billing/insurance/simulator")
public class InsuranceSimulatorController {
    private final InsuranceSimulatorService service;

    public InsuranceSimulatorController(InsuranceSimulatorService service) { this.service = service; }

    @GetMapping
    SimulatorView view() { return service.view(); }
}
