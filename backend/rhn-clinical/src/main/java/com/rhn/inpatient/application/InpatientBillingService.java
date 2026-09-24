package com.rhn.inpatient.application;

import com.rhn.billing.api.InpatientBillingDirectory;
import com.rhn.billing.api.InpatientBillingDirectory.AccountSnapshot;
import com.rhn.billing.api.InpatientBillingDirectory.PostedCharge;
import com.rhn.inpatient.api.InpatientBillingViews.AccountView;
import com.rhn.inpatient.api.InpatientBillingViews.BedDayPostingView;
import com.rhn.inpatient.api.InpatientBillingViews.CategorySummaryView;
import com.rhn.inpatient.api.InpatientBillingViews.CostLineView;
import com.rhn.inpatient.api.InpatientBillingViews.DailyStatementView;
import com.rhn.inpatient.api.InpatientBillingViews.DepositView;
import com.rhn.inpatient.api.InpatientBillingViews.DepositRecordView;
import com.rhn.inpatient.api.InpatientBillingViews.FinalSettlementView;
import com.rhn.inpatient.api.InpatientBillingViews.FinancialActionView;
import com.rhn.inpatient.api.InpatientBillingViews.FinancialSettlementView;
import com.rhn.inpatient.domain.CareEpisode;
import com.rhn.inpatient.domain.EncounterLocationHistory;
import com.rhn.inpatient.domain.InpatientBedProfile;
import com.rhn.inpatient.domain.InpatientBedDayFact;
import com.rhn.inpatient.domain.InpatientCareRequest;
import com.rhn.inpatient.domain.InpatientEncounter;
import com.rhn.inpatient.domain.InpatientOrderTask;
import com.rhn.inpatient.domain.ServiceLocation;
import com.rhn.inpatient.infrastructure.CareEpisodeRepository;
import com.rhn.inpatient.infrastructure.EncounterLocationHistoryRepository;
import com.rhn.inpatient.infrastructure.InpatientBedProfileRepository;
import com.rhn.inpatient.infrastructure.InpatientBedDayFactRepository;
import com.rhn.inpatient.infrastructure.InpatientCareRequestRepository;
import com.rhn.inpatient.infrastructure.InpatientEncounterRepository;
import com.rhn.inpatient.infrastructure.InpatientOrderTaskRepository;
import com.rhn.inpatient.infrastructure.ServiceLocationRepository;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

@Service
public class InpatientBillingService {
    private static final String DEFAULT_CURRENCY = "CNY";
    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Asia/Shanghai");
    private final CareEpisodeRepository episodes;
    private final InpatientEncounterRepository encounters;
    private final InpatientCareRequestRepository requests;
    private final InpatientOrderTaskRepository orderTasks;
    private final EncounterLocationHistoryRepository locations;
    private final InpatientBedProfileRepository beds;
    private final InpatientBedDayFactRepository bedDays;
    private final ServiceLocationRepository serviceLocations;
    private final InpatientBillingDirectory billing;
    private final CatalogLifecycleDirectory catalog;
    private final ExecutionContextProvider contextProvider;

    public InpatientBillingService(
            CareEpisodeRepository episodes, InpatientEncounterRepository encounters,
            InpatientCareRequestRepository requests, InpatientOrderTaskRepository orderTasks,
            EncounterLocationHistoryRepository locations,
            InpatientBedProfileRepository beds, InpatientBedDayFactRepository bedDays,
            ServiceLocationRepository serviceLocations, InpatientBillingDirectory billing,
            CatalogLifecycleDirectory catalog,
            ExecutionContextProvider contextProvider) {
        this.episodes = episodes;
        this.encounters = encounters;
        this.requests = requests;
        this.orderTasks = orderTasks;
        this.locations = locations;
        this.beds = beds;
        this.bedDays = bedDays;
        this.serviceLocations = serviceLocations;
        this.billing = billing;
        this.catalog = catalog;
        this.contextProvider = contextProvider;
    }

