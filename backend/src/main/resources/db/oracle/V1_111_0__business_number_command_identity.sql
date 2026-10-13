-- Separate retry identities from newly generated display numbers; historical numbers stay unchanged.
alter table RHN_BIL_INVOICE add CD_CMD varchar2(64 char);
update RHN_BIL_INVOICE set CD_CMD = CD_INVOICE_NO where CD_CMD is null;
alter table RHN_BIL_INVOICE modify (CD_CMD not null);
create unique index UK_BIL_INV_CMD on RHN_BIL_INVOICE(ID_TNT, CD_CMD);
comment on column RHN_BIL_INVOICE.CD_CMD is '请求幂等键；与展示业务编码分离，历史值沿用原编号';
alter table RHN_BIL_PAY add CD_CMD varchar2(64 char);
update RHN_BIL_PAY set CD_CMD = CD_PAY_NO where CD_CMD is null;
alter table RHN_BIL_PAY modify (CD_CMD not null);
create unique index UK_BIL_PAY_CMD on RHN_BIL_PAY(ID_TNT, CD_CMD);
comment on column RHN_BIL_PAY.CD_CMD is '请求幂等键；与展示业务编码分离，历史值沿用原编号';
alter table RHN_SUP_STOCK_RETURN add CD_CMD varchar2(64 char);
update RHN_SUP_STOCK_RETURN set CD_CMD = CD_RETURN_NO where CD_CMD is null;
alter table RHN_SUP_STOCK_RETURN modify (CD_CMD not null);
create unique index UK_SUP_RETURN_CMD on RHN_SUP_STOCK_RETURN(ID_TNT, CD_CMD);
comment on column RHN_SUP_STOCK_RETURN.CD_CMD is '请求幂等键；与展示业务编码分离，历史值沿用原编号';
