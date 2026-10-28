package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceDebugViews.*;
import com.rhn.billing.infrastructure.InsuranceDebugStore;
import com.rhn.billing.infrastructure.InsuranceDebugStore.ConfigRow;
import com.rhn.billing.infrastructure.InsuranceDebugStore.LogQuery;
import com.rhn.billing.infrastructure.InsuranceDebugStore.LogRow;
import com.rhn.billing.infrastructure.insurance.chs.ChsExchange;
import com.rhn.billing.infrastructure.insurance.chs.ChsExchangeRecorder;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

/**
 * 医保接入向导的调试控制台：开关与记录范围配置、医保网关往返记录与查询。
 *
 * <p>记录只在调试开启且命中范围时发生，写库走独立单线程队列，队列满即丢弃，绝不阻塞或影响真实交易；
 * 默认存脱敏报文（沿用 {@link ChsExchangeRedactor}）。原始报文须独立权限、显式确认，并强制在 24 小时内自动关闭。
 */
@Service
public class InsuranceDebugService implements ChsExchangeRecorder {
    public static final String VIEW = "INSURANCE_DEBUG.VIEW";
    public static final String CONFIGURE = "INSURANCE_DEBUG.CONFIGURE";
    public static final String RAW = "INSURANCE_DEBUG.RAW";

    private static final Logger log = LoggerFactory.getLogger(InsuranceDebugService.class);
    private static final Logger audit = LoggerFactory.getLogger("rhn.insurance.debug.audit");
    private static final Duration CACHE_TTL = Duration.ofSeconds(5);
    private static final int MAX_AUTO_DISABLE_HOURS = 168;
    private static final int MAX_RAW_HOURS = 24;
    private static final int MAX_SELECTED = 20;
    private static final int PAYLOAD_LIMIT = 200_000;

    private static final List<InfnoOption> KNOWN = List.of(
            new InfnoOption("9001", "签到", true), new InfnoOption("9002", "签退", true),
            new InfnoOption("1101", "人员信息", false), new InfnoOption("2201", "就诊登记", true),
            new InfnoOption("2202", "就诊登记撤销", true), new InfnoOption("2203A", "就诊诊断上传", true),
            new InfnoOption("2204", "费用明细上传", true), new InfnoOption("2205", "费用明细撤销", true),
            new InfnoOption("2206", "预结算", true), new InfnoOption("2207", "结算", true), new InfnoOption("2208", "结算撤销", true));
    private static final Map<String, InfnoOption> KNOWN_BY_CODE = new LinkedHashMap<>();
    static { KNOWN.forEach(option -> KNOWN_BY_CODE.put(option.code(), option)); }

    enum Scope { ALL, IMPORTANT, SELECTED }
    enum Retention { SUMMARY, REDACTED, RAW }

    record Settings(boolean enabled, Scope scope, Set<String> selected, Retention retention, int keepDays, Instant until, long revision) {
        static Settings defaults() { return new Settings(false, Scope.IMPORTANT, Set.of(), Retention.REDACTED, 7, null, -1); }

        boolean active(Instant now) { return enabled && (until == null || until.isAfter(now)); }

        boolean inScope(String infno) {
            return switch (scope) {
                case ALL -> true;
                case IMPORTANT -> KNOWN_BY_CODE.containsKey(infno) && KNOWN_BY_CODE.get(infno).important();
                case SELECTED -> selected.contains(infno);
            };
        }
    }

    private record Cached(Settings settings, Instant loadedAt) {}

