package com.rhn.platform.search.application;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** 全量搜索重建关闭时，也补齐已有检查部位组合；按批处理且可重复执行。 */
@Component
@ConditionalOnProperty(name = "rhn.search.projection.rebuild-on-startup", havingValue = "false", matchIfMissing = true)
public class ExaminationSearchStartupRebuilder implements ApplicationRunner {
    private final SearchEntryProjectionService projections;

    public ExaminationSearchStartupRebuilder(SearchEntryProjectionService projections) {
        this.projections = projections;
    }

    @Override
    public void run(ApplicationArguments args) {
        projections.rebuildExaminationSites();
    }
}
