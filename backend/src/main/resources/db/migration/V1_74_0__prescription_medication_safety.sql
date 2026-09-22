alter table RHN_EX_REQ_GRP add column JSON_SAFETY_REVIEW text;
comment on column RHN_EX_REQ_GRP.JSON_SAFETY_REVIEW is '处方提交时合理用药提示、涉及药品及医生处理理由，供药师审方核对';
