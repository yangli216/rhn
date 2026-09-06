package com.rhn.billing.web;

import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.billing.application.InsuranceClaimApplicationService;
import com.rhn.billing.application.InsuranceClaimApplicationService.LineMapping;
import com.rhn.billing.application.InsuranceClaimApplicationService.PreSettleCommand;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoRequest;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels.PersonInfoResponse;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.notFound;

@RestController
@RequestMapping("/api/billing")
public class InsuranceClaimController {
    private final InsuranceClaimApplicationService service;
    private final NationalInsuranceClient nationalInsuranceClient;
    private final SettlementRepository settlements;
    private final SettlementLineRepository settlementLines;
    private final ChargeItemRepository chargeItems;
    private final PatientAccountRepository accounts;
    private final CoverageDirectory coverages;
    private final ExecutionContextProvider contextProvider;

    public InsuranceClaimController(InsuranceClaimApplicationService service,
                                    NationalInsuranceClient nationalInsuranceClient,
                                    SettlementRepository settlements,
                                    SettlementLineRepository settlementLines,
                                    ChargeItemRepository chargeItems,
                                    PatientAccountRepository accounts,
                                    CoverageDirectory coverages,
                                    ExecutionContextProvider contextProvider) {
        this.service = service;
        this.nationalInsuranceClient = nationalInsuranceClient;
        this.settlements = settlements;
        this.settlementLines = settlementLines;
        this.chargeItems = chargeItems;
        this.accounts = accounts;
        this.coverages = coverages;
        this.contextProvider = contextProvider;
    }

    /** 1101 医保人员信息获取与鉴权 */
    @PostMapping("/insurance/person-info")
    PersonInfoResponse queryPersonInfo(@RequestBody PersonInfoRequest input) {
        return nationalInsuranceClient.queryPersonInfo(input);
    }

    /** 快捷门诊医保预结算（自动组装目录映射与患者保障上下文） */
    @PostMapping("/settlements/{settlementId}/insurance/quick-pre-settle")
    @ResponseStatus(HttpStatus.CREATED)
    InsuranceSettlementView quickPreSettle(@PathVariable Long settlementId,
                                          @RequestBody(required = false) QuickPreSettleRequest input) {
        ExecutionContext context = contextProvider.requireCurrent();
        Settlement settlement = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        PatientAccount account = accounts.findByIdAndTenantId(settlement.patientAccountId(), context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));

        String typeCode = input != null && input.insuranceTypeCode() != null && !input.insuranceTypeCode().isBlank()
                ? input.insuranceTypeCode().trim() : "01";
        String region = input != null && input.regionCode() != null && !input.regionCode().isBlank()
                ? input.regionCode().trim() : "360100";
        Long covId = input != null ? input.coverageId() : null;
        var coverage = coverages.requireOrProvisionActive(covId, account.residentId(), LocalDate.now(), typeCode, "江西省城镇职工基本医疗保险");

