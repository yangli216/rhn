package com.rhn.platform.dictionary.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Overrides the dictionary code inferred from an outgoing JSON property. Properties beginning
 * with {@code sd} are translated automatically; the annotation is only needed when the complete
 * dictionary code cannot be derived from the property name.
 */
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.RECORD_COMPONENT, ElementType.FIELD, ElementType.METHOD})
public @interface DictionaryBinding {
    String value();
}
