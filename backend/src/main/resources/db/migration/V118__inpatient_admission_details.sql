-- Administrative facts captured at the admission window. These are snapshots of the
-- admission transaction and must remain stable when the resident profile changes later.
alter table inpatient_episode_details add column admission_method_code varchar(32);
alter table inpatient_episode_details add column condition_code varchar(32);
alter table inpatient_episode_details add column payment_method_code varchar(32);
alter table inpatient_episode_details add column referral_organization_name varchar(200);
alter table inpatient_episode_details add column emergency_contact_name varchar(100);
alter table inpatient_episode_details add column emergency_contact_relationship varchar(64);
alter table inpatient_episode_details add column emergency_contact_phone varchar(32);
alter table inpatient_episode_details add column admission_note varchar(1000);
