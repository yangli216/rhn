package com.rhn.billing.infrastructure.insurance.chs;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.time.Duration;
import java.util.Map;

/**
 * 国家医保统一接口（HTTP/JSON）接入配置。机构编码、就医地区划、接收方系统编码等均由医保平台开通接入时下发，
 * 不提供默认值；启用时缺失任一必填项，应用启动即失败，避免带着未核实的资料联调。
 */
@ConfigurationProperties(prefix = "rhn.billing.insurance.chs.gateway", ignoreUnknownFields = false)
public record ChsGatewayProperties(
        @DefaultValue("false") boolean enabled,
        String baseUrl,
        /** 定点医药机构编码 fixmedins_code */
        String fixmedinsCode,
        String fixmedinsName,
        /** 就医地医保区划 mdtrtarea_admvs */
        String mdtrtareaAdmvs,
        /** 接收方系统代码 recer_sys_code */
        String recerSysCode,
        String devNo,
        String devSafeInfo,
        String cainfo,
        String signtype,
        @DefaultValue("V1.0") String infver,
        /** 经办人类别 opter_type：1 经办人，2 自助终端，3 移动端 */
        @DefaultValue("1") String opterType,
        /** 无业务操作员的交易（如 1101 人员鉴权）使用的经办人编号，同时作为 9001 签到的操作员 */
        String defaultOperator,
        @DefaultValue("true") boolean signInRequired,
        /** 9001 签到所需的终端 mac / ip，按平台要求填写 */
        String signInMac,
        String signInIp,
        /** 门诊医疗类别 med_type：11 普通门诊、14 门诊慢特病等 */
        @DefaultValue("11") String medType,
        /** 结算时是否使用个人账户 acct_used_flag */
        @DefaultValue("false") boolean accountUsed,
        @DefaultValue("Asia/Shanghai") String zone,
        @DefaultValue("3s") Duration connectTimeout,
        @DefaultValue("20s") Duration readTimeout,
        /** 1101 鉴权凭证在内存中保留的时长，期间可用于同一参保人的预结算 */
        @DefaultValue("30m") Duration credentialTtl,
        /** 省级平台要求的附加 HTTP 头（如网关鉴权），值不会写入日志 */
        Map<String, String> headers,
        /** 允许联通探测执行 2207 结算（随即自动 2208 撤销）。默认关闭；生产环境仅在使用平台测试人员时开启 */
        @DefaultValue("false") boolean probeSettlementEnabled) {

    public ChsGatewayProperties {
        headers = headers == null ? Map.of() : Map.copyOf(headers);
        if (enabled) {
            require(baseUrl, "base-url"); require(fixmedinsCode, "fixmedins-code"); require(fixmedinsName, "fixmedins-name");
            require(mdtrtareaAdmvs, "mdtrtarea-admvs"); require(recerSysCode, "recer-sys-code");
            require(defaultOperator, "default-operator");
            if (signInRequired) { require(signInMac, "sign-in-mac"); require(signInIp, "sign-in-ip"); }
        }
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("rhn.billing.insurance.chs.gateway." + name + " 未配置，不能启用医保正式网关");
        }
    }
}
