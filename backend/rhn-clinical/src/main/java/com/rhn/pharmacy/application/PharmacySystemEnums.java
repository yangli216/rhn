package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.DispenseTaskStatus;
import com.rhn.pharmacy.domain.GoodsReceiptStatus;
import com.rhn.pharmacy.domain.InventoryOpenPackageStatus;
import com.rhn.pharmacy.domain.InventoryPeriodStatus;
import com.rhn.pharmacy.domain.InventoryTraceCodeStatus;
import com.rhn.pharmacy.domain.PurchaseOrderStatus;
import com.rhn.pharmacy.domain.StockCountStatus;
import com.rhn.pharmacy.domain.StockRequisitionStatus;
import com.rhn.pharmacy.domain.StockTransferStatus;
import com.rhn.pharmacy.domain.WardDeliveryStatus;
import com.rhn.pharmacy.domain.WardMedicationReturnRequestStatus;
import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/**
 * Pharmacy and inventory value sets. Java enums are authoritative where they exist; the others mirror the table check
 * constraints or the codes the services compute (SystemEnumConsistencyTest). Services validate against these sets.
 */
@Component
class PharmacySystemEnums implements SystemEnumContribution {
    static final String RETURN_DISPOSITION = "SUP_RETURN_DISPOSITION";
    static final String WARD_SUPPLY_SHIFT = "SUP_WARD_SUPPLY_SHIFT";

