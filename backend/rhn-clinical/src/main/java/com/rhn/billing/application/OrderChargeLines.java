package com.rhn.billing.application;

import java.util.Collection;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;

import static com.rhn.shared.api.BusinessErrors.conflict;

/**
 * 检查申请按收费方案多行落账，收费行必须随申请整单结算、整单退费：勾选其中一行时，同一申请在候选范围内的其余行
 * 必须一并勾选，避免主项目已退而加收项目仍挂账，或只结算部分行使执行科室误判已缴费。
 */
final class OrderChargeLines {
    private static final String SOURCE_TYPE = "SERVICE_REQUEST";

    private OrderChargeLines() {}

    static <T> void requireWholeOrders(Collection<T> selected, Collection<T> candidates,
                                       Function<T, String> sourceType, Function<T, Long> sourceId,
                                       String code, String message) {
        Set<Long> selectedOrders = new HashSet<>();
        for (T value : selected) {
            if (SOURCE_TYPE.equals(sourceType.apply(value)) && sourceId.apply(value) != null) {
                selectedOrders.add(sourceId.apply(value));
            }
        }
        if (selectedOrders.isEmpty()) return;
        boolean incomplete = candidates.stream()
                .filter(value -> SOURCE_TYPE.equals(sourceType.apply(value))
                        && selectedOrders.contains(sourceId.apply(value)))
                .anyMatch(value -> selected.stream().noneMatch(chosen -> Objects.equals(chosen, value)));
        if (incomplete) throw conflict(code, message);
    }
}
