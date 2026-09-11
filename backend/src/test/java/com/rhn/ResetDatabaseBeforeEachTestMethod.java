package com.rhn;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Keeps the Spring TestContext cached while restoring the integration-test database baseline before
 * every test method. Use this instead of {@code @DirtiesContext(BEFORE_EACH_TEST_METHOD)} when the
 * isolation requirement is database state rather than a fresh application context.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@interface ResetDatabaseBeforeEachTestMethod {
}
