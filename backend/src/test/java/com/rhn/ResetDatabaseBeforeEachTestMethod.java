package com.rhn;

import java.lang.annotation.ElementType;
import java.lang.annotation.Inherited;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** Opt-in for tests whose mutable state is limited to the database and dictionary/config caches. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@ResetDatabaseBeforeEachTestClass
public @interface ResetDatabaseBeforeEachTestMethod {}
