package com.rhn.billing.application;

import com.rhn.billing.api.InsuranceReadinessViews.ReadinessCheck;
import com.rhn.billing.api.InsuranceReadinessViews.ReadinessReport;
import com.rhn.billing.api.InsuranceReadinessViews.ReadinessSection;
import com.rhn.billing.api.InsuranceReadinessViews.ReadinessSummary;
import com.rhn.billing.infrastructure.insurance.chs.ChsGatewayProperties;
import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import com.rhn.platform.organization.api.DepartmentView;
import com.rhn.platform.organization.api.OrganizationDirectory;
import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 上线前只读体检：不调用医保平台，也不修改任何配置。网关配置按原始配置值核对（网关未启用时也能提前发现缺项），
 * 结果只包含“已配置/未配置”和字段名，绝不回显配置内容。
 */
@Service
public class InsuranceReadinessService {
    static final String PREFIX = "rhn.billing.insurance.chs.gateway";
    private static final Pattern INSUTYPE = Pattern.compile("\\d{3}");

    private final Environment environment;
    private final InsuranceQuickSubmissionProperties registrations;
    private final NationalInsuranceClient client;
    private final ExecutionContextProvider contextProvider;
    private final OrganizationDirectory organizations;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    InsuranceReadinessService(Environment environment, InsuranceQuickSubmissionProperties registrations,
                              NationalInsuranceClient client, ExecutionContextProvider contextProvider,
                              OrganizationDirectory organizations) {
        this(environment, registrations, client, contextProvider, organizations, Clock.systemUTC());
    }

    InsuranceReadinessService(Environment environment, InsuranceQuickSubmissionProperties registrations,
                              NationalInsuranceClient client, ExecutionContextProvider contextProvider,
                              OrganizationDirectory organizations, Clock clock) {
        this.environment = environment; this.registrations = registrations; this.client = client;
        this.contextProvider = contextProvider; this.organizations = organizations; this.clock = clock;
    }

    public ReadinessReport check() {
        ExecutionContext context = contextProvider.requireCurrent();
        String mode = mode();
        List<ReadinessSection> sections = List.of(clientSection(mode), gatewaySection(), registrationSection(context));
        int pass = 0, warn = 0, block = 0;
        for (ReadinessSection section : sections) for (ReadinessCheck check : section.checks()) {
            switch (check.status()) { case "PASS" -> pass++; case "WARN" -> warn++; default -> block++; }
        }
        Set<String> systems = new LinkedHashSet<>();
        for (var r : scoped(context)) if (text(r.insuranceSystemCode())) systems.add(r.insuranceSystemCode().trim());
        String overall = block > 0 ? "BLOCK" : warn > 0 ? "WARN" : "PASS";
        return new ReadinessReport(clock.instant(), mode, modeText(mode), overall,
                switch (overall) { case "PASS" -> "通过"; case "WARN" -> "警告"; default -> "阻断"; },
                new ReadinessSummary(pass, warn, block), sections, List.copyOf(systems));
    }

    private static String modeText(String mode) {
        return switch (mode) { case "GATEWAY" -> "正式网关"; case "MOCK" -> "模拟客户端（仅限测试）"; default -> "未接入"; };
    }

    String mode() {
        if (client instanceof HttpChsNationalInsuranceClient) return "GATEWAY";
        if (client instanceof MockChsNationalInsuranceClient) return "MOCK";
        return "UNAVAILABLE";
    }

    private ReadinessSection clientSection(String mode) {
        ReadinessCheck check = switch (mode) {
            case "GATEWAY" -> pass("client-mode", "当前医保客户端", "已启用国家医保正式网关客户端");
            case "MOCK" -> warn("client-mode", "当前医保客户端", "当前为模拟客户端，结算结果不是医保平台返回，仅限离线测试",
                    "上线前关闭 rhn.billing.insurance.chs.mock-enabled，并启用 " + PREFIX + ".enabled");
            default -> block("client-mode", "当前医保客户端", "正式网关与模拟客户端均未启用，医保交易会被拒绝",
                    "配置 " + PREFIX + ".* 并将 enabled 设为 true");
        };
        return new ReadinessSection("client", "客户端模式", List.of(check));
    }

