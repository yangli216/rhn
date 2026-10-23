package com.rhn.billing.api;

import com.rhn.billing.api.BillingViews.BillingWorkItemView;

import java.util.List;

public record BillingWorkItemPageView(
        List<BillingWorkItemView> content,
        int page,
        int size,
        long totalElements,
        int totalPages,
        boolean first,
        boolean last
) {
}
