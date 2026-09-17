package com.rhn.platform.persistence;

import org.hibernate.boot.model.TypeContributions;
import org.hibernate.dialect.PostgreSQLDialect;
import org.hibernate.service.ServiceRegistry;
import org.hibernate.type.SqlTypes;
import org.hibernate.type.descriptor.jdbc.LongVarcharJdbcType;

/** Shared String LOB fields are stored as inline text, never PostgreSQL OIDs. */
public class PostgreSqlTextDialect extends PostgreSQLDialect {
    @Override
    public void contributeTypes(TypeContributions contributions, ServiceRegistry services) {
        super.contributeTypes(contributions, services);
        contributions.getTypeConfiguration().getJdbcTypeRegistry()
                .addDescriptor(SqlTypes.CLOB, LongVarcharJdbcType.INSTANCE);
    }

    @Override
    protected String columnType(int sqlTypeCode) {
        return sqlTypeCode == SqlTypes.CLOB ? "text" : super.columnType(sqlTypeCode);
    }
}
