-- 检查项目 P4：开立项目的超声方式与增强方式，供 AI 结构化意图按“彩超/B超”“平扫/增强”定位唯一开立项目。
alter table RHN_BD_EXAM_SVC add column SD_EXAM_TECHNIQUE varchar(32);
alter table RHN_BD_EXAM_SVC add column SD_CONTRAST_PHASE varchar(16);
alter table RHN_BD_EXAM_SVC add constraint CK_BD_EXAM_SVC_TECHNIQUE check (SD_EXAM_TECHNIQUE is null or SD_EXAM_TECHNIQUE in ('B_MODE', 'COLOR_DOPPLER'));
alter table RHN_BD_EXAM_SVC add constraint CK_BD_EXAM_SVC_CONTRAST check (SD_CONTRAST_PHASE is null or SD_CONTRAST_PHASE in ('PLAIN', 'ENHANCED', 'PLAIN_ENHANCED'));
comment on column RHN_BD_EXAM_SVC.SD_EXAM_TECHNIQUE is '超声方式：B_MODE 常规 B 超，COLOR_DOPPLER 彩色多普勒；非超声为空';
comment on column RHN_BD_EXAM_SVC.SD_CONTRAST_PHASE is '增强方式：PLAIN 平扫，ENHANCED 增强，PLAIN_ENHANCED 平扫加增强；非 CT/MR 为空';
