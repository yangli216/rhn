update code_systems
set code = 'RHN.COMMON.CS.GENDER',
    name = 'RHN 性别编码体系',
    version_code = case when version_code = '1.0' then '2026.01' else version_code end
where code = 'RHN.GENDER';

update value_sets
set code = 'RHN.PI.VS.RESIDENT.GENDER',
    version_code = case when version_code = '1.0' then '2026.01' else version_code end
where code = 'RHN.RESIDENT.GENDER';
