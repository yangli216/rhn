-- Keep both skin-test gate paths available for local end-to-end verification.
update RHN_BD_MED
set SD_SKIN_TEST_SOLUTION_MODE = 'ORIGINAL_SOLUTION',
    DES_SKIN_TEST_INSTRUCTION = '使用本次处方原药按院内规范完成皮试，开始前必须核对结算、发药和药品批号'
where ID_TNT = 362387869790209 and CD_MED = 'DEMO-DRUG-CRO';

update RHN_BD_MED
set SD_SKIN_TEST_SOLUTION_MODE = 'DILUTED_SOLUTION',
    DES_SKIN_TEST_INSTRUCTION = '皮试液500 U/ml，皮内注射0.1ml；非原液皮试可先执行，阴性后用药仍需完成收费发药'
where ID_TNT = 362387869790209 and CD_MED = 'DEMO-DRUG-PEN-G';
