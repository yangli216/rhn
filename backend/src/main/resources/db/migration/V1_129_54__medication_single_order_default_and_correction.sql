-- 将药品 RHN_BD_MED 的 FG_SINGLE_ORDER 默认值调整为 false（单列专方默认不开启，绝大多数药品为普通合方）
alter table RHN_BD_MED alter column FG_SINGLE_ORDER set default false;

-- 纠正此前因默认值误配置为 true 的基线与存量药品
update RHN_BD_MED set FG_SINGLE_ORDER = false where FG_SINGLE_ORDER = true;

comment on column RHN_BD_MED.FG_SINGLE_ORDER is '是否单列医嘱（一药一方）';
