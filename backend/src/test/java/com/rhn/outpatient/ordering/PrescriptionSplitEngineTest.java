package com.rhn.outpatient.ordering;

import com.rhn.outpatient.api.EncounterDirectory.EncounterSnapshot;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory;
import com.rhn.platform.masterdata.api.CatalogLifecycleDirectory.MedicationSnapshot;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory;
import com.rhn.platform.masterdata.api.MedicationRouteDirectory.RouteSnapshot;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PrescriptionSplitEngineTest {

    @Mock
    private CatalogLifecycleDirectory catalogDirectory;

    @Mock
    private MedicationRouteDirectory routeDirectory;

    private PrescriptionSplitEngine engine;
    private EncounterSnapshot encounter;

    @BeforeEach
    void setUp() {
        engine = new PrescriptionSplitEngine(catalogDirectory, routeDirectory);
        encounter = new EncounterSnapshot(
                1001L, 1L, 2001L, 3001L, 4001L,
                "ENC20260912001", "DOC001", "ARRIVED", 1L,
                "心内科门诊", Instant.now()
        );
    }

    private BatchOrderMedicationItem createItem(Long medId, String name, String category,
                                                String routeCode, String routeExecType,
                                                String adminKey, Long stockSiteId, String stockSiteName) {
        return new BatchOrderMedicationItem(
                medId, 10000L + medId, 20000L + medId,
                BigDecimal.valueOf(10), "mg", routeCode, "QD",
                BigDecimal.valueOf(7), "天", BigDecimal.ONE, "盒",
                true, false, "遵医嘱", true, null,
                "SALE", true, stockSiteId, stockSiteName,
                adminKey, routeExecType, category, false, null, null, "门诊开立"
        );
    }

    private MedicationSnapshot mockMedication(Long id, String name, String category, boolean singleOrder) {
        return new MedicationSnapshot(
                id, 1L, "M" + id, name, null, category, "片剂",
                "10mg", "mg", BigDecimal.valueOf(10), "mg", "NORMAL",
                true, false, false, null, true, false, false,
                null, false, null, null, null, null, null,
                BigDecimal.valueOf(10), "mg", "PO", 1L, "QD",
                false, singleOrder, "ACTIVE"
        );
    }

    @Test
    @DisplayName("测试规则1与规则2：西药、中成药与草药按大类和药房隔离分方")
    void shouldSplitByCategoryAndStockSite() {
        // 2个西药（西药房），1个中成药（中药房），2个草药饮片（草药房）
        when(catalogDirectory.requireMedication(1L, 1L)).thenReturn(mockMedication(1L, "阿莫西林", "WESTERN", false));
        when(catalogDirectory.requireMedication(1L, 2L)).thenReturn(mockMedication(2L, "布洛芬", "WESTERN", false));
        when(catalogDirectory.requireMedication(1L, 3L)).thenReturn(mockMedication(3L, "感冒清热颗粒", "CHINESE_PATENT", false));
        when(catalogDirectory.requireMedication(1L, 4L)).thenReturn(mockMedication(4L, "金银花", "HERBAL", false));
        when(catalogDirectory.requireMedication(1L, 5L)).thenReturn(mockMedication(5L, "连翘", "HERBAL", false));

        List<BatchOrderMedicationItem> items = List.of(
                createItem(1L, "阿莫西林", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(2L, "布洛芬", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(3L, "感冒清热颗粒", "CHINESE_PATENT", "PO", "NONE", null, 20L, "中药房"),
                createItem(4L, "金银花", "HERBAL", "DECOCT", "NONE", null, 30L, "草药房"),
                createItem(5L, "连翘", "HERBAL", "DECOCT", "NONE", null, 30L, "草药房")
        );

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        assertThat(plans).hasSize(3);

        // 处方1：西药处方
        assertThat(plans.get(0).categoryCode()).isEqualTo("WESTERN");
        assertThat(plans.get(0).stockSiteId()).isEqualTo(10L);
        assertThat(plans.get(0).items()).hasSize(2);

        // 处方2：中成药处方
        assertThat(plans.get(1).categoryCode()).isEqualTo("CHINESE_PATENT");
        assertThat(plans.get(1).stockSiteId()).isEqualTo(20L);
        assertThat(plans.get(1).items()).hasSize(1);

        // 处方3：草药饮片处方（两味中药合在同一方）
        assertThat(plans.get(2).categoryCode()).isEqualTo("HERBAL");
        assertThat(plans.get(2).stockSiteId()).isEqualTo(30L);
        assertThat(plans.get(2).items()).hasSize(2);
    }

    @Test
    @DisplayName("测试规则3：静脉输液与口服西药分方")
    void shouldSplitInfusionFromOral() {
        when(catalogDirectory.requireMedication(1L, 1L)).thenReturn(mockMedication(1L, "阿莫西林胶囊", "WESTERN", false));
        when(catalogDirectory.requireMedication(1L, 2L)).thenReturn(mockMedication(2L, "5%葡萄糖注射液", "WESTERN", false));
        when(routeDirectory.resolveActive(eq(1L), eq("IV_DRIP"), eq("OUTPATIENT"), any(LocalDate.class)))
                .thenReturn(Optional.of(new RouteSnapshot(99L, "IV_DRIP", "静脉滴注", "STD", "1", "INFUSION")));

        List<BatchOrderMedicationItem> items = List.of(
                createItem(1L, "阿莫西林胶囊", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(2L, "5%葡萄糖注射液", "WESTERN", "IV_DRIP", "INFUSION", "temp:infusion-1", 10L, "西药房")
        );

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        assertThat(plans).hasSize(2);
        assertThat(plans.get(0).routeGroupType()).isEqualTo("ORAL");
        assertThat(plans.get(0).title()).isEqualTo("门诊西药处方");
        assertThat(plans.get(1).routeGroupType()).isEqualTo("INFUSION");
        assertThat(plans.get(1).title()).isEqualTo("门诊输液处方");
    }

    @Test
    @DisplayName("测试规则4：单列医嘱药品（singleOrder）独立成方")
    void shouldSplitSingleOrderMedication() {
        when(catalogDirectory.requireMedication(1L, 1L)).thenReturn(mockMedication(1L, "常规西药A", "WESTERN", false));
        when(catalogDirectory.requireMedication(1L, 2L)).thenReturn(mockMedication(2L, "贵重管制药B", "WESTERN", true));

        List<BatchOrderMedicationItem> items = List.of(
                createItem(1L, "常规西药A", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(2L, "贵重管制药B", "WESTERN", "PO", "NONE", null, 10L, "西药房")
        );

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        assertThat(plans).hasSize(2);
        assertThat(plans.get(0).items().get(0).item().medicationId()).isEqualTo(1L);
        assertThat(plans.get(1).items().get(0).item().medicationId()).isEqualTo(2L);
        assertThat(plans.get(1).title()).contains("贵重管制药B");
        assertThat(plans.get(1).ruleReasons()).contains("单列药品一药一方");
    }

    @Test
    @DisplayName("测试规则5与规则6：输液组原子性保护，不跨方拆分，并在超过5种时分方")
    void shouldKeepInfusionGroupAtomicAndNotSplitAcrossPrescriptions() {
        // 开 3 种口服西药，外加 1 组输液（1个溶媒 + 2个辅药 = 3个药）
        // 总共 6 个药，单方上限 5 个。
        // 如果暴力切分：处方1将放 3口服 + 2输液，处方2放 1输液（同组被拆散！）。
        // 规则引擎正确行为：检测到当前处方放不下整组输液(3+3>5)，应将整组输液移到下一张处方！
        // 从而：处方1放 3个口服；处方2放 3个输液（完整同组）。
        for (long i = 1; i <= 6; i++) {
            when(catalogDirectory.requireMedication(1L, i)).thenReturn(mockMedication(i, "药品" + i, "WESTERN", false));
        }
        when(routeDirectory.resolveActive(eq(1L), eq("IV_DRIP"), eq("OUTPATIENT"), any(LocalDate.class)))
                .thenReturn(Optional.of(new RouteSnapshot(99L, "IV_DRIP", "静脉滴注", "STD", "1", "INFUSION")));

        List<BatchOrderMedicationItem> items = List.of(
                createItem(1L, "口服1", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(2L, "口服2", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(3L, "口服3", "WESTERN", "PO", "NONE", null, 10L, "西药房"),
                createItem(4L, "生理盐水(溶媒)", "WESTERN", "IV_DRIP", "INFUSION", "grp-1", 10L, "西药房"),
                createItem(5L, "辅药A", "WESTERN", "IV_DRIP", "INFUSION", "grp-1", 10L, "西药房"),
                createItem(6L, "辅药B", "WESTERN", "IV_DRIP", "INFUSION", "grp-1", 10L, "西药房")
        );

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        assertThat(plans).hasSize(2);
        // 处方1是口服，包含 3 种
        assertThat(plans.get(0).title()).isEqualTo("门诊西药处方");
        assertThat(plans.get(0).items()).hasSize(3);

        // 处方2是输液，完整保留整组 3 种，首个标记为 groupLeader
        assertThat(plans.get(1).title()).isEqualTo("门诊输液处方");
        assertThat(plans.get(1).items()).hasSize(3);
        assertThat(plans.get(1).items().get(0).groupLeader()).isTrue();
        assertThat(plans.get(1).items().get(1).groupLeader()).isFalse();
        assertThat(plans.get(1).items().get(2).groupLeader()).isFalse();
        assertThat(plans.get(1).ruleReasons()).contains("同组输液原子性保护");
    }

    @Test
    @DisplayName("测试容量限制：超过5种同类型口服药自动顺序装箱切分")
    void shouldSplitWhenExceedingMaxCapacity() {
        // 7 种口服西药 -> 切分为处方1(5种) + 处方2(2种)
        for (long i = 1; i <= 7; i++) {
            when(catalogDirectory.requireMedication(1L, i)).thenReturn(mockMedication(i, "西药" + i, "WESTERN", false));
        }

        List<BatchOrderMedicationItem> items = new ArrayList<>();
        for (long i = 1; i <= 7; i++) {
            items.add(createItem(i, "西药" + i, "WESTERN", "PO", "NONE", null, 10L, "西药房"));
        }

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        assertThat(plans).hasSize(2);
        assertThat(plans.get(0).items()).hasSize(5);
        assertThat(plans.get(1).items()).hasSize(2);
        assertThat(plans.get(0).ruleReasons()).anyMatch(r -> r.contains("5种容量限制"));
        assertThat(plans.get(1).ruleReasons()).anyMatch(r -> r.contains("5种容量限制"));
    }

    @Test
    @DisplayName("测试规则：同组输液即便含有 singleOrder 药品，也必须保持同组原子性，统一归入门诊输液处方")
    void shouldKeepInfusionGroupAtomicEvenWithSingleOrderMedication() {
        // 两个输液药品，均被标记为 singleOrder = true（如头孢曲松钠 + 维生素B1注射液），同属于一个输液组
        when(catalogDirectory.requireMedication(1L, 101L)).thenReturn(mockMedication(101L, "注射用头孢曲松钠", "WESTERN", true));
        when(catalogDirectory.requireMedication(1L, 102L)).thenReturn(mockMedication(102L, "维生素B1注射液", "WESTERN", true));
        when(routeDirectory.resolveActive(eq(1L), eq("IVGTT"), eq("OUTPATIENT"), any(LocalDate.class)))
                .thenReturn(Optional.of(new RouteSnapshot(99L, "IVGTT", "静脉滴注", "STD", "1", "INFUSION")));

        List<BatchOrderMedicationItem> items = List.of(
                createItem(101L, "注射用头孢曲松钠", "WESTERN", "IVGTT", "INFUSION", "grp-ceftriaxone", 10L, "门诊药房"),
                createItem(102L, "维生素B1注射液", "WESTERN", "IVGTT", "INFUSION", "grp-ceftriaxone", 10L, "门诊药房")
        );

        List<SplitPrescriptionPlan> plans = engine.plan(encounter, items);

        // 必须合在同一张“门诊输液处方”中，而不是拆成两个单列专方！
        assertThat(plans).hasSize(1);
        SplitPrescriptionPlan plan = plans.getFirst();
        assertThat(plan.title()).isEqualTo("门诊输液处方");
        assertThat(plan.routeGroupType()).isEqualTo("INFUSION");
        assertThat(plan.items()).hasSize(2);
        assertThat(plan.items().get(0).groupLeader()).isTrue();
        assertThat(plan.items().get(0).groupKey()).isEqualTo("grp-ceftriaxone");
        assertThat(plan.items().get(1).groupLeader()).isFalse();
        assertThat(plan.items().get(1).groupKey()).isEqualTo("grp-ceftriaxone");
        assertThat(plan.ruleReasons()).contains("同组输液原子性保护");
    }
}