    private static final List<SystemEnumDefinition> DEFINITIONS = List.of(
            of("SUP_DISPENSE_TASK_STATUS", "发药任务状态", "药房接方、审方、拣货、发药与退药任务的状态",
                    DispenseTaskStatus.class, items(
                            "PENDING_REVIEW", "待审方", "等待药师审方", "INTERVENTION", "待干预", "审方需临床干预",
                            "READY_TO_PICK", "待拣货", "审方通过待拣货", "REJECTED", "已驳回", "审方驳回",
                            "PICKING", "拣货中", "正在拣货", "PARTIALLY_DISPENSED", "部分发药", "已发出部分药品",
                            "READY_TO_DISPENSE", "待发药", "拣货完成待发药", "COMPLETED", "已完成", "已全部发药",
                            "PARTIALLY_RETURNED", "部分退药", "已退回部分药品", "RETURNED", "已全部退药", "药品已全部退回",
                            "CANCELLED", "已取消", "任务已取消")),
            of("SUP_PHARMACIST_REVIEW_RESULT", "审方结论", "药师审方给出的处理结论", items(
                    "PASS", "通过", "处方合理", "REJECT", "驳回", "退回医生修改", "INTERVENE", "干预", "需与医生沟通",
                    "OVERRIDE", "强制通过", "存在提醒但确认放行")),
            of("SUP_STOCK_STATUS", "库存状态", "库存数量所处的质量与可用状态", items(
                    "AVAILABLE", "可用", "可发放", "PENDING", "待验", "待验收", "QUARANTINE", "隔离", "隔离待处理",
                    "DAMAGED", "破损", "破损不可用", "EXPIRED", "过期", "已过有效期")),
            of("SUP_BIN_TYPE", "库位类型", "库房库位的层级或用途", items(
                    "ZONE", "库区", "库房分区", "RACK", "货架", "货架", "BIN", "货位", "最小存放位",
                    "COUNTER", "柜台", "发药柜台", "TRANSIT", "在途位", "调拨在途虚拟位")),
            of("SUP_ISSUE_POLICY", "出库策略", "出库时选择批次的规则", items(
                    "FEFO", "近效期先出", "按有效期先到先出", "FIFO", "先进先出", "按入库先后出库",
                    "MANUAL", "人工指定", "人工选择批次")),
            of("SUP_TRANSACTION_TYPE", "库存业务类型", "库存流水的业务来源", items(
                    "RECEIPT", "验收入库", "采购验收入库", "ISSUE", "请领出库", "科室请领出库", "TRANSFER", "库间调拨", "库房间调拨",
                    "COUNT", "盘点调整", "盘点盈亏调整", "DISPENSE", "发药出库", "药房发药", "RETURN", "退回入库", "退药或退货",
                    "QUALITY", "质量处置", "隔离、破损等质量处置", "REVERSAL", "冲正", "冲销原流水")),
            of("SUP_OPEN_PACKAGE_STATUS", "拆零包装状态", "拆零后剩余包装的使用状态", InventoryOpenPackageStatus.class, items(
                    "OPEN", "使用中", "仍有剩余可发", "CONSUMED", "已用完", "剩余量已用完")),
            of("SUP_INVENTORY_PERIOD_STATUS", "库存会计期间状态", "库存月结期间的状态", InventoryPeriodStatus.class, items(
                    "OPEN", "开放", "可正常记账", "CLOSING", "结账中", "正在月结", "CLOSED", "已月结", "期间已关闭")),
            of("SUP_PRICE_ADJUSTMENT_TYPE", "调价类型", "库存调价单调整的价格", items(
                    "SALE_PRICE", "销售调价", "调整零售价", "COST_REVALUE", "成本重估", "重估库存成本",
                    "SALE_AND_COST", "售价与成本同调", "同时调整零售价和成本")),
            of("SUP_PURCHASE_ORDER_STATUS", "采购订单状态", "采购订单的审批与到货状态", PurchaseOrderStatus.class, items(
                    "DRAFT", "草稿", "未提交", "SUBMITTED", "待审核", "已提交待审核", "APPROVED", "已审核", "审核通过",
                    "REJECTED", "已驳回", "审核驳回", "PARTIALLY_RECEIVED", "部分入库", "部分到货入库",
                    "COMPLETED", "已完成", "全部到货")),
            of("SUP_GOODS_RECEIPT_STATUS", "验收单状态", "到货验收单的验收与记账状态", GoodsReceiptStatus.class, items(
                    "RECEIVED", "待验收", "已到货待验收", "INSPECTING", "验收中", "正在验收",
                    "PARTIALLY_ACCEPTED", "部分合格", "部分验收合格", "ACCEPTED", "验收合格", "全部验收合格",
                    "REJECTED", "已拒收", "验收不合格拒收", "POSTED", "已记账", "已入库记账")),
            of("SUP_RECEIPT_QUALITY_STATUS", "验收质量结论", "到货验收明细的质量结论", items(
                    "PENDING", "待验", "尚未验收", "QUALIFIED", "合格", "验收合格", "REJECTED", "拒收", "验收不合格",
                    "QUARANTINE", "隔离", "隔离待处理")),
            of("SUP_LOT_QUALITY_STATUS", "批次质量状态", "库存批次的质量状态", items(
                    "PENDING", "待验", "尚未验收", "QUALIFIED", "合格", "质量合格", "QUARANTINE", "隔离", "隔离待处理",
                    "REJECTED", "拒收", "质量不合格", "RECALLED", "召回", "已召回")),
            of("SUP_SPLIT_EVENT_TYPE", "拆零事件", "拆零包装的使用事件", items(
                    "OPEN", "开包", "拆零开包", "CONSUME", "拆零消耗", "拆零发出", "RETURN", "拆零退回", "拆零退回",
                    "ADJUST", "调整", "余量调整", "VOID", "作废", "作废拆零包")),
            of("SUP_WARD_DELIVERY_EVENT_TYPE", "病区配送事件", "病区配送单的处理事件", items(
                    "CREATED", "生成配送单", "生成配送单", "DISPATCHED", "送出", "药房送出", "RECEIVED", "签收", "病区签收",
                    "DISCREPANCY_RECORDED", "登记差异", "签收差异登记", "RESOLVED", "差异处理", "差异已处理")),
            of("SUP_WARD_RETURN_EVENT_TYPE", "病区退药事件", "病区退药交接事件", items(
                    "CREATED", "申请退药", "病区申请退药", "HANDED_OVER", "病区交出", "病区交出药品", "RECEIVED", "药房接收", "药房验收接收")),
            of("SUP_REQUISITION_STATUS", "请领单状态", "科室请领单的审批与出库状态", StockRequisitionStatus.class, items(
                    "DRAFT", "草稿", "未提交", "SUBMITTED", "待审核", "已提交待审核", "APPROVED", "已审核", "审核通过",
                    "REJECTED", "已驳回", "审核驳回", "PICKING", "拣货中", "正在拣货", "ISSUED", "已出库", "已发出")),
            of("SUP_TRANSFER_STATUS", "调拨单状态", "库间调拨单的审批与在途状态", StockTransferStatus.class, items(
                    "DRAFT", "草稿", "未提交", "SUBMITTED", "待审核", "已提交待审核", "APPROVED", "已审核", "审核通过",
                    "REJECTED", "已驳回", "审核驳回", "PICKING", "拣货中", "正在拣货", "IN_TRANSIT", "在途", "已调出未接收",
                    "COMPLETED", "已完成", "已调入")),
            of("SUP_COUNT_STATUS", "盘点单状态", "库存盘点单的状态", StockCountStatus.class, items(
                    "DRAFT", "草稿", "未开始", "COUNTING", "盘点中", "正在盘点", "SUBMITTED", "待审核", "已提交待审核",
                    "APPROVED", "已审核", "审核通过待调整", "REJECTED", "已驳回", "审核驳回", "POSTED", "已记账", "盈亏已调整")),
            of("SUP_WARD_DELIVERY_STATUS", "病区配送状态", "药房向病区配送药品的状态", WardDeliveryStatus.class, items(
                    "PENDING_DISPATCH", "待送出", "待药房送出", "IN_TRANSIT", "配送中", "正在配送",
                    "RECEIVED", "病区已签收", "病区已签收", "DISCREPANCY", "存在差异", "签收时发现差异",
                    "RESOLVED", "差异已处理", "差异已处理")),
            of("SUP_WARD_RETURN_STATUS", "病区退药状态", "病区退药交接状态", WardMedicationReturnRequestStatus.class, items(
                    "REQUESTED", "病区待交出", "病区已申请退药", "IN_TRANSIT", "待药房接收", "已交出待药房接收",
                    "RECEIVED", "已接收", "药房已接收")),
            of(RETURN_DISPOSITION, "退药处置方式", "退回药品的处置去向", items(
                    "RESTOCK", "验收合格入库", "质量合格重新入库", "QUARANTINE", "隔离待处理", "隔离等待处理",
                    "DESTROY", "待销毁", "按规定销毁")),
            of("SUP_TRACE_CODE_STATUS", "追溯码状态", "药品追溯码的在库与流转状态", InventoryTraceCodeStatus.class, items(
                    "PENDING_RECEIPT", "待入库", "已登记待入库", "AVAILABLE", "在库可用", "在库可发",
                    "ISSUED", "已出库", "已发出", "OPENED", "已开包", "已拆零开包",
                    "PARTIALLY_ISSUED", "部分发出", "拆零部分发出", "IN_TRANSIT", "调拨在途", "调拨在途",
                    "DAMAGED", "破损", "破损不可用", "QUARANTINED", "隔离", "隔离待处理")),
            of("SUP_TRACE_EVENT_TYPE", "追溯码事件", "追溯码的流转事件", items(
                    "RECEIVED", "验收入库", "验收入库", "ISSUED", "出库核销", "出库核销",
                    "TRANSFER_OUT", "调拨出库", "调拨出库", "TRANSFER_IN", "调拨入库", "调拨入库",
                    "TRANSFER_DAMAGED", "调拨破损", "调拨中破损", "SPLIT_OPEN", "追溯开包", "拆零开包",
                    "PARTIAL_ISSUE", "拆零发药", "拆零发药", "PARTIAL_RETURN", "拆零退药", "拆零退药")),
            of(WARD_SUPPLY_SHIFT, "病区供药班次", "病区日常供药的班次", items(
                    "DAY", "白班", "白班用药", "EVENING", "小夜", "小夜班用药", "NIGHT", "大夜", "大夜班用药")),
            of("SUP_WARD_SUPPLY_LINE_STATUS", "病区供药明细状态", "病区日常供药明细的备药与发放状态", items(
                    "PENDING_INTAKE", "待接方", "等待药房接方", "PREPARING", "备药中", "正在备药",
                    "COVERED", "已覆盖", "病区库存已覆盖", "GAP", "有缺口", "备药不足", "ISSUED", "已发在途", "已发出在途",
                    "RETURN_PENDING", "待退", "需退回", "EXCEPTION", "异常", "需人工处理", "CANCELLED", "已取消", "已取消")),
            of("SUP_RECONCILIATION_ISSUE_TYPE", "库存核对问题类型", "库存账实核对发现的问题类别", items(
                    "LEDGER_BALANCE", "流水与余额", "流水汇总与余额不一致", "RESERVATION_BALANCE", "预留量", "预留量与占用不一致",
                    "OPEN_PACKAGE_BALANCE", "拆零余量", "拆零余量与流水不一致", "TRACE_BALANCE", "追溯码数量", "追溯码数量与库存不一致")));
    private static final Map<String, SystemEnumDefinition> BY_CODE = DEFINITIONS.stream()
            .collect(Collectors.toUnmodifiableMap(SystemEnumDefinition::code, Function.identity()));

    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return DEFINITIONS;
    }

    static boolean contains(String code, String value) {
        return value != null && BY_CODE.get(code).items().stream().anyMatch(item -> item.code().equals(value));
    }
}
