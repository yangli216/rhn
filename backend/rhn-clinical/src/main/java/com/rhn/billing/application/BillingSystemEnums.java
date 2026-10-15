package com.rhn.billing.application;

import com.rhn.billing.domain.CashierCloseStatus;
import com.rhn.billing.domain.SettlementStatus;
import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/**
 * Billing value sets; items without a Java enum mirror the table check constraints (SystemEnumConsistencyTest).
 * Where a charge is collected is the PAY_USE_SCENE dictionary, because payment methods reference it.
 */
@Component
class BillingSystemEnums implements SystemEnumContribution {
    static final String SETTLEMENT_SCENE = "BIL_SETTLEMENT_SCENE";
    static final String SETTLEMENT_TYPE = "BIL_SETTLEMENT_TYPE";
    static final String TENDER_TYPE = "BIL_TENDER_TYPE";
    static final String RECEIPT_TYPE = "BIL_RECEIPT_TYPE";
    static final String RECEIPT_STATUS = "BIL_RECEIPT_STATUS";
    static final String PAYMENT_ORDER_STATUS = "BIL_PAYMENT_ORDER_STATUS";
    static final String CASHIER_CLOSE_STATUS = "BIL_CASHIER_CLOSE_STATUS";
    static final String WORK_STATUS = "BIL_WORK_STATUS";

    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(
                of(SETTLEMENT_SCENE, "结算场景", "结算单所属的收费业务", items(
                        "REGISTRATION", "挂号收费", "门诊挂号费用", "OUTPATIENT", "门诊收费", "门诊诊疗及药品费用",
                        "INPATIENT", "住院收费", "住院费用", "HOME_BED", "家庭病床", "家庭病床费用",
                        "PHARMACY", "药房收费", "药房零售或补收")),
                of("BIL_SETTLEMENT_STATUS", "结算状态", "结算单的收款与冲正状态", SettlementStatus.class, items(
                        "PRICED", "已计价", "已计价待收款", "PAYMENT_PENDING", "待收款", "等待收款",
                        "PARTIAL", "部分收款", "已收部分款项", "SETTLED", "已结算", "结算完成", "REVERSED", "已冲正", "结算已冲正")),
                of(SETTLEMENT_TYPE, "结算类型", "结算单的业务性质", items(
                        "NORMAL", "正常结算", "首次结算", "REVERSAL", "冲正结算", "冲销原结算",
                        "SUPPLEMENT", "补充结算", "对原结算的补收")),
                of(TENDER_TYPE, "结算支付类别", "结算单各笔支付的资金类别", items(
                        "CASH", "现金", "现金收付", "BANK_CARD", "银行卡", "银行卡收付",
                        "DIGITAL", "移动支付", "微信、支付宝等移动支付", "INSURANCE_FUND", "医保统筹", "医保基金支付",
                        "PERSONAL_ACCOUNT", "医保个人账户", "医保个人账户支付",
                        "COMMERCIAL_INSURANCE", "商业保险", "商业保险支付", "PREPAYMENT", "预交金", "冲抵预交金",
                        "HOSPITAL_DISCOUNT", "医院减免", "医院减免金额", "SUBSIDY", "补助", "政府或机构补助",
                        "ROUNDING", "舍入差额", "按支付精度舍入的差额", "OTHER", "其他自付", "其他经授权的患者自付方式")),
                of("BIL_CHARGE_SOURCE_TYPE", "收费来源", "收费事项由哪类业务事实产生；冲销来源与原来源成对出现", items(
                        "REGISTRATION", "挂号", "挂号费用", "REGISTRATION_REVERSAL", "退号冲销", "退号冲销挂号费用",
                        "DIRECT_VISIT_SERVICE", "直接就诊服务", "无排班直接就诊的诊查费用",
                        "MEDICATION_REQUEST", "药品医嘱", "门诊药品医嘱", "MEDICATION_REQUEST_REVERSAL", "药品医嘱冲销", "撤销药品医嘱冲销费用",
                        "SERVICE_REQUEST", "检查检验申请", "检查、检验及治疗申请",
                        "SERVICE_REQUEST_REVERSAL", "申请冲销", "撤销检查检验申请冲销费用",
                        "MEDICATION_DISPENSE", "发药", "按实际发药计费", "MEDICATION_RETURN", "退药", "退药冲销费用",
                        "INPATIENT_ORDER_TASK", "住院医嘱执行", "住院医嘱执行计费", "INPATIENT_BED_DAY", "床日", "住院床位日费用",
                        "DIRECT_REFUND", "直接退费冲销", "未执行项目直接退费冲销")),
                of("BIL_PAYMENT_TYPE", "收付类型", "支付记录是收款还是退款", items(
                        "PAYMENT", "收款", "向患者收款", "REFUND", "退款", "向患者退款")),
                of("BIL_RECONCILIATION_LINE_STATUS", "账务核对结果", "发退药事实与收费事项的逐笔核对结果", items(
                        "MATCHED", "一致", "数量和金额一致", "UNCHARGED", "未计费", "发退药尚未形成收费事项",
                        "MISMATCH", "不一致", "数量或金额不一致", "ORPHAN_CHARGE", "缺少来源", "收费事项缺少同日发退药事实")),
                of("BIL_INPATIENT_FINANCIAL_STATUS", "住院结算财务状态", "出院结算后预交金、补缴和退余款的处理状态", items(
                        "PENDING_PAYMENT", "待补缴", "预交金不足，需补缴差额", "PENDING_REFUND", "待退余款", "预交金有余额待退还",
                        "PAYMENT_REVIEW", "待财务复核", "收付已平但结算未完成，需财务复核", "SETTLED", "已结清", "出院结算已结清")),
                of(RECEIPT_TYPE, "票据类型", "结算票据的种类", items(
                        "MEDICAL_E_INVOICE", "医疗电子票据", "财政医疗收费电子票据", "PAPER_INVOICE", "纸质票据", "财政医疗收费纸质票据",
                        "RECEIPT", "收据", "院内收款收据", "VIRTUAL", "虚拟票据", "无需交付的内部票据")),
                of(RECEIPT_STATUS, "票据状态", "结算票据的开具状态", items(
                        "REQUESTED", "开具中", "已提交开具", "ISSUED", "已开具", "票据已开具",
                        "FAILED", "开具失败", "开具失败待重试", "VOIDED", "已作废", "票据已作废",
                        "RED_FLUSHED", "已冲红", "票据已冲红")),
                of(PAYMENT_ORDER_STATUS, "支付订单状态", "线上或终端支付订单的处理状态", items(
                        "CREATED", "已创建", "订单已创建", "PENDING", "待通道确认", "等待支付通道确认",
                        "PROCESSING", "处理中", "支付处理中", "PARTIAL", "部分成功", "部分金额支付成功",
                        "SUCCEEDED", "支付成功", "支付完成", "FAILED", "支付失败", "支付失败",
                        "CANCELLED", "已取消", "订单已取消", "EXPIRED", "已过期", "订单超时",
                        "REFUNDING", "退款中", "退款处理中", "REFUNDED", "已退款", "已全部退款")),
                of(CASHIER_CLOSE_STATUS, "收费员结账状态", "收费员日结的确认状态", CashierCloseStatus.class, items(
                        "CALCULATED", "待确认", "已计算待确认", "CONFIRMED", "已结账", "结账已确认",
                        "REVERSED", "已撤销", "结账已撤销")),
                of("BIL_SETTLEMENT_EVENT_TYPE", "结算事件", "结算单的处理事件", items(
                        "CREATE", "创建", "生成结算单", "PRICE", "计价", "完成计价", "REQUEST_PAYMENT", "发起收款", "发起收款",
                        "PARTIAL_PAY", "部分收款", "收到部分款项", "FINALIZE", "完成结算", "结算完成",
                        "REVERSE_REQUEST", "申请冲正", "申请冲正", "REVERSE_COMPLETE", "冲正完成", "冲正完成",
                        "FAIL", "失败", "处理失败")),
                of("BIL_PAYMENT_EVENT_TYPE", "支付事件", "支付订单与支付通道的交互事件", items(
                        "CREATE", "创建订单", "创建支付订单", "SUBMIT", "提交通道", "提交支付通道", "CALLBACK", "通道回调", "收到通道回调",
                        "QUERY", "主动查询", "主动查询结果", "CAPTURE", "支付成功", "确认收款",
                        "PARTIAL_CAPTURE", "部分成功", "确认部分收款", "FAIL", "支付失败", "支付失败", "CANCEL", "取消", "取消订单",
                        "EXPIRE", "超时", "订单超时", "REFUND_REQUEST", "申请退款", "提交退款", "REFUND_CALLBACK", "退款回调", "收到退款结果")),
                of("BIL_RECEIPT_EVENT_TYPE", "票据事件", "票据开具与交付事件", items(
                        "REQUEST", "申请开具", "提交开具", "ISSUE", "开具", "票据已开具", "PRINT", "打印", "打印票据",
                        "DELIVER", "交付", "交付患者", "FAIL", "失败", "开具失败", "VOID", "作废", "票据作废", "RED_FLUSH", "冲红", "票据冲红")),
                of(WORK_STATUS, "收费工作状态", "就诊账户在收费工作台上的待办状态", items(
                        "PENDING_CHARGE", "待计费", "存在未计费的医嘱事件", "PENDING_INVOICE", "待结算", "存在未结算费用",
                        "PENDING_PAYMENT", "待收款", "账户应收余额大于零", "PENDING_REFUND", "待退款", "账户余额为负",
                        "SETTLED", "已平账", "费用与收付款已平")));
    }
}
