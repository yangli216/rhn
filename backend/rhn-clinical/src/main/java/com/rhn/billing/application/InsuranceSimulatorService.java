package com.rhn.billing.application;

import com.rhn.billing.infrastructure.insurance.chs.ChsGatewayProperties;
import com.rhn.billing.infrastructure.insurance.chs.HttpChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.MockChsNationalInsuranceClient;
import com.rhn.billing.infrastructure.insurance.chs.NationalInsuranceClient;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.net.InetAddress;
import java.net.URI;
import java.util.List;

/**
 * 医保联调模拟场景：仅在显式开启 {@code rhn.billing.insurance.chs.simulator.enabled} 且当前医保客户端是模拟客户端或
 * 指向本机的网关时生效，前端据此才显示模拟读卡/电子医保码入口。
 * 开启时若正式网关地址不是本机（回环）地址，应用启动即失败，避免联调开关与真实医保平台同时生效。
 * 本服务不调用任何外部系统，也不改动配置。
 */
@Service
public class InsuranceSimulatorService {
    static final String SIMULATOR_ENABLED = "rhn.billing.insurance.chs.simulator.enabled";
    static final String SIMULATOR_CONSOLE_URL = "rhn.billing.insurance.chs.simulator.console-url";

    private final boolean requested;
    private final String mode;
    private final String consoleUrl;

    InsuranceSimulatorService(Environment environment, NationalInsuranceClient client) {
        this.requested = environment.getProperty(SIMULATOR_ENABLED, Boolean.class, false);
        this.mode = client instanceof HttpChsNationalInsuranceClient ? "GATEWAY"
                : client instanceof MockChsNationalInsuranceClient ? "MOCK" : "UNAVAILABLE";
        String baseUrl = null;
        if (requested && "GATEWAY".equals(mode)) {
            ChsGatewayProperties gateway = Binder.get(environment).bind(InsuranceReadinessService.PREFIX, ChsGatewayProperties.class)
                    .orElseThrow(() -> new IllegalStateException("医保模拟场景需要先配置本机 mock 网关"));
            baseUrl = gateway.baseUrl();
            requireLoopback(baseUrl);
        }
        String configured = environment.getProperty(SIMULATOR_CONSOLE_URL);
        this.consoleUrl = configured != null && !configured.isBlank() ? configured.trim() : origin(baseUrl);
    }

    public SimulatorView view() {
        boolean active = requested && !"UNAVAILABLE".equals(mode);
        if (!active) return new SimulatorView(false, mode, null, List.of(),
                requested ? "医保客户端未启用，模拟场景不生效" : null);
        return new SimulatorView(true, mode, consoleUrl, PERSONAS, null);
    }

    static void requireLoopback(String baseUrl) {
        String host;
        try { host = URI.create(baseUrl.trim()).getHost(); }
        catch (RuntimeException exception) { host = null; }
        boolean local;
        try { local = host != null && InetAddress.getByName(host).isLoopbackAddress(); }
        catch (java.net.UnknownHostException exception) { local = false; }
        if (!local) throw new IllegalStateException(
                SIMULATOR_ENABLED + "=true 时 " + InsuranceReadinessService.PREFIX + ".base-url 必须是本机地址，"
                        + "不得与真实医保平台同时启用");
    }

    private static String origin(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) return null;
        try {
            URI uri = URI.create(baseUrl.trim());
            return uri.getScheme() + "://" + uri.getAuthority();
        } catch (RuntimeException exception) { return null; }
    }

    /**
     * 与 rhn-thirdparty-mocks 的测试人员一一对应：certNo 决定 mock 的参保场景；residentKeyword 指向本地演示库中
     * 预置的模拟患者（其医保个人编号为 mock 返回的 PSN-&lt;certNo&gt;，见迁移 V1_129_25）。
     */
    private static final List<Persona> PERSONAS = List.of(
            new Persona("TEST-310", "职工医保 · 正常", "310", "TEST-310", "HRMOCK0001", "个人账户余额 1850.00，走完整挂号/诊间结算与退费"),
            new Persona("TEST-390", "居民医保 · 正常", "390", "TEST-390", "HRMOCK0002", "无个人账户，居民统筹"),
            new Persona("TEST-MULTI", "多险种 · 取正常参保", "310", "TEST-MULTI", "HRMOCK0003", "1101 返回终止的居民险与正常的职工险，应取职工险"),
            new Persona("TEST-SUSPENDED", "暂停参保", "310", "TEST-SUSPENDED", "HRMOCK0004", "2201 就诊登记被拒，提示暂停参保"),
            new Persona("TEST-NOINSU", "无参保信息", null, "TEST-NOINSU", "HRMOCK0012", "1101 即被拒，验证读卡失败提示"),
            new Persona("TEST-REJECT-2206", "预结算被拒", "310", "TEST-REJECT-2206", "HRMOCK0005", "2206 返回存在未结算记录"),
            new Persona("TEST-IMBALANCE", "结算金额不守恒", "310", "TEST-IMBALANCE", "HRMOCK0006", "2206/2207 金额合计不平，应被平台拒绝入账"),
            new Persona("TEST-MISSING-AMT", "结算缺金额字段", "310", "TEST-MISSING-AMT", "HRMOCK0007", "2206 缺 acct_pay"),
            new Persona("TEST-SLOW", "平台超时", "310", "TEST-SLOW", "HRMOCK0008", "2206 延迟超过客户端读超时"),
            new Persona("TEST-HTTP500", "网关 500", "310", "TEST-HTTP500", "HRMOCK0009", "2207 返回 HTTP 500，结果未知需人工核对"),
            new Persona("TEST-BADJSON", "报文非 JSON", "310", "TEST-BADJSON", "HRMOCK0010", "2207 返回无法解析的文本"),
            new Persona("TEST-SIGN-EXPIRE", "签到失效", "310", "TEST-SIGN-EXPIRE", "HRMOCK0011", "首次业务交易后签到失效，客户端应自动重新签到"));

    public record Persona(String id, String label, String insuranceType, String certNo, String residentKeyword, String expectation) {}

    public record SimulatorView(boolean enabled, String mode, String consoleUrl, List<Persona> personas, String reason) {}
}
