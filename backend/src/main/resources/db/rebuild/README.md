# RHN fresh-schema rebuild package

`rebuild/` is the disposable development database package generated from the
published migration history. It is intended for a new, isolated schema while
the existing `db/migration` and `db/oracle` directories remain the upgrade path
for databases that already have Flyway history.

The package has three layers:

| Layer | PostgreSQL/H2 | Oracle | Contents |
| --- | --- | --- | --- |
| Base | `postgresql/B1_77_0__rhn_schema_and_standard_metadata.sql` | `oracle/B1_77_0__rhn_schema_and_standard_metadata.sql` | Final schema, comments, standard dictionaries, medication standards and rule metadata through 1.77.0 |
| Development fixture | `local/V1_77_1__development_hospital.sql` | `oracle-local/V1_77_1__development_hospital.sql` | The reusable demonstration hospital, staff, catalog, inventory, print devices and sample residents |
| H2 adapter | `h2/V1_77_2__h2_clob_types.sql` | — | H2-only CLOB conversions after the final physical column names are in place |

The generated base is a fold of `B1_42_1` and every published PostgreSQL or
Oracle `V` migration through `1.77.0`. It is source-derived, so the header and
`manifest.json` retain the source checksums. Do not edit generated SQL by hand;
run:

```bash
node scripts/rebuild-database.mjs
node scripts/rebuild-database.mjs --check
```

The rebuild package intentionally does not contain an export of the current
database. It excludes existing patients, encounters, workflow events and audit
runtime rows. The current Oracle development schema was explicitly cleared
before applying this package; any rollback copy must be maintained separately
by the database owner. Create a new database/schema with the appropriate DBA
process, point the application at that empty target, and use one of these
Flyway location sets:

```text
H2:        classpath:db/rebuild/postgresql,classpath:db/rebuild/local,classpath:db/rebuild/h2
Postgres:  classpath:db/rebuild/postgresql,classpath:db/rebuild/local
Oracle:    classpath:db/rebuild/oracle,classpath:db/rebuild/oracle-local
```

Never add these locations to the normal profile for an existing database. An
existing database continues to use `db/migration` or `db/oracle`, so its data
and Flyway history are preserved. The rebuild package is only for an empty
target schema; it has no drop, truncate, Flyway repair or history-rewrite step.
