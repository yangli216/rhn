package com.rhn.platform.realtime.api;

import java.time.Instant;
import java.util.List;

public record PresenceUserPage(long total, int page, int size, Instant asOf, List<PresenceUserView> items) {}
