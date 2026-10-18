package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/** 政策版本中的一条费用范围与计算方式；排除范围不带计算方式。 */
@Entity
@Table(name = "RHN_BIL_RELIEF_RULE")
public class ReliefRule {
    @Id @Column(name = "ID_RELIEF_RULE") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_POLICY_VER", nullable = false) private Long policyVersionId;
    @Column(name = "SN_LINE", nullable = false) private int lineNo;
    @Enumerated(EnumType.STRING) @Column(name = "SD_SCOPE_TYPE", nullable = false) private ReliefScopeType scopeType;
    @Column(name = "CD_SCOPE_VAL") private String scopeValue;
    @Column(name = "ID_CATALOG_ITEM") private Long catalogItemId;
    @Column(name = "NA_SCOPE_SNAP") private String scopeNameSnapshot;
    @Column(name = "FG_EXCLUDE", nullable = false) private boolean excluded;
    @Enumerated(EnumType.STRING) @Column(name = "SD_METHOD") private ReliefMethod method;
    @Column(name = "VAL_RATIO", precision = 9, scale = 6) private BigDecimal ratio;
    @Column(name = "AMT_RULE", precision = 24, scale = 6) private BigDecimal amount;
    @Column(name = "AMT_MANUAL_MAX", precision = 24, scale = 6) private BigDecimal manualMaxAmount;
    @Column(name = "QTY_PERIOD_MAX") private Integer periodMaxCount;

    protected ReliefRule() {}

    public ReliefRule(Long tenantId, Long policyVersionId, int lineNo, ReliefRuleTerms terms) {
        terms.validate();
        this.id = GlobalIds.next(); this.tenantId = tenantId; this.policyVersionId = policyVersionId; this.lineNo = lineNo;
        this.scopeType = terms.scopeType(); this.scopeValue = terms.scopeValue(); this.catalogItemId = terms.catalogItemId();
        this.scopeNameSnapshot = terms.scopeName(); this.excluded = terms.excluded(); this.method = terms.method();
        this.ratio = terms.ratio(); this.amount = terms.amount(); this.manualMaxAmount = terms.manualMaxAmount();
        this.periodMaxCount = terms.periodMaxCount();
    }

    public ReliefRuleTerms terms() {
        return new ReliefRuleTerms(scopeType, scopeValue, catalogItemId, scopeNameSnapshot, excluded, method,
                ratio, amount, manualMaxAmount, periodMaxCount);
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long policyVersionId() { return policyVersionId; }
    public int lineNo() { return lineNo; }
}
