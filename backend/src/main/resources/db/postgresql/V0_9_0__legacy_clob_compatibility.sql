-- Historical shared migrations contain CLOB declarations. Preserve their Flyway
-- checksums while mapping that legacy type to PostgreSQL's native text storage.
-- New PostgreSQL migrations should declare text directly.
create domain clob as text;
