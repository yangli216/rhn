package com.rhn.platform.identityaccess.application;

import com.rhn.platform.dictionary.api.SystemEnumContribution;
import com.rhn.platform.dictionary.api.SystemEnumDefinition;
import org.springframework.stereotype.Component;

import java.util.List;

import static com.rhn.platform.dictionary.api.SystemEnumDefinition.items;
import static com.rhn.platform.dictionary.api.SystemEnumDefinition.of;

/** Role type value set; the role screens read its names here instead of keeping Chinese copies. */
@Component
class IdentityAccessSystemEnums implements SystemEnumContribution {
    @Override
    public List<SystemEnumDefinition> systemEnums() {
        return List.of(
                of("SYS_ACC_ROLE_TYPE", "角色类型", "账号角色的来源与管理方式", items(
                        "SYSTEM", "系统角色", "系统内置，不可修改",
                        "ADMIN", "管理角色", "平台与租户管理职责",
                        "BUSINESS", "业务角色", "按业务岗位维护",
                        "CUSTOM", "自定义角色", "机构自行定义")));
    }
}
