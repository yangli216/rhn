package com.rhn.billing.application;

import com.rhn.billing.application.ReliefEligibilityResolver.Eligibility;
import com.rhn.billing.application.ReliefEligibilityResolver.Facts;
import com.rhn.billing.application.ReliefPolicyApplicationService.ReliefApplicableScope;
import com.rhn.billing.api.ReliefViews.ReliefApplicationLineView;
import com.rhn.billing.api.ReliefViews.ReliefApplicationView;
import com.rhn.billing.api.ReliefViews.ReliefOutcomeView;
import com.rhn.billing.domain.ChargeItem;
import com.rhn.billing.domain.InsuranceClaim;
import com.rhn.billing.domain.Invoice;
import com.rhn.billing.domain.LedgerEntry;
import com.rhn.billing.domain.PatientAccount;
import com.rhn.billing.domain.ReliefApplication;
import com.rhn.billing.domain.ReliefApplicationLine;
import com.rhn.billing.domain.ReliefCalculator;
import com.rhn.billing.domain.ReliefCalculator.ChargeLine;
import com.rhn.billing.domain.ReliefCalculator.Outcome;
import com.rhn.billing.domain.ReliefCalculator.OutcomeStatus;
import com.rhn.billing.domain.ReliefPolicy;
import com.rhn.billing.domain.ReliefPolicyStatus;
import com.rhn.billing.domain.ReliefPolicyVersion;
import com.rhn.billing.domain.ReliefQualification;
import com.rhn.billing.domain.ReliefQuotaKey;
import com.rhn.billing.domain.ReliefRosterStatus;
import com.rhn.billing.domain.ReliefRule;
import com.rhn.billing.domain.ReliefSponsor;
import com.rhn.billing.domain.ReliefTiming;
import com.rhn.billing.domain.Settlement;
import com.rhn.billing.domain.SettlementLine;
import com.rhn.billing.domain.SettlementTender;
import com.rhn.billing.infrastructure.ChargeItemRepository;
import com.rhn.billing.infrastructure.InsuranceClaimRepository;
import com.rhn.billing.infrastructure.LedgerEntryRepository;
import com.rhn.billing.infrastructure.ReliefApplicationLineRepository;
import com.rhn.billing.infrastructure.ReliefApplicationRepository;
import com.rhn.billing.infrastructure.ReliefPolicyRepository;
import com.rhn.billing.infrastructure.ReliefPolicyVersionRepository;
import com.rhn.billing.infrastructure.ReliefQualificationRepository;
import com.rhn.billing.infrastructure.ReliefRosterRepository;
import com.rhn.billing.infrastructure.ReliefRuleRepository;
import com.rhn.billing.infrastructure.SettlementLineRepository;
import com.rhn.billing.infrastructure.SettlementRepository;
import com.rhn.billing.infrastructure.SettlementTenderRepository;
import com.rhn.healthcore.api.ResidentDirectory;
import com.rhn.platform.dictionary.api.DictionaryDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.forbidden;

/**
 * 惠民减免与结算的集成，由 {@link SettlementApplicationService} 在其事务内调用。
 *
 * <ul>
 *   <li>医保前：开具账单生成正式结算后立即计算，降低结算行、结算单与账单净额，医保按减免后金额结算。</li>
 *   <li>医保后：医保正式结算回执落账后自动计算；自费患者由收费员确认后计算。减免作为“医院减免/补助”收款计入结算，
 *       不是患者支付。人工核准项只在确认时按权限录入。</li>
 *   <li>每笔减免记 RELIEF 贷方账务、按行分配，并在同一事务内加锁占用额度；结算完成时确认额度。</li>
 * </ul>
 * 本期接入门诊收费与药房收费场景；挂号与住院结算的收款时序不同，后续单独接入。
 */
@Component
class SettlementReliefService {
    static final Set<String> SUPPORTED_SCENES = Set.of("OUTPATIENT", "PHARMACY");
    static final String SELF_PAY = "SELF_PAY";
    static final String APPROVE_AUTHORITY = "BILLING_RELIEF.APPROVE";
    private static final BigDecimal PRECISION = new BigDecimal("0.01");
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private static final Logger log = LoggerFactory.getLogger(SettlementReliefService.class);

    private final ReliefPolicyRepository policies;
    private final ReliefPolicyVersionRepository versions;
    private final ReliefRuleRepository rules;
    private final ReliefQualificationRepository qualifications;
    private final ReliefRosterRepository roster;
    private final ReliefApplicationRepository applications;
    private final ReliefApplicationLineRepository applicationLines;
    private final ReliefQuotaService quotas;
    private final ReliefEligibilityResolver eligibility;
    private final SettlementLineRepository settlementLines;
    private final SettlementTenderRepository tenders;
    private final ChargeItemRepository chargeItems;
    private final LedgerEntryRepository ledger;
    private final InsuranceClaimRepository claims;
    private final SettlementRepository settlements;
    private final ResidentDirectory residents;
    private final DictionaryDirectory dictionaries;
    private final JsonCodec json;
    private final ReliefCalculator calculator = new ReliefCalculator();

