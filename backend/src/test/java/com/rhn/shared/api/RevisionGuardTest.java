package com.rhn.shared.api;

import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RevisionGuardTest {
    @Test
    void preservesModuleCodeAndDomainMessageForStaleRevision() {
        assertThatThrownBy(() -> RevisionGuard.run("PARAMETER_REVISION_CONFLICT", "fallback",
                () -> { throw new StaleRevisionException(7L, "参数已被其他用户修改"); }))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.code()).isEqualTo("PARAMETER_REVISION_CONFLICT");
                    assertThat(exception.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getMessage()).isEqualTo("参数已被其他用户修改");
                });
    }

    @Test
    void usesFallbackMessageForPersistenceOptimisticLock() {
        assertThatThrownBy(() -> RevisionGuard.supply("DICTIONARY_REVISION_CONFLICT", "请刷新后重试",
                () -> { throw new OptimisticLockingFailureException("stale database row"); }))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.code()).isEqualTo("DICTIONARY_REVISION_CONFLICT");
                    assertThat(exception.status()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(exception.getMessage()).isEqualTo("请刷新后重试");
                });
    }
}
