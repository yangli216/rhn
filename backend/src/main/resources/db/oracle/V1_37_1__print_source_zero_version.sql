alter table RHN_SYS_PRINT_OUTPUT drop constraint CK_SYS_PRINT_OUTP_PRINT_OUTPUT;
alter table RHN_SYS_PRINT_OUTPUT add constraint CK_SYS_PRINT_OUTP_PRINT_OUTPUT check (SN_SRC_VER >= 0);

