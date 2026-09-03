package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceResultDirectory.InsuranceClaimLineView;
import com.rhn.billing.api.InsuranceResultDirectory.InsuranceClaimResponseView;
import com.rhn.billing.api.InsuranceResultDirectory.InsuranceSettlementView;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceLine;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceQuery;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.InsuranceClaimLine;
import com.rhn.billing.domain.InsuranceClaimResponse;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InsuranceClaimLineRepository;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.InsuranceClaimResponseRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
class InsuranceClaimTransactionService {
    private final InsuranceClaimRepository claims;
    private final InsuranceClaimLineRepository claimLines;
    private final InsuranceClaimResponseRepository responses;
    private final SettlementRepository settlements;
    private final SettlementLineRepository settlementLines;
    private final ChargeItemRepository charges;
    private final PatientAccountRepository accounts;
    private final CoverageDirectory coverages;
    private final SettlementApplicationService settlementService;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec json;

    InsuranceClaimTransactionService(InsuranceClaimRepository claims, InsuranceClaimLineRepository claimLines,
                                     InsuranceClaimResponseRepository responses, SettlementRepository settlements,
                                     SettlementLineRepository settlementLines, ChargeItemRepository charges,
                                     PatientAccountRepository accounts, CoverageDirectory coverages,
                                     SettlementApplicationService settlementService,
                                     ExecutionContextProvider contextProvider, JsonCodec json) {
        this.claims = claims; this.claimLines = claimLines; this.responses = responses; this.settlements = settlements;
        this.settlementLines = settlementLines; this.charges = charges; this.accounts = accounts;
        this.coverages = coverages; this.settlementService = settlementService;
        this.contextProvider = contextProvider; this.json = json;
    }

    @Transactional
    CreateResult create(CreateCommand input) {
        ExecutionContext context = requireContext();
        String command = required(input.idempotencyKey(), "INSURANCE_COMMAND_REQUIRED", "医保预结算必须提供幂等编码");
        InsuranceClaim replay = claims.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (replay != null) return new CreateResult(verifyReplay(replay, input), true);
        Settlement settlement = settlements.findByIdAndTenantId(input.settlementId(), context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (!"PRICED".equals(settlement.status())) {
            throw conflict("INSURANCE_SETTLEMENT_STATE_INVALID", "医保预结算必须在收款前完成");
        }
        if (claims.findByTenantIdAndSettlementId(context.tenantId(), settlement.id()).isPresent()) {
            throw conflict("INSURANCE_CLAIM_ALREADY_EXISTS", "当前结算单已经存在医保申请");
        }
        PatientAccount account = requireAccount(context, settlement.patientAccountId());
        CoverageDirectory.CoverageView coverage = coverages.requireActive(input.coverageId(), account.residentId(),
                input.serviceStartedAt() == null ? LocalDate.now() : input.serviceStartedAt().atZone(
                        java.time.ZoneId.systemDefault()).toLocalDate());
        String insuranceType = required(input.insuranceTypeCode(), "INSURANCE_TYPE_REQUIRED", "医保类型不能为空").toUpperCase();
        if (!coverage.coverageTypeCode().equalsIgnoreCase(insuranceType)) {
            throw conflict("INSURANCE_COVERAGE_TYPE_MISMATCH", "医保申请类型与患者保障类型不一致");
        }
        List<com.rhn.billing.domain.SettlementLine> values = settlementLines
                .findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlement.id());
        Map<Long, LineMapping> mappings = mapping(input.lines(), values.size());
        Map<Long, ChargeItem> byId = charges.findAllById(values.stream().map(
                com.rhn.billing.domain.SettlementLine::chargeItemId).toList()).stream()
                .collect(Collectors.toMap(ChargeItem::id, value -> value));
        InsuranceClaim claim = claims.save(new InsuranceClaim(context.tenantId(), settlement.id(), account.id(),
                coverage.id(), command, upper(input.regionCode(), "INSURANCE_REGION_REQUIRED", "医保统筹区不能为空"),
                insuranceType, coverage.payerName(), required(input.organizationCode(), "INSURANCE_ORG_CODE_REQUIRED", "医保机构编码不能为空"),
                required(input.departmentCode(), "INSURANCE_DEPT_CODE_REQUIRED", "医保科室编码不能为空"),
                required(input.practitionerCode(), "INSURANCE_PRACTITIONER_CODE_REQUIRED", "医保医师编码不能为空"),
                required(input.diagnosisPayloadDigest(), "INSURANCE_DIAGNOSIS_DIGEST_REQUIRED", "诊断摘要不能为空"),
                Objects.requireNonNullElseGet(input.serviceStartedAt(), java.time.Instant::now), input.serviceEndedAt(),
                money(settlement.netAmount()), settlement.currencyCode(), clean(input.correlationId()) == null
                ? context.correlationId() : clean(input.correlationId()), context.subjectId()));
        for (var line : values) {
            LineMapping mapping = mappings.get(line.id());
            if (mapping == null) throw badRequest("INSURANCE_LINE_MAPPING_INCOMPLETE", "每条结算明细都必须提供医保目录映射");
            ChargeItem charge = byId.get(line.chargeItemId());
            claimLines.save(new InsuranceClaimLine(context.tenantId(), claim.id(), line.id(), line.lineNo(),
                    charge.itemCodeSnapshot(), required(mapping.insuranceItemCode(), "INSURANCE_ITEM_CODE_REQUIRED", "医保目录编码不能为空"),
                    charge.itemNameSnapshot(), category(charge), line.settledQuantity(), charge.unitPrice(),
                    money(line.netAmount()), json.write(mapping.traceAttributes() == null ? Map.of() : mapping.traceAttributes())));
        }
        return new CreateResult(claim, false);
    }

