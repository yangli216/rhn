package com.rhn.pharmacy.application;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;
import static com.rhn.shared.api.BusinessErrors.conflict;

/** Conversion facts for live availability queries; prescription freezing uses saved order quantities. */
final class InventoryPackageFacts {
    private InventoryPackageFacts() {}

    static BigDecimal factor(String stockBaseUnit, String productBaseUnit, Long packageId,
                             PackageSnapshot itemPackage, LocalDate at) {
        if (stockBaseUnit == null || stockBaseUnit.isBlank() || !stockBaseUnit.equals(productBaseUnit)) {
            throw conflict("INVENTORY_BASE_UNIT_UNCONFIRMED", "库存与产品基础单位缺失或不一致，无法确认可用数量");
        }
        if (packageId == null && itemPackage == null) return BigDecimal.ONE;
        if (packageId == null || itemPackage == null || !Objects.equals(packageId, itemPackage.id())
                || itemPackage.quantityFactor() == null || itemPackage.quantityFactor().signum() <= 0
                || itemPackage.unitCode() == null || itemPackage.unitCode().isBlank()
                || !"ACTIVE".equals(itemPackage.status()) || itemPackage.validFrom() == null
                || itemPackage.validFrom().isAfter(at)
                || itemPackage.validTo() != null && (itemPackage.validTo().isBefore(at)
                    || itemPackage.validTo().isBefore(itemPackage.validFrom()))) {
            throw conflict("INVENTORY_PACKAGE_UNCONFIRMED", "指定包装的身份、单位、换算系数或有效期未确认，无法计算可用数量");
        }
        return itemPackage.quantityFactor();
    }
}
