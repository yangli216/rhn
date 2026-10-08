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
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InsuranceClaimLineRepository;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.InsuranceClaimResponseRepository;
import com.rhn.billing.infrastructure.PatientAccountRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.healthcore.api.CoverageDirectory;
import com.rhn.platform.masterdata.api.ItemStandardMappingDirectory;
import com.rhn.platform.integration.api.ExternalMessageService;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.json.JsonCodec;
import com.rhn.shared.text.Strings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
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
    private final InsuranceQuickSubmissionResolver quickResolver;
    private final ItemStandardMappingDirectory itemMappings;
    private final ExternalMessageService messages;

    InsuranceClaimTransactionService(InsuranceClaimRepository claims, InsuranceClaimLineRepository claimLines,
                                     InsuranceClaimResponseRepository responses, SettlementRepository settlements,
                                     SettlementLineRepository settlementLines, ChargeItemRepository charges,
                                     PatientAccountRepository accounts, CoverageDirectory coverages,
                                     SettlementApplicationService settlementService,
                                     ExecutionContextProvider contextProvider, JsonCodec json,
                                     InsuranceQuickSubmissionResolver quickResolver, ItemStandardMappingDirectory itemMappings,
                                     ExternalMessageService messages) {
        this.claims = claims; this.claimLines = claimLines; this.responses = responses; this.settlements = settlements;
        this.settlementLines = settlementLines; this.charges = charges; this.accounts = accounts;
        this.coverages = coverages; this.settlementService = settlementService;
        this.contextProvider = contextProvider; this.json = json;
        this.quickResolver = quickResolver; this.itemMappings = itemMappings;
        this.messages = messages;
    }

    /**
     * 组装快捷门诊医保预结算所需的结算单、费用账户、患者保障与明细映射上下文，
     * 使 web 层无需直接依赖结算/费用仓储与医保专网客户端。
     */
    @Transactional(readOnly = true)
    public QuickContext quickPreSettleContext(Long settlementId, Long coverageId, String insuranceTypeCode,
                                              String regionCode) {
        ExecutionContext context = requireContext();
        Settlement settlement = settlements.findByIdAndTenantId(settlementId, context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        PatientAccount account = requireAccount(context, settlement.patientAccountId());
        var visit = quickResolver.visit(account);
        CoverageDirectory.CoverageView coverage = coverages.requireExistingActive(coverageId, account.residentId(),
                visit.serviceDate(), insuranceTypeCode);
        var submission = quickResolver.resolve(account, visit, coverage.coverageTypeCode(), regionCode);
        List<com.rhn.billing.domain.SettlementLine> lines = settlementLines
                .findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlementId);
        if (lines.isEmpty()) throw conflict("INSURANCE_LINE_MAPPING_INCOMPLETE", "医保结算没有费用明细，不能生成目录映射");
        Map<Long, ChargeItem> chargesById = charges.findAllById(lines.stream()
                        .map(com.rhn.billing.domain.SettlementLine::chargeItemId).toList()).stream()
                .collect(Collectors.toMap(ChargeItem::id, value -> value));
        List<QuickLine> mappings = new ArrayList<>();
        for (com.rhn.billing.domain.SettlementLine line : lines) {
            ChargeItem charge = chargesById.get(line.chargeItemId());
            if (charge == null || !context.tenantId().equals(charge.tenantId())
                    || !account.id().equals(charge.patientAccountId()) || !account.encounterId().equals(charge.encounterId())) {
                throw conflict("INSURANCE_CHARGE_CONTEXT_INVALID", "医保费用明细缺失或不属于本次患者账户");
            }
            var candidates = itemMappings.resolve(context.tenantId(), "CATALOG_ITEM", charge.catalogItemId(),
                            "INSURANCE", visit.serviceDate()).stream()
                    .filter(value -> submission.insuranceSystemCode().equals(value.systemCode())
                            && "INSURANCE".equals(value.mappingType()) && "INSURANCE".equals(value.authorityType())
                            && "ACTIVE".equals(value.status())
                            && ("EXACT".equals(value.equivalence()) || "EQUIVALENT".equals(value.equivalence())))
                    .toList();
            if (candidates.size() != 1 || Strings.trimToNull(candidates.getFirst().termCode()) == null) {
                throw conflict("INSURANCE_ITEM_MAPPING_UNCONFIRMED", "收费项目 " + charge.itemCodeSnapshot()
                        + " 缺少唯一有效的医保等价目录映射，请先维护并核实目录");
            }
            var mapping = candidates.getFirst();
            mappings.add(new QuickLine(line.id(), mapping.termCode(), Map.of(
                    "mappingId", String.valueOf(mapping.id()), "insuranceSystemCode", mapping.systemCode())));
        }
        return new QuickContext(settlement, account, coverage, visit, submission, mappings);
    }

    public record QuickLine(Long settlementLineId, String insuranceItemCode, Map<String, String> traceAttributes) {}

    public record QuickContext(Settlement settlement, PatientAccount account, CoverageDirectory.CoverageView coverage,
                               InsuranceQuickSubmissionResolver.Visit visit,
                               InsuranceQuickSubmissionResolver.Submission submission, List<QuickLine> lines) {}

    @Transactional
    CreateResult create(CreateCommand input) {
        ExecutionContext context = requireContext();
        String command = required(input.idempotencyKey(), "INSURANCE_COMMAND_REQUIRED", "医保预结算必须提供幂等编码");
        InsuranceClaim replay = claims.findByTenantIdAndCommandCode(context.tenantId(), command).orElse(null);
        if (replay != null) {
            requireAccount(context, replay.patientAccountId());
            return new CreateResult(verifyReplay(replay, input), true);
        }
        if (input.serviceStartedAt() == null) {
            throw badRequest("INSURANCE_SERVICE_TIME_REQUIRED", "医保预结算必须提供真实就诊开始时间");
        }
        if (input.serviceEndedAt() != null && input.serviceEndedAt().isBefore(input.serviceStartedAt())) {
            throw badRequest("INSURANCE_SERVICE_TIME_INVALID", "就诊结束时间不能早于开始时间");
        }
        Settlement settlement = settlements.findByIdAndTenantId(input.settlementId(), context.tenantId())
                .orElseThrow(() -> notFound("SETTLEMENT_NOT_FOUND", "未找到正式结算单"));
        if (settlement.status() != SettlementStatus.PRICED) {
            throw conflict("INSURANCE_SETTLEMENT_STATE_INVALID", "医保预结算必须在收款前完成");
        }
        if (claims.findByTenantIdAndSettlementId(context.tenantId(), settlement.id()).isPresent()) {
            throw conflict("INSURANCE_CLAIM_ALREADY_EXISTS", "当前结算单已经存在医保申请");
        }
        PatientAccount account = requireAccount(context, settlement.patientAccountId());
        CoverageDirectory.CoverageView coverage = coverages.requireActive(input.coverageId(), account.residentId(),
                quickResolver.serviceDate(account, input.serviceStartedAt()));
        String insuranceType = upper(input.insuranceTypeCode(), "INSURANCE_TYPE_REQUIRED", "医保类型不能为空");
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
                input.serviceStartedAt(), input.serviceEndedAt(),
                money(settlement.netAmount()), settlement.currencyCode(), Strings.trimToNull(input.correlationId()) == null
                ? context.correlationId() : Strings.trimToNull(input.correlationId()), context.subjectId()));
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
    InsuranceSettlementView applyInbound(Long claimId, String operation, InsuranceResult result, String commandCode,
                                         ExternalMessageService.InboundMessage message) {
        ExecutionContext context = requireContext();
        InsuranceClaim claim = lock(claimId, context);
        var inbound = messages.receiveInbound(message);
        boolean processed = "PROCESSED".equals(inbound.status());
        if (processed && (!"InsuranceClaim".equals(inbound.relatedResourceType())
                || !claim.id().equals(inbound.relatedResourceId()) || inbound.relatedResourceVersion() == null)) {
            throw conflict("INSURANCE_CALLBACK_RESOURCE_MISMATCH", "医保回调消息已关联其他业务结果");
        }
        if (processed && existingResponse(context.tenantId(), claim.id(), commandCode, result) == null) {
            throw conflict("INSURANCE_PROCESSED_RESULT_MISSING", "已处理医保消息缺少原业务回执，请核实记录");
        }
        var applied = apply(claimId, operation, result, commandCode, inbound.id(), inbound.duplicate());
        claims.flush();
        var view = view(claimId, applied.duplicate());
        // A later retry must retain the resource version and timestamp of the original processing.
        if (!processed) messages.markProcessed(inbound.id(), "InsuranceClaim", claim.id(), view.revision());
        return view;
    }

    @Transactional
    ApplyResult apply(Long claimId, String operation, InsuranceResult result, String commandCode,
                      Long externalMessageId, boolean duplicate) {
        ExecutionContext context = requireContext();
        InsuranceClaim value = lock(claimId, context);
        String command = required(commandCode, "INSURANCE_RESULT_COMMAND_REQUIRED", "医保结果命令编码不能为空");
        InsuranceClaimResponse replay = existingResponse(context.tenantId(), value.id(), command, result);
        if (replay != null) {
            if (!replay.hasReportedAmounts()) throw conflict("INSURANCE_RESULT_AMOUNTS_UNVERIFIED", "历史医保回执金额来源待核实，不能视为已确认的重试结果");
            if (!replay.matches(operation, result, value.currencyCode())) throw conflict(
                    "INSURANCE_RESULT_REPLAY_MISMATCH", "医保回执命令已用于不同业务结果");
            return new ApplyResult(value, replay, true);
        }
        String previous;
        try { previous = value.apply(operation, result); }
        catch (IllegalStateException exception) { throw conflict("INSURANCE_RESULT_INVALID", exception.getMessage()); }
        boolean confirmedDuplicate = result.outcome() == InsuranceResult.Outcome.SUCCEEDED && previous.equals(value.status());
        if (confirmedDuplicate) {
            InsuranceClaimResponse confirmed = responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(
                            context.tenantId(), value.id()).stream()
                    .filter(item -> operation.equals(item.operation()) && "SUCCEEDED".equals(item.status()))
                    .findFirst().orElseThrow(() -> conflict("INSURANCE_CONFIRMED_RESPONSE_MISSING", "已确认医保结果缺少原成功回执，请核实原记录"));
            if (!confirmed.hasReportedAmounts()) throw conflict("INSURANCE_RESULT_AMOUNTS_UNVERIFIED", "原医保成功回执金额来源待核实");
            if (!confirmed.matches(operation, result, value.currencyCode())) throw conflict(
                    "INSURANCE_RESULT_REPLAY_MISMATCH", "重复医保成功回执与原确认结果不一致");
        }
        InsuranceClaimResponse response = responses.save(new InsuranceClaimResponse(context.tenantId(), value.id(),
                externalMessageId, command, operation, result));
        if (!confirmedDuplicate && "SETTLE".equals(value.currentOperation()) && "SETTLED".equals(value.status())) {
            settlementService.recordInsuranceResponse(context, value.settlementId(), response.id(), value.regionCode(),
                    value.payerName(), value.insuranceFundAmount(), value.personalAccountAmount(), value.patientCashAmount(),
                    value.otherFundAmount(), response.respondedAt());
        } else if (!confirmedDuplicate && "REVERSE".equals(value.currentOperation()) && "REVERSED".equals(value.status())) {
            InsuranceClaimResponse settled = responses.findByTenantIdAndClaimIdOrderByRespondedAtAscIdAsc(
                            context.tenantId(), value.id()).stream()
                    .filter(item -> "SETTLE".equals(item.operation()) && "SUCCEEDED".equals(item.status()))
                    .findFirst().orElseThrow(() -> conflict("INSURANCE_SETTLEMENT_RESPONSE_MISSING",
                            "医保冲正缺少原正式结算成功结果"));
            settlementService.recordInsuranceReversal(context, value.settlementId(), settled.id(), response.id(),
                    value.regionCode(), value.payerName(), value.insuranceFundAmount(), value.personalAccountAmount(),
                    value.otherFundAmount(), response.respondedAt());
        }
        return new ApplyResult(value, response, duplicate || confirmedDuplicate);
    }

    private InsuranceClaimResponse existingResponse(Long tenantId, Long claimId, String command, InsuranceResult result) {
        var replay = responses.findByTenantIdAndClaimIdAndCommandCode(tenantId, claimId, command).orElse(null);
        if (replay == null && result != null && Strings.trimToNull(result.externalMessageBusinessId()) != null) {
            replay = responses.findByTenantIdAndClaimIdAndResponseNo(tenantId, claimId,
                    Strings.trimToNull(result.externalMessageBusinessId())).orElse(null);
        }
        return replay;
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
                value.reversalReason(), value.correlationId(), requireAccount(context, value.patientAccountId()).residentId(),
                value.coverageId(), value.practitionerCode(), value.currencyCode(), value.insuranceFundAmount(),
                value.personalAccountAmount(), value.patientCashAmount(), value.otherFundAmount());
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
        var response = responses.findByTenantIdAndClaimIdAndCommandCode(context.tenantId(), claimId,
                required(commandCode, "INSURANCE_RESULT_COMMAND_REQUIRED", "医保结果命令编码不能为空"));
        if (response.isPresent() && !response.get().hasReportedAmounts()) throw conflict(
                "INSURANCE_RESULT_AMOUNTS_UNVERIFIED", "历史医保回执金额来源待核实，不能跳过结果核验");
        return response.isPresent();
    }

    @Transactional(readOnly = true)
    List<InsuranceSettlementView> recoveryWorklist(int limit) {
        ExecutionContext context = requireContext();
        return claims.findRecoveryWorklist(context.tenantId(), context.organizationId(),
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
                        response.errorCode(), response.errorMessage(), response.respondedAt(), response.amountSource())).toList();
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
                || !value.regionCode().equalsIgnoreCase(Strings.trimToNull(input.regionCode()))
                || !value.insuranceTypeCode().equalsIgnoreCase(Strings.trimToNull(input.insuranceTypeCode()))
                || !Objects.equals(value.organizationCode(), Strings.trimToNull(input.organizationCode()))
                || !Objects.equals(value.departmentCode(), Strings.trimToNull(input.departmentCode()))
                || !Objects.equals(value.practitionerCode(), Strings.trimToNull(input.practitionerCode()))
                || !Objects.equals(value.diagnosisPayloadDigest(), Strings.trimToNull(input.diagnosisPayloadDigest()))
                || !Objects.equals(value.serviceStartedAt(), input.serviceStartedAt())
                || !Objects.equals(value.serviceEndedAt(), input.serviceEndedAt())) {
            throw conflict("INSURANCE_IDEMPOTENCY_MISMATCH", "幂等编码已用于不同医保申请");
        }
        // Compare the original submission snapshot, not mutable settlement totals or current directories.
        var originalLines = claimLines.findByTenantIdAndClaimIdOrderByLineNoAsc(value.tenantId(), value.id());
        if (input.lines() == null || input.lines().size() != originalLines.size() || originalLines.isEmpty()) {
            throw conflict("INSURANCE_IDEMPOTENCY_MISMATCH", "幂等编码对应的医保费用映射与原申请不一致");
        }
        Map<Long, LineMapping> mappings = new LinkedHashMap<>();
        for (var line : input.lines()) {
            if (line == null || line.settlementLineId() == null || mappings.putIfAbsent(line.settlementLineId(), line) != null) {
                throw conflict("INSURANCE_IDEMPOTENCY_MISMATCH", "幂等重试包含缺失或重复的医保结算行");
            }
        }
        for (var original : originalLines) {
            var line = mappings.get(original.settlementLineId());
            if (line == null || !Objects.equals(original.insuranceItemCode(), Strings.trimToNull(line.insuranceItemCode()))
                    || !json.readObject(original.traceAttributesJson() == null ? "{}" : original.traceAttributesJson())
                    .equals(line.traceAttributes() == null ? Map.of() : line.traceAttributes())) {
                throw conflict("INSURANCE_IDEMPOTENCY_MISMATCH", "幂等编码对应的医保费用映射与原申请不一致");
            }
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
    private String category(ChargeItem value) {
        if ("DIRECT_VISIT_SERVICE".equals(value.sourceType())) return "TREATMENT";
        return "REGISTRATION".equals(value.sourceType()) ? "REGISTRATION" : "MEDICATION";
    }
    private String required(String value, String code, String message) {
        String result = Strings.trimToNull(value); if (result == null || result.length() > 128) throw badRequest(code, message); return result;
    }
    private String upper(String value, String code, String message) { return required(value, code, message).toUpperCase(Locale.ROOT); }
    private BigDecimal money(BigDecimal value) { return value.setScale(6, RoundingMode.HALF_UP); }
    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw forbidden(
                "BILLING_WORK_CONTEXT_REQUIRED", "医保结算前必须选择工作机构");
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
