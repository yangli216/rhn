package com.rhn.platform.cryptography.spi;

import java.util.Map;
import java.util.Optional;

/**
 * Turns a vendor callback into an order reference after checking the vendor's own signature. The
 * platform treats a callback only as a hint to query the order, so a forged callback costs one query.
 */
public interface CaCallbackTranslator {
    Optional<String> externalOrderId(Map<String, String> headers, byte[] body);
}
