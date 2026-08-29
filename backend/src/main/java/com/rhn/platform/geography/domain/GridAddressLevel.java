package com.rhn.platform.geography.domain;

public enum GridAddressLevel {
    PROVINCE(1, "省级"), CITY(2, "市级"), COUNTY(3, "县区级"), STREET(4, "街道乡镇"), COMMUNITY(5, "社区村");

    private final int depth;
    private final String displayName;

    GridAddressLevel(int depth, String displayName) {
        this.depth = depth;
        this.displayName = displayName;
    }

    public int depth() { return depth; }
    public String displayName() { return displayName; }
    public GridAddressLevel childLevel() {
        return switch (this) {
            case PROVINCE -> CITY;
            case CITY -> COUNTY;
            case COUNTY -> STREET;
            case STREET -> COMMUNITY;
            case COMMUNITY -> null;
        };
    }
}
