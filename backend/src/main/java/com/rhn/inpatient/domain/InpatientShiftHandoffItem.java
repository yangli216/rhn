package com.rhn.inpatient.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

@Entity
@Table(name = "inpatient_shift_handoff_items")
public class InpatientShiftHandoffItem {
    @Id private Long id;
    @Column(name = "tenant_id", nullable = false) private Long tenantId;
    @Column(name = "handoff_id", nullable = false) private Long handoffId;
    @Column(name = "episode_id", nullable = false) private Long episodeId;
    @Column(name = "encounter_id", nullable = false) private Long encounterId;
    @Column(name = "resident_id", nullable = false) private Long residentId;
    @Column(name = "resident_name_snapshot", nullable = false) private String residentNameSnapshot;
    @Column(name = "bed_no_snapshot") private String bedNoSnapshot;
    @Column(nullable = false) private String situation;
    @Lob @Column(name = "pending_actions_json", nullable = false) private String pendingActionsJson;
    @Lob @Column(name = "risk_flags_json", nullable = false) private String riskFlagsJson;
    @Column(name = "sort_order", nullable = false) private int sortOrder;

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

