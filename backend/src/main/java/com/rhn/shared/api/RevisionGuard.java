package com.rhn.shared.api;

import org.springframework.dao.OptimisticLockingFailureException;

import java.util.function.Supplier;

/** 统一的乐观锁冲突守卫：捕获修订号过期与 JPA 乐观锁异常并映射为 409 业务冲突。 */
public final class RevisionGuard {
    private RevisionGuard() {
    }

    public static void run(String code, String message, Runnable action) {
        try {
            action.run();
        } catch (StaleRevisionException exception) {
            throw BusinessErrors.conflict(code, exception.getMessage());
        } catch (OptimisticLockingFailureException exception) {
            throw BusinessErrors.conflict(code, message);
        }
    }

    public static <T> T supply(String code, String message, Supplier<T> action) {
        try {
            return action.get();
        } catch (StaleRevisionException exception) {
            throw BusinessErrors.conflict(code, exception.getMessage());
        } catch (OptimisticLockingFailureException exception) {
            throw BusinessErrors.conflict(code, message);
        }
    }
}
