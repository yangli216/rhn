package com.rhn.diagnostics.api;

import java.time.Instant;

public record DiagnosticImageView(Long id, String contentHash, String mediaType, long byteSize,
                                  int width, int height, String caption, Long uploadedBy, Instant uploadedAt) {}
