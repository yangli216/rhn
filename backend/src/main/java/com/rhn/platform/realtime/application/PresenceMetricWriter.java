package com.rhn.platform.realtime.application;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
class PresenceMetricWriter {
    private final PresenceMetricSampleRepository samples;

    PresenceMetricWriter(PresenceMetricSampleRepository samples) { this.samples = samples; }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(Long tenantId, String scopeType, String scopeKey, Long organizationId,
                       Long departmentId, Instant bucketAt, PresenceMetricValues values, Instant now) {
        if (samples.existsByTenantIdAndScopeKeyAndBucketAt(tenantId, scopeKey, bucketAt)) return;
        samples.saveAndFlush(new PresenceMetricSample(tenantId, scopeType, scopeKey, organizationId,
                departmentId, bucketAt, values, now));
    }

    @Transactional
    public int deleteOlderThan(Instant cutoff) { return samples.deleteOlderThan(cutoff); }
}
