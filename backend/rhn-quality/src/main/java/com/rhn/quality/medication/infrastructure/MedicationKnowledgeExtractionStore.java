package com.rhn.quality.medication.infrastructure;

import com.rhn.quality.medication.api.MedicationKnowledgeExtractionContracts.Run;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public class MedicationKnowledgeExtractionStore {
    private final JdbcTemplate jdbc; private final JsonCodec json;
    public MedicationKnowledgeExtractionStore(JdbcTemplate jdbc, JsonCodec json) {this.jdbc=jdbc; this.json=json;}
    public void append(Long tenant, Run run) {
        jdbc.update("insert into RHN_AUD_KNOW_EXTRACT (ID_TNT, ID_EXTRACT, JSON_RUN) values (?,?,?)",tenant,run.id(),json.write(run));
    }
    public Optional<Run> find(Long tenant, Long id) {
        return jdbc.query("select JSON_RUN from RHN_AUD_KNOW_EXTRACT where ID_TNT=? and ID_EXTRACT=?",
                (rs,row)->json.read(rs.getString(1),Run.class),tenant,id).stream().findFirst();
    }
    public List<Run> page(Long tenant, int page) {
        return jdbc.query("select JSON_RUN from RHN_AUD_KNOW_EXTRACT where ID_TNT=? order by ID_EXTRACT desc offset ? rows fetch next 20 rows only",
                (rs,row)->json.read(rs.getString(1),Run.class),tenant,(long)page*20);
    }
}
