-- Administrative facts captured at the admission window.
alter table inpatient_episode_details add (
    admission_method_code varchar2(32 char),
    condition_code varchar2(32 char),
    payment_method_code varchar2(32 char),
    referral_organization_name varchar2(200 char),
    emergency_contact_name varchar2(100 char),
    emergency_contact_relationship varchar2(64 char),
    emergency_contact_phone varchar2(32 char),
    admission_note varchar2(1000 char)
);
