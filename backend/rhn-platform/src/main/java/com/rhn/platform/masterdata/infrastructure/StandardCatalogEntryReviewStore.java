package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.api.StandardCatalogEntryReview.EntryReviewEvent;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public class StandardCatalogEntryReviewStore {
    private final JdbcTemplate jdbc;
    private final JsonCodec json;
    public StandardCatalogEntryReviewStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    public List<EntryReviewEvent> latest(Long tenant,String hash) {
        return jdbc.query("""
            select e.JSON_EVENT from RHN_BD_ENTRY_REVIEW e
            where e.ID_TNT=? and e.HASH_IDTY=? and not exists (
                select 1 from RHN_BD_ENTRY_REVIEW n where n.ID_TNT=e.ID_TNT and n.HASH_IDTY=e.HASH_IDTY
                and n.ID_ENTRY=e.ID_ENTRY and n.REVISION>e.REVISION)
            order by e.ID_ENTRY
            """,(rs,row)->json.read(rs.getString(1),EntryReviewEvent.class),tenant,hash);
    }
    public void append(Long tenant,String hash,EntryReviewEvent e) {
        jdbc.update("insert into RHN_BD_ENTRY_REVIEW (ID_REVIEW,ID_TNT,HASH_IDTY,ID_ENTRY,REVISION,JSON_EVENT) values (?,?,?,?,?,?)",
            e.id(),tenant,hash,e.entryId(),e.revision(),json.write(e));
    }
}
