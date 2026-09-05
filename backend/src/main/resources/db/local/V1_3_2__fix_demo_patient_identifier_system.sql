-- Fix electronic health card identifier system code from misconfigured '1' to 'HEALTH_CARD'
UPDATE RHN_PI_PAT_IDENT
SET CD_IDENT_SYS = 'HEALTH_CARD'
WHERE CD_IDENT_VAL LIKE 'E%' AND CD_IDENT_SYS = '1';
