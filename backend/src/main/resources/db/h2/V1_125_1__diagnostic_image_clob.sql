alter table RHN_EX_DIAG_IMAGE alter column CONTENT_BASE64 clob not null;
comment on column RHN_EX_DIAG_IMAGE.CONTENT_BASE64 is '数据库保存的原始图像内容';
