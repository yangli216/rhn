package com.rhn.outpatient.ordering;

import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.function.Supplier;

/** 同一事务内复用只读事实，避免批量操作逐条重复查询；事务外退化为直接读取。 */
final class TransactionScopedFacts {
    private TransactionScopedFacts() {}

    @SuppressWarnings("unchecked")
    static <T> T reuse(String key, Supplier<T> loader) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) return loader.get();
        String resourceKey = TransactionScopedFacts.class.getName() + ':' + key;
        Object cached = TransactionSynchronizationManager.getResource(resourceKey);
        if (cached instanceof Cached<?> fact) return (T) fact.value();
        T value = loader.get();
        TransactionSynchronizationManager.bindResource(resourceKey, new Cached<>(value));
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                TransactionSynchronizationManager.unbindResourceIfPossible(resourceKey);
            }
        });
        return value;
    }

    private record Cached<T>(T value) {}
}
