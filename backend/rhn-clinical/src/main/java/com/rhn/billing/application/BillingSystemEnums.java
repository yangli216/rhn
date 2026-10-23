package com.rhn.billing.application;

import com.rhn.billing.domain.CashierCloseStatus;
import com.rhn.billing.domain.ReliefApplicationStatus;
import com.rhn.billing.domain.ReliefFailurePolicy;
import com.rhn.billing.domain.ReliefMethod;
import com.rhn.billing.domain.ReliefPolicyStatus;
import com.rhn.billing.domain.ReliefQualificationMode;
import com.rhn.billing.domain.ReliefQualificationSource;
import com.rhn.billing.domain.ReliefQuotaPeriod;
import com.rhn.billing.domain.ReliefQuotaTransactionType;
import com.rhn.billing.domain.ReliefRosterStatus;
import com.rhn.billing.domain.ReliefScopeType;
import com.rhn.billing.domain.ReliefSponsor;
import com.rhn.billing.domain.ReliefTiming;
import com.rhn.billing.domain.ReliefVersionStatus;
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
    static final String SETTLEMENT_MODE = "BIL_SETTLEMENT_MODE";
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
                of(SETTLEMENT_MODE, "结算方式", "结算单是否走医保结算，与医保基金金额是否为零无关", items(
                        "SELF_PAY", "自费结算", "未走医保结算", "MEDICAL_INSURANCE", "医保结算", "已走医保结算，基金支付可为零")),
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
                        "SETTLED", "已平账", "费用与收付款已平")),
                of("BIL_RELIEF_POLICY_STATUS", "惠民政策状态", "惠民减免政策的生效状态", ReliefPolicyStatus.class, items(
                        "DRAFT", "草稿", "尚未发布任何版本", "ACTIVE", "生效中", "已发布并参与结算减免",
                        "SUSPENDED", "已暂停", "暂停参与结算减免", "RETIRED", "已停用", "政策停止执行")),
                of("BIL_RELIEF_VERSION_STATUS", "惠民政策版本状态", "政策版本的发布状态", ReliefVersionStatus.class, items(
                        "DRAFT", "草稿", "可修改的待发布版本", "PUBLISHED", "已发布", "当前执行版本",
                        "SUPERSEDED", "已替代", "已被新版本替代")),
                of("BIL_RELIEF_TIMING", "减免时机", "减免在医保结算前还是后执行", ReliefTiming.class, items(
                        "PRE_INSURANCE", "医保前减免", "降低结算净额，医保按减免后金额结算",
                        "POST_INSURANCE", "医保后减免", "冲抵医保结算后的剩余个人自付")),
                of("BIL_RELIEF_SPONSOR", "减免承担主体", "减免资金由谁承担", ReliefSponsor.class, items(
                        "HOSPITAL", "医院", "医院让利或惠民减免", "GOVERNMENT", "政府", "民政、卫健等政府补助",
                        "CHARITY", "慈善机构", "基金会或慈善组织补助", "OTHER", "其他", "其他承担单位")),
                of("BIL_RELIEF_QUALIFICATION_MODE", "资格组合方式", "多项资格条件如何组合", ReliefQualificationMode.class, items(
                        "ANY", "满足任一", "满足任一资格条件即可", "ALL", "全部满足", "必须同时满足全部资格条件")),
                of("BIL_RELIEF_QUALIFICATION_SOURCE", "资格来源", "资格条件的判定依据", ReliefQualificationSource.class, items(
                        "ALL", "全部患者", "不限资格", "ROSTER", "资格名单", "按院内维护的资格名单判定",
                        "ATTRIBUTE", "属性条件", "按年龄、性别、险种等患者属性判定",
                        "PROVIDER", "外部接口", "调用妇幼、民政、家医签约等外部资格接口")),
                of("BIL_RELIEF_FAILURE_POLICY", "资格接口失败处理", "外部资格查询失败时的处理方式", ReliefFailurePolicy.class, items(
                        "BLOCK", "阻断结算", "提示失败并阻断本次结算", "INELIGIBLE", "视为不符合", "本次不享受该政策",
                        "MANUAL_CONFIRM", "人工确认", "由有权限人员人工确认资格")),
                of("BIL_RELIEF_QUOTA_PERIOD", "额度周期", "周期累计额度的计算区间", ReliefQuotaPeriod.class, items(
                        "NONE", "不设周期", "不限制周期累计", "DAY", "每日", "按自然日累计", "MONTH", "每月", "按自然月累计",
                        "QUARTER", "每季度", "按自然季度累计", "YEAR", "每年", "按自然年累计",
                        "POLICY_TERM", "政策期", "在政策有效期内累计")),
                of("BIL_RELIEF_SCOPE_TYPE", "减免费用范围", "减免规则覆盖的费用范围", ReliefScopeType.class, items(
                        "ALL", "全部费用", "本次结算的全部费用", "ACCOUNTING_CATEGORY", "费用大类", "按会计分类匹配",
                        "CATALOG_ITEM", "收费项目", "按收费项目明细匹配", "SOURCE_TYPE", "收费来源", "按挂号、药品、检查等来源匹配")),
                of("BIL_RELIEF_METHOD", "减免方式", "减免金额的计算方式", ReliefMethod.class, items(
                        "RATIO", "按比例", "计算基数乘以减免比例", "FREE", "全免", "计算基数全部减免",
                        "FIXED_AMOUNT", "固定金额", "本次结算固定减免金额", "UNIT_AMOUNT", "单位减免", "每计费单位减免固定金额",
                        "PRICE_CAP", "个人限价", "每计费单位患者最高负担金额", "MANUAL", "人工核定", "收费时由收费员按实际情况核定金额")),
                of("BIL_RELIEF_ROSTER_STATUS", "资格名单状态", "资格名单记录的状态", ReliefRosterStatus.class, items(
                        "ACTIVE", "有效", "资格有效", "REVOKED", "已停用", "资格已停用")),
                of("BIL_RELIEF_APPLICATION_STATUS", "减免记录状态", "结算减免记录的冲销状态", ReliefApplicationStatus.class, items(
                        "APPLIED", "已减免", "减免有效", "REVERSED", "已冲销", "减免已全部冲销")),
                of("BIL_RELIEF_OUTCOME_STATUS", "减免计算结果", "一项政策在本次结算中的计算结果",
                        com.rhn.billing.domain.ReliefCalculator.OutcomeStatus.class, items(
                        "APPLIED", "已减免", "本次结算享受减免", "SKIPPED", "不适用", "不符合条件或额度已用完",
                        "AWAITING_MANUAL", "可人工核定", "收费员可按需核定减免金额")),
                of("BIL_RELIEF_QUOTA_TXN_TYPE", "额度变动类型", "减免额度流水的变动类型", ReliefQuotaTransactionType.class, items(
                        "RESERVE", "占用", "结算减免占用额度", "CONFIRM", "确认", "结算完成确认额度",
                        "RELEASE", "释放", "结算放弃释放额度", "REVERSE", "恢复", "退费冲销恢复额度")));
    }
}
