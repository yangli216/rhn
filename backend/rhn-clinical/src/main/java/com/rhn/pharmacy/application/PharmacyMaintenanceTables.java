package com.rhn.pharmacy.application;

import com.rhn.platform.maintenance.api.MaintenanceRelationalData.TableDefinition;
import java.util.List;

/** Domain-owned maintenance definitions; protected configuration and immutable facts remain retained. */
final class PharmacyMaintenanceTables {
    private PharmacyMaintenanceTables() {}
    static List<TableDefinition> all() {
        return List.of(
                new TableDefinition("RHN_SUP_DISP_ROUTE", "ID_DISP_ROUTE", "PHARMACY", "发药途径", true),
                new TableDefinition("RHN_SUP_DISP_TASK", "ID_DISP_TASK", "PHARMACY", "发药任务", false),
                new TableDefinition("RHN_SUP_DISP_TASK_LINE", "ID_DISP_TASK_LINE", "PHARMACY", "发药任务明细", false),
                new TableDefinition("RHN_SUP_GOOD_RCPT", "ID_GOOD_RCPT", "PHARMACY", "到货票据", true),
                new TableDefinition("RHN_SUP_GOOD_RCPT_LINE", "ID_GOOD_RCPT_LINE", "PHARMACY", "到货票据明细", true),
                new TableDefinition("RHN_SUP_INP_MED_CONSUME", "ID_INP_MED_CONSUME", "PHARMACY", "住院用药消耗", true),
                new TableDefinition("RHN_SUP_INP_MED_SUPPLY_BATCH", "ID_INP_MED_SUPPLY_BATCH", "PHARMACY", "住院用药供应批次", true),
                new TableDefinition("RHN_SUP_INP_MED_SUPPLY_GEN_RUN", "ID_INP_MED_SUPPLY_GEN_RUN", "PHARMACY", "住院用药供应生成运行", true),
                new TableDefinition("RHN_SUP_INP_MED_SUPPLY_LINE", "ID_INP_MED_SUPPLY_LINE", "PHARMACY", "住院用药供应明细", true),
                new TableDefinition("RHN_SUP_INP_MED_SUPPLY_TASK", "ID_INP_MED_SUPPLY_TASK", "PHARMACY", "住院用药供应任务", true),
                new TableDefinition("RHN_SUP_INV_BAL", "ID_INV_BAL", "PHARMACY", "库存余额", true),
                new TableDefinition("RHN_SUP_INV_DOC_EVT", "ID_INV_DOC_EVT", "PHARMACY", "库存文书事件", true),
                new TableDefinition("RHN_SUP_INV_OPEN_PKG", "ID_INV_OPEN_PKG", "PHARMACY", "库存拆零包装", true),
                new TableDefinition("RHN_SUP_INV_PERIOD", "ID_INV_PERIOD", "PHARMACY", "库存期间", true),
                new TableDefinition("RHN_SUP_INV_RESV", "ID_INV_RESV", "PHARMACY", "库存预留", false),
                new TableDefinition("RHN_SUP_INV_SPLIT_EVT", "ID_INV_SPLIT_EVT", "PHARMACY", "库存拆分事件", true),
                new TableDefinition("RHN_SUP_INV_TRACE_CODE", "ID_INV_TRACE_CODE", "PHARMACY", "库存追溯编码", true),
                new TableDefinition("RHN_SUP_INV_TRACE_EVT", "ID_INV_TRACE_EVT", "PHARMACY", "库存追溯事件", true),
                new TableDefinition("RHN_SUP_INV_TXN", "ID_INV_TXN", "PHARMACY", "库存流水", true),
                new TableDefinition("RHN_SUP_INV_TXN_LINE", "ID_INV_TXN_LINE", "PHARMACY", "库存流水明细", true),
                new TableDefinition("RHN_SUP_MED_DISP", "ID_MED_DISP", "PHARMACY", "药品发药", false),
                new TableDefinition("RHN_SUP_MED_DISP_LINE", "ID_MED_DISP_LINE", "PHARMACY", "药品发药明细", false),
                new TableDefinition("RHN_SUP_PHARM_FULFILL_AUTH", "ID_PHARM_FULFILL_AUTH", "PHARMACY", "药房履约授权", false),
                new TableDefinition("RHN_SUP_PHARM_REVIEW", "ID_PHARM_REVIEW", "PHARMACY", "药房审核", false),
                new TableDefinition("RHN_SUP_PURCH_ORDER", "ID_PURCH_ORDER", "PHARMACY", "采购医嘱", true),
                new TableDefinition("RHN_SUP_PURCH_ORDER_LINE", "ID_PURCH_ORDER_LINE", "PHARMACY", "采购医嘱明细", true),
                new TableDefinition("RHN_SUP_RX_INV_FREEZE", "ID_RX_INV_FREEZE", "PHARMACY", "一行代表一条处方库存冻结明细", false),
                new TableDefinition("RHN_SUP_STOCK_BIN", "ID_STOCK_BIN", "PHARMACY", "库存库位", true),
                new TableDefinition("RHN_SUP_STOCK_COUNT", "ID_STOCK_COUNT", "PHARMACY", "库存盘点", true),
                new TableDefinition("RHN_SUP_STOCK_COUNT_LINE", "ID_STOCK_COUNT_LINE", "PHARMACY", "库存盘点明细", true),
                new TableDefinition("RHN_SUP_STOCK_ITEM", "ID_STOCK_ITEM", "PHARMACY", "库存项目", true),
                new TableDefinition("RHN_SUP_STOCK_LOT", "ID_STOCK_LOT", "PHARMACY", "库存批号", true),
                new TableDefinition("RHN_SUP_STOCK_REQ", "ID_STOCK_REQ", "PHARMACY", "库存请领", true),
                new TableDefinition("RHN_SUP_STOCK_REQ_ALLOC", "ID_STOCK_REQ_ALLOC", "PHARMACY", "库存请领分配", true),
                new TableDefinition("RHN_SUP_STOCK_REQ_LINE", "ID_STOCK_REQ_LINE", "PHARMACY", "库存请领明细", true),
                new TableDefinition("RHN_SUP_STOCK_RETURN", "ID_STOCK_RETURN", "PHARMACY", "患者测试退药单", false),
                new TableDefinition("RHN_SUP_STOCK_RETURN_LINE", "ID_STOCK_RETURN_LINE", "PHARMACY", "患者测试退药明细", false),
                new TableDefinition("RHN_SUP_STOCK_SITE", "ID_STOCK_SITE", "PHARMACY", "库存库房", true),
                new TableDefinition("RHN_SUP_STOCK_XFER", "ID_STOCK_XFER", "PHARMACY", "库存调拨", true),
                new TableDefinition("RHN_SUP_STOCK_XFER_ALLOC", "ID_STOCK_XFER_ALLOC", "PHARMACY", "库存调拨分配", true),
                new TableDefinition("RHN_SUP_STOCK_XFER_LINE", "ID_STOCK_XFER_LINE", "PHARMACY", "库存调拨明细", true),
                new TableDefinition("RHN_SUP_SUPPL", "ID_SUPPL", "PHARMACY", "供应商", true),
                new TableDefinition("RHN_SUP_SUPPL_SUPPLY_ITEM", "ID_SUPPL_SUPPLY_ITEM", "PHARMACY", "供应商供应项目", true),
                new TableDefinition("RHN_SUP_WARD_DELIV", "ID_WARD_DELIV", "PHARMACY", "病区配送", true),
                new TableDefinition("RHN_SUP_WARD_DELIV_EVT", "ID_WARD_DELIV_EVT", "PHARMACY", "病区配送事件", true),
                new TableDefinition("RHN_SUP_WARD_DELIV_LINE", "ID_WARD_DELIV_LINE", "PHARMACY", "病区配送明细", true),
                new TableDefinition("RHN_SUP_WARD_MED_RETURN_EVT", "ID_WARD_MED_RETURN_EVT", "PHARMACY", "病区用药退回事件", true),
                new TableDefinition("RHN_SUP_WARD_MED_RETURN_LINE", "ID_WARD_MED_RETURN_LINE", "PHARMACY", "病区用药退回明细", true),
                new TableDefinition("RHN_SUP_WARD_MED_RETURN_REQ", "ID_WARD_MED_RETURN_REQ", "PHARMACY", "病区用药退回请求", true)
        );
    }
}