    SettlementReliefService(ReliefPolicyRepository policies, ReliefPolicyVersionRepository versions,
                            ReliefRuleRepository rules, ReliefQualificationRepository qualifications,
                            ReliefRosterRepository roster, ReliefApplicationRepository applications,
                            ReliefApplicationLineRepository applicationLines, ReliefQuotaService quotas,
                            ReliefEligibilityResolver eligibility, SettlementLineRepository settlementLines,
                            SettlementTenderRepository tenders, ChargeItemRepository chargeItems,
                            LedgerEntryRepository ledger, InsuranceClaimRepository claims,
                            SettlementRepository settlements, ResidentDirectory residents,
                            DictionaryDirectory dictionaries, JsonCodec json) {
        this.policies = policies; this.versions = versions; this.rules = rules; this.qualifications = qualifications;
        this.roster = roster; this.applications = applications; this.applicationLines = applicationLines;
        this.quotas = quotas; this.eligibility = eligibility; this.settlementLines = settlementLines;
        this.tenders = tenders; this.chargeItems = chargeItems; this.ledger = ledger; this.claims = claims;
        this.settlements = settlements;
        this.residents = residents; this.dictionaries = dictionaries; this.json = json;
    }

    static boolean supported(Settlement settlement) {
        return "NORMAL".equals(settlement.settlementType()) && SUPPORTED_SCENES.contains(settlement.settlementScene());
    }

    /**
     * 医保前减免。settlementMode 为 SELF_PAY 时适用全部医保前政策；未声明或医保结算时只执行允许医保患者享受的政策。
     */
    List<ReliefOutcomeView> applyPreInsurance(ExecutionContext context, PatientAccount account, Settlement settlement,
                                        Invoice invoice, String settlementMode) {
        if (!supported(settlement) || settlement.netAmount().signum() <= 0) return List.of();
        boolean insured = !SELF_PAY.equals(settlementMode);
        Stage stage = prepare(context, account, settlement, ReliefTiming.PRE_INSURANCE, null, true);
        if (stage.policies().isEmpty()) return List.of();
        ReliefCalculator.Result result = calculator.calculate(new ReliefCalculator.Request(ReliefTiming.PRE_INSURANCE,
                insured, PRECISION, stage.lines(), stage.policyInputs(), stage.prior(), Map.of()));
        persist(context, account, settlement, invoice, stage, result, Map.of(), "RELIEF-PRE-");
        return views(result);
    }

    /** 医保正式结算回执落账后自动执行医保后减免；资格判定失败不影响医保结果入账，只记录日志。 */
    List<ReliefOutcomeView> applyAfterInsurance(ExecutionContext context, PatientAccount account, Settlement settlement) {
        if (!supported(settlement)) return List.of();
        try {
            return applyPostInsurance(context, account, settlement, Map.of(), "RELIEF-INS-");
        } catch (com.rhn.shared.api.BusinessException exception) {
            log.warn("Post-insurance relief skipped for settlement {}: {}", settlement.id(), exception.getMessage());
            return List.of();
        }
    }