    private final InsuranceDebugStore store;
    private final ExecutionContextProvider contextProvider;
    private final JsonCodec json;
    private final Clock clock;
    private final Map<Long, Cached> cache = new ConcurrentHashMap<>();
    private final ThreadPoolExecutor writer = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1000),
            runnable -> { var thread = new Thread(runnable, "insurance-debug-writer"); thread.setDaemon(true); return thread; },
            (runnable, executor) -> log.warn("医保调试记录队列已满，丢弃一条记录"));

    @org.springframework.beans.factory.annotation.Autowired
    public InsuranceDebugService(InsuranceDebugStore store, ExecutionContextProvider contextProvider, JsonCodec json) {
        this(store, contextProvider, json, Clock.systemUTC());
    }

    InsuranceDebugService(InsuranceDebugStore store, ExecutionContextProvider contextProvider, JsonCodec json, Clock clock) {
        this.store = store; this.contextProvider = contextProvider; this.json = json; this.clock = clock;
    }

    // ==================== 配置 ====================

    public DebugSettingsView settings() {
        long tenant = tenant();
        Settings value = load(tenant, true);
        return view(value, clock.instant());
    }

    public DebugSettingsView update(UpdateDebugSettings request) {
        ExecutionContext context = contextProvider.requireCurrent();
        long tenant = context.tenantId();
        Scope scope = parse(Scope.class, request.scope(), "INSURANCE_DEBUG_SCOPE_INVALID", "记录范围无效");
        Retention retention = parse(Retention.class, request.retention() == null ? "REDACTED" : request.retention(),
                "INSURANCE_DEBUG_RETENTION_INVALID", "报文留存级别无效");
        Set<String> selected = selected(scope, request.selectedInfnos());
        int keepDays = request.keepDays() == null ? 7 : request.keepDays();
        if (keepDays < 1 || keepDays > 90) throw badRequest("INSURANCE_DEBUG_KEEP_DAYS_INVALID", "记录保留天数须在 1 到 90 之间");
        Integer hours = request.autoDisableHours();
        if (hours != null && (hours < 1 || hours > MAX_AUTO_DISABLE_HOURS)) {
            throw badRequest("INSURANCE_DEBUG_AUTO_DISABLE_INVALID", "自动关闭时间须在 1 到 " + MAX_AUTO_DISABLE_HOURS + " 小时之间");
        }
        if (retention == Retention.RAW && request.enabled()) {
            if (!context.hasAuthority(RAW)) throw badRequest("INSURANCE_DEBUG_RAW_FORBIDDEN", "无权限开启原始报文留存");
            if (!request.confirmRaw()) throw badRequest("INSURANCE_DEBUG_RAW_UNCONFIRMED", "原始报文含证件号等敏感信息，须确认后开启");
            if (hours == null || hours > MAX_RAW_HOURS) {
                throw badRequest("INSURANCE_DEBUG_RAW_DURATION", "原始报文留存须设置 " + MAX_RAW_HOURS + " 小时内自动关闭");
            }
        }
        Instant now = clock.instant();
        Instant until = request.enabled() && hours != null ? now.plus(Duration.ofHours(hours)) : null;
        var row = new ConfigRow(0, 0, request.enabled(), scope.name(), String.join(",", selected), retention.name(), keepDays, until);
        Settings before = load(tenant, true);
        if (before.revision() < 0) {
            if (request.expectedRevision() != null && request.expectedRevision() > 0) {
                throw conflict("INSURANCE_DEBUG_REVISION_CONFLICT", "调试配置已被他人修改，请刷新后重试");
            }
            try { store.insertConfig(GlobalIds.next(), tenant, row, context.subjectId(), now); }
            catch (org.springframework.dao.DuplicateKeyException duplicate) {
                throw conflict("INSURANCE_DEBUG_REVISION_CONFLICT", "调试配置已被他人修改，请刷新后重试");
            }
        } else {
            if (request.expectedRevision() == null || !request.expectedRevision().equals(before.revision())
                    || store.updateConfig(tenant, before.revision(), row, context.subjectId(), now) == 0) {
                throw conflict("INSURANCE_DEBUG_REVISION_CONFLICT", "调试配置已被他人修改，请刷新后重试");
            }
        }
        cache.remove(tenant);
        audit.info("insurance debug settings changed by={} enabled={} scope={} selected={} retention={} keepDays={} until={}",
                context.actor(), request.enabled(), scope, selected, retention, keepDays, until);
        return view(load(tenant, true), now);
    }

    // ==================== 记录 ====================

    @Override
    public void record(ChsExchange exchange) {
        try {
            Long tenant = TenantContext.currentTenantId().orElse(null);
            if (tenant == null) return;
            Instant now = clock.instant();
            Settings settings = load(tenant, false);
            if (!settings.active(now)) return;
            boolean failed = exchange.outcome() != ChsExchange.Outcome.OK
                    || (exchange.infcode() != null && !"0".equals(exchange.infcode()));
            boolean inScope = settings.inScope(exchange.infno());
            if (!inScope && !failed) return;
            // 范围外的失败交易仍留一条摘要：结果不明正是事后最需要追查的情况。
            Retention retention = inScope ? settings.retention() : Retention.SUMMARY;
            ExecutionContext context = currentContext();
            var row = new LogRow(0, exchange.infno(), exchange.startedAt(), exchange.durationMs(), exchange.httpStatus(), exchange.infcode(),
                    truncate(exchange.errMsg(), 1000), exchange.outcome().name(), retention.name(),
                    context == null ? null : context.subjectId(), context == null ? null : truncate(context.actor(), 128),
                    context == null ? null : context.organizationId(), context == null ? null : context.correlationId(),
                    payload(exchange.request(), retention), payload(exchange.response(), retention),
                    now.plus(Duration.ofDays(settings.keepDays())),
                    com.rhn.billing.infrastructure.insurance.chs.ChsExchangeScope.currentClaimId(), null);
            writer.execute(() -> {
                try { store.insertLog(GlobalIds.next(), tenant, row, now); }
                catch (RuntimeException failure) { log.warn("医保调试记录写入失败：{}", failure.getMessage()); }
            });
        } catch (RuntimeException failure) {
            log.warn("医保调试记录失败：{}", failure.getMessage());
        }
    }

    public ExchangePage exchanges(Instant from, Instant to, String infno, String outcome, String keyword, boolean failedOnly,
                                  String claimId, int page, int size) {
        long tenant = tenant();
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(0, page);
        var query = new LogQuery(from, to, blank(infno), blank(outcome), blank(keyword), failedOnly, claimId == null ? null : parseId(claimId));
        long total = store.count(tenant, query);
        var content = store.page(tenant, query, safePage, safeSize).stream().map(this::summary).toList();
        return new ExchangePage(content, total, (int) ((total + safeSize - 1) / safeSize), safePage, safeSize);
    }

    public ExchangeDetail exchange(String externalId) {
        ExecutionContext context = contextProvider.requireCurrent();
        long id;
        try { id = GlobalIds.parseExternal(externalId); }
        catch (RuntimeException invalid) { throw notFound("INSURANCE_DEBUG_RECORD_NOT_FOUND", "未找到该医保调试记录"); }
        LogRow row = store.find(context.tenantId(), id)
                .orElseThrow(() -> notFound("INSURANCE_DEBUG_RECORD_NOT_FOUND", "未找到该医保调试记录"));
        boolean rawVisible = Retention.RAW.name().equals(row.retention()) && context.hasAuthority(RAW);
        return new ExchangeDetail(summary(row), row.correlationId(), view(row.request(), rawVisible), view(row.response(), rawVisible), rawVisible);
    }

    /** 按保留期清理过期记录。 */
    @Scheduled(fixedDelayString = "${rhn.billing.insurance.debug.purge-interval-ms:3600000}", initialDelayString = "${rhn.billing.insurance.debug.purge-interval-ms:3600000}")
    public void purgeExpired() {
        try {
            int removed = store.purgeExpired(clock.instant());
            if (removed > 0) log.info("已清理 {} 条过期医保调试记录", removed);
        } catch (RuntimeException failure) {
            log.warn("清理医保调试记录失败：{}", failure.getMessage());
        }
    }

    // ==================== 内部 ====================

    private Settings load(long tenant, boolean fresh) {
        Instant now = clock.instant();
        Cached cached = fresh ? null : cache.get(tenant);
        if (cached != null && Duration.between(cached.loadedAt(), now).compareTo(CACHE_TTL) < 0) return cached.settings();
        Settings value = store.findConfig(tenant).map(this::settings).orElseGet(Settings::defaults);
        cache.put(tenant, new Cached(value, now));
        return value;
    }

    private Settings settings(ConfigRow row) {
        Set<String> selected = row.selectedInfnos() == null || row.selectedInfnos().isBlank() ? Set.of()
                : Set.copyOf(Arrays.asList(row.selectedInfnos().split(",")));
        return new Settings(row.enabled(), Scope.valueOf(row.scope()), selected, Retention.valueOf(row.retention()), row.keepDays(),
                row.enabledUntil(), row.revision());
    }

    private DebugSettingsView view(Settings value, Instant now) {
        return new DebugSettingsView(value.enabled(), value.active(now), value.scope().name(), value.selected().stream().sorted().toList(),
                value.retention().name(), value.keepDays(), value.until(), Math.max(value.revision(), 0), KNOWN,
                contextProvider.requireCurrent().hasAuthority(RAW));
    }

    private static Set<String> selected(Scope scope, List<String> requested) {
        if (scope != Scope.SELECTED) return Set.of();
        var codes = new TreeSet<String>();
        if (requested != null) requested.stream().filter(Objects::nonNull).map(String::trim).filter(value -> !value.isEmpty()).forEach(codes::add);
        if (codes.isEmpty()) throw badRequest("INSURANCE_DEBUG_SELECTED_REQUIRED", "指定交易范围至少选择一个交易号");
        if (codes.size() > MAX_SELECTED) throw badRequest("INSURANCE_DEBUG_SELECTED_TOO_MANY", "指定交易最多 " + MAX_SELECTED + " 个");
        for (String code : codes) {
            if (!KNOWN_BY_CODE.containsKey(code)) throw badRequest("INSURANCE_DEBUG_INFNO_UNKNOWN", "未知的交易号：" + code);
        }
        return codes;
    }

    private static <E extends Enum<E>> E parse(Class<E> type, String value, String code, String message) {
        try { return Enum.valueOf(type, value == null ? "" : value.trim()); }
        catch (IllegalArgumentException invalid) { throw badRequest(code, message); }
    }

    private String payload(String raw, Retention retention) {
        if (raw == null || retention == Retention.SUMMARY) return null;
        String text = retention == Retention.RAW ? raw : redacted(raw);
        return truncate(text, PAYLOAD_LIMIT);
    }

    private String redacted(String raw) {
        try { return json.write(ChsExchangeRedactor.redact(json.readTree(raw))); }
        catch (RuntimeException invalid) { return ChsExchangeRedactor.describeRaw(raw); }
    }

    /** 读取时的脱敏：非原始报文权限的读者看到的永远是脱敏文本，即使该条按原始报文保存。 */
    private String view(String stored, boolean rawVisible) {
        if (stored == null || rawVisible) return stored;
        return redacted(stored);
    }

    private ExchangeSummary summary(LogRow row) {
        var option = KNOWN_BY_CODE.get(row.infno());
        return new ExchangeSummary(GlobalIds.external(row.id()), row.infno(), option == null ? row.infno() : option.name(), row.startedAt(),
                row.durationMs(), row.httpStatus(), row.infcode(), row.errMsg(), row.outcome(), outcomeText(row.outcome()), row.actor(),
                row.retention(), row.claimId() == null ? null : GlobalIds.external(row.claimId()), row.claimNo());
    }

    private static String outcomeText(String outcome) {
        return switch (outcome) {
            case "OK" -> "成功"; case "REJECTED" -> "医保拒绝"; case "TIMEOUT" -> "超时（结果未知）"; case "NETWORK" -> "网络失败（结果未知）";
            case "HTTP_STATUS" -> "HTTP 异常"; case "BAD_JSON" -> "回执非 JSON"; case "INCOMPLETE" -> "回执不完整"; default -> outcome;
        };
    }

    private ExecutionContext currentContext() {
        try { return contextProvider.requireCurrent(); }
        catch (RuntimeException unavailable) { return null; }
    }

    private long tenant() { return contextProvider.requireCurrent().tenantId(); }

    private static long parseId(String value) {
        try { return GlobalIds.parseExternal(value); }
        catch (RuntimeException invalid) { throw badRequest("INSURANCE_DEBUG_CLAIM_ID_INVALID", "医保申请标识无效"); }
    }

    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    private static String truncate(String value, int limit) { return value == null || value.length() <= limit ? value : value.substring(0, limit); }
}