    private ReadinessSection gatewaySection() {
        List<ReadinessCheck> checks = new ArrayList<>();
        ChsGatewayProperties properties;
        try {
            properties = Binder.get(environment).bind(PREFIX, ChsGatewayProperties.class).orElse(null);
        } catch (RuntimeException exception) {
            checks.add(block("gateway-parse", "网关配置可解析", "网关配置存在格式错误，无法读取",
                    "核对 " + PREFIX + ".* 的取值格式（时长如 3s、布尔值 true/false）"));
            return new ReadinessSection("gateway", "正式网关配置", checks);
        }
        boolean enabled = properties != null && properties.enabled();
        checks.add(enabled ? pass("gateway-enabled", "正式网关已启用", "已启用")
                : block("gateway-enabled", "正式网关已启用", "未启用 " + PREFIX + ".enabled",
                "完成下列配置后将 " + PREFIX + ".enabled 设为 true"));
        checks.add(required("base-url", "网关地址 base-url", properties == null ? null : properties.baseUrl()));
        if (properties != null && text(properties.baseUrl())) checks.add(urlCheck(properties.baseUrl()));
        checks.add(required("fixmedins-code", "定点医药机构编码 fixmedins-code", properties == null ? null : properties.fixmedinsCode()));
        checks.add(required("fixmedins-name", "定点医药机构名称 fixmedins-name", properties == null ? null : properties.fixmedinsName()));
        checks.add(required("mdtrtarea-admvs", "就医地医保区划 mdtrtarea-admvs", properties == null ? null : properties.mdtrtareaAdmvs()));
        checks.add(required("recer-sys-code", "接收方系统编码 recer-sys-code", properties == null ? null : properties.recerSysCode()));
        checks.add(required("default-operator", "默认经办人 default-operator", properties == null ? null : properties.defaultOperator()));
        boolean signIn = properties == null || properties.signInRequired();
        if (signIn) {
            checks.add(required("sign-in-mac", "签到终端 mac sign-in-mac", properties == null ? null : properties.signInMac()));
            checks.add(required("sign-in-ip", "签到终端 ip sign-in-ip", properties == null ? null : properties.signInIp()));
        } else {
            checks.add(warn("sign-in", "9001 签到", "已关闭签到（sign-in-required=false）", "仅当医保平台明确不要求签到时保持关闭"));
        }
        return new ReadinessSection("gateway", "正式网关配置", checks);
    }

