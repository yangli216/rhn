package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.api.StandardSpecificationDisposition.Event;
import com.rhn.shared.json.JsonCodec;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class StandardSpecificationDispositionStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;

    public StandardSpecificationDispositionStore(JdbcTemplate jdbc, JsonCodec json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public List<Event> latest(Long tenant, String hash) {
        return jdbc.query("""
            select e.JSON_EVENT from RHN_BD_SPEC_DISP e
            where e.ID_TNT=? and e.HASH_IDTY=? and not exists (
                select 1 from RHN_BD_SPEC_DISP n where n.ID_TNT=e.ID_TNT and n.HASH_IDTY=e.HASH_IDTY
                and n.ID_STD_SPEC=e.ID_STD_SPEC and n.REVISION>e.REVISION)
            order by e.ID_STD_SPEC
            """, (rs, row) -> json.read(rs.getString(1), Event.class), tenant, hash);
    }

    public void append(Long tenant, String hash, Event event) {
        jdbc.update("insert into RHN_BD_SPEC_DISP (ID_SPEC_DISP,ID_TNT,HASH_IDTY,ID_STD_SPEC,REVISION,JSON_EVENT) values (?,?,?,?,?,?)",
                event.id(), tenant, hash, event.specificationId(), event.revision(), json.write(event));
    }
}
