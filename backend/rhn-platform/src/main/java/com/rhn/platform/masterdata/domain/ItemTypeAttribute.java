package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.text.Strings;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "RHN_BD_ITEM_TYPE_ATTR")
public class ItemTypeAttribute {
    @Id @Column(name = "ID_ITEM_TYPE_ATTR") private Long id;
    @Version @Column(name = "REVISION") private long revision;
    @Column(name = "ID_ITEM_TYPE", nullable = false) private Long itemTypeId;
    @Column(name = "ID_ITEM_ATTR_DEF", nullable = false) private Long attributeDefinitionId;
    @Column(name = "FG_RQD_VAL", nullable = false) private boolean requiredValue;
    @Lob @Column(name = "JSON_DEFAULT") private String defaultJson;
    @Column(name = "SD_WIDGET_TYPE", nullable = false) private String widgetType;
    @Column(name = "NA_GRP") private String groupName;
    @Column(name = "SN_GRP_SORT", nullable = false) private int groupSortOrder;
    @Column(name = "SN_ATTR_SORT", nullable = false) private int attributeSortOrder;
    @Lob @Column(name = "JSON_VISIBLE_COND") private String visibleConditionJson;
    @Lob @Column(name = "JSON_RQD_COND") private String requiredConditionJson;
    @Column(name = "FG_SRCHBL", nullable = false) private boolean searchable;
    @Column(name = "FG_LIST_DISPLAY", nullable = false) private boolean listDisplay;
    @Column(name = "SD_STATUS", nullable = false) private String status;
    @Column(name = "DT_CREATED", nullable = false) private Instant createdAt;
    @Column(name = "ID_USER_CREATED", nullable = false) private Long createdBy;
    @Column(name = "DT_UPDATED", nullable = false) private Instant updatedAt;
    @Column(name = "ID_USER_UPDATED", nullable = false) private Long updatedBy;

    protected ItemTypeAttribute() {}

    public ItemTypeAttribute(Long itemTypeId, Long definitionId, boolean requiredValue, String defaultJson,
                             String widgetType, String groupName, int groupSortOrder, int attributeSortOrder,
                             String visibleConditionJson, String requiredConditionJson,
                             boolean searchable, boolean listDisplay, Long actorId) {
        this.id = GlobalIds.next();
        this.itemTypeId = Strings.requireId(itemTypeId, "项目类型");
        this.attributeDefinitionId = Strings.requireId(definitionId, "属性定义");
        apply(requiredValue, defaultJson, widgetType, groupName, groupSortOrder, attributeSortOrder,
                visibleConditionJson, requiredConditionJson, searchable, listDisplay);
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = Strings.requireId(actorId, "操作用户");
        this.updatedAt = createdAt;
        this.updatedBy = actorId;
    }

    public void update(long expectedRevision, boolean requiredValue, String defaultJson, String widgetType,
                       String groupName, int groupSortOrder, int attributeSortOrder,
                       String visibleConditionJson, String requiredConditionJson,
                       boolean searchable, boolean listDisplay, Long actorId) {
        requireRevision(expectedRevision);
        apply(requiredValue, defaultJson, widgetType, groupName, groupSortOrder, attributeSortOrder,
                visibleConditionJson, requiredConditionJson, searchable, listDisplay);
        touch(actorId);
    }

    public void changeStatus(long expectedRevision, String status, Long actorId) {
        requireRevision(expectedRevision);
        if (!"ACTIVE".equals(status) && !"INACTIVE".equals(status)) {
            throw new IllegalArgumentException("类型属性状态仅支持 ACTIVE 或 INACTIVE");
        }
        this.status = status;
        touch(actorId);
    }

    private void apply(boolean requiredValue, String defaultJson, String widgetType, String groupName,
                       int groupSortOrder, int attributeSortOrder, String visibleConditionJson,
                       String requiredConditionJson, boolean searchable, boolean listDisplay) {
        if (groupSortOrder < 0 || attributeSortOrder < 0) throw new IllegalArgumentException("属性排序不能小于 0");
        this.requiredValue = requiredValue;
        this.defaultJson = Strings.optionalText(defaultJson, 20000);
        this.widgetType = Strings.requireText(widgetType, "控件类型", 32);
        this.groupName = Strings.optionalText(groupName, 200);
        this.groupSortOrder = groupSortOrder;
        this.attributeSortOrder = attributeSortOrder;
        this.visibleConditionJson = Strings.optionalText(visibleConditionJson, 20000);
        this.requiredConditionJson = Strings.optionalText(requiredConditionJson, 20000);
        this.searchable = searchable;
        this.listDisplay = listDisplay;
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = Strings.requireId(actorId, "操作用户");
    }

    private void requireRevision(long expectedRevision) {
        if (revision != expectedRevision) throw new IllegalArgumentException("类型属性修订号已变化");
    }

    public Long id() { return id; }
    public long revision() { return revision; }
    public Long itemTypeId() { return itemTypeId; }
    public Long attributeDefinitionId() { return attributeDefinitionId; }
    public boolean requiredValue() { return requiredValue; }
    public String defaultJson() { return defaultJson; }
    public String widgetType() { return widgetType; }
    public String groupName() { return groupName; }
    public int groupSortOrder() { return groupSortOrder; }
    public int attributeSortOrder() { return attributeSortOrder; }
    public String visibleConditionJson() { return visibleConditionJson; }
    public String requiredConditionJson() { return requiredConditionJson; }
    public boolean searchable() { return searchable; }
    public boolean listDisplay() { return listDisplay; }
    public String status() { return status; }

}