    private ReadinessSection registrationSection(ExecutionContext context) {
        List<ReadinessCheck> checks = new ArrayList<>();
        var scoped = scoped(context);
        if (scoped.isEmpty()) {
            checks.add(block("registration-present", "机构医保注册资料", "当前机构没有任何快捷预结算注册记录",
                    "在 rhn.billing.insurance.quick-submission.registrations 中登记经医保部门核实的机构、科室、统筹区和险种"));
            return new ReadinessSection("registration", "机构与医师注册资料", checks);
        }
        Map<Long, String> departmentNames = departmentNames(context);
        Set<String> seen = new LinkedHashSet<>();
        int index = 0;
        for (var r : scoped) {
            index++;
            String label = "注册记录 " + index + "（" + departmentNames.getOrDefault(r.departmentId(), "科室 " + r.departmentId())
                    + " / 险种 " + (text(r.insuranceTypeCode()) ? r.insuranceTypeCode().trim() : "未填") + "）";
            List<String> missing = new ArrayList<>();
            if (!text(r.regionCode())) missing.add("region-code");
            if (!text(r.organizationCode())) missing.add("organization-code");
            if (!text(r.departmentCode())) missing.add("department-code");
            if (!text(r.insuranceSystemCode())) missing.add("insurance-system-code");
            if (!text(r.insuranceTypeCode())) missing.add("insurance-type-code");
            if (!missing.isEmpty()) {
                checks.add(block("registration-" + index + "-fields", label + " 必填项",
                        "缺少 " + String.join("、", missing), "补齐后重启或刷新配置"));
            } else {
                checks.add(pass("registration-" + index + "-fields", label + " 必填项", "机构、科室、统筹区、险种和目录体系均已登记"));
            }
            if (text(r.insuranceTypeCode()) && !INSUTYPE.matcher(r.insuranceTypeCode().trim()).matches()) {
                checks.add(block("registration-" + index + "-insutype", label + " 险种编码",
                        "正式网关要求三位险种类型编码（如 310、390），当前登记值不符合", "改用平台险种编码"));
            }
            if (r.practitionerCodes().isEmpty()) {
                checks.add(block("registration-" + index + "-practitioners", label + " 医师医保注册号",
                        "尚未登记任何接诊医师的医保注册号", "在 practitioner-codes 中逐个登记接诊医师账号到医保注册号的映射"));
            } else {
                long blank = r.practitionerCodes().values().stream().filter(value -> !text(value)).count();
                checks.add(blank > 0
                        ? block("registration-" + index + "-practitioners", label + " 医师医保注册号",
                        "已登记 " + r.practitionerCodes().size() + " 位，其中 " + blank + " 位注册号为空", "补齐空缺的医保注册号")
                        : pass("registration-" + index + "-practitioners", label + " 医师医保注册号",
                        "已登记 " + r.practitionerCodes().size() + " 位接诊医师"));
            }
            if (!seen.add(r.departmentId() + "|" + r.insuranceTypeCode() + "|" + r.regionCode())) {
                checks.add(block("registration-" + index + "-duplicate", label + " 唯一性",
                        "同一科室、险种和统筹区存在多条注册记录，预结算会因歧义被拒绝", "只保留一条经核实的记录"));
            }
        }
        checks.add(warn("registration-staff", "在岗医师覆盖", "系统无法自动比对在岗接诊医师与已登记医师，需人工核对",
                "按科室医师名单逐一确认每位接诊医师账号都已在 practitioner-codes 中登记"));
        return new ReadinessSection("registration", "机构与医师注册资料", checks);
    }

    private List<InsuranceQuickSubmissionProperties.Registration> scoped(ExecutionContext context) {
        return registrations.registrations().stream()
                .filter(r -> Objects.equals(r.tenantId(), context.tenantId())
                        && (context.organizationId() == null || Objects.equals(r.organizationId(), context.organizationId())))
                .toList();
    }

    private Map<Long, String> departmentNames(ExecutionContext context) {
        if (context.organizationId() == null) return Map.of();
        try {
            return organizations.listDepartments(context.tenantId(), context.organizationId()).stream()
                    .collect(Collectors.toMap(DepartmentView::id, DepartmentView::name, (left, right) -> left));
        } catch (RuntimeException exception) { return Map.of(); }
    }

    private static ReadinessCheck required(String code, String title, String value) {
        return text(value) ? pass(code, title, "已配置")
                : block(code, title, "未配置", "在 " + PREFIX + "." + code + " 填写医保平台下发的值");
    }

    private static ReadinessCheck urlCheck(String value) {
        try {
            URI uri = URI.create(value.trim());
            if (uri.getHost() == null || !Set.of("http", "https").contains(String.valueOf(uri.getScheme()).toLowerCase())) {
                return block("base-url-format", "网关地址格式", "地址格式不正确", "填写完整的 http(s):// 地址");
            }
            if ("http".equalsIgnoreCase(uri.getScheme())) {
                return warn("base-url-format", "网关地址格式", "使用明文 http 传输", "确认调用链路位于医保专网或已有传输加密");
            }
            return pass("base-url-format", "网关地址格式", "地址格式正确");
        } catch (RuntimeException exception) {
            return block("base-url-format", "网关地址格式", "地址格式不正确", "填写完整的 http(s):// 地址");
        }
    }

    private static boolean text(String value) { return value != null && !value.isBlank(); }
    private static ReadinessCheck pass(String code, String title, String detail) { return new ReadinessCheck(code, title, "PASS", detail, null); }
    private static ReadinessCheck warn(String code, String title, String detail, String fix) { return new ReadinessCheck(code, title, "WARN", detail, fix); }
    private static ReadinessCheck block(String code, String title, String detail, String fix) { return new ReadinessCheck(code, title, "BLOCK", detail, fix); }
}
