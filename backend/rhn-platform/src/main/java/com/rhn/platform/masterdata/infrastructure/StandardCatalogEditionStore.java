package com.rhn.platform.masterdata.infrastructure;

import com.rhn.platform.masterdata.api.StandardCatalogEditionContracts.*;
import com.rhn.platform.masterdata.application.ClinicalSemanticVersions;
import com.rhn.shared.json.JsonCodec;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.*;
import java.sql.*;
import static com.rhn.shared.api.BusinessErrors.*;

@Repository
public class StandardCatalogEditionStore {
    private final JdbcTemplate jdbc;private final JsonCodec json;
    public StandardCatalogEditionStore(JdbcTemplate jdbc,JsonCodec json) {this.jdbc=jdbc;this.json=json;}
    private Stored read(ResultSet rs,int row) throws SQLException {
        var metadata=metadata(rs,row);var value=json.read(rs.getString("JSON_EDITION"),Stored.class);var e=value.edition();
        if(!Objects.equals(metadata,e)||!Objects.equals(ClinicalSemanticVersions.hash(value,json),rs.getString("HASH_EDITION"))||!Objects.equals(e.id(),rs.getObject("ID_STD_EDITION",Long.class))||!Objects.equals(e.identity().catalogId(),rs.getString("CD_CATALOG"))||!Objects.equals(e.identity().catalogVersion(),rs.getString("CATALOG_VERSION")))throw conflict("STANDARD_EDITION_INTEGRITY","目录登记记录与指纹不一致，请核查保存材料");
        return value;
    }
    private Edition metadata(ResultSet rs,int row) throws SQLException {
        var e=json.read(rs.getString("JSON_META"),Edition.class);
        if(!Objects.equals(ClinicalSemanticVersions.hash(e,json),rs.getString("HASH_META"))||!Objects.equals(e.id(),rs.getObject("ID_STD_EDITION",Long.class))||!Objects.equals(e.identity().catalogId(),rs.getString("CD_CATALOG"))||!Objects.equals(e.identity().catalogVersion(),rs.getString("CATALOG_VERSION")))throw conflict("STANDARD_EDITION_INTEGRITY","目录登记摘要与指纹不一致");return e;
    }
    public Optional<Stored> find(Long tenant,Long id) {return jdbc.query("select * from RHN_BD_STD_EDITION where ID_TNT=? and ID_STD_EDITION=?",this::read,tenant,id).stream().findFirst();}
    public List<Edition> list(Long tenant,int page) {return jdbc.query("select ID_STD_EDITION,CD_CATALOG,CATALOG_VERSION,JSON_META,HASH_META from RHN_BD_STD_EDITION where ID_TNT=? order by ID_STD_EDITION desc offset ? rows fetch next 20 rows only",this::metadata,tenant,(long)page*20);}
    public void lockTenant(Long tenant) {if(jdbc.query("select ID_TNT from RHN_SYS_TNT where ID_TNT=? for update",(r,n)->r.getLong(1),tenant).isEmpty())throw notFound("STANDARD_EDITION_TENANT","未找到登记所属租户");}
    public Optional<Stored> version(Long tenant,String catalog,String version) {return jdbc.query("select * from RHN_BD_STD_EDITION where ID_TNT=? and CD_CATALOG=? and CATALOG_VERSION=?",this::read,tenant,catalog,version).stream().findFirst();}
    public long count(Long tenant) {return jdbc.queryForObject("select count(*) from RHN_BD_STD_EDITION where ID_TNT=?",Long.class,tenant);}
    public void append(Long tenant,Stored value) {
        var e=value.edition();jdbc.update("insert into RHN_BD_STD_EDITION (ID_TNT,ID_STD_EDITION,CD_CATALOG,CATALOG_VERSION,JSON_EDITION,HASH_EDITION,JSON_META,HASH_META) values (?,?,?,?,?,?,?,?)",tenant,e.id(),e.identity().catalogId(),e.identity().catalogVersion(),json.write(value),ClinicalSemanticVersions.hash(value,json),json.write(e),ClinicalSemanticVersions.hash(e,json));
    }
}