    @Transactional
    InsuranceClaim prepareSettlement(Long claimId) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = lock(claimId, context);
        try { value.prepareSettlement(); }
        catch (IllegalStateException exception) { throw conflict("INSURANCE_CLAIM_STATE_INVALID", exception.getMessage()); }
        return value;
    }

    @Transactional
    InsuranceClaim prepareReversal(Long claimId, String reason) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = lock(claimId, context);
        try { value.prepareReversal(reason); }
        catch (IllegalStateException exception) { throw conflict("INSURANCE_CLAIM_STATE_INVALID", exception.getMessage()); }
        return value;
    }

    @Transactional
    ApplyResult apply(Long claimId, String operation, InsuranceResult result, String commandCode,
                      Long externalMessageId, boolean duplicate) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = lock(claimId, context);
        String command = required(commandCode, "INSURANCE_RESULT_COMMAND_REQUIRED", "医保结果命令编码不能为空");
        InsuranceClaimResponse replay = responses.findByTenantIdAndClaimIdAndCommandCode(
                context.tenantId(), value.id(), command).orElse(null);
        if (replay != null) return new ApplyResult(value, replay, true);
        try { value.apply(operation, result); }
        catch (IllegalStateException exception) { throw conflict("INSURANCE_RESULT_INVALID", exception.getMessage()); }
        InsuranceClaimResponse response = responses.save(new InsuranceClaimResponse(context.tenantId(), value.id(),
                externalMessageId, command, operation, result));
        if ("SETTLE".equals(value.currentOperation()) && "SETTLED".equals(value.status())) {
            settlementService.recordInsuranceResponse(context, value.settlementId(), response.id(), value.regionCode(),
                    value.payerName(), value.insuranceFundAmount(), value.personalAccountAmount(), value.patientCashAmount(),
                    value.otherFundAmount(), response.respondedAt());
        } else if ("REVERSE".equals(value.currentOperation()) && "REVERSED".equals(value.status())) {
            InsuranceClaimResponse settled = responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(
                            context.tenantId(), value.id()).stream()
                    .filter(item -> "SETTLE".equals(item.operation()) && "SUCCEEDED".equals(item.status()))
                    .findFirst().orElseThrow(() -> conflict("INSURANCE_SETTLEMENT_RESPONSE_MISSING",
                            "医保冲正缺少原正式结算成功结果"));
            settlementService.recordInsuranceReversal(context, value.settlementId(), settled.id(), response.id(),
                    value.regionCode(), value.payerName(), value.insuranceFundAmount(), value.personalAccountAmount(),
                    value.otherFundAmount(), response.respondedAt());
        }
        return new ApplyResult(value, response, duplicate);
    }

    @Transactional(readOnly = true)
    InsuranceInstruction instruction(Long claimId) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = require(claimId, context);
        Settlement settlement = settlements.findByIdAndTenantId(value.settlementId(), context.tenantId()).orElseThrow();
        PatientAccount account = requireAccount(context, value.patientAccountId());
        Map<Long, Long> chargeBySettlementLine = settlementLines
                .findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), value.settlementId()).stream()
                .collect(Collectors.toMap(com.rhn.billing.domain.SettlementLine::id,
                        com.rhn.billing.domain.SettlementLine::chargeItemId));
        List<InsuranceLine> lines = claimLines.findByTenantIdAndClaimIdOrderByLineNoAsc(context.tenantId(), value.id())
                .stream().map(line -> new InsuranceLine(line.settlementLineId(), chargeBySettlementLine.get(line.settlementLineId()), line.itemCode(),
                        line.insuranceItemCode(), line.itemName(), line.quantity(), line.unitPrice(), line.claimedAmount(),
                        line.categoryCode(), trace(line.traceAttributesJson()))).toList();
        return new InsuranceInstruction(value.id(), settlement.id(), settlement.settlementNo(), value.commandCode(), account.id(),
                account.residentId(), account.encounterId(), value.coverageId(), value.regionCode(), value.insuranceTypeCode(),
                value.organizationCode(), value.departmentCode(), value.practitionerCode(), value.serviceStartedAt(),
                value.serviceEndedAt(), value.diagnosisPayloadDigest(), lines, value.grossAmount(), value.currencyCode(),
                value.correlationId());
    }

    @Transactional(readOnly = true)
    InsuranceQuery queryInstruction(Long claimId) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = require(claimId, context);
        return new InsuranceQuery(value.id(), value.claimNo(), value.currentOperation(), value.regionCode(),
                value.insuranceTypeCode(), value.externalPreSettlementNo(), value.externalSettlementNo(), value.correlationId());
    }

    @Transactional(readOnly = true)
    InsuranceReversal reversalInstruction(Long claimId, String commandCode) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = require(claimId, context);
        if (!"REVERSE".equals(value.currentOperation()) || value.externalSettlementNo() == null) {
            throw conflict("INSURANCE_REVERSAL_NOT_READY", "医保申请尚未具备冲正条件");
        }
        Settlement settlement = settlements.findByIdAndTenantId(value.settlementId(), context.tenantId()).orElseThrow();
        return new InsuranceReversal(value.id(), settlement.id(), settlement.settlementNo(), commandCode,
                value.regionCode(), value.insuranceTypeCode(), value.externalSettlementNo(), value.grossAmount(),
                value.reversalReason(), value.correlationId());
    }

    @Transactional(readOnly = true)
    InsuranceClaim requireBySettlementNo(String settlementNo) {
        ExecutionContext context = requireContext();
        Settlement settlement = settlements.findByTenantIdAndSettlementNo(context.tenantId(), required(settlementNo,
                        "SETTLEMENT_NO_REQUIRED", "结算单号不能为空"))
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        InsuranceClaim value = claims.findByTenantIdAndSettlementId(context.tenantId(), settlement.id())
                .orElseThrow(() -> notFound("INSURANCE_CLAIM_NOT_FOUND", "未找到医保申请"));
        require(value.id(), context); return value;
    }

    @Transactional(readOnly = true)
    boolean responseApplied(Long claimId, String commandCode) {
        ExecutionContext context = requireContext(); require(claimId, context);
        return responses.findByTenantIdAndClaimIdAndCommandCode(context.tenantId(), claimId,
                required(commandCode, "INSURANCE_RESULT_COMMAND_REQUIRED", "医保结果命令编码不能为空")).isPresent();
    }

    @Transactional(readOnly = true)
    List<InsuranceSettlementView> recoveryWorklist(int limit) {
        ExecutionContext context = requireContext();
        return claims.findRecoveryWorklist(context.tenantId(), context.organizationId(), context.departmentId(),
                        List.of("PRE_SETTLEMENT_PENDING", "SETTLEMENT_PENDING", "REVERSAL_PENDING"),
                        PageRequest.of(0, Math.max(1, Math.min(limit, 100))))
                .stream().map(value -> view(value.id(), false)).toList();
    }

    @Transactional(readOnly = true)
    InsuranceSettlementView view(Long claimId, boolean duplicate) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = require(claimId, context);
        Settlement settlement = settlements.findByIdAndTenantId(value.settlementId(), context.tenantId()).orElseThrow();
        List<InsuranceClaimLineView> lineViews = claimLines.findByTenantIdAndClaimIdOrderByLineNoAsc(context.tenantId(), value.id())
                .stream().map(line -> new InsuranceClaimLineView(line.id(), line.settlementLineId(), line.lineNo(),
                        line.itemCode(), line.insuranceItemCode(), line.itemName(), line.categoryCode(), line.quantity(),
                        line.unitPrice(), line.claimedAmount(), line.approvedAmount(), line.rejectionCode())).toList();
        List<InsuranceClaimResponseView> responseViews = responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(
                        context.tenantId(), value.id()).stream().map(response -> new InsuranceClaimResponseView(response.id(),
                        response.externalMessageId(), response.responseNo(), response.commandCode(), response.operation(),
                        response.status(), response.externalSettlementNo(), response.insuranceFundAmount(),
                        response.personalAccountAmount(), response.patientCashAmount(), response.otherFundAmount(),
                        response.errorCode(), response.errorMessage(), response.respondedAt())).toList();
        return new InsuranceSettlementView(value.id(), value.revision(), settlement.id(), value.patientAccountId(),
                value.coverageId(), value.claimNo(), settlement.settlementNo(), value.status(), value.currentOperation(),
                value.regionCode(), value.insuranceTypeCode(), value.externalPreSettlementNo(), value.externalSettlementNo(),
                value.grossAmount(), value.insuranceFundAmount(), value.personalAccountAmount(), value.patientCashAmount(),
                value.otherFundAmount(), value.currencyCode(), value.reversalReason(), value.reversedAt(),
                value.errorCode(), value.errorMessage(), duplicate,
                lineViews, responseViews);
    }

    private InsuranceClaim verifyReplay(InsuranceClaim value, CreateCommand input) {
        if (!value.settlementId().equals(input.settlementId()) || !value.coverageId().equals(input.coverageId())
                || !value.regionCode().equalsIgnoreCase(clean(input.regionCode()))
                || !value.insuranceTypeCode().equalsIgnoreCase(clean(input.insuranceTypeCode()))) {
            throw conflict("INSURANCE_IDEMPOTENCY_MISMATCH", "幂等编码已用于不同医保申请");
        }
        return value;
    }
    private InsuranceClaim lock(Long id, ExecutionContext context) {
        InsuranceClaim value = claims.lockByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("INSURANCE_CLAIM_NOT_FOUND", "未找到医保申请"));
        requireAccount(context, value.patientAccountId()); return value;
    }
    private InsuranceClaim require(Long id, ExecutionContext context) {
        InsuranceClaim value = claims.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("INSURANCE_CLAIM_NOT_FOUND", "未找到医保申请"));
        requireAccount(context, value.patientAccountId()); return value;
    }
    private PatientAccount requireAccount(ExecutionContext context, Long id) {
        PatientAccount account = accounts.findByIdAndTenantId(id, context.tenantId())
                .orElseThrow(() -> notFound("PATIENT_ACCOUNT_NOT_FOUND", "未找到患者费用账户"));
        if (!context.hasWorkContext() || !context.canAccessOrganization(account.organizationId())) {
            throw forbidden("INSURANCE_CLAIM_FORBIDDEN", "当前工作上下文不能访问该医保申请");
        }
        return account;
    }
    private Map<Long, LineMapping> mapping(List<LineMapping> values, int expected) {
        if (values == null || values.size() != expected) throw badRequest("INSURANCE_LINE_MAPPING_INCOMPLETE", "医保目录映射数量与结算明细不一致");
        try { return values.stream().collect(Collectors.toMap(LineMapping::settlementLineId, value -> value)); }
        catch (IllegalStateException exception) { throw badRequest("INSURANCE_LINE_MAPPING_DUPLICATE", "医保目录映射包含重复结算行"); }
    }
    private Map<String, String> trace(String value) {
        Map<String, Object> source = json.readObject(value == null ? "{}" : value);
        Map<String, String> result = new LinkedHashMap<>(); source.forEach((key, item) -> result.put(key, String.valueOf(item)));
        return result;
    }
    private String category(ChargeItem value) { return "REGISTRATION".equals(value.sourceType()) ? "REGISTRATION" : "MEDICATION"; }
    private String required(String value, String code, String message) {
        String result = clean(value); if (result == null || result.length() > 128) throw badRequest(code, message); return result;
    }
    private String upper(String value, String code, String message) { return required(value, code, message).toUpperCase(); }
    private String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext() || context.departmentId() == null) throw forbidden(
                "BILLING_WORK_CONTEXT_REQUIRED", "医保结算前必须选择工作机构和科室");
        return context;
    }

    record CreateCommand(Long settlementId, Long coverageId, String idempotencyKey, String regionCode,
                         String insuranceTypeCode, String organizationCode, String departmentCode,
                         String practitionerCode, String diagnosisPayloadDigest,
                         java.time.Instant serviceStartedAt, java.time.Instant serviceEndedAt,
                         String correlationId, List<LineMapping> lines) {}
    record LineMapping(Long settlementLineId, String insuranceItemCode, Map<String, String> traceAttributes) {}
    record CreateResult(InsuranceClaim claim, boolean duplicate) {}
    record ApplyResult(InsuranceClaim claim, InsuranceClaimResponse response, boolean duplicate) {}
}
