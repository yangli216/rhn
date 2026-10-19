package com.rhn.billing.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.api.StaleRevisionException;
import jakarta.persistence.*;
import java.time.Instant;

/** One encrypted merchant configuration per tenant, legal institution and payment method. */
@Entity
@Table(name = "RHN_BIL_PAY_CFG")
public class PaymentMerchantConfiguration {
    @Id @Column(name = "ID_PAY_CFG") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_ORG", nullable = false) private Long organizationId;
    @Column(name = "CD_PAY_METHOD", nullable = false) private String paymentMethodCode;
    @Column(name = "FL_ENABLED", nullable = false) private boolean enabled;
    @Column(name = "FL_ID_LOCK", nullable = false) private boolean identityLocked;
    @Lob @Column(name = "TXT_CIPHER", nullable = false) private String encryptedValues;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    protected PaymentMerchantConfiguration() {}
    public PaymentMerchantConfiguration(Long tenantId, Long organizationId, String method) {
        id = GlobalIds.next(); this.tenantId = tenantId; this.organizationId = organizationId; paymentMethodCode = method;
    }
    public void update(long expectedRevision, boolean enabled, String encryptedValues, Long actorId) {
        if (revision != expectedRevision) throw new StaleRevisionException(revision);
        this.enabled = enabled; this.identityLocked |= enabled; this.encryptedValues = encryptedValues;
        updatedBy = actorId; updatedAt = Instant.now();
    }
    public void lockIdentity() { identityLocked = true; }
    public Long id() { return id; }
    public long revision() { return revision; }
    public boolean enabled() { return enabled; }
    public boolean identityLocked() { return identityLocked; }
    public String encryptedValues() { return encryptedValues; }
    public Instant updatedAt() { return updatedAt; }
}
