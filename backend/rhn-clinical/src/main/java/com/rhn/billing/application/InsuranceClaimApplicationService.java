package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceResultDirectory;
import com.rhn.billing.api.InsuranceSettlementAdapter;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceInstruction;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceQuery;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceReversal;
import com.rhn.billing.api.InsuranceSettlementAdapter.InsuranceResult;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.infrastructure.insurance.chs.ChsModels;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.idempotency.CommandCodes;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;

@Service
public class InsuranceClaimApplicationService implements InsuranceResultDirectory {
    private final InsuranceClaimTransactionService transactions;
    private final List<InsuranceSettlementAdapter> adapters;
    private final ExternalMessageService messages;
    private final ExecutionContextProvider contextProvider;
    private final NationalInsuranceClient nationalInsuranceClient;

    InsuranceClaimApplicationService(InsuranceClaimTransactionService transactions,
                                     List<InsuranceSettlementAdapter> adapters,
                                     ExternalMessageService messages, ExecutionContextProvider contextProvider,
                                     NationalInsuranceClient nationalInsuranceClient) {
        this.transactions = transactions; this.adapters = List.copyOf(adapters);
        this.messages = messages; this.contextProvider = contextProvider;
        this.nationalInsuranceClient = nationalInsuranceClient;
    }

    private com.rhn.healthcore.api.ResidentDirectory residents;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setResidents(com.rhn.healthcore.api.ResidentDirectory residents) { this.residents = residents; }

    private RegistrationBillingService registrations;

    /** 挂号结算单被医保资金结清时没有支付指令触发建就诊，由本服务在医保结算成功后补触发；缺省（如单测）不触发。 */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setRegistrations(RegistrationBillingService registrations) { this.registrations = registrations; }

    private InsuranceSettlementView afterSettle(InsuranceSettlementView view) {
        if (registrations != null && "SETTLED".equals(view.status())) {
            try { registrations.completeIfSettled(view.settlementId()); }
            catch (RuntimeException exception) {
                org.slf4j.LoggerFactory.getLogger(InsuranceClaimApplicationService.class).warn(
                        "Insurance settlement {} succeeded but registration completion failed", view.settlementId(), exception);
            }
        }
        return view;
    }

    /** 1101 医保人员信息获取与鉴权（对外契约，屏蔽 CHS 专网报文模型）。 */
    public PersonInfoView queryPersonInfo(PersonInfoQuery query) {
        var response = nationalInsuranceClient.queryPersonInfo(
                new ChsModels.PersonInfoRequest(query.certType(), query.certNo(), query.personName()));
        return new PersonInfoView(response.psnNo(), response.psnCertType(), response.certno(), response.psnName(),
                response.gender(), response.birthday(), response.insutype(), response.insutypeName(), response.balc(),
                response.insuOptins(), response.insuOptinsName(), response.psnType(), response.status());
    }

    /** 1101 按患者档案鉴权：以档案身份证号与姓名发起，并核对医保端返回的姓名、证件号与档案一致。 */
    public PersonInfoView queryPersonInfoByResident(Long residentId) {
        if (residents == null) throw badRequest("RESIDENT_DIRECTORY_UNAVAILABLE", "患者档案服务不可用，无法自动鉴权");
        var snapshot = residents.requireSnapshot(residentId);
        String nationalId = residents.findNationalId(residentId).orElseThrow(() -> badRequest("RESIDENT_NATIONAL_ID_MISSING",
                "患者档案缺少身份证号，请补录证件或改用医保电子凭证/社保卡读取"));
        var view = queryPersonInfo(new PersonInfoQuery("01", nationalId, snapshot.fullName()));
        if (view.personName() != null && !view.personName().trim().equals(snapshot.fullName().trim())) {
            throw badRequest("INSURANCE_PERSON_NAME_MISMATCH",
                    "医保登记姓名与患者档案姓名不一致（医保：" + view.personName() + "，档案：" + snapshot.fullName() + "），请核对身份");
        }
        if (view.certNo() != null && !view.certNo().isBlank() && !view.certNo().trim().equalsIgnoreCase(nationalId.trim())) {
            throw badRequest("INSURANCE_PERSON_CERT_MISMATCH", "医保登记证件号与患者档案不一致，请核对身份");
        }
        return view;
    }

