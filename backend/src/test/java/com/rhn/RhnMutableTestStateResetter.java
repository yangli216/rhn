package com.rhn;

import com.github.benmanes.caffeine.cache.Cache;
import com.rhn.platform.configuration.infrastructure.ConfigurationValueCache;
import com.rhn.platform.tenant.TenantContext;
import com.rhn.platform.web.RequestCorrelationContext;
import org.springframework.context.ApplicationContext;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Collection;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

/** Clears mutable singleton state that is not part of the database snapshot. */
final class RhnMutableTestStateResetter {
    private RhnMutableTestStateResetter() {}

    static void reset(ApplicationContext application) throws Exception {
        application.getBean(ConfigurationValueCache.class).invalidateAll();
        clearFields(application, "dictionaryTextCache", "cache");
        clearFields(application, "inMemoryPresenceLeaseStore", "connections", "tenants");
        clearFields(application, "realtimeConnectionRegistry", "connections");
        clearFields(application, "inMemoryRefreshLoginSessionStore", "sessions");
        clearFields(application, "inMemorySessionRevocationStore", "revocations");
        clearFields(application, "mockChsNationalInsuranceClient", "preSettlements", "settlements");
        clearFields(application, "mockFiscalReceiptClient", "storage");
        clearFields(application, "queueingRealtimeBridge", "delivered");
        clearFields(application, "criticalValueRealtimeBridge", "deliveredDomainEvents");
        clearFields(application, "clinicalAiCircuitBreaker", "states");
        resetAtomicLong(application, "mockFiscalReceiptClient", "invoiceNumberSequence", 1_859_230L);
        TenantContext.clear();
        RequestCorrelationContext.clear();
    }

    private static void clearFields(ApplicationContext application, String beanName, String... fieldNames)
            throws Exception {
        if (!application.containsBean(beanName)) return;
        Object bean = AopTestUtils.getUltimateTargetObject(application.getBean(beanName));
        for (String fieldName : fieldNames) {
            Object value = ReflectionTestUtils.getField(bean, fieldName);
            if (value instanceof Cache<?, ?> cache) {
                cache.invalidateAll();
                cache.cleanUp();
            } else if (value instanceof Map<?, ?> map) {
                map.clear();
            } else if (value instanceof Collection<?> collection) {
                collection.clear();
            } else {
                throw new IllegalStateException(beanName + "." + fieldName + " reset contract changed");
            }
        }
    }

    private static void resetAtomicLong(ApplicationContext application, String beanName, String fieldName,
                                        long initialValue) throws Exception {
        if (!application.containsBean(beanName)) return;
        Object bean = AopTestUtils.getUltimateTargetObject(application.getBean(beanName));
        Object value = ReflectionTestUtils.getField(bean, fieldName);
        if (!(value instanceof AtomicLong counter)) {
            throw new IllegalStateException(beanName + "." + fieldName + " reset contract changed");
        }
        counter.set(initialValue);
    }
}