        List<SettlementLine> lines = settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlementId);
        Map<Long, ChargeItem> chargesById = chargeItems.findAllById(lines.stream().map(SettlementLine::chargeItemId).toList())
                .stream().collect(Collectors.toMap(ChargeItem::id, item -> item));

        List<LineMapping> lineMappings = new ArrayList<>();
        for (SettlementLine line : lines) {
            ChargeItem charge = chargesById.get(line.chargeItemId());
            String hiCode = charge != null && charge.itemCodeSnapshot() != null ? "CHS-" + charge.itemCodeSnapshot() : "CHS-ITEM";
            lineMappings.add(new LineMapping(line.id(), hiCode, Map.of()));
        }

        String orgCode = context.hasWorkContext() ? "ORG-" + context.organizationId() : "ORG-DEFAULT";
        String deptCode = "DEPT-" + account.departmentId();
        String practCode = context.hasWorkContext() ? "DR-" + context.subjectId() : "DR-DEFAULT";
        String digest = "MD5-" + settlement.settlementNo();
        String idempotencyKey = input != null && input.idempotencyKey() != null && !input.idempotencyKey().isBlank()
                ? input.idempotencyKey().trim()
                : "PRE-CHS-" + settlement.settlementNo() + "-" + System.currentTimeMillis();

        return service.preSettle(new PreSettleCommand(settlementId, coverage.id(), idempotencyKey, region,
                coverage.coverageTypeCode(), orgCode, deptCode, practCode, digest, Instant.now(), null,
                context.correlationId(), lineMappings));
    }

    @PostMapping("/settlements/{settlementId}/insurance/pre-settlements")
    @ResponseStatus(HttpStatus.CREATED)
    InsuranceSettlementView preSettle(@PathVariable Long settlementId, @Valid @RequestBody PreSettleRequest input) {
        return service.preSettle(new PreSettleCommand(settlementId, input.coverageId(), input.idempotencyKey(),
                input.regionCode(), input.insuranceTypeCode(), input.organizationCode(), input.departmentCode(),
                input.practitionerCode(), input.diagnosisPayloadDigest(), input.serviceStartedAt(),
                input.serviceEndedAt(), input.correlationId(), input.lines().stream().map(line -> new LineMapping(
                        line.settlementLineId(), line.insuranceItemCode(), line.traceAttributes())).toList()));
    }

    @GetMapping("/insurance-claims/{claimId}")
    InsuranceSettlementView get(@PathVariable Long claimId) { return service.get(claimId); }

    @PostMapping("/insurance-claims/{claimId}/settle")
    InsuranceSettlementView settle(@PathVariable Long claimId, @Valid @RequestBody OperationRequest input) {
        return service.settle(claimId, input.commandCode());
    }

    @PostMapping("/insurance-claims/{claimId}/query")
    InsuranceSettlementView query(@PathVariable Long claimId, @Valid @RequestBody OperationRequest input) {
        return service.query(claimId, input.commandCode());
    }

    @PostMapping("/insurance-claims/{claimId}/reverse")
    InsuranceSettlementView reverse(@PathVariable Long claimId, @Valid @RequestBody ReversalRequest input) {
        return service.reverse(claimId, input.commandCode(), input.reason());
    }

    @GetMapping("/insurance-claims/recovery-worklist")
    List<InsuranceSettlementView> recoveryWorklist(@RequestParam(defaultValue = "50") int limit) {
        return service.recoveryWorklist(limit);
    }

    @PostMapping("/insurance-claims/recovery")
    List<InsuranceClaimApplicationService.RecoveryResult> recover(@Valid @RequestBody RecoveryRequest input) {
        return service.recoverPending(input.batchCode(), input.limit() == null ? 50 : input.limit());
    }

    record PreSettleRequest(
            @NotNull Long coverageId, @NotBlank @Size(max = 128) String idempotencyKey,
            @NotBlank @Size(max = 64) String regionCode,
            @NotBlank @Size(max = 64) String insuranceTypeCode,
            @NotBlank @Size(max = 128) String organizationCode,
            @NotBlank @Size(max = 128) String departmentCode,
            @NotBlank @Size(max = 128) String practitionerCode,
            @NotBlank @Size(max = 128) String diagnosisPayloadDigest,
            Instant serviceStartedAt, Instant serviceEndedAt,
            @Size(max = 128) String correlationId,
            @NotEmpty @Size(max = 500) List<@Valid LineMappingRequest> lines) {}
    record LineMappingRequest(@NotNull Long settlementLineId,
                              @NotBlank @Size(max = 128) String insuranceItemCode,
                              @Size(max = 50) Map<@Size(max = 64) String, @Size(max = 256) String> traceAttributes) {}
    record OperationRequest(@NotBlank @Size(max = 128) String commandCode) {}
    record ReversalRequest(@NotBlank @Size(max = 128) String commandCode,
                           @NotBlank @Size(max = 500) String reason) {}
    record RecoveryRequest(@NotBlank @Size(max = 96) String batchCode,
                           @jakarta.validation.constraints.Min(1)
                           @jakarta.validation.constraints.Max(100) Integer limit) {}
    record QuickPreSettleRequest(Long coverageId, String insuranceTypeCode, String regionCode, String idempotencyKey) {}
}
