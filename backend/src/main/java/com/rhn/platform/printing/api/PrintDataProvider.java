package com.rhn.platform.printing.api;

/** Business-owned adapter that validates a source and freezes its standard print payload. */
public interface PrintDataProvider {
    String providerCode();
    PrintDataSnapshot load(PrintDataRequest request);
}
