package com.rhn.platform.organization.infrastructure;

import com.rhn.shared.context.ExecutionContext;
import com.rhn.shared.context.ExecutionContextProvider;
import com.rhn.shared.id.GlobalIds;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

/** Append-only domain history, committed in the same transaction as the mutation. */
@Repository
public class OrganizationChangeStore {
    private final JdbcTemplate jdbc;
    private final ExecutionContextProvider contexts;
    private final JsonCodec json;
    public OrganizationChangeStore(JdbcTemplate jdbc, ExecutionContextProvider contexts, JsonCodec json) {
        this.jdbc = jdbc; this.contexts = contexts; this.json = json;
    }
    public void record(String resourceType, Long resourceId, String action, Object before, Object after, String reason) {
        ExecutionContext context = contexts.requireCurrent();
        jdbc.update("""
            insert into RHN_SYS_ORG_CHG (ID_ORG_CHG,ID_TNT,CD_RSRC_TYPE,ID_RSRC,CD_ACTION,
                DES_BEFORE,DES_AFTER,DES_REASON,NA_ACTOR,ID_USER,DT_OCCRD) values (?,?,?,?,?,?,?,?,?,?,?)
            """, GlobalIds.next(), context.tenantId(), resourceType, resourceId, action,
                json.write(before), json.write(after), reason.trim(), context.actor(), context.subjectId(), Timestamp.from(Instant.now()));
    }
    public List<ChangeView> list(String type, Long id) {
        return jdbc.query("""
            select ID_ORG_CHG,CD_ACTION,DES_BEFORE,DES_AFTER,DES_REASON,ID_USER,DT_OCCRD,NA_ACTOR
            from RHN_SYS_ORG_CHG where ID_TNT=? and CD_RSRC_TYPE=? and ID_RSRC=?
            order by DT_OCCRD desc,ID_ORG_CHG desc fetch first 200 rows only
            """, (rs, row) -> new ChangeView(rs.getLong(1),rs.getString(2),actionText(rs.getString(2)),rs.getString(3),rs.getString(4),
                rs.getString(5),rs.getObject(6,Long.class),rs.getTimestamp(7).toInstant(),rs.getString(8)), contexts.requireCurrent().tenantId(),type,id);
    }
    private static String actionText(String action) {
        return switch(action) {
            case "MAINTAIN_ORGANIZATION" -> "统一维护资料";
            case "CREATE_CONTACT" -> "新增联系方式";
            case "CREATE_ADDRESS" -> "新增地址";
            case "CREATE_IDENTIFIER" -> "新增标识";
            case "CREATE_CAPABILITY" -> "新增服务能力";
            case "CREATE_RESPONSIBILITY" -> "新增负责人";
            case "CREATE_RELATION" -> "新增协作关系";
            case "TRANSFER_ASSIGNMENT" -> "调岗";
            case "END_ASSIGNMENT" -> "结束任职";
            case "END_EMPLOYMENT" -> "办理离职";
            case "UPDATE_ASSIGNMENT" -> "编辑任职";
            case "UPDATE_EMPLOYMENT" -> "编辑聘用";
            case "UPDATE_POSITION" -> "维护岗位";
            case "UPDATE_ORGANIZATION" -> "编辑机构";
            case "UPDATE_DEPARTMENT" -> "编辑科室";
            case "CHANGE_STATUS" -> "变更启停状态";
            case "UPDATE_PRACTITIONER" -> "维护人员";
            case "UPDATE_QUALIFICATION" -> "维护执业资质";
            case "ASSIGN_PRACTITIONER" -> "新增任职";
            case "UPDATE_CONTACT" -> "变更联系方式";
            case "UPDATE_ADDRESS" -> "变更地址";
            case "UPDATE_IDENTIFIER" -> "变更标识";
            case "UPDATE_CAPABILITY" -> "变更服务能力";
            case "UPDATE_RESPONSIBILITY" -> "变更负责人";
            case "UPDATE_RELATION" -> "变更协作关系";
            default -> action;
        };
    }
    public record ChangeView(Long id,String action,String actionText,String beforeSnapshot,String afterSnapshot,String reason,Long actorId,Instant occurredAt,String actor) {}
}
