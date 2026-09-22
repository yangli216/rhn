package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgePublicationContracts.Authorization;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Objects;
import static com.rhn.quality.medication.infrastructure.MedicationKnowledgeFeedbackStore.hash;
import static com.rhn.shared.api.BusinessErrors.*;

@Repository
public class MedicationKnowledgePublicationStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public MedicationKnowledgePublicationStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public void append(Authorization value) {
        String raw=json.write(value);
        jdbc.update("insert into RHN_AUD_KNOW_RELEASE (ID_TNT,ID_KNOW_RELEASE,ID_DEPLOYMENT,JSON_RELEASE,HASH_RELEASE) values (?,?,?,?,?)",value.tenantId(),value.id(),value.deploymentId(),raw,hash(raw));
    }
    public Authorization require(Long tenant,Long id) {
        if(id==null)throw conflict("QMED_PUBLICATION_MISSING","正式发布缺少独立启用记录");
        return jdbc.query("select ID_DEPLOYMENT,JSON_RELEASE,HASH_RELEASE from RHN_AUD_KNOW_RELEASE where ID_TNT=? and ID_KNOW_RELEASE=?",(r,n)->{
            String raw=r.getString(2);
            if(!Objects.equals(hash(raw),r.getString(3)))throw conflict("QMED_PUBLICATION_INTEGRITY","正式发布材料指纹不一致");
            var value=json.read(raw,Authorization.class);
            if(!Objects.equals(value.tenantId(),tenant)||!Objects.equals(value.id(),id)||!Objects.equals(value.deploymentId(),r.getLong(1)))throw conflict("QMED_PUBLICATION_INTEGRITY","正式发布材料身份不一致");
            return value;
        },tenant,id).stream().findFirst().orElseThrow(()->notFound("QMED_PUBLICATION_MISSING","未找到当前租户的正式发布材料"));
    }
}