    /** 快捷门诊医保预结算：自动组装患者保障上下文、执行范围与目录映射后转入标准预结算流程。 */
    public InsuranceSettlementView quickPreSettle(Long settlementId, Long coverageId, String insuranceTypeCode,
                                                 String regionCode, String idempotencyKey) {
        ExecutionContext context = contextProvider.requireCurrent();
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.trim().length() > 128) {
            throw badRequest("INSURANCE_COMMAND_REQUIRED", "医保预结算必须提供有效的幂等编码，请沿用原请求编号重试");
        }
        // 已有医保申请（如页面刷新后幂等编码丢失）时直接返回现有申请，由调用方按其状态/失败原因继续。
        var existing = transactions.existingClaimId(settlementId);
        if (existing.isPresent()) return retryUncertainPreSettle(existing.get());
        var quick = transactions.quickPreSettleContext(settlementId, coverageId, insuranceTypeCode, regionCode);
        var submission = quick.submission();
        return preSettle(new PreSettleCommand(settlementId, quick.coverage().id(), idempotencyKey.trim(), submission.regionCode(),
                InsuranceTypeCodes.of(quick.coverage().coverageTypeCode()), submission.organizationCode(), submission.departmentCode(),
                submission.practitionerCode(), submission.diagnosisDigest(), quick.visit().startedAt(), quick.visit().completedAt(),
                context.correlationId(), quick.lines().stream().map(line -> new LineMapping(line.settlementLineId(),
                        line.insuranceItemCode(), line.traceAttributes())).toList()));
    }

    /**
     * 已有申请尚未取得医保预结算流水，且处于“通道不确定的处理中”，或“请求发出前上下文未确认（如参保人鉴权凭证失效）的失败”时，
     * 用新的结果命令编码重试一次预结算；其他状态原样返回，由调用方按状态与原因继续。
     */
    private InsuranceSettlementView retryUncertainPreSettle(Long claimId) {
        var view = transactions.view(claimId, true);
        if (!"PRE_SETTLE".equals(view.currentOperation()) || view.externalPreSettlementNo() != null) return view;
        boolean uncertain = "PRE_SETTLEMENT_PENDING".equals(view.status()) && "INSURANCE_CHANNEL_UNCERTAIN".equals(view.errorCode());
        boolean notSent = "FAILED".equals(view.status()) && "CHS_REQUEST_CONTEXT_UNCONFIRMED".equals(view.errorCode());
        if (!uncertain && !notSent) return view;
        if (notSent) transactions.prepareRetryPreSettle(claimId);
        InsuranceInstruction instruction = transactions.instruction(claimId);
        InsuranceSettlementAdapter adapter = adapter(instruction);
        if (adapter == null) return view;
        String command = CommandCodes.prefixed("PRE-R" + (view.responses().size() + 1) + "-", view.claimNo());
        if (transactions.responseApplied(claimId, command)) return view;
        InsuranceResult result;
        try { result = adapter.preSettle(instruction); }
        catch (RuntimeException exception) { result = uncertain(exception); }
        var applied = transactions.apply(claimId, "PRE_SETTLE", result, command, null, false);
        return transactions.view(claimId, applied.duplicate());
    }

    public InsuranceSettlementView preSettle(PreSettleCommand input) {
        var created = transactions.create(new InsuranceClaimTransactionService.CreateCommand(input.settlementId(),
                input.coverageId(), input.idempotencyKey(), input.regionCode(), input.insuranceTypeCode(),
                input.organizationCode(), input.departmentCode(), input.practitionerCode(),
                input.diagnosisPayloadDigest(), input.serviceStartedAt(), input.serviceEndedAt(),
                input.correlationId(), input.lines().stream().map(line -> new InsuranceClaimTransactionService.LineMapping(
                        line.settlementLineId(), line.insuranceItemCode(), line.traceAttributes())).toList()));
        InsuranceClaim claim = created.claim();
        if (created.duplicate() || !"PRE_SETTLEMENT_PENDING".equals(claim.status())) {
            return transactions.view(claim.id(), created.duplicate());
        }
        String command = operationCommand("PRE-", claim.commandCode());
        if (transactions.responseApplied(claim.id(), command)) return transactions.view(claim.id(), true);
        InsuranceInstruction instruction = transactions.instruction(claim.id());
        InsuranceSettlementAdapter adapter = adapter(instruction);
        InsuranceResult result;
        Long messageId = null;
        if (adapter == null) {
            messageId = enqueue(instruction, "INSURANCE_PRE_SETTLEMENT", command);
            result = pending("INSURANCE_ADAPTER_PENDING", "医保适配器尚未处理预结算申请");
        } else {
            try { result = adapter.preSettle(instruction); }
            catch (RuntimeException exception) { result = uncertain(exception); }
        }
        var applied = transactions.apply(claim.id(), "PRE_SETTLE", result, command, messageId, false);
        return transactions.view(claim.id(), applied.duplicate());
    }

    public InsuranceSettlementView settle(Long claimId, String commandCode) {
        String command = operationCommand("SETTLE-", commandCode);
        if (transactions.responseApplied(claimId, command)) return afterSettle(transactions.view(claimId, true));
        InsuranceSettlementView view = transactions.view(claimId, false);
        if ("PRE_SETTLED".equals(view.status())) transactions.prepareSettlement(claimId);
        else if (!"SETTLEMENT_PENDING".equals(view.status())) {
            throw conflict("INSURANCE_CLAIM_NOT_SETTLEABLE", "当前医保申请不能执行正式结算");
        }
        InsuranceInstruction instruction = transactions.instruction(claimId);
        InsuranceSettlementAdapter adapter = adapter(instruction);
        InsuranceResult result;
        Long messageId = null;
        if (adapter == null) {
            messageId = enqueue(instruction, "INSURANCE_SETTLEMENT", command);
            result = pending("INSURANCE_ADAPTER_PENDING", "医保适配器尚未处理正式结算申请");
        } else {
            try { result = adapter.settle(instruction, transactions.view(claimId, false).externalPreSettlementNo()); }
            catch (RuntimeException exception) { result = uncertain(exception); }
        }
        var applied = transactions.apply(claimId, "SETTLE", result, command, messageId, false);
        return afterSettle(transactions.view(claimId, applied.duplicate()));
    }

    public InsuranceSettlementView query(Long claimId, String commandCode) {
        String command = operationCommand("QUERY-", commandCode);
        if (transactions.responseApplied(claimId, command)) return transactions.view(claimId, true);
        InsuranceInstruction instruction = transactions.instruction(claimId);
        InsuranceSettlementAdapter adapter = adapter(instruction);
        if (adapter == null) {
            enqueueQuery(transactions.queryInstruction(claimId), command);
            return transactions.view(claimId, false);
        }
        InsuranceResult result;
        InsuranceQuery query = transactions.queryInstruction(claimId);
        try { result = adapter.query(query); }
        catch (RuntimeException exception) { result = uncertain(exception); }
        var applied = transactions.apply(claimId, query.operation(), result, command, null, false);
        return transactions.view(claimId, applied.duplicate());
    }

    public InsuranceSettlementView reverse(Long claimId, String commandCode, String reason) {
        String command = operationCommand("REVERSE-", commandCode);
        String normalizedReason = requiredReason(reason);
        InsuranceSettlementView before = transactions.view(claimId, false);
        if (transactions.responseApplied(claimId, command)) {
            if (!normalizedReason.equals(before.reversalReason())) throw conflict(
                    "INSURANCE_REVERSAL_REPLAY_MISMATCH", "医保冲正幂等编码已用于不同冲正原因");
            return transactions.view(claimId, true);
        }
        if ("SETTLED".equals(before.status())
                || ("FAILED".equals(before.status()) && "REVERSE".equals(before.currentOperation()))) {
            transactions.prepareReversal(claimId, normalizedReason);
        } else if (!"REVERSAL_PENDING".equals(before.status())) {
            throw conflict("INSURANCE_CLAIM_NOT_REVERSIBLE", "当前医保申请不能执行冲正");
        } else if (!normalizedReason.equals(before.reversalReason())) {
            throw conflict("INSURANCE_REVERSAL_REASON_MISMATCH", "医保冲正重试原因与原申请不一致");
        }
        InsuranceInstruction instruction = transactions.instruction(claimId);
        InsuranceReversal reversal = transactions.reversalInstruction(claimId, command);
        InsuranceSettlementAdapter adapter = adapter(instruction);
        InsuranceResult result;
        Long messageId = null;
        if (adapter == null) {
            messageId = enqueueReversal(reversal, command);
            result = pending("INSURANCE_ADAPTER_PENDING", "医保适配器尚未处理冲正申请");
        } else {
            try { result = adapter.reverse(reversal); }
            catch (RuntimeException exception) { result = uncertain(exception); }
        }
        var applied = transactions.apply(claimId, "REVERSE", result, command, messageId, false);
        return transactions.view(claimId, applied.duplicate());
    }

    public InsuranceSettlementView get(Long claimId) { return transactions.view(claimId, false); }

    public List<InsuranceSettlementView> recoveryWorklist(int limit) {
        return transactions.recoveryWorklist(limit);
    }

    public List<RecoveryResult> recoverPending(String batchCode, int limit) {
        String prefix = required(batchCode);
        return transactions.recoveryWorklist(limit).stream().map(item -> {
            try {
                InsuranceSettlementView result = query(item.claimId(), prefix + "-" + item.claimId());
                return new RecoveryResult(item.claimId(), result.status(), true, null, null);
            } catch (RuntimeException exception) {
                return new RecoveryResult(item.claimId(), item.status(), false,
                        exception.getClass().getSimpleName(), exception.getMessage());
            }
        }).toList();
    }

    @Override
    public InsuranceSettlementView accept(VerifiedInsuranceResult input) {
        if (input == null || input.operation() == null || input.status() == null) {
            throw badRequest("INSURANCE_RESULT_TYPE_REQUIRED", "医保回调必须包含操作和结果状态");
        }
        InsuranceClaim claim = transactions.requireBySettlementNo(input.settlementNo());
        if (!claim.regionCode().equals(normalize(input.regionCode()))) {
            throw conflict("INSURANCE_CALLBACK_REGION_MISMATCH", "医保回调统筹区与原申请不一致");
        }
        String command = required(input.commandCode());
        String messageId = required(input.externalMessageBusinessId());
        String currency = normalize(input.currencyCode());
        if (input.status() == VerifiedInsuranceResult.ResultStatus.SUCCEEDED && currency == null) {
            throw badRequest("INSURANCE_CALLBACK_CURRENCY_REQUIRED", "医保成功回调必须明确提供币种");
        }
        if (currency != null && !currency.equals(claim.currencyCode())) {
            throw conflict("INSURANCE_CALLBACK_CURRENCY_MISMATCH", "医保回调币种与原申请不一致");
        }
        ExecutionContext context = contextProvider.requireCurrent();
        InsuranceResult result = result(input, currency);
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("claimId", claim.id()); payload.put("settlementNo", input.settlementNo().trim());
        payload.put("regionCode", normalize(input.regionCode())); payload.put("operation", input.operation().name());
        payload.put("status", input.status().name()); payload.put("externalSettlementNo", input.externalSettlementNo());
        payload.put("insuranceFundAmount", input.insuranceFundAmount()); payload.put("personalAccountAmount", input.personalAccountAmount());
        payload.put("patientCashAmount", input.patientCashAmount()); payload.put("otherFundAmount", input.otherFundAmount());
        payload.put("currencyCode", currency); payload.put("errorCode", input.errorCode()); payload.put("errorMessage", input.errorMessage());
        payload.put("sanitizedPayload", input.sanitizedPayload());
        return transactions.applyInbound(claim.id(), input.operation().name(), result, command,
                new ExternalMessageService.InboundMessage(endpoint(claim.regionCode()), "INSURANCE_RESULT", messageId,
                        claim.correlationId(), context.organizationId(), context.departmentId(), payload));
    }

    private InsuranceSettlementAdapter adapter(InsuranceInstruction input) {
        return adapters.stream().filter(value -> value.supports(input.regionCode(), input.insuranceTypeCode()))
                .findFirst().orElse(null);
    }
    private Long enqueue(InsuranceInstruction input, String messageType, String businessMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("settlementId", input.settlementId()); payload.put("settlementNo", input.settlementNo());
        payload.put("coverageId", input.coverageId()); payload.put("regionCode", input.regionCode());
        payload.put("insuranceTypeCode", input.insuranceTypeCode()); payload.put("organizationCode", input.organizationCode());
        payload.put("departmentCode", input.departmentCode()); payload.put("practitionerCode", input.practitionerCode());
        payload.put("diagnosisPayloadDigest", input.diagnosisPayloadDigest()); payload.put("lines", input.lines());
        payload.put("grossAmount", input.grossAmount()); payload.put("currencyCode", input.currencyCode());
        return messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(endpoint(input.regionCode()),
                messageType, businessMessageId, input.correlationId(), context.organizationId(), context.departmentId(),
                payload, "InsuranceClaim", input.claimId(), 0L)).id();
    }
    private void enqueueQuery(InsuranceQuery input, String businessMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("claimId", input.claimId()); payload.put("claimNo", input.claimNo());
        payload.put("operation", input.operation()); payload.put("externalPreSettlementNo", input.externalPreSettlementNo());
        payload.put("externalSettlementNo", input.externalSettlementNo());
        messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(endpoint(input.regionCode()),
                "INSURANCE_QUERY", businessMessageId, input.correlationId(), context.organizationId(), context.departmentId(),
                payload, "InsuranceClaim", input.claimId(), 0L));
    }
    private Long enqueueReversal(InsuranceReversal input, String businessMessageId) {
        ExecutionContext context = contextProvider.requireCurrent();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("claimId", input.claimId()); payload.put("settlementId", input.settlementId());
        payload.put("settlementNo", input.settlementNo()); payload.put("regionCode", input.regionCode());
        payload.put("insuranceTypeCode", input.insuranceTypeCode());
        payload.put("originalExternalSettlementNo", input.originalExternalSettlementNo());
        payload.put("amount", input.amount()); payload.put("reason", input.reason());
        payload.put("residentId", input.residentId()); payload.put("coverageId", input.coverageId());
        payload.put("practitionerCode", input.practitionerCode()); payload.put("currencyCode", input.currencyCode());
        payload.put("insuranceFundAmount", input.insuranceFundAmount());
        payload.put("personalAccountAmount", input.personalAccountAmount());
        payload.put("patientCashAmount", input.patientCashAmount()); payload.put("otherFundAmount", input.otherFundAmount());
        return messages.enqueueOutbound(new ExternalMessageService.OutboundMessage(
                endpoint(input.regionCode()), "INSURANCE_REVERSAL", businessMessageId, input.correlationId(),
                context.organizationId(), context.departmentId(), payload,
                "InsuranceClaim", input.claimId(), 0L)).id();
    }
    private InsuranceResult result(VerifiedInsuranceResult input, String currency) {
        InsuranceResult.Outcome outcome = switch (input.status()) {
            case SUCCEEDED -> InsuranceResult.Outcome.SUCCEEDED;
            case PENDING -> InsuranceResult.Outcome.PENDING;
            case FAILED -> InsuranceResult.Outcome.FAILED;
        };
        return new InsuranceResult(outcome, input.externalSettlementNo(), input.externalMessageBusinessId(),
                input.insuranceFundAmount(), input.personalAccountAmount(), input.patientCashAmount(),
                input.otherFundAmount(), currency, input.errorCode(), input.errorMessage(), input.sanitizedPayload());
    }
    private InsuranceResult pending(String code, String message) {
        return new InsuranceResult(InsuranceResult.Outcome.PENDING, null, null, null, null, null, null,
                null, code, message, null);
    }
    private InsuranceResult uncertain(RuntimeException exception) {
        return new InsuranceResult(InsuranceResult.Outcome.PENDING, null, null, null, null, null, null,
                null, "INSURANCE_CHANNEL_UNCERTAIN", exception.getMessage(), null);
    }
    private String endpoint(String region) { return "INSURANCE_" + region; }
    private String normalize(String value) { return value == null || value.isBlank() ? null : value.trim().toUpperCase(Locale.ROOT); }
    private String required(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 128) throw badRequest(
                "INSURANCE_COMMAND_REQUIRED", "医保操作必须提供不超过 128 字符的幂等编码");
        return value.trim();
    }
    private String requiredReason(String value) {
        if (value == null || value.isBlank() || value.trim().length() > 500) throw badRequest(
                "INSURANCE_REVERSAL_REASON_REQUIRED", "医保冲正必须提供不超过 500 字符的原因");
        return value.trim();
    }
    private String operationCommand(String prefix, String value) {
        return CommandCodes.prefixed(prefix, required(value));
    }

    public record PreSettleCommand(Long settlementId, Long coverageId, String idempotencyKey,
                                   String regionCode, String insuranceTypeCode, String organizationCode,
                                   String departmentCode, String practitionerCode, String diagnosisPayloadDigest,
                                   java.time.Instant serviceStartedAt, java.time.Instant serviceEndedAt,
                                   String correlationId, List<LineMapping> lines) {}
    public record LineMapping(Long settlementLineId, String insuranceItemCode,
                              Map<String, String> traceAttributes) {}
    public record RecoveryResult(Long claimId, String status, boolean accepted,
                                 String errorCode, String errorMessage) {}
}
