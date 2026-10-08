package com.rhn.billing.application;

import com.rhn.billing.infrastructure.PaymentOrderRepository;
import com.rhn.platform.dictionary.api.DictionaryAttributeDirectory;
import com.rhn.shared.context.ExecutionContext;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

import static com.rhn.shared.api.BusinessErrors.conflict;

/** Validates a requested rounding change against scoped configuration and the unpaid balance. */
@Component
class PaymentRoundingPolicy {
    private final DictionaryAttributeDirectory attributes;
    private final PaymentOrderRepository orders;

    PaymentRoundingPolicy(DictionaryAttributeDirectory attributes, PaymentOrderRepository orders) {
        this.attributes = attributes;
        this.orders = orders;
    }

    BigDecimal totalAdjustment(ExecutionContext context, Long invoiceId, String method, String scene,
                               BigDecimal outstanding, BigDecimal paymentAmount,
                               BigDecimal requestedDelta, BigDecimal currentAdjustment) {
        BigDecimal delta = exactMoney(requestedDelta);
        if (outstanding == null || outstanding.signum() <= 0) {
            throw conflict("PAYMENT_ROUNDING_BALANCE_INVALID", "没有可舍入的待付余额");
        }
        if (orders.activeRequestedForInvoice(context.tenantId(), invoiceId).signum() > 0) {
            throw conflict("PAYMENT_ROUNDING_PENDING_ORDER", "存在在途支付，不能调整结算金额，请先查询或取消原支付");
        }
        var item = attributes.applicableItems(context.tenantId(), context.organizationId(), context.departmentId(),
                        "PAY_METHOD", "AVAILABLE_SCENE", scene).stream()
                .filter(value -> value.code().equals(method)).findFirst()
                .orElseThrow(() -> conflict("PAYMENT_ROUNDING_CONFIG_INVALID", "未找到当前场景的支付舍入配置"));
        BigDecimal rounded = round(exactMoney(outstanding), item.attributes());
        BigDecimal expectedDelta = rounded.subtract(outstanding);
        if (delta.compareTo(expectedDelta) != 0) {
            throw conflict("PAYMENT_ROUNDING_MISMATCH", "舍入调整与当前支付规则及待付余额不一致，请刷新后重试");
        }
        if (rounded.signum() <= 0 || exactMoney(paymentAmount).compareTo(rounded) != 0) {
            throw conflict("PAYMENT_ROUNDING_FULL_PAYMENT_REQUIRED", "应用舍入调整时必须一次支付调整后的全部待付金额");
        }
        return exactMoney(currentAdjustment).add(delta);
    }

    private BigDecimal round(BigDecimal amount, Map<String, String> values) {
        String precision = values == null ? null : values.get("PAYMENT_PRECISION");
        String mode = values == null ? null : values.get("ROUNDING_MODE");
        int scale;
        if ("0.01".equals(precision)) scale = 2;
        else if ("0.1".equals(precision)) scale = 1;
        else throw conflict("PAYMENT_ROUNDING_CONFIG_INVALID", "支付精度未配置或无效，请维护支付字典");
        RoundingMode rounding;
        if ("HALF_UP".equals(mode)) rounding = RoundingMode.HALF_UP;
        else if ("HALF_EVEN_SIX".equals(mode)) rounding = RoundingMode.HALF_DOWN;
        else if ("FLOOR".equals(mode)) rounding = RoundingMode.DOWN;
        else throw conflict("PAYMENT_ROUNDING_CONFIG_INVALID", "支付舍入方式未配置或无效，请维护支付字典");
        return amount.setScale(scale, rounding);
    }

    private BigDecimal exactMoney(BigDecimal value) {
        if (value == null) throw conflict("PAYMENT_ROUNDING_AMOUNT_INVALID", "舍入金额数据缺失");
        try { return value.setScale(6, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException error) {
            throw conflict("PAYMENT_ROUNDING_AMOUNT_INVALID", "舍入金额不能超过六位小数");
        }
    }
}
