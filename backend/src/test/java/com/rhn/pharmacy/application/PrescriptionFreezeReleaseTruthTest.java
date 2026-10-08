package com.rhn.pharmacy.application;

import com.rhn.outpatient.api.OutpatientPrescriptionInventoryDirectory.PrescriptionReleaseCommand;
import com.rhn.pharmacy.domain.*;
import com.rhn.pharmacy.infrastructure.*;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.search.api.MasterDataSearchDirectory;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class PrescriptionFreezeReleaseTruthTest {
    private final InventoryAvailabilityService availability = mock(InventoryAvailabilityService.class);
    private final PrescriptionInventoryFreezeRepository freezes = mock(PrescriptionInventoryFreezeRepository.class);
    private final OutpatientPrescriptionInventoryService service = new OutpatientPrescriptionInventoryService(
            mock(DispenseRouteRepository.class), mock(StockSiteRepository.class), mock(StockItemRepository.class),
            availability, freezes, mock(CatalogLifecycleDirectory.class), mock(MasterDataSearchDirectory.class),
            mock(DispenseRouteApplicationService.class));
    private final PrescriptionReleaseCommand command = new PrescriptionReleaseCommand(1L, 3L, 2L, "撤销处方", 4L);

    @Test void missingLaterBalanceDoesNotReleaseEarlierRecords() {
        var first = freeze(10L, 20L, "片", BigDecimal.ONE);
        var missing = freeze(11L, 21L, "片", BigDecimal.ONE);
        var balance = balance(10L, 20L, "片", BigDecimal.ONE);
        when(freezes.lockActiveByPrescriptionId(1L, 2L)).thenReturn(List.of(first, missing));
        assertThatThrownBy(() -> service.releasePrescription(command)).hasMessageContaining("库存余额缺失");
        assertThat(first.status()).isEqualTo(PrescriptionInventoryFreezeStatus.ACTIVE);
        assertThat(missing.status()).isEqualTo(PrescriptionInventoryFreezeStatus.ACTIVE);
        assertThat(balance.quantityFrozen()).isEqualByComparingTo(BigDecimal.ONE);
    }
    @Test void mismatchedUnitsRemainFrozen() {
        var frozen = freeze(10L, 20L, "盒", BigDecimal.ONE);
        var balance = balance(10L, 20L, "片", BigDecimal.ONE);
        when(freezes.lockActiveByPrescriptionId(1L, 2L)).thenReturn(List.of(frozen));
        assertThatThrownBy(() -> service.releasePrescription(command)).hasMessageContaining("不一致");
        assertThat(frozen.releasedAt()).isNull();
        assertThat(balance.quantityFrozen()).isEqualByComparingTo(BigDecimal.ONE);
    }
    @Test void verifiesTotalReleaseAcrossRecordsSharingOneBalanceBeforeMutation() {
        var first = freeze(10L, 20L, "片", BigDecimal.TWO);
        var second = freeze(10L, 20L, "片", BigDecimal.TWO);
        var balance = balance(10L, 20L, "片", new BigDecimal("3"));
        when(freezes.lockActiveByPrescriptionId(1L, 2L)).thenReturn(List.of(first, second));
        assertThatThrownBy(() -> service.releasePrescription(command)).hasMessageContaining("不足以释放全部");
        assertThat(balance.quantityFrozen()).isEqualByComparingTo("3");
        assertThat(first.status()).isEqualTo(PrescriptionInventoryFreezeStatus.ACTIVE);
        assertThat(second.status()).isEqualTo(PrescriptionInventoryFreezeStatus.ACTIVE);
    }
    @Test void releasesConfirmedBalancesAndAllCorrespondingFactsTogether() {
        var first = freeze(10L, 20L, "片", BigDecimal.ONE);
        var second = freeze(10L, 20L, "片", BigDecimal.TWO);
        var balance = balance(10L, 20L, "片", new BigDecimal("5"));
        when(freezes.lockActiveByPrescriptionId(1L, 2L)).thenReturn(List.of(first, second));
        service.releasePrescription(command);
        assertThat(balance.quantityFrozen()).isEqualByComparingTo("2");
        assertThat(first.status()).isEqualTo(PrescriptionInventoryFreezeStatus.RELEASED);
        assertThat(second.status()).isEqualTo(PrescriptionInventoryFreezeStatus.RELEASED);
        assertThat(first.releaseReason()).isEqualTo("撤销处方");
    }
    private PrescriptionInventoryFreeze freeze(Long bin, Long item, String unit, BigDecimal quantity) {
        return new PrescriptionInventoryFreeze(1L, 2L, 3L, 5L, bin, item, 30L, quantity, unit, 4L);
    }
    private InventoryBalance balance(Long bin, Long item, String unit, BigDecimal frozen) {
        InventoryBalance balance = new InventoryBalance(1L, 5L, bin, item, 30L, "AVAILABLE", unit);
        balance.receive(BigDecimal.TEN, BigDecimal.ONE); balance.freeze(frozen);
        when(availability.lockDimension(1L, bin, item, 30L, "AVAILABLE")).thenReturn(Optional.of(balance));
        return balance;
    }
}
