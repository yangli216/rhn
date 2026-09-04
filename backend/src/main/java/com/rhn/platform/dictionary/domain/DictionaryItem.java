package com.rhn.platform.dictionary.domain;

import com.rhn.shared.id.GlobalIds;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "RHN_BD_DICT_ITEM")
public class DictionaryItem {
    @Id
    @Column(name = "ID_DICT_ITEM") private Long id;
    @Column(name = "ID_DICT_DEF_DICT", nullable = false)
    private Long dictionaryId;
    @Column(name = "CD_DICT_ITEM", nullable = false, length = 128)
    private String code;
    @Column(name = "NA_DICT_ITEM", nullable = false, length = 300)
    private String name;
    @Column(name = "DES_DICT_ITEM", length = 1000)
    private String description;
    @Column(name = "SN_SORT", nullable = false)
    private int sortOrder;
    @Enumerated(EnumType.STRING)
    @Column(name = "SD_STATUS", nullable = false, length = 32)
    private DictionaryStatus status;

    protected DictionaryItem() {
    }

    public DictionaryItem(Long dictionaryId, String code, String name, String description, int sortOrder) {
        if (dictionaryId == null) throw new IllegalArgumentException("字典标识不能为空");
        this.id = GlobalIds.next();
        this.dictionaryId = dictionaryId;
        this.code = DictionaryCodePolicy.requireItemCode(code);
        this.name = requireName(name);
        this.description = optionalDescription(description);
        this.sortOrder = requireSort(sortOrder);
        this.status = DictionaryStatus.ACTIVE;
    }

    public void update(String name, String description, int sortOrder) {
        this.name = requireName(name);
        this.description = optionalDescription(description);
        this.sortOrder = requireSort(sortOrder);
    }

    public void enable() {
        if (status == DictionaryStatus.ACTIVE) throw new IllegalArgumentException("字典项已经启用");
        status = DictionaryStatus.ACTIVE;
    }

    public void disable() {
        if (status == DictionaryStatus.INACTIVE) throw new IllegalArgumentException("字典项已经停用");
        status = DictionaryStatus.INACTIVE;
    }

    private static String requireName(String value) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException("字典项名称不能为空");
        String result = value.trim();
        if (result.length() > 300) throw new IllegalArgumentException("字典项名称长度不能超过300");
        return result;
    }

    private static String optionalDescription(String value) {
        if (value == null || value.isBlank()) return null;
        String result = value.trim();
        if (result.length() > 1000) throw new IllegalArgumentException("描述长度不能超过1000");
        return result;
    }

    private static int requireSort(int value) {
        if (value < 0) throw new IllegalArgumentException("排序号不能小于0");
        return value;
    }

    public Long id() { return id; }
    public Long dictionaryId() { return dictionaryId; }
    public String code() { return code; }
    public String name() { return name; }
    public String description() { return description; }
    public int sortOrder() { return sortOrder; }
    public DictionaryStatus status() { return status; }
}