    @Transactional(readOnly = true)
    public AccountView account(Long episodeId, String currencyCode) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireEpisode(context, episodeId);
        return account(context, inpatient, currency(currencyCode));
    }

    @Transactional
    public DepositView registerDeposit(Long episodeId, DepositCommand input) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireEpisode(context, episodeId);
        if (!"ADMITTED".equals(inpatient.episode().status())) {
            throw conflict("INPATIENT_DEPOSIT_EPISODE_CLOSED", "只有在院患者可以登记预交金");
        }
        String currency = currency(input.currencyCode());
        String paymentNo = required(input.paymentNo(), "INPATIENT_DEPOSIT_NO_REQUIRED", "预交金凭证号不能为空");
        String method = required(input.paymentMethodCode(), "INPATIENT_DEPOSIT_METHOD_REQUIRED", "支付方式不能为空")
                .toUpperCase(Locale.ROOT);
        BigDecimal amount = money(input.amount());
        if (amount.signum() <= 0) throw badRequest("INPATIENT_DEPOSIT_AMOUNT_INVALID", "预交金金额必须大于零");

        var result = billing.registerDeposit(new InpatientBillingDirectory.DepositCommand(
                context.tenantId(), inpatient.episode().residentId(), inpatient.encounter().id(),
                inpatient.episode().organizationId(), inpatient.encounter().departmentId(), paymentNo,
                amount, currency, method, input.paidAt(), clean(input.externalTransactionNo()),
                clean(input.description()), context.subjectId()));
        return new DepositView(result.paymentId(), result.paymentNo(), result.amount(), result.currencyCode(),
                result.paymentMethodCode(), result.paidAt(), result.duplicate(),
                account(context, inpatient, currency));
    }

    @Transactional
    public BedDayPostingView postBedDays(Long episodeId, BedDayPostingCommand input) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireLockedEpisode(context, episodeId);
        LocalDate throughDate = input.throughDate() == null ? LocalDate.now(BUSINESS_ZONE) : input.throughDate();
        PostingStats result = postBedDays(context, inpatient, throughDate,
                required(input.commandCode(), "INPATIENT_BED_DAY_COMMAND_REQUIRED", "床日记账命令编码不能为空"),
                currency(input.currencyCode()));
        return new BedDayPostingView(episodeId, inpatient.encounter().id(), result.throughDate(),
                result.createdCount(), result.existingCount(), result.postedAmount(),
                account(context, inpatient, currency(input.currencyCode())));
    }

    @Transactional(readOnly = true)
    public DailyStatementView dailyStatement(Long episodeId, LocalDate businessDate, String currencyCode) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireEpisode(context, episodeId);
        LocalDate date = businessDate == null ? LocalDate.now(BUSINESS_ZONE) : businessDate;
        AccountView account = account(context, inpatient, currency(currencyCode));
        List<CostLineView> lines = account.costLines().stream()
                .filter(value -> businessDate(value.occurredAt()).equals(date)).toList();
        BigDecimal posted = money(lines.stream().filter(CostLineView::posted)
                .map(CostLineView::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        BigDecimal estimated = money(lines.stream().filter(value -> !value.posted())
                .map(CostLineView::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
        Map<String, CategoryTotals> summaries = new LinkedHashMap<>();
        lines.forEach(value -> summaries.computeIfAbsent(value.category(), ignored -> new CategoryTotals())
                .add(value.posted(), value.totalAmount()));
        List<CategorySummaryView> categories = summaries.entrySet().stream()
                .map(value -> new CategorySummaryView(value.getKey(), categoryName(value.getKey()),
                        money(value.getValue().posted), money(value.getValue().estimated),
                        money(value.getValue().posted.add(value.getValue().estimated))))
                .toList();
        return new DailyStatementView(episodeId, inpatient.encounter().id(), date, posted, estimated,
                categories, lines, Instant.now());
    }

    @Transactional
    public FinalSettlementView finalSettlement(Long episodeId, FinalSettlementCommand input) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireLockedEpisode(context, episodeId);
        if (!"DISCHARGED".equals(inpatient.episode().status())) {
            throw conflict("INPATIENT_FINAL_SETTLEMENT_REQUIRES_DISCHARGE", "完成临床出院后才能办理住院最终结算");
        }
        String currency = currency(input.currencyCode());
        LocalDate lastDate = lastBillableDate(inpatient.episode());
        postBedDays(context, inpatient, lastDate,
                required(input.commandCode(), "INPATIENT_SETTLEMENT_COMMAND_REQUIRED", "住院结算命令编码不能为空")
                        + "-BED",
                currency);
        AccountView prepared = account(context, inpatient, currency);
        if (prepared.estimatedOrderAmount().signum() > 0 || prepared.estimatedBedAmount().signum() > 0) {
            throw conflict("INPATIENT_SETTLEMENT_HAS_UNPOSTED_COST", "仍有未执行医嘱或未记账床日，暂不能生成最终结算");
        }
        if (prepared.patientAccountId() == null) {
            throw conflict("INPATIENT_SETTLEMENT_ACCOUNT_MISSING", "当前住院尚未形成可结算费用账户");
        }
        var result = billing.issueFinalSettlement(new InpatientBillingDirectory.FinalSettlementCommand(
                context.tenantId(), prepared.patientAccountId(),
                required(input.invoiceNo(), "INPATIENT_SETTLEMENT_NO_REQUIRED", "结算凭证编码不能为空"),
                input.issuedAt(), clean(input.terminalCode())));
        return new FinalSettlementView(episodeId, inpatient.encounter().id(), result.invoiceId(),
                result.settlementId(), result.invoiceNo(), result.settlementNo(), result.status(),
                result.netAmount(), result.prepaymentAmount(), result.paidAmount(), result.outstandingAmount(),
                result.refundableAmount(), result.financialStatus(), result.currencyCode(), result.duplicate(),
                account(context, inpatient, currency));
    }

    @Transactional
    public FinancialActionView collectFinalPayment(Long episodeId, SettlementPaymentCommand input) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireLockedEpisode(context, episodeId);
        requireDischarged(inpatient);
        String currency = currency(input.currencyCode());
        var financial = requireFinancialSettlement(context, inpatient, currency);
        var result = billing.collectFinalPayment(new InpatientBillingDirectory.SettlementPaymentCommand(
                context.tenantId(), financial.settlementId(), input.expectedRevision(),
                required(input.commandCode(), "INPATIENT_PAYMENT_COMMAND_REQUIRED", "补缴命令编码不能为空"),
                required(input.paymentMethodCode(), "INPATIENT_PAYMENT_METHOD_REQUIRED", "支付方式不能为空")
                        .toUpperCase(Locale.ROOT),
                input.amount(), input.paidAt(), clean(input.externalTransactionNo()), clean(input.description())));
        return new FinancialActionView(List.of(result.paymentId()), result.duplicate(),
                financialView(result.settlement()), account(context, inpatient, currency));
    }

    @Transactional
    public FinancialActionView refundSurplus(Long episodeId, SurplusRefundCommand input) {
        ExecutionContext context = requireContext();
        EpisodeContext inpatient = requireLockedEpisode(context, episodeId);
        requireDischarged(inpatient);
        String currency = currency(input.currencyCode());
        var financial = requireFinancialSettlement(context, inpatient, currency);
        var result = billing.refundSurplus(new InpatientBillingDirectory.SurplusRefundCommand(
                context.tenantId(), financial.settlementId(), input.expectedRevision(),
                required(input.commandCode(), "INPATIENT_REFUND_COMMAND_REQUIRED", "退余命令编码不能为空"),
                input.amount(), input.refundedAt(), clean(input.externalTransactionNo()), clean(input.reason())));
        return new FinancialActionView(result.refundPaymentIds(), result.duplicate(),
                financialView(result.settlement()), account(context, inpatient, currency));
    }

    private AccountView account(ExecutionContext context, EpisodeContext inpatient, String currency) {
        AccountSnapshot billingAccount = billing.account(context.tenantId(), inpatient.encounter().id(), currency);
        List<CostLineView> lines = new ArrayList<>();
        billingAccount.charges().forEach(value -> lines.add(postedLine(value)));
        requests.findByTenantIdAndEncounterIdAndStatusInOrderByAuthoredAtAscIdAsc(
                        context.tenantId(), inpatient.encounter().id(), List.of("ACTIVE", "COMPLETED")).stream()
                .filter(value -> currency.equals(value.currencyCode()))
                .forEach(value -> orderEstimateLines(context, value).forEach(lines::add));
        bedEstimateLines(context, inpatient, currency).forEach(lines::add);

        BigDecimal postedAmount = sum(lines, true, null);
        BigDecimal orderAmount = sum(lines, false, "ORDER");
        BigDecimal bedAmount = sum(lines, false, "BED");
        BigDecimal total = money(postedAmount.add(orderAmount).add(bedAmount));
        BigDecimal deposit = money(billingAccount.depositAmount());
        BigDecimal ledgerBalance = money(billingAccount.ledgerBalance());
        BigDecimal projectedBalance = money(ledgerBalance.add(orderAmount).add(bedAmount));
        BigDecimal outstanding = money(projectedBalance.max(BigDecimal.ZERO));
        BigDecimal credit = money(projectedBalance.negate().max(BigDecimal.ZERO));
        return new AccountView(inpatient.episode().id(), inpatient.encounter().id(),
                billingAccount.patientAccountId(), billingAccount.accountStatus(),
                inpatient.episode().status(), currency, postedAmount, orderAmount, bedAmount, total,
                deposit, ledgerBalance, outstanding, credit, outstanding.signum() > 0, true,
                financialView(billingAccount.financialSettlement()), billingAccount.deposits().stream()
                .map(value -> new DepositRecordView(value.paymentId(), value.paymentNo(), value.originalAmount(),
                        value.allocatedAmount(), value.refundedAmount(), value.availableAmount(),
                        value.currencyCode(), value.paymentMethodCode(), value.paidAt(),
                        value.externalTransactionNo(), value.description()))
                .toList(), List.copyOf(lines));
    }

    private InpatientBillingDirectory.FinancialSettlementSnapshot requireFinancialSettlement(
            ExecutionContext context, EpisodeContext inpatient, String currency) {
        AccountSnapshot account = billing.account(context.tenantId(), inpatient.encounter().id(), currency);
        if (account.financialSettlement() == null) {
            throw conflict("INPATIENT_FINAL_SETTLEMENT_MISSING", "请先完成费用核对并生成住院结算单");
        }
        return account.financialSettlement();
    }

    private FinancialSettlementView financialView(
            InpatientBillingDirectory.FinancialSettlementSnapshot value) {
        if (value == null) return null;
        return new FinancialSettlementView(value.invoiceId(), value.settlementId(), value.revision(),
                value.invoiceNo(), value.settlementNo(), value.settlementStatus(), value.financialStatus(),
                value.netAmount(), value.prepaymentAmount(), value.paidAmount(), value.outstandingAmount(),
                value.refundableAmount(), value.currencyCode(), value.finalizedAt());
    }

    private void requireDischarged(EpisodeContext inpatient) {
        if (!"DISCHARGED".equals(inpatient.episode().status())) {
            throw conflict("INPATIENT_FINANCIAL_ACTION_REQUIRES_DISCHARGE", "完成临床出院后才能办理补缴或退余");
        }
    }

    private CostLineView postedLine(PostedCharge value) {
        String category = value.sourceType().contains("BED") ? "BED" : "ORDER";
        return new CostLineView(category, value.sourceType(), value.id(), value.itemCode(),
                value.itemName(), value.status(), value.quantity(), value.unitCode(), value.unitPrice(),
                money(value.totalAmount()), value.currencyCode(), value.occurredAt(), true);
    }

    private List<CostLineView> orderEstimateLines(ExecutionContext context, InpatientCareRequest request) {
        if (request.unitPrice() == null || request.totalAmount() == null) return List.of();
        List<InpatientOrderTask> planned = orderTasks.findByTenantIdAndRequestIdOrderByOccurrenceNoAsc(
                        context.tenantId(), request.id()).stream()
                .filter(task -> "PLANNED".equals(task.status()))
                .toList();
        if (!planned.isEmpty()) {
            BigDecimal price = money(request.unitPrice());
            return planned.stream().map(task -> new CostLineView(
                    "ORDER", "INPATIENT_ORDER_TASK_ESTIMATE", task.id(), request.itemCodeSnapshot(),
                    request.itemNameSnapshot(), task.status(), BigDecimal.ONE, request.unitCodeSnapshot(),
                    price, price, request.currencyCode(), task.scheduledAt(), false)).toList();
        }
        if (!"ACTIVE".equals(request.status())) return List.of();
        return List.of(new CostLineView("ORDER", "CARE_REQUEST_ESTIMATE", request.id(),
                request.itemCodeSnapshot(), request.itemNameSnapshot(), request.status(), BigDecimal.ONE,
                request.unitCodeSnapshot(), money(request.unitPrice()), money(request.totalAmount()),
                request.currencyCode(), request.authoredAt(), false));
    }

    private List<CostLineView> bedEstimateLines(ExecutionContext context, EpisodeContext inpatient, String currency) {
        List<EncounterLocationHistory> histories = locations.findByTenantIdAndEncounterIdOrderByStartAtAscIdAsc(
                context.tenantId(), inpatient.encounter().id());
        var postedDates = bedDays.findByTenantIdAndEpisodeIdOrderByBusinessDateAscIdAsc(
                context.tenantId(), inpatient.episode().id()).stream()
                .map(InpatientBedDayFact::businessDate).collect(java.util.stream.Collectors.toSet());
        LocalDate first = businessDate(inpatient.episode().startAt());
        LocalDate last = lastBillableDate(inpatient.episode());
        List<CostLineView> result = new ArrayList<>();
        for (LocalDate date = first; !date.isAfter(last); date = date.plusDays(1)) {
            if (postedDates.contains(date)) continue;
            EncounterLocationHistory history = historyForDate(histories, date);
            if (history == null) continue;
            InpatientBedProfile profile = beds.findById(history.locationId()).orElse(null);
            ServiceLocation location = serviceLocations.findByIdAndTenantId(history.locationId(), context.tenantId())
                    .orElse(null);
            BigDecimal rate = estimatedRate(context, inpatient, profile, date, currency);
            result.add(new CostLineView("BED", "INPATIENT_BED_ESTIMATE", history.id(),
                    location == null ? null : location.code(),
                    location == null ? "住院床位费" : location.name() + "床位费",
                    history.status(), BigDecimal.ONE, "床日", rate, rate, currency,
                    date.atStartOfDay(BUSINESS_ZONE).toInstant(), false));
        }
        return List.copyOf(result);
    }

    private PostingStats postBedDays(ExecutionContext context, EpisodeContext inpatient,
                                     LocalDate requestedThroughDate, String commandCode, String currency) {
        if (!List.of("ADMITTED", "DISCHARGED").contains(inpatient.episode().status())) {
            throw conflict("INPATIENT_BED_DAY_EPISODE_INVALID", "只有在院或已出院病程可以办理床日记账");
        }
        LocalDate first = businessDate(inpatient.episode().startAt());
        LocalDate maximum = lastBillableDate(inpatient.episode());
        if (requestedThroughDate.isBefore(first)) {
            throw badRequest("INPATIENT_BED_DAY_RANGE_INVALID", "床日记账截止日期不能早于入院日期");
        }
        if (requestedThroughDate.isAfter(LocalDate.now(BUSINESS_ZONE))) {
            throw badRequest("INPATIENT_BED_DAY_FUTURE_INVALID", "不能提前记账未来床日");
        }
        LocalDate through = requestedThroughDate.isAfter(maximum) ? maximum : requestedThroughDate;
        List<EncounterLocationHistory> histories = locations.findByTenantIdAndEncounterIdOrderByStartAtAscIdAsc(
                context.tenantId(), inpatient.encounter().id());
        int created = 0;
        int existing = 0;
        BigDecimal amount = BigDecimal.ZERO;
        for (LocalDate date = first; !date.isAfter(through); date = date.plusDays(1)) {
            if (bedDays.findByTenantIdAndEpisodeIdAndBusinessDate(
                    context.tenantId(), inpatient.episode().id(), date).isPresent()) {
                existing++;
                continue;
            }
            EncounterLocationHistory history = historyForDate(histories, date);
            if (history == null) {
                throw conflict("INPATIENT_BED_DAY_LOCATION_MISSING", date + " 缺少有效床位占用记录");
            }
            InpatientBedProfile profile = beds.findById(history.locationId())
                    .filter(value -> context.tenantId().equals(value.tenantId()))
                    .orElse(null);
            if (profile == null) {
                throw conflict("INPATIENT_BED_DAY_PROFILE_MISSING", date + " 缺少床位计费配置");
            }
            if (profile.chargeCatalogItemId() == null) {
                throw conflict("INPATIENT_BED_DAY_CATALOG_MISSING", date + " 的床位未绑定收费目录项目");
            }
            var pricing = catalog.resolve(context.tenantId(), profile.chargeCatalogItemId(),
                    inpatient.episode().organizationId(), null, "SALE", date);
            if (!pricing.item().chargeable() || !"ACTIVE".equals(pricing.item().status())
                    || pricing.adoption() == null || !pricing.adoption().chargeable()
                    || !"ACTIVE".equals(pricing.adoption().sdStatus())) {
                throw conflict("INPATIENT_BED_DAY_CATALOG_INACTIVE", date + " 的床位收费项目未在当前机构启用");
            }
            if (pricing.price() == null || !"ACTIVE".equals(pricing.price().sdStatus())) {
                throw conflict("INPATIENT_BED_DAY_PRICE_MISSING", date + " 缺少有效床位价格");
            }
            if (!currency.equals(pricing.price().currencyCode())) {
                throw conflict("INPATIENT_BED_DAY_CURRENCY_MISMATCH", date + " 的床位价格币种与住院账户不一致");
            }
            String dayCommand = commandCode + "-" + date;
            InpatientBedDayFact replay = bedDays.findByTenantIdAndCommandCode(context.tenantId(), dayCommand)
                    .orElse(null);
            if (replay != null) {
                if (!replay.episodeId().equals(inpatient.episode().id()) || !replay.businessDate().equals(date)) {
                    throw conflict("INPATIENT_BED_DAY_COMMAND_REUSED", "床日记账命令编码已用于其他住院业务日期");
                }
                existing++;
                continue;
            }
            InpatientBedDayFact fact = bedDays.saveAndFlush(new InpatientBedDayFact(
                    context.tenantId(), inpatient.episode().organizationId(), inpatient.encounter().departmentId(),
                    inpatient.episode().id(), inpatient.encounter().id(), history.id(),
                    history.locationId(), date, dayCommand, context.subjectId()));
            BigDecimal price = money(pricing.price().price());
            billing.postBedDay(new InpatientBillingDirectory.BedDayChargeCommand(
                    context.tenantId(), inpatient.episode().residentId(), inpatient.encounter().id(),
                    inpatient.episode().organizationId(), inpatient.encounter().departmentId(), fact.id(),
                    pricing.item().id(), pricing.item().code(), pricing.item().name(), price,
                    pricing.price().currencyCode(), pricing.price().id(), pricing.price().revision(),
                    pricing.price().sdPriceType(), date.atStartOfDay(BUSINESS_ZONE).toInstant(), context.subjectId()));
            created++;
            amount = amount.add(price);
        }
        return new PostingStats(through, created, existing, money(amount));
    }

    private EncounterLocationHistory historyForDate(List<EncounterLocationHistory> histories, LocalDate date) {
        Instant from = date.atStartOfDay(BUSINESS_ZONE).toInstant();
        Instant to = date.plusDays(1).atStartOfDay(BUSINESS_ZONE).toInstant();
        return histories.stream()
                .filter(value -> value.startAt().isBefore(to)
                        && (value.endAt() == null || value.endAt().isAfter(from)))
                .max(Comparator.comparing(EncounterLocationHistory::startAt)
                        .thenComparing(EncounterLocationHistory::id))
                .orElse(null);
    }

    private BigDecimal estimatedRate(ExecutionContext context, EpisodeContext inpatient,
                                     InpatientBedProfile profile, LocalDate date, String currency) {
        if (profile != null && profile.chargeCatalogItemId() != null) {
            try {
                var pricing = catalog.resolve(context.tenantId(), profile.chargeCatalogItemId(),
                        inpatient.episode().organizationId(), null, "SALE", date);
                if (pricing.price() != null && currency.equals(pricing.price().currencyCode())) {
                    return money(pricing.price().price());
                }
            } catch (RuntimeException ignored) {
                // Estimation remains available while an explicit posting command reports configuration gaps.
            }
        }
        return profile == null || profile.dailyBedRate() == null
                ? BigDecimal.ZERO.setScale(6) : money(profile.dailyBedRate());
    }

    private LocalDate lastBillableDate(CareEpisode episode) {
        LocalDate first = businessDate(episode.startAt());
        if (!"DISCHARGED".equals(episode.status()) || episode.endAt() == null) {
            return LocalDate.now(BUSINESS_ZONE);
        }
        LocalDate dischargeDate = businessDate(episode.endAt());
        return dischargeDate.isAfter(first) ? dischargeDate.minusDays(1) : first;
    }

    private LocalDate businessDate(Instant instant) {
        return instant.atZone(BUSINESS_ZONE).toLocalDate();
    }

    private String categoryName(String category) {
        if (category == null || category.isBlank()) return "其他费用";
        return switch (category.trim().toUpperCase()) {
            case "BED" -> "床位费";
            case "ORDER" -> "诊疗及医嘱费";
            case "REGISTRATION" -> "诊察挂号费";
            case "TREATMENT", "PROCEDURE" -> "治疗处置费";
            case "LABORATORY" -> "检验费";
            case "EXAMINATION", "IMAGING" -> "检查影像费";
            case "SURGERY" -> "手术费";
            case "NURSING" -> "护理费";
            case "BLOOD" -> "输血费";
            case "MATERIAL" -> "材料费";
            case "WESTERN_MED" -> "西药费";
            case "CHINESE_PATENT_MED" -> "中成药费";
            case "HERBAL_MED" -> "中药饮片费";
            case "MEDICATION" -> "药品费";
            default -> category;
        };
    }

    private BigDecimal sum(List<CostLineView> lines, boolean posted, String category) {
        return money(lines.stream().filter(value -> value.posted() == posted)
                .filter(value -> category == null || category.equals(value.category()))
                .map(CostLineView::totalAmount).reduce(BigDecimal.ZERO, BigDecimal::add));
    }

    private EpisodeContext requireEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findByIdAndTenantId(episodeId, context.tenantId())
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "未找到住院病程"));
        return requireEpisodeContext(context, episode);
    }

    private EpisodeContext requireLockedEpisode(ExecutionContext context, Long episodeId) {
        CareEpisode episode = episodes.findLocked(context.tenantId(), episodeId)
                .orElseThrow(() -> notFound("INPATIENT_EPISODE_NOT_FOUND", "未找到住院病程"));
        return requireEpisodeContext(context, episode);
    }

    private EpisodeContext requireEpisodeContext(ExecutionContext context, CareEpisode episode) {
        if (!context.canAccessOrganization(episode.organizationId())) {
            throw badRequest("INPATIENT_BILLING_SCOPE_INVALID", "当前工作上下文不能访问该住院费用");
        }
        InpatientEncounter encounter = encounters.findByTenantIdAndEpisodeId(context.tenantId(), episode.id())
                .orElseThrow(() -> notFound("INPATIENT_ENCOUNTER_NOT_FOUND", "住院病程缺少就诊事实"));
        return new EpisodeContext(episode, encounter);
    }

    private ExecutionContext requireContext() {
        ExecutionContext context = contextProvider.requireCurrent();
        if (!context.hasWorkContext()) throw badRequest("INPATIENT_BILLING_WORK_CONTEXT_REQUIRED", "住院费用操作必须选择工作机构");
        return context;
    }

    private String currency(String value) {
        String result = clean(value);
        if (result == null) return DEFAULT_CURRENCY;
        result = result.toUpperCase(Locale.ROOT);
        if (result.length() != 3) throw badRequest("INPATIENT_BILLING_CURRENCY_INVALID", "币种必须是三位代码");
        return result;
    }

    private String required(String value, String code, String message) {
        String result = clean(value);
        if (result == null) throw badRequest(code, message);
        return result;
    }

    private String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private BigDecimal money(BigDecimal value) {
        return value.setScale(6, RoundingMode.HALF_UP);
    }

    public record DepositCommand(String paymentNo, BigDecimal amount, String currencyCode,
                                 String paymentMethodCode, Instant paidAt,
                                 String externalTransactionNo, String description) {
    }

    public record BedDayPostingCommand(LocalDate throughDate, String currencyCode, String commandCode) {
    }

    public record FinalSettlementCommand(String invoiceNo, String currencyCode, Instant issuedAt,
                                         String terminalCode, String commandCode) {
    }

    public record SettlementPaymentCommand(
            long expectedRevision, String commandCode, String paymentMethodCode, BigDecimal amount,
            String currencyCode, Instant paidAt, String externalTransactionNo, String description) {
    }

    public record SurplusRefundCommand(
            long expectedRevision, String commandCode, BigDecimal amount, String currencyCode,
            Instant refundedAt, String externalTransactionNo, String reason) {
    }

    private record EpisodeContext(CareEpisode episode, InpatientEncounter encounter) {
    }

    private static final class CategoryTotals {
        private BigDecimal posted = BigDecimal.ZERO;
        private BigDecimal estimated = BigDecimal.ZERO;

        private void add(boolean actual, BigDecimal amount) {
            if (actual) posted = posted.add(amount);
            else estimated = estimated.add(amount);
        }
    }

    private record PostingStats(LocalDate throughDate, int createdCount, int existingCount,
                                BigDecimal postedAmount) {
    }
}
