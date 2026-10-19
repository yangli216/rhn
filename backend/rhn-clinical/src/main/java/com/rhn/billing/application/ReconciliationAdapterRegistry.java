package com.rhn.billing.application;

import com.rhn.billing.api.ReconciliationAdapter;
import com.rhn.billing.api.PaymentReconciliation.StatementCapability;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
import static com.rhn.shared.api.BusinessErrors.*;

/** One declared owner per statement route; legacy predicate ambiguity is rejected as well. */
@Component
public class ReconciliationAdapterRegistry {
    private final Map<String, ReconciliationAdapter> statements;
    private final List<ReconciliationAdapter> all;
    public ReconciliationAdapterRegistry(List<ReconciliationAdapter> adapters, PaymentChannelRegistry payments) {
        all = List.copyOf(adapters);
        var registered = new LinkedHashMap<String, ReconciliationAdapter>();
        for (var adapter : adapters) {
            var c = adapter.statementCapability();
            if (c == null) continue;
            if(c.paymentMethodCode()==null||!c.paymentMethodCode().matches("[A-Z][A-Z0-9_]{0,127}")||c.name()==null||c.name().isBlank()||c.availableAfter()==null||!c.availableAfter().matches("[0-9]{2}:[0-9]{2}"))
                throw new IllegalArgumentException("对账适配器必须声明规范支付方式、名称和出账时刻");
            var owner = payments.resolve(c.paymentMethodCode());
            if (owner == null || !owner.capabilities(c.paymentMethodCode()).adapterCode().equals(c.adapterCode())
                    || registered.putIfAbsent(c.paymentMethodCode(), adapter) != null || !"TRADE".equals(c.billType())
                    || c.historyDays() < 1 || c.historyDays() > 2200 || c.parserVersion() == null || c.parserVersion().isBlank())
                throw new IllegalArgumentException("对账适配器归属、能力或唯一声明无效");
            ZoneId.of(c.zoneId()); LocalTime.parse(c.availableAfter());
        }
        statements = Collections.unmodifiableMap(registered);
    }
    public ReconciliationAdapter require(String method) {
        var adapter = statements.get(method);
        if (adapter == null) throw badRequest("RECON_CHANNEL_UNSUPPORTED", "当前渠道未提供交易账单能力");
        return adapter;
    }
    public List<StatementCapability> capabilities() { return statements.values().stream().map(ReconciliationAdapter::statementCapability).toList(); }
    public ReconciliationAdapter legacy(String type, String source) {
        var found = all.stream().filter(a -> a.supports(type, source)).toList();
        if (found.size() > 1) throw conflict("RECON_ROUTE_AMBIGUOUS", "同一对账来源存在多个适配器");
        return found.isEmpty() ? null : found.getFirst();
    }
}
