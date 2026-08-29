package com.rhn.platform.masterdata.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "item_type_attributes")
public class ItemTypeAttribute {
    @Id private Long id;
    @Version private long revision;
    @Column(name = "item_type_id", nullable = false) private Long itemTypeId;
    @Column(name = "attribute_definition_id", nullable = false) private Long attributeDefinitionId;
    @Column(name = "required_value", nullable = false) private boolean requiredValue;
    @Lob @Column(name = "default_json") private String defaultJson;
    @Column(name = "widget_type", nullable = false) private String widgetType;
    @Column(name = "group_name") private String groupName;
    @Column(name = "group_sort_order", nullable = false) private int groupSortOrder;
    @Column(name = "attribute_sort_order", nullable = false) private int attributeSortOrder;
    @Lob @Column(name = "visible_condition_json") private String visibleConditionJson;
    @Lob @Column(name = "required_condition_json") private String requiredConditionJson;
    @Column(nullable = false) private boolean searchable;
    @Column(name = "list_display", nullable = false) private boolean listDisplay;
    @Column(nullable = false) private String status;
    @Column(name = "created_at", nullable = false) private Instant createdAt;
    @Column(name = "created_by", nullable = false) private Long createdBy;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt;
    @Column(name = "updated_by", nullable = false) private Long updatedBy;

    protected ItemTypeAttribute() {}

    public ItemTypeAttribute(Long itemTypeId, Long definitionId, boolean requiredValue, String defaultJson,
                             String widgetType, String groupName, int groupSortOrder, int attributeSortOrder,
                             String visibleConditionJson, String requiredConditionJson,
                             boolean searchable, boolean listDisplay, Long actorId) {
        this.id = GlobalIds.next();
        this.itemTypeId = requireId(itemTypeId, "项目类型");
        this.attributeDefinitionId = requireId(definitionId, "属性定义");
        apply(requiredValue, defaultJson, widgetType, groupName, groupSortOrder, attributeSortOrder,
                visibleConditionJson, requiredConditionJson, searchable, listDisplay);
        this.status = "ACTIVE";
        this.createdAt = Instant.now();
        this.createdBy = requireId(actorId, "操作用户");
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
        this.defaultJson = optionalText(defaultJson, 20000);
        this.widgetType = requireText(widgetType, "控件类型", 32);
        this.groupName = optionalText(groupName, 200);
        this.groupSortOrder = groupSortOrder;
        this.attributeSortOrder = attributeSortOrder;
        this.visibleConditionJson = optionalText(visibleConditionJson, 20000);
        this.requiredConditionJson = optionalText(requiredConditionJson, 20000);
        this.searchable = searchable;
        this.listDisplay = listDisplay;
    }

    private void touch(Long actorId) {
        this.updatedAt = Instant.now();
        this.updatedBy = requireId(actorId, "操作用户");
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

    private static Long requireId(Long value, String label) {
        if (value == null || value <= 0) throw new IllegalArgumentException(label + "标识不能为空");
        return value;
    }

    private static String requireText(String value, String label, int max) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException(label + "长度不能超过" + max);
        return result;
    }

    private static String optionalText(String value, int max) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > max) throw new IllegalArgumentException("文本长度不能超过" + max);
        return result;
    }
}
