package com.rhn.platform.search.application;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "rhn.search.projection.rebuild-on-startup", havingValue = "true")
public class SearchEntryStartupRebuilder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(SearchEntryStartupRebuilder.class);
    private final SearchEntryProjectionService projections;

    public SearchEntryStartupRebuilder(SearchEntryProjectionService projections) {
        this.projections = projections;
    }

    @Override
    public void run(ApplicationArguments args) {
        SearchEntryProjectionService.RebuildResult result = projections.rebuildAll();
        log.info("Master-data search projection reconciled: desired={}, created={}, updated={}, deleted={}",
                result.desired(), result.created(), result.updated(), result.deleted());
    }
}
