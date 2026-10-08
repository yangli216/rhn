package com.rhn.pharmacy.application;

import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.PackageSnapshot;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.math.BigDecimal;
import java.time.LocalDate;
import static org.assertj.core.api.Assertions.*;

class InventoryPackageFactsTest {
    private final LocalDate at = LocalDate.of(2026, 10, 3);
    @Test void onlyAnExplicitBaseUnitHasFactorOneWithoutAPackage() {
        assertThat(InventoryPackageFacts.factor("片", "片", null, null, at)).isEqualByComparingTo(BigDecimal.ONE);
        assertThatThrownBy(() -> InventoryPackageFacts.factor(null, "片", null, null, at)).hasMessageContaining("基础单位");
        assertThatThrownBy(() -> InventoryPackageFacts.factor("盒", "片", null, null, at)).hasMessageContaining("基础单位");
    }
    @Test void preservesRealFactorIncludingFractionalValues() {
        assertThat(InventoryPackageFacts.factor("g", "g", 1L,
                pack(1L, "BAG", new BigDecimal("0.25"), "ACTIVE", at, at), at)).isEqualByComparingTo("0.25");
    }
    @ParameterizedTest @ValueSource(strings = {"missing", "wrong-id", "null-factor", "zero-factor", "negative-factor", "unit", "status", "start", "future", "expired"})
    void doesNotReplaceInvalidPackageFactsWithFactorOne(String defect) {
        PackageSnapshot value = pack("wrong-id".equals(defect) ? 2L : 1L, "unit".equals(defect) ? "" : "BOX",
                "null-factor".equals(defect) ? null : "zero-factor".equals(defect) ? BigDecimal.ZERO
                    : "negative-factor".equals(defect) ? BigDecimal.ONE.negate() : BigDecimal.TEN,
                "status".equals(defect) ? "INACTIVE" : "ACTIVE",
                "start".equals(defect) ? null : "future".equals(defect) ? at.plusDays(1) : at.minusDays(10),
                "expired".equals(defect) ? at.minusDays(1) : null);
        assertThatThrownBy(() -> InventoryPackageFacts.factor("片", "片", 1L, "missing".equals(defect) ? null : value, at))
                .hasMessageContaining("指定包装");
    }
    private PackageSnapshot pack(Long id, String unit, BigDecimal factor, String status, LocalDate from, LocalDate to) {
        return new PackageSnapshot(id, unit, unit, null, factor, "SALE", status, from, to);
    }
}
