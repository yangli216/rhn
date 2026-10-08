-- Missing diagnosis domain must remain unknown. Preserve existing recorded values.
alter table RHN_VIS_ENC_DIAG alter column SD_DIAG_DOMAIN drop default;
alter table RHN_VIS_ENC_DIAG alter column SD_DIAG_DOMAIN drop not null;
alter table RHN_VIS_ENC_DIAG_REV alter column SD_DIAG_DOMAIN drop default;
alter table RHN_VIS_ENC_DIAG_REV alter column SD_DIAG_DOMAIN drop not null;
