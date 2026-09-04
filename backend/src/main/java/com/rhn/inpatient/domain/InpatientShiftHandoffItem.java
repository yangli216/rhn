package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_VIS_INP_SHIFT_HANDOFF_ITEM")
public class InpatientShiftHandoffItem {
    @Id @Column(name = "ID_INP_SHIFT_HANDOFF_ITEM") private Long id;
    @Column(name = "ID_TNT", nullable = false) private Long tenantId;
    @Column(name = "ID_INP_SHIFT_HANDOFF", nullable = false) private Long handoffId;
    @Column(name = "ID_CARE_EPISODE", nullable = false) private Long episodeId;
    @Column(name = "ID_ENC", nullable = false) private Long encounterId;
    @Column(name = "ID_PAT", nullable = false) private Long residentId;
    @Column(name = "NA_PAT_SNAP", nullable = false) private String residentNameSnapshot;
    @Column(name = "CD_BED_SNAP") private String bedNoSnapshot;
    @Column(name = "DES_SITUATION", nullable = false) private String situation;
    @Lob @Column(name = "JSON_PENDING_ACTIONS", nullable = false) private String pendingActionsJson;
    @Lob @Column(name = "JSON_RISK_FLAGS", nullable = false) private String riskFlagsJson;
    @Column(name = "SN_SORT", nullable = false) private int sortOrder;

    protected InpatientShiftHandoffItem() {
    }

    public InpatientShiftHandoffItem(Long tenantId, Long handoffId, Long episodeId,
                                     Long encounterId, Long residentId, String residentNameSnapshot,
                                     String bedNoSnapshot, String situation, String pendingActionsJson,
                                     String riskFlagsJson, int sortOrder) {
        this.id = GlobalIds.next();
        this.tenantId = tenantId;
        this.handoffId = handoffId;
        this.episodeId = episodeId;
        this.encounterId = encounterId;
        this.residentId = residentId;
        this.residentNameSnapshot = residentNameSnapshot;
        this.bedNoSnapshot = bedNoSnapshot;
        this.situation = situation;
        this.pendingActionsJson = pendingActionsJson;
        this.riskFlagsJson = riskFlagsJson;
        this.sortOrder = sortOrder;
    }

    public Long id() { return id; }
    public Long tenantId() { return tenantId; }
    public Long handoffId() { return handoffId; }
    public Long episodeId() { return episodeId; }
    public Long encounterId() { return encounterId; }
    public Long residentId() { return residentId; }
    public String residentNameSnapshot() { return residentNameSnapshot; }
    public String bedNoSnapshot() { return bedNoSnapshot; }
    public String situation() { return situation; }
    public String pendingActionsJson() { return pendingActionsJson; }
    public String riskFlagsJson() { return riskFlagsJson; }
    public int sortOrder() { return sortOrder; }
}

