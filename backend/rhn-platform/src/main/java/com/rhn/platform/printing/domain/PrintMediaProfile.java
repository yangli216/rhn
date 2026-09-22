package com.rhn.platform.printing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.math.BigDecimal;

@Entity
@Table(name = "RHN_META_PRINT_MEDIA")
public class PrintMediaProfile {
    @Id @Column(name = "ID_PRINT_MEDIA") private Long id;
    @Version @Column(name = "REVISION", nullable = false) private long revision;
    @Column(name = "ID_TNT") private Long tenantId;
    @Column(name = "CD_MEDIA", nullable = false) private String mediaCode;
    @Column(name = "NA_MEDIA", nullable = false) private String mediaName;
    @Column(name = "SD_MEDIA_KIND", nullable = false) private String mediaKind;
    @Column(name = "WIDTH_MM", nullable = false) private BigDecimal widthMm;
    @Column(name = "HEIGHT_MM") private BigDecimal heightMm;
    @Column(name = "SD_ORIENT", nullable = false) private String orientation;
    @Column(name = "MARGIN_TOP_MM", nullable = false) private BigDecimal marginTopMm;
    @Column(name = "MARGIN_RIGHT_MM", nullable = false) private BigDecimal marginRightMm;
    @Column(name = "MARGIN_BOTTOM_MM", nullable = false) private BigDecimal marginBottomMm;
    @Column(name = "MARGIN_LEFT_MM", nullable = false) private BigDecimal marginLeftMm;
    @Column(name = "GAP_HORIZ_MM", nullable = false) private BigDecimal horizontalGapMm;
    @Column(name = "GAP_VERT_MM", nullable = false) private BigDecimal verticalGapMm;
    @Column(name = "QTY_COLUMNS", nullable = false) private int columns;
    @Column(name = "QTY_ROWS", nullable = false) private int rows;
    @Column(name = "QTY_DPI", nullable = false) private int dpi;
    @Column(name = "SD_SENSOR_MODE", nullable = false) private String sensorMode;
    @Column(name = "SD_STATUS", nullable = false) private String status;

    protected PrintMediaProfile() {}

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public String mediaCode() { return mediaCode; }
    public String mediaName() { return mediaName; }
    public String mediaKind() { return mediaKind; }
    public BigDecimal widthMm() { return widthMm; }
    public BigDecimal heightMm() { return heightMm; }
    public String orientation() { return orientation; }
    public BigDecimal marginTopMm() { return marginTopMm; }
    public BigDecimal marginRightMm() { return marginRightMm; }
    public BigDecimal marginBottomMm() { return marginBottomMm; }
    public BigDecimal marginLeftMm() { return marginLeftMm; }
    public BigDecimal horizontalGapMm() { return horizontalGapMm; }
    public BigDecimal verticalGapMm() { return verticalGapMm; }
    public int columns() { return columns; }
    public int rows() { return rows; }
    public int dpi() { return dpi; }
    public String sensorMode() { return sensorMode; }
    public String status() { return status; }
}
