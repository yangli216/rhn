package com.rhn.pharmacy.application;

import com.rhn.pharmacy.domain.StockBin;
import com.rhn.pharmacy.infrastructure.StockBinRepository;
import com.rhn.pharmacy.infrastructure.StockSiteRepository;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.rhn.shared.api.BusinessErrors.badRequest;
import static com.rhn.shared.api.BusinessErrors.conflict;
import static com.rhn.shared.api.BusinessErrors.notFound;

/** Keeps the ledger dimension concrete when a hospital does not manage physical bins. */
@Service
public class StockBinResolver {
    static final String DEFAULT_CODE = "__DEFAULT__";
    private final StockBinRepository bins;
    private final StockSiteRepository sites;

    public StockBinResolver(StockBinRepository bins, StockSiteRepository sites) {
        this.bins = bins; this.sites = sites;
    }

    @Transactional
    public StockBin receive(ExecutionContext context, Long siteId, Long binId) {
        StockBin bin;
        if (binId != null) {
            bin = bins.findByIdAndTenantId(binId, context.tenantId())
                    .orElseThrow(() -> notFound("STOCK_BIN_NOT_FOUND", "未找到库存货位"));
        } else {
            // Serialize first creation per site; concurrent receipts must share one default dimension.
            sites.lockByIdAndTenantId(siteId, context.tenantId())
                    .orElseThrow(() -> notFound("STOCK_SITE_NOT_FOUND", "未找到库存站点"));
            bin = bins.findByTenantIdAndStockSiteIdAndCode(context.tenantId(), siteId, DEFAULT_CODE)
                    .orElseGet(() -> bins.save(new StockBin(context.tenantId(), siteId, null,
                            DEFAULT_CODE, "默认货位", "BIN", "AVAILABLE", true, true, true, 0, context.subjectId())));
        }
        if (!siteId.equals(bin.stockSiteId())) {
            throw badRequest("STOCK_BIN_SITE_MISMATCH", "库存货位不属于当前库房");
        }
        if (!bin.active() || !bin.receiveAllowed()) {
            throw conflict("STOCK_BIN_NOT_RECEIVABLE", "目标货位未开放收货");
        }
        return bin;
    }
}
