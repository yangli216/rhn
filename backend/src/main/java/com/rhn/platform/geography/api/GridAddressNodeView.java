package com.rhn.platform.geography.api;

import com.rhn.platform.geography.domain.GridAddressLevel;
import com.rhn.platform.geography.domain.GridAddressStatus;

import java.time.Instant;

public record GridAddressNodeView(
        Long id, long revision, Long parentId, GridAddressLevel level, String levelName, int depth,
        String code, String name, String shortName, String pinyinCode, String fullPath,
        int sortOrder, GridAddressStatus status, boolean systemManaged, Instant updatedAt
) {
}
