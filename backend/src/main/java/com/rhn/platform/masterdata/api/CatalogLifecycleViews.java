package com.rhn.platform.masterdata.api;

import com.rhn.platform.masterdata.api.MasterDataViews.OrganizationAdoptionView;
import com.rhn.platform.masterdata.api.MasterDataViews.PriceView;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class CatalogLifecycleViews {
    private CatalogLifecycleViews() {}

    public record CatalogLifecycleView(
            Long catalogItemId, Long organizationId, LocalDate businessDate,
            OrganizationAdoptionView currentAdoption, List<OrganizationAdoptionView> adoptionHistory,
            List<PriceView> currentPrices, List<PriceView> priceHistory) {}

    public record CatalogChangeBatchView(
            Long id, long revision, String batchType, String operationType, Long organizationId,
            String requestCode, LocalDate businessDate, String status, int totalRows,
            int succeededRows, int failedRows, Instant createdAt, Long createdBy, Instant updatedAt,
            List<CatalogChangeBatchRowView> rows) {}

    public record CatalogChangeBatchRowView(
            Long id, int rowNumber, Long catalogItemId, Long packageId, String status,
            String targetResourceType, Long targetId, String errorCode, String errorMessage) {}
}
