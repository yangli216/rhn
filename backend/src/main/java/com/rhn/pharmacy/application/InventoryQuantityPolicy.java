package com.rhn.pharmacy.application;

import com.rhn.platform.masterdata.domain.UnitDefinition;
import com.rhn.platform.masterdata.infrastructure.UnitDefinitionRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.Set;

import static com.rhn.shared.api.BusinessErrors.badRequest;

@Service
public class InventoryQuantityPolicy {
    private static final int STORAGE_SCALE = 8;
    private static final Set<String> LEGACY_INTEGER_UNITS = Set.of(
            "EA", "BOX", "TAB", "TABLET", "CAP", "CAPSULE", "VIAL", "AMP", "AMPOULE",
            "BOTTLE", "BAG", "PACK", "PIECE", "DOSE", "支", "片", "粒", "瓶", "袋", "盒", "个");

    private final UnitDefinitionRepository unitRepository;

    public InventoryQuantityPolicy(UnitDefinitionRepository unitRepository) {
        this.unitRepository = unitRepository;
    }

    public BigDecimal require(Long tenantId, String unitCode, BigDecimal value, String errorCode, String label) {
        if (value == null) throw badRequest(errorCode, label + "不能为空");
        int scale = allowedScale(tenantId, unitCode);
        if (effectiveScale(value) > scale) {
            throw badRequest(errorCode, "%s最多允许%d位小数，当前值为%s".formatted(label, scale, value.toPlainString()));
        }
        if (effectiveScale(value) > STORAGE_SCALE) {
            throw badRequest(errorCode, label + "超过库存账支持的8位小数精度");
        }
        try {
            return value.setScale(scale, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException exception) {
            throw badRequest(errorCode, label + "不符合计量单位精度要求");
        }
    }

    public BigDecimal toBase(Long tenantId, String operationUnitCode, BigDecimal operationQuantity,
                             BigDecimal factor, String baseUnitCode, String errorCode, String label) {
        BigDecimal normalizedOperation = require(tenantId, operationUnitCode, operationQuantity, errorCode, label);
        if (factor == null || factor.signum() <= 0) throw badRequest(errorCode, "包装换算因子必须大于零");
        BigDecimal base = normalizedOperation.multiply(factor, MathContext.DECIMAL128);
        return require(tenantId, baseUnitCode, base, errorCode, label + "换算后的基础数量");
    }

    public int allowedScale(Long tenantId, String unitCode) {
        String code = unitCode == null ? "" : unitCode.trim();
        UnitDefinition definition = code.isEmpty() ? null
                : unitRepository.findByTenantIdAndCode(tenantId, code).orElse(null);
        if (definition != null) return Math.min(definition.decimalScale(), STORAGE_SCALE);
        return LEGACY_INTEGER_UNITS.contains(code.toUpperCase(Locale.ROOT)) ? 0 : STORAGE_SCALE;
    }

    private int effectiveScale(BigDecimal value) {
        return Math.max(0, value.stripTrailingZeros().scale());
    }
}