    /**
     * 医保后减免（自费确认或医保结算后补充人工核准）。已执行的政策不会重复执行。
     * 医保申请存在但尚未正式结算时不能确认，避免先按自费减免再走医保。
     */
    List<ReliefOutcomeView> applyPostInsurance(ExecutionContext context, PatientAccount account, Settlement settlement,
                                         Map<Long, ManualDecision> manual, String commandPrefix) {
        if (!supported(settlement)) throw conflict("RELIEF_SCENE_UNSUPPORTED", "当前结算场景暂不支持惠民减免");
        InsuranceClaim claim = claims.findByTenantIdAndSettlementId(context.tenantId(), settlement.id()).orElse(null);
        if (claim != null && !"SETTLED".equals(claim.status())) {
            throw conflict("RELIEF_INSURANCE_PENDING", "医保结算尚未完成，不能确认医保后减免");
        }
        if (!manual.isEmpty() && !context.hasAuthority(APPROVE_AUTHORITY)) {
            throw forbidden("RELIEF_MANUAL_FORBIDDEN", "没有人工核准惠民减免的权限");
        }
        for (var entry : manual.entrySet()) {
            ManualDecision decision = entry.getValue();
            if (decision.amount() == null || decision.amount().signum() <= 0) {
                throw badRequest("RELIEF_MANUAL_AMOUNT_INVALID", "人工核准金额必须大于零");
            }
            if (decision.reason() == null || decision.reason().isBlank()) {
                throw badRequest("RELIEF_MANUAL_REASON_REQUIRED", "人工核准必须填写原因");
            }
        }
        Stage stage = prepare(context, account, settlement, ReliefTiming.POST_INSURANCE,
                claim == null ? null : claim.insuranceTypeCode(), true);
        if (stage.policies().isEmpty()) {
            if (!manual.isEmpty()) throw conflict("RELIEF_MANUAL_POLICY_INVALID", "人工核准的政策不适用于本次结算");
            return List.of();
        }
        Map<Long, BigDecimal> manualAmounts = manual.entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().amount()));
        ReliefCalculator.Result result = calculator.calculate(new ReliefCalculator.Request(ReliefTiming.POST_INSURANCE,
                claim != null, PRECISION, stage.lines(), stage.policyInputs(), stage.prior(), manualAmounts));
        for (Long policyId : manual.keySet()) {
            Outcome outcome = result.outcomes().stream().filter(value -> value.policyId().equals(policyId))
                    .findFirst().orElse(null);
            if (outcome == null || outcome.status() != OutcomeStatus.APPLIED) {
                throw conflict("RELIEF_MANUAL_POLICY_INVALID", "人工核准的政策不能执行："
                        + (outcome == null ? "不适用于本次结算" : outcome.message()));
            }
        }
        persist(context, account, settlement, null, stage, result, manual, commandPrefix);
        return views(result);
    }

    /** 只读预览当前还能执行的医保后减免，供收费界面展示与人工核准。 */
    List<ReliefOutcomeView> previewPostInsurance(ExecutionContext context, PatientAccount account, Settlement settlement) {
        if (!supported(settlement)) return List.of();
        InsuranceClaim claim = claims.findByTenantIdAndSettlementId(context.tenantId(), settlement.id()).orElse(null);
        if (claim != null && !"SETTLED".equals(claim.status())) return List.of();
        Stage stage = prepare(context, account, settlement, ReliefTiming.POST_INSURANCE,
                claim == null ? null : claim.insuranceTypeCode(), false);
        if (stage.policies().isEmpty()) return List.of();
        return views(calculator.calculate(new ReliefCalculator.Request(ReliefTiming.POST_INSURANCE, claim != null,
                PRECISION, stage.lines(), stage.policyInputs(), stage.prior(), Map.of())));
    }

    /** 已按自费确认医保后减免，或享受了仅限自费的医保前减免时，不能再发起医保结算。 */
    void requireInsuranceAllowed(ExecutionContext context, Long settlementId) {
        List<ReliefApplication> existing = applications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(
                context.tenantId(), settlementId);
        if (existing.isEmpty()) return;
        if (existing.stream().anyMatch(value -> value.timing() == ReliefTiming.POST_INSURANCE)) {
            throw conflict("RELIEF_SELF_PAY_CONFIRMED", "已按自费确认医保后惠民减免，不能再发起医保结算");
        }
        Map<Long, ReliefPolicyVersion> byId = versions.findByTenantIdAndIdIn(context.tenantId(),
                existing.stream().map(ReliefApplication::policyVersionId).toList()).stream()
                .collect(Collectors.toMap(ReliefPolicyVersion::id, value -> value));
        if (existing.stream().anyMatch(value -> !byId.get(value.policyVersionId()).insuredApplicable())) {
            throw conflict("RELIEF_SELF_PAY_ONLY", "本次结算已享受仅限自费患者的医保前减免，不能再发起医保结算");
        }
    }

    /**
     * 退费冲销：按原政策版本对原结算的保留费用重算减免，冲回“当前有效减免 - 重算结果”。
     * 有冲正结算时，医保前减免冲回到冲正行优惠、医保后减免冲回为负向减免收款；直接退费尚未生成冲正结算时，
     * 冲销记录挂在原结算上，之后开具贷项账单时因已无差额而不再重复冲回。
     * 每笔冲回记 RELIEF_REVERSAL 借方账务并恢复额度，使退款只覆盖患者实际支付部分。
     * 同一原结算存在多项叠加政策时，重算按单项政策独立计算，并以该政策当前有效金额封顶。
     *
     * @return 本次冲回的减免合计
     */
    BigDecimal reverseForChargeReversals(ExecutionContext context, PatientAccount account, List<ChargeItem> reversalCharges,
                                         Settlement reversalSettlement, Invoice creditInvoice) {
        List<ChargeItem> reversals = reversalCharges.stream().filter(charge -> charge.reversesChargeItemId() != null).toList();
        if (reversals.isEmpty()) return BigDecimal.ZERO;
        Map<Long, List<SettlementLine>> originalLines = settlementLines.findByTenantIdAndChargeItemIdIn(context.tenantId(),
                        reversals.stream().map(ChargeItem::reversesChargeItemId).distinct().toList()).stream()
                .collect(Collectors.groupingBy(SettlementLine::settlementId, LinkedHashMap::new, Collectors.toList()));
        BigDecimal total = BigDecimal.ZERO;
        Instant now = Instant.now();
        for (Long settlementId : originalLines.keySet()) {
            Settlement original = settlements.findByIdAndTenantId(settlementId, context.tenantId()).orElse(null);
            if (original == null || !"NORMAL".equals(original.settlementType())) continue;
            List<ReliefApplication> active = applications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(
                            context.tenantId(), settlementId).stream()
                    .filter(value -> value.reversesApplicationId() == null
                            && value.status() == com.rhn.billing.domain.ReliefApplicationStatus.APPLIED)
                    .toList();
            if (active.isEmpty()) continue;
            Retained retained = retained(context, original);
            List<ChargeItem> batch = reversals.stream().filter(charge -> retained.originalCharges()
                    .containsKey(charge.reversesChargeItemId())).toList();
            for (ReliefApplication application : active) {
                total = total.add(reverseApplication(context, account, original, application, retained, batch,
                        reversalSettlement, creditInvoice, now));
            }
        }
        return total;
    }

    private BigDecimal reverseApplication(ExecutionContext context, PatientAccount account, Settlement original,
                                          ReliefApplication application, Retained retained, List<ChargeItem> batch,
                                          Settlement reversalSettlement, Invoice creditInvoice, Instant now) {
        String command = "RELIEF-REV-" + (reversalSettlement != null ? reversalSettlement.id()
                : "CHG" + batch.get(0).id()) + "-" + application.id();
        if (applications.findByTenantIdAndCommandCode(context.tenantId(), command).isPresent()) return BigDecimal.ZERO;
        List<ReliefApplication> previous = applications.findByTenantIdAndReversesApplicationId(context.tenantId(), application.id());
        BigDecimal alreadyReversed = previous.stream().map(value -> value.reliefAmount().negate())
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal current = application.reliefAmount().subtract(alreadyReversed);
        if (current.signum() <= 0) return BigDecimal.ZERO;
        Map<Long, BigDecimal> currentLines = new HashMap<>();
        List<Long> ids = new ArrayList<>(previous.stream().map(ReliefApplication::id).toList());
        ids.add(application.id());
        for (ReliefApplicationLine line : applicationLines.findByTenantIdAndApplicationIdIn(context.tenantId(), ids)) {
            currentLines.merge(line.settlementLineId(), line.reliefAmount(), BigDecimal::add);
        }

        ReliefPolicyVersion version = versions.findByIdAndTenantId(application.policyVersionId(), context.tenantId()).orElseThrow();
        List<ReliefCalculator.Rule> calculatorRules = rules.findByTenantIdAndPolicyVersionIdOrderByLineNoAsc(
                        context.tenantId(), version.id()).stream()
                .map(rule -> new ReliefCalculator.Rule(rule.id(), rule.terms(), null)).toList();
        ReliefCalculator.Policy policy = new ReliefCalculator.Policy(application.policyId(), version.id(), null,
                version.timing(), version.priority(), null, true, true, version.baseIncludesPersonalAccount(),
                version.onceMaxAmount(), current, null, true, null, calculatorRules);
        Map<Long, BigDecimal> manual = application.manualReason() == null ? Map.of()
                : Map.of(application.policyId(), retained.retainedShare(current));
        ReliefCalculator.Result result = calculator.calculate(new ReliefCalculator.Request(version.timing(), false,
                PRECISION, retained.lines(version.timing()), List.of(policy), List.of(), manual));
        Outcome outcome = result.applied().stream().findFirst().orElse(null);
        BigDecimal recomputed = outcome == null ? BigDecimal.ZERO : outcome.reliefAmount().min(current);
        BigDecimal amount = current.subtract(recomputed).setScale(2, RoundingMode.HALF_UP).setScale(6);
        if (reversalSettlement != null && version.timing() == ReliefTiming.PRE_INSURANCE) {
            amount = amount.min(reversibleDiscount(context, reversalSettlement, batch));
        }
        if (amount.signum() <= 0) return BigDecimal.ZERO;

        Map<Long, BigDecimal> recomputedLines = new HashMap<>();
        if (outcome != null) outcome.lines().forEach(line -> recomputedLines.merge(line.lineId(), line.reliefAmount(), BigDecimal::add));
        List<Long> lineIds = new ArrayList<>(retained.lines().keySet());
        List<BigDecimal> weights = lineIds.stream().map(id -> currentLines.getOrDefault(id, BigDecimal.ZERO)
                .subtract(recomputedLines.getOrDefault(id, BigDecimal.ZERO)).max(BigDecimal.ZERO)).toList();
        List<BigDecimal> capacities = lineIds.stream().map(id -> currentLines.getOrDefault(id, BigDecimal.ZERO)).toList();
        if (weights.stream().allMatch(weight -> weight.signum() == 0)) weights = capacities;
        List<BigDecimal> perLine = ReliefCalculator.allocate(amount, weights, capacities, PRECISION);

        Long targetSettlementId = reversalSettlement != null ? reversalSettlement.id() : original.id();
        ReliefApplication reversal = applications.save(application.reverse(targetSettlementId, amount, alreadyReversed,
                command, context.subjectId(), now));
        for (int index = 0; index < lineIds.size(); index++) {
            if (perLine.get(index).signum() == 0) continue;
            SettlementLine line = retained.lines().get(lineIds.get(index));
            applicationLines.save(new ReliefApplicationLine(context.tenantId(), reversal.id(), line.id(),
                    line.chargeItemId(), null, BigDecimal.ZERO.setScale(6), perLine.get(index).negate()));
        }
        if (reversalSettlement != null) {
            if (version.timing() == ReliefTiming.PRE_INSURANCE) {
                spreadDiscountReversal(context, reversalSettlement, batch, amount);
                reversalSettlement.applyDiscountReversal(amount);
                creditInvoice.applyDiscountReversal(amount);
            } else {
                int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), reversalSettlement.id()) + 1);
                SettlementTender tender = tenders.save(SettlementTender.relief(context.tenantId(), reversalSettlement.id(),
                        reversal.id(), lineNo, version.sponsor() == ReliefSponsor.HOSPITAL ? "HOSPITAL_DISCOUNT" : "SUBSIDY",
                        version.payerCode(), version.payerName(), amount.negate(), reversalSettlement.currencyCode()));
                reversal.bindTender(tender.id());
                reversalSettlement.applyReliefReversal(amount);
            }
        }
        ledger.save(new LedgerEntry(context.tenantId(), account.id(), "RELIEF_REVERSAL", "DEBIT", amount,
                original.currencyCode(), null, creditInvoice != null ? creditInvoice.id() : original.legacyInvoiceId(),
                null, null, now, context.subjectId()));
        quotas.restore(context.tenantId(), application, reversal, amount,
                application.status() == com.rhn.billing.domain.ReliefApplicationStatus.REVERSED,
                outcome == null ? Set.of() : outcome.usedRuleScopes(), context.subjectId(), now);
        return amount;
    }

    private BigDecimal reversibleDiscount(ExecutionContext context, Settlement reversalSettlement, List<ChargeItem> batch) {
        Set<Long> batchCharges = batch.stream().map(ChargeItem::id).collect(Collectors.toSet());
        return settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), reversalSettlement.id())
                .stream().filter(line -> batchCharges.contains(line.chargeItemId()))
                .map(line -> line.grossAmount().abs().subtract(line.discountAmount().abs()).setScale(2, RoundingMode.FLOOR))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** 冲回的医保前减免按冲正行原额比例落到本批冲正行，每行不超过其冲正原额。 */
    private void spreadDiscountReversal(ExecutionContext context, Settlement reversalSettlement, List<ChargeItem> batch,
                                        BigDecimal amount) {
        Set<Long> batchCharges = batch.stream().map(ChargeItem::id).collect(Collectors.toSet());
        List<SettlementLine> targets = settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(),
                reversalSettlement.id()).stream().filter(line -> batchCharges.contains(line.chargeItemId())).toList();
        List<BigDecimal> capacities = targets.stream()
                .map(line -> line.grossAmount().abs().subtract(line.discountAmount().abs())).toList();
        List<BigDecimal> shares = ReliefCalculator.allocate(amount, capacities, capacities, PRECISION);
        for (int index = 0; index < targets.size(); index++) {
            if (shares.get(index).signum() > 0) targets.get(index).applyDiscountReversal(shares.get(index));
        }
    }

    /** 原结算各行扣除全部已冲正数量与金额后的保留部分。 */
    private Retained retained(ExecutionContext context, Settlement original) {
        Map<Long, SettlementLine> lines = settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                        context.tenantId(), original.id()).stream()
                .collect(Collectors.toMap(SettlementLine::id, value -> value, (a, b) -> a, LinkedHashMap::new));
        Map<Long, ChargeItem> charges = chargeItems.findAllById(lines.values().stream().map(SettlementLine::chargeItemId).toList())
                .stream().collect(Collectors.toMap(ChargeItem::id, value -> value));
        Map<Long, BigDecimal> reversedAmount = new HashMap<>();
        Map<Long, BigDecimal> reversedQuantity = new HashMap<>();
        for (ChargeItem reversal : chargeItems.findByTenantIdAndReversesChargeItemIdIn(context.tenantId(), charges.keySet())) {
            reversedAmount.merge(reversal.reversesChargeItemId(), reversal.totalAmount().abs(), BigDecimal::add);
            reversedQuantity.merge(reversal.reversesChargeItemId(), reversal.quantity().abs(), BigDecimal::add);
        }
        BigDecimal personalAccount = tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), original.id())
                .stream().filter(tender -> tender.claimResponseId() != null && "PERSONAL_ACCOUNT".equals(tender.tenderType()))
                .map(SettlementTender::tenderAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new Retained(lines, charges, reversedAmount, reversedQuantity, personalAccount);
    }

    private record Retained(Map<Long, SettlementLine> lines, Map<Long, ChargeItem> originalCharges,
                            Map<Long, BigDecimal> reversedAmount, Map<Long, BigDecimal> reversedQuantity,
                            BigDecimal personalAccount) {
        BigDecimal ratio(SettlementLine line) {
            if (line.grossAmount().signum() == 0) return BigDecimal.ZERO;
            BigDecimal kept = line.grossAmount().subtract(reversedAmount.getOrDefault(line.chargeItemId(), BigDecimal.ZERO))
                    .max(BigDecimal.ZERO);
            return kept.divide(line.grossAmount(), 12, RoundingMode.HALF_UP);
        }

        BigDecimal retainedShare(BigDecimal amount) {
            BigDecimal gross = lines.values().stream().map(SettlementLine::grossAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
            if (gross.signum() == 0) return BigDecimal.ZERO;
            BigDecimal kept = lines.values().stream().map(line -> line.grossAmount().multiply(ratio(line)))
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            return amount.multiply(kept).divide(gross, 6, RoundingMode.HALF_UP);
        }

        List<ChargeLine> lines(ReliefTiming timing) {
            List<SettlementLine> values = new ArrayList<>(lines.values());
            List<BigDecimal> shares = ReliefCalculator.split(personalAccount,
                    values.stream().map(SettlementLine::patientAmount).toList(), 6);
            List<ChargeLine> result = new ArrayList<>();
            for (int index = 0; index < values.size(); index++) {
                SettlementLine line = values.get(index);
                ChargeItem charge = originalCharges.get(line.chargeItemId());
                BigDecimal ratio = ratio(line);
                BigDecimal quantity = line.settledQuantity()
                        .subtract(reversedQuantity.getOrDefault(line.chargeItemId(), BigDecimal.ZERO)).max(BigDecimal.ZERO);
                if (timing == ReliefTiming.PRE_INSURANCE) {
                    result.add(new ChargeLine(line.id(), charge.catalogItemId(), charge.accountingCategory(),
                            charge.sourceType(), quantity, line.grossAmount().multiply(ratio), null, null, null, null));
                } else {
                    BigDecimal share = shares.isEmpty() ? BigDecimal.ZERO : shares.get(index);
                    result.add(new ChargeLine(line.id(), charge.catalogItemId(), charge.accountingCategory(),
                            charge.sourceType(), quantity, line.netAmount().multiply(ratio), null,
                            line.patientAmount().subtract(share).multiply(ratio), share.multiply(ratio), null));
                }
            }
            return result;
        }
    }

    void confirmQuota(ExecutionContext context, Settlement settlement, Instant occurredAt) {
        List<ReliefApplication> existing = applications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(
                context.tenantId(), settlement.id());
        if (!existing.isEmpty()) quotas.confirm(context.tenantId(), existing, context.subjectId(), occurredAt);
    }

    List<ReliefApplicationView> applications(ExecutionContext context, Long settlementId) {
        List<ReliefApplication> values = applications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(
                context.tenantId(), settlementId);
        if (values.isEmpty()) return List.of();
        Map<Long, String> names = policies.findAllById(values.stream().map(ReliefApplication::policyId).distinct().toList())
                .stream().collect(Collectors.toMap(ReliefPolicy::id, ReliefPolicy::name));
        Map<Long, List<ReliefApplicationLine>> lines = applicationLines.findByTenantIdAndApplicationIdIn(context.tenantId(),
                values.stream().map(ReliefApplication::id).toList()).stream()
                .collect(Collectors.groupingBy(ReliefApplicationLine::applicationId));
        return values.stream().map(value -> new ReliefApplicationView(value.id(), value.policyId(), names.get(value.policyId()),
                value.policyVersionId(), value.timing().name(), value.sponsor().name(), value.baseAmount(),
                value.reliefAmount(), value.status().name(), value.manualReason(), value.approvedBy(), value.createdAt(),
                lines.getOrDefault(value.id(), List.of()).stream().map(line -> new ReliefApplicationLineView(
                        line.settlementLineId(), line.chargeItemId(), line.baseAmount(), line.reliefAmount())).toList()))
                .toList();
    }

    private Stage prepare(ExecutionContext context, PatientAccount account, Settlement settlement, ReliefTiming timing,
                          String coverageType, boolean lock) {
        LocalDate businessDate = LocalDate.ofInstant(settlement.createdAt(), BUSINESS_ZONE);
        List<ReliefPolicy> active = policies.findByTenantIdAndStatus(context.tenantId(), ReliefPolicyStatus.ACTIVE);
        List<ReliefPolicyVersion> candidates = versions.findByTenantIdAndIdIn(context.tenantId(),
                        active.stream().map(ReliefPolicy::currentVersionId).filter(Objects::nonNull).toList()).stream()
                .filter(version -> version.timing() == timing && version.effectiveOn(businessDate)
                        && inScope(version, settlement))
                .toList();
        if (candidates.isEmpty()) return Stage.empty();
        Map<Long, String> names = active.stream().collect(Collectors.toMap(ReliefPolicy::id, ReliefPolicy::name));
        List<Long> versionIds = candidates.stream().map(ReliefPolicyVersion::id).toList();
        Map<Long, List<ReliefRule>> rulesByVersion = rules.findByTenantIdAndPolicyVersionIdInOrderByLineNoAsc(
                context.tenantId(), versionIds).stream().collect(Collectors.groupingBy(ReliefRule::policyVersionId));
        Map<Long, List<ReliefQualification>> qualificationsByVersion = qualifications
                .findByTenantIdAndPolicyVersionIdInOrderByLineNoAsc(context.tenantId(), versionIds).stream()
                .collect(Collectors.groupingBy(ReliefQualification::policyVersionId));
        Facts facts = new Facts(residents.requireSnapshot(context.tenantId(), account.residentId()),
                roster.findByTenantIdAndResidentIdAndStatus(context.tenantId(), account.residentId(), ReliefRosterStatus.ACTIVE),
                coverageType, businessDate,
                dictionaries.resolveItemTexts(context.tenantId(), ReliefPolicyApplicationService.QUALIFICATION_TYPE_DICTIONARY));

        List<ReliefApplication> existing = applications.findByTenantIdAndSettlementIdOrderByCreatedAtAscIdAsc(
                context.tenantId(), settlement.id()).stream().filter(value -> value.reversesApplicationId() == null).toList();
        Map<Long, ReliefPolicyVersion> existingVersions = existing.isEmpty() ? Map.of()
                : versions.findByTenantIdAndIdIn(context.tenantId(), existing.stream()
                        .map(ReliefApplication::policyVersionId).distinct().toList()).stream()
                .collect(Collectors.toMap(ReliefPolicyVersion::id, value -> value));
        List<ReliefCalculator.PriorPolicy> prior = existing.stream().map(value -> {
            ReliefPolicyVersion version = existingVersions.get(value.policyVersionId());
            return new ReliefCalculator.PriorPolicy(value.policyId(), version.mutexGroup(), version.stackable());
        }).toList();

        List<PreparedPolicy> prepared = new ArrayList<>();
        for (ReliefPolicyVersion version : candidates) {
            List<ReliefRule> versionRules = rulesByVersion.getOrDefault(version.id(), List.of());
            Eligibility result = eligibility.resolve(version,
                    qualificationsByVersion.getOrDefault(version.id(), List.of()), facts);
            ReliefQuotaKey policyKey = quotas.key(version, account.residentId(), businessDate,
                    settlement.settlementScene(), settlement.organizationId(), ReliefQuotaKey.POLICY_SCOPE);
            BigDecimal remainingAmount = null;
            Integer remainingCount = null;
            if (result.eligible() && (version.periodMaxAmount() != null || version.periodMaxCount() != null)) {
                ReliefQuotaService.Usage usage = quotas.usage(context.tenantId(), policyKey, lock);
                if (version.periodMaxAmount() != null) remainingAmount = version.periodMaxAmount().subtract(usage.amount());
                if (version.periodMaxCount() != null) remainingCount = version.periodMaxCount() - usage.count();
            }
            List<ReliefCalculator.Rule> calculatorRules = new ArrayList<>();
            for (ReliefRule rule : versionRules) {
                Integer ruleRemaining = null;
                if (result.eligible() && rule.terms().periodMaxCount() != null) {
                    ReliefQuotaKey ruleKey = quotas.key(version, account.residentId(), businessDate,
                            settlement.settlementScene(), settlement.organizationId(), rule.terms().scopeKey());
                    ruleRemaining = rule.terms().periodMaxCount() - quotas.usage(context.tenantId(), ruleKey, lock).count();
                }
                calculatorRules.add(new ReliefCalculator.Rule(rule.id(), rule.terms(), ruleRemaining));
            }
            ReliefCalculator.Policy input = new ReliefCalculator.Policy(version.policyId(), version.id(),
                    names.get(version.policyId()), version.timing(), version.priority(), version.mutexGroup(),
                    version.stackable(), version.insuredApplicable(), version.baseIncludesPersonalAccount(),
                    version.onceMaxAmount(), remainingAmount, remainingCount, result.eligible(), result.reason(),
                    calculatorRules);
            prepared.add(new PreparedPolicy(version, input, result));
        }
        return new Stage(prepared, chargeLines(context, settlement, timing, existing), prior, businessDate);
    }

    private List<ChargeLine> chargeLines(ExecutionContext context, Settlement settlement, ReliefTiming timing,
                                         List<ReliefApplication> existing) {
        List<SettlementLine> values = settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                context.tenantId(), settlement.id());
        Map<Long, ChargeItem> charges = chargeItems.findAllById(values.stream().map(SettlementLine::chargeItemId).toList())
                .stream().collect(Collectors.toMap(ChargeItem::id, value -> value));
        if (timing == ReliefTiming.PRE_INSURANCE) {
            return values.stream().map(line -> {
                ChargeItem charge = charges.get(line.chargeItemId());
                return new ChargeLine(line.id(), charge.catalogItemId(), charge.accountingCategory(), charge.sourceType(),
                        line.settledQuantity(), line.grossAmount(), line.discountAmount(), null, null, null);
            }).toList();
        }
        // 医保后：行个人自付 = 行净额 - 统筹 - 其他基金；个人账户按行自付比例分摊，剩余为现金自付。
        BigDecimal personalAccount = tenders.findByTenantIdAndSettlementIdOrderByLineNoAsc(context.tenantId(), settlement.id())
                .stream().filter(tender -> tender.claimResponseId() != null && "PERSONAL_ACCOUNT".equals(tender.tenderType()))
                .map(SettlementTender::tenderAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<BigDecimal> shares = ReliefCalculator.split(personalAccount,
                values.stream().map(SettlementLine::patientAmount).toList(), 6);
        Set<Long> postApplications = existing.stream().filter(value -> value.timing() == ReliefTiming.POST_INSURANCE)
                .map(ReliefApplication::id).collect(Collectors.toSet());
        Map<Long, BigDecimal> priorRelief = new HashMap<>();
        if (!postApplications.isEmpty()) {
            applicationLines.findByTenantIdAndApplicationIdIn(context.tenantId(), postApplications)
                    .forEach(line -> priorRelief.merge(line.settlementLineId(), line.reliefAmount(), BigDecimal::add));
        }
        List<ChargeLine> result = new ArrayList<>();
        for (int index = 0; index < values.size(); index++) {
            SettlementLine line = values.get(index);
            ChargeItem charge = charges.get(line.chargeItemId());
            BigDecimal share = shares.isEmpty() ? BigDecimal.ZERO : shares.get(index);
            result.add(new ChargeLine(line.id(), charge.catalogItemId(), charge.accountingCategory(), charge.sourceType(),
                    line.settledQuantity(), line.netAmount(), null, line.patientAmount().subtract(share), share,
                    priorRelief.getOrDefault(line.id(), BigDecimal.ZERO)));
        }
        return result;
    }

    private boolean inScope(ReliefPolicyVersion version, Settlement settlement) {
        ReliefApplicableScope scope = json.read(version.applicableScopeJson(), ReliefApplicableScope.class);
        return scope.scenes().contains(settlement.settlementScene())
                && (scope.organizationIds().isEmpty() || scope.organizationIds().contains(settlement.organizationId()));
    }

    private void persist(ExecutionContext context, PatientAccount account, Settlement settlement, Invoice invoice,
                         Stage stage, ReliefCalculator.Result result, Map<Long, ManualDecision> manual,
                         String commandPrefix) {
        Instant now = Instant.now();
        Map<Long, SettlementLine> lines = settlementLines.findByTenantIdAndSettlementIdOrderByLineNoAsc(
                        context.tenantId(), settlement.id()).stream()
                .collect(Collectors.toMap(SettlementLine::id, value -> value, (a, b) -> a, LinkedHashMap::new));
        for (Outcome outcome : result.applied()) {
            String command = commandPrefix + settlement.id() + "-" + outcome.policyId();
            if (applications.findByTenantIdAndCommandCode(context.tenantId(), command).isPresent()) continue;
            PreparedPolicy policy = stage.policy(outcome.policyId());
            ManualDecision decision = manual.get(outcome.policyId());
            ReliefApplication application = applications.save(new ReliefApplication(context.tenantId(),
                    settlement.organizationId(), settlement.id(), account.residentId(), policy.version(),
                    settlement.settlementScene(), outcome.baseAmount(), outcome.reliefAmount(),
                    policy.eligibility().evidenceJson(),
                    decision == null ? null : new ReliefApplication.ManualApproval(decision.reason().trim(),
                            decision.evidence(), context.subjectId()),
                    command, context.subjectId(), now));
            for (ReliefCalculator.LineRelief line : outcome.lines()) {
                SettlementLine settlementLine = lines.get(line.lineId());
                applicationLines.save(new ReliefApplicationLine(context.tenantId(), application.id(), line.lineId(),
                        settlementLine.chargeItemId(), line.ruleId(), line.baseAmount(), line.reliefAmount()));
                if (policy.version().timing() == ReliefTiming.PRE_INSURANCE) settlementLine.applyDiscount(line.reliefAmount());
            }
            if (policy.version().timing() == ReliefTiming.PRE_INSURANCE) {
                settlement.applyPreInsuranceDiscount(outcome.reliefAmount());
                invoice.applyDiscount(outcome.reliefAmount());
            } else {
                int lineNo = Math.toIntExact(tenders.countByTenantIdAndSettlementId(context.tenantId(), settlement.id()) + 1);
                SettlementTender tender = tenders.save(SettlementTender.relief(context.tenantId(), settlement.id(),
                        application.id(), lineNo, policy.version().sponsor() == ReliefSponsor.HOSPITAL
                                ? "HOSPITAL_DISCOUNT" : "SUBSIDY",
                        policy.version().payerCode(), payerName(policy), outcome.reliefAmount(), settlement.currencyCode()));
                application.bindTender(tender.id());
                settlement.applyPostInsuranceRelief(outcome.reliefAmount());
            }
            ledger.save(new LedgerEntry(context.tenantId(), account.id(), "RELIEF", "CREDIT", outcome.reliefAmount(),
                    settlement.currencyCode(), null, settlement.legacyInvoiceId(), null, null, now, context.subjectId()));
            ReliefQuotaKey policyKey = quotas.key(policy.version(), account.residentId(), stage.businessDate(),
                    settlement.settlementScene(), settlement.organizationId(), ReliefQuotaKey.POLICY_SCOPE);
            quotas.reserve(context.tenantId(), application, policyKey, outcome.reliefAmount(), 1, context.subjectId(), now);
            for (String scope : outcome.usedRuleScopes()) {
                quotas.reserve(context.tenantId(), application, quotas.key(policy.version(), account.residentId(),
                        stage.businessDate(), settlement.settlementScene(), settlement.organizationId(), scope),
                        BigDecimal.ZERO.setScale(6), 1, context.subjectId(), now);
            }
        }
    }

    private static String payerName(PreparedPolicy policy) {
        return policy.version().payerName() != null ? policy.version().payerName() : policy.input().name();
    }

    private static List<ReliefOutcomeView> views(ReliefCalculator.Result result) {
        return result.outcomes().stream().map(outcome -> new ReliefOutcomeView(outcome.policyId(), outcome.policyName(),
                result.timing().name(), outcome.status().name(), outcome.message(),
                outcome.baseAmount().setScale(2, RoundingMode.HALF_UP), outcome.reliefAmount().setScale(2, RoundingMode.HALF_UP)))
                .toList();
    }

    private record PreparedPolicy(ReliefPolicyVersion version, ReliefCalculator.Policy input, Eligibility eligibility) {}

    private record Stage(List<PreparedPolicy> policies, List<ChargeLine> lines, List<ReliefCalculator.PriorPolicy> prior,
                         LocalDate businessDate) {
        static Stage empty() { return new Stage(List.of(), List.of(), List.of(), null); }
        List<ReliefCalculator.Policy> policyInputs() { return policies.stream().map(PreparedPolicy::input).toList(); }
        PreparedPolicy policy(Long policyId) {
            return policies.stream().filter(value -> value.version().policyId().equals(policyId)).findFirst().orElseThrow();
        }
    }

    /** 人工核准：金额、原因与依据；核准人为当前操作人，需人工核准权限。 */
    record ManualDecision(BigDecimal amount, String reason, String evidence) {}
}
