package com.rhn.analytics.semantic.model;

public record TimeIntent(
    String type,
    String startDate,
    String endDate
) {
    public static TimeIntent monthToDate() {
        return new TimeIntent("MONTH_TO_DATE", null, null);
    }

    public static TimeIntent lastMonth() {
        return new TimeIntent("LAST_MONTH", null, null);
    }

    public static TimeIntent last30Days() {
        return new TimeIntent("LAST_30_DAYS", null, null);
    }

    public static TimeIntent yearToDate() {
        return new TimeIntent("YEAR_TO_DATE", null, null);
    }

    public static TimeIntent fixed(String startDate, String endDate) {
        return new TimeIntent("FIXED", startDate, endDate);
    }
}
