package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.StockSite;

import static com.rhn.shared.api.BusinessErrors.badRequest;

final class StockSiteRequirements {
    private StockSiteRequirements() {}

    static Long requireDepartment(StockSite site) {
        if (site.departmentId() == null) {
            throw badRequest("STOCK_SITE_DEPARTMENT_REQUIRED",
                    "库存站点“" + site.name() + "”未绑定所属科室，无法生成业务单据，请先完善站点配置");
        }
        return site.departmentId();
    }
}
