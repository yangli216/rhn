package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_UNIT_DEF")
public class UnitDefinition {
    @Id @Column(name = "ID_UNIT_DEF") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "CD_UNIT_DEF", nullable = false) private String code;
    @Column(name = "NA_UNIT_DEF", nullable = false) private String name;
    @Column(name = "SYMBOL") private String symbol;
    @Column(name = "DIM", nullable = false) private String dimension;
    @Column(name = "DECIMAL_SCALE", nullable = false) private int decimalScale;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected UnitDefinition() {}

    public UnitDefinition(Long tenantId, Long actorId, String code, String name, String symbol,
                          String dimension, int decimalScale, String status) {
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.code = require(code, "单位编码");
        this.createdAt = Instant.now(); this.createdBy = actorId;
        updateValues(actorId, name, symbol, dimension, decimalScale, status);
    }

    public void update(long expectedRevision, Long actorId, String name, String symbol,
                       String dimension, int decimalScale, String status) {
        requireRevision(expectedRevision);
        updateValues(actorId, name, symbol, dimension, decimalScale, status);
    }

    public void changeStatus(long expectedRevision, Long actorId, String status) {
        requireRevision(expectedRevision); this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }

    private void updateValues(Long actorId, String name, String symbol, String dimension,
                              int decimalScale, String status) {
        if (!java.util.Set.of("COUNT", "MASS", "VOLUME", "TIME", "LENGTH", "AREA", "ACTIVITY", "TEMPERATURE", "OTHER").contains(dimension)) {
            throw new IllegalArgumentException("不支持的计量维度");
        }
        if (decimalScale < 0 || decimalScale > 12) throw new IllegalArgumentException("单位精度必须在0到12之间");
        this.name = require(name, "单位名称"); this.symbol = trim(symbol); this.dimension = dimension;
        this.decimalScale = decimalScale; this.status = status; this.updatedAt = Instant.now(); this.updatedBy = actorId;
    }
    private static String require(String value, String label) { if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空"); return value.trim(); }
    private static String trim(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private void requireRevision(long expected) { if (revision != expected) throw new IllegalStateException("计量单位已被其他用户修改，请刷新后重试"); }

    public Long id() { return id; } public long revision() { return revision; } public Long tenantId() { return tenantId; }
    public String code() { return code; } public String name() { return name; } public String symbol() { return symbol; }
    public String dimension() { return dimension; } public int decimalScale() { return decimalScale; } public String status() { return status; }
}
