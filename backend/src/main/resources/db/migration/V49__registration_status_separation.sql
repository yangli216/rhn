-- Registration transaction status is independent from queue and encounter progress.

alter table patient_registrations drop constraint ck_registration_status;

update patient_registrations
set status = case when status = 'CANCELLED' then 'CANCELLED' else 'REGISTERED' end;

alter table patient_registrations add constraint ck_registration_status
    check (status in ('REGISTERED', 'CANCELLED'));
