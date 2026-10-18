package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/** 政策版本要求的一项资格条件；名单与外部接口按资格类别判定，属性条件保存为表达式。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_QUALIF")
public class ReliefQualification {
    @Id @Column(name = "ID_RELIEF_QUALIF") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_POLICY_VER", nullable = false) private Long policyVersionId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Enumerated(EnumType.STRING) @Column(name = "SD_QUALIF_SRC", nullable = false) private ReliefQualificationSource source;
    @Column(name = "CD_QUALIF_TYPE") private String qualificationType;
    @Lob @Column(name = "JSON_COND") private String conditionsJson;
    @Column(name = "CD_PRVDR") private String providerCode;
    @Enumerated(EnumType.STRING) @Column(name = "SD_FAIL_POLICY") private ReliefFailurePolicy failurePolicy;

    protected ReliefQualification() {}

    public ReliefQualification(Long tenantId, Long policyVersionId, int lineNo, ReliefQualificationSource source,
                               String qualificationType, String conditionsJson, String providerCode,
                               ReliefFailurePolicy failurePolicy) {
        switch (source) {
            case ALL -> require(qualificationType == null && conditionsJson == null && providerCode == null,
                    "全部患者条件不能附带资格类别、属性或接口");
            case ROSTER -> require(qualificationType != null && conditionsJson == null && providerCode == null,
                    "名单资格必须指定资格类别");
            case ATTRIBUTE -> require(conditionsJson != null && !conditionsJson.isBlank() && providerCode == null,
                    "属性资格必须设置条件");
            case PROVIDER -> require(qualificationType != null && providerCode != null && failurePolicy != null,
                    "外部接口资格必须指定资格类别、接口和失败处理方式");
        }
        require(source == ReliefQualificationSource.PROVIDER || failurePolicy == null, "仅外部接口资格需要失败处理方式");
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.policyVersionId = policyVersionId;
        this.lineNo = lineNo; this.source = source; this.qualificationType = qualificationType;
        this.conditionsJson = conditionsJson; this.providerCode = providerCode; this.failurePolicy = failurePolicy;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new IllegalArgumentException(message);
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long policyVersionId() { return policyVersionId; }
    public int lineNo() { return lineNo; }
    public ReliefQualificationSource source() { return source; }
    public String qualificationType() { return qualificationType; }
    public String conditionsJson() { return conditionsJson; }
    public String providerCode() { return providerCode; }
    public ReliefFailurePolicy failurePolicy() { return failurePolicy; }
}
