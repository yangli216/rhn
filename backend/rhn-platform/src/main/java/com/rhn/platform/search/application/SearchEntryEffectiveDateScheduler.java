package com.rhn.platform.search.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "rhn.search.projection.effective-refresh-enabled", havingValue = "true",
        matchIfMissing = true)
public class SearchEntryEffectiveDateScheduler {
    private static final Logger log = LoggerFactory.getLogger(SearchEntryEffectiveDateScheduler.class);
    private final SearchEntryProjectionService projections;

    public SearchEntryEffectiveDateScheduler(SearchEntryProjectionService projections) {
        this.projections = projections;
    }

    @Scheduled(cron = "${rhn.search.projection.effective-refresh-cron:0 5 0 * * *}",
            zone = "${rhn.search.projection.effective-refresh-zone:Asia/Shanghai}")
    public void refresh() {
        SearchEntryProjectionService.RebuildResult result =
                projections.refreshEffectiveDateTransitions(projections.currentDate());
        if (result.desired() > 0 || result.deleted() > 0) {
            log.info("Master-data search effective-date transitions refreshed: desired={}, created={}, updated={}, deleted={}",
                    result.desired(), result.created(), result.updated(), result.deleted());
        }
    }
}
