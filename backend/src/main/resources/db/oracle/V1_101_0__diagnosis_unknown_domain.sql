-- Missing diagnosis domain must remain unknown. Preserve existing recorded values.
alter table RHN_VIS_ENC_DIAG modify (SD_DIAG_DOMAIN default null null);
alter table RHN_VIS_ENC_DIAG_REV modify (SD_DIAG_DOMAIN default null null);
