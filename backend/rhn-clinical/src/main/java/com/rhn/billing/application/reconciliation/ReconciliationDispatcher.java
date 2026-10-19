package com.rhn.billing.application.reconciliation;
import org.springframework.stereotype.Component;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
@Component
@ConditionalOnProperty(name="rhn.billing.reconciliation.worker-enabled",havingValue="true",matchIfMissing=true)
class ReconciliationDispatcher {
 private final ReconciliationWorker worker;
 ReconciliationDispatcher(ReconciliationWorker worker){this.worker=worker;}
 @Scheduled(fixedDelayString="${rhn.billing.reconciliation.poll-interval-ms:5000}") void dispatch(){worker.processDue(5);}
 @Scheduled(fixedDelayString="${rhn.billing.reconciliation.schedule-interval-ms:60000}") void schedule(){worker.schedule();}
}
