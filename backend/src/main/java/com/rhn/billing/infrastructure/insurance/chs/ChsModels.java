package com.rhn.billing.infrastructure.insurance.chs;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * National Healthcare Security Administration (CHS) Standard Data Models.
 * 对标国家医疗保障信息平台标准规范（1101 人员鉴权、2206 门诊预结算、2207 正式结算、2208 结算撤销）。
 */
public final class ChsModels {
    private ChsModels() {}

    // ==================== 1101 人员信息获取 ====================
    public record PersonInfoRequest(
            String psnCertType,   // 01 身份证, 02 医保电子凭证, 06 社保卡
            String certno,        // 证件号码 / Token
            String psnName
    ) {}

    public record PersonInfoResponse(
            String psnNo,             // 医保人员编号
            String psnCertType,       // 证件类型
            String certno,            // 证件号码
            String psnName,           // 人员姓名
            String gender,            // 性别 (1 男, 2 女)
            LocalDate birthday,       // 出生日期
            String insutype,          // 险种类型: 310 职工基本医疗保险, 390 城乡居民基本医疗保险
            String insutypeName,      // 险种名称
            BigDecimal balc,          // 个人账户余额
            String insuOptins,        // 参保地统筹区编码 (如 360100)
            String insuOptinsName,    // 参保地统筹区名称
            String psnType,           // 人员类别: 在职, 退休, 城乡居民等
            String status             // 参保状态: NORMAL
    ) {}

    // ==================== 2206 门诊预结算（试算分解） ====================
    public record PreSettleRequest(
            String psnNo,
            String insutype,
            Long settlementId,
            String settlementNo,
            BigDecimal medfeeSumamt,
            String organizationCode,
            String departmentCode,
            String practitionerCode,
            List<FeedetItem> feedetList
    ) {}

    public record FeedetItem(
            Long feedetId,
            String itemCode,
            String hilistCode,        // 医保目录编码
            String hilistName,        // 医保目录名称
            String listCategory,      // 1 药品, 2 诊疗服务, 3 耗材
            String chrgitmLv,         // 项目等级: 1 甲类 (全部纳入报销), 2 乙类 (先行自付部分), 3 丙类 (自费)
            BigDecimal cnt,           // 数量
            BigDecimal pric,          // 单价
            BigDecimal detItemFeeSumamt // 明细总额
    ) {}

    public record PreSettleResponse(
            String preSetlId,             // 医保预结算流水号
            BigDecimal medfeeSumamt,      // 医疗费用总额
            BigDecimal inscpAmt,          // 符合政策范围金额
            BigDecimal hifpPay,           // 统筹基金支付金额 (医保报销)
            BigDecimal cvdPay,            // 大病补充保险支付金额
            BigDecimal othPay,            // 其他基金支付金额 (公务员补助/救助)
            BigDecimal acctPay,           // 个人账户支出金额 (医保卡划扣)
            BigDecimal psnCashPay,        // 个人现金支付金额 (现金/移动自付)
            BigDecimal fulamtOwnpayAmt,   // 全自费金额
            BigDecimal preselfpayAmt,     // 先行自付金额
            String currency,
            String message
    ) {}

    // ==================== 2207 门诊正式结算 ====================
    public record SettleRequest(
            String preSetlId,             // 预结算流水号
            String psnNo,
            String settlementNo,
            String operatorId
    ) {}

    public record SettleResponse(
            String setlId,                // 正式医保结算流水号
            String preSetlId,             // 关联预结算流水号
            BigDecimal medfeeSumamt,      // 医疗总额
            BigDecimal hifpPay,           // 统筹基金支付
            BigDecimal cvdPay,            // 大病补充
            BigDecimal othPay,            // 其他基金
            BigDecimal acctPay,           // 个人账户支出
            BigDecimal psnCashPay,        // 个人自付现金
            Instant setlTime,             // 结算时间
            String message
    ) {}

    // ==================== 2208 门诊结算撤销 ====================
    public record ReversalRequest(
            String setlId,                // 原医保结算流水号
            String psnNo,
            String operatorId,
            String reversalReason
    ) {}

    public record ReversalResponse(
            String reversalId,            // 撤销流水号
            String originalSetlId,        // 原结算号
            Instant reversalTime,         // 撤销时间
            boolean success,
            String message
    ) {}
}
