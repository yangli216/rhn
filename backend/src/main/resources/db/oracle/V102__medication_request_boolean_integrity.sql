alter table medication_requests add constraint ck_med_req_subst_bool
    check (substitution_allowed in (0, 1));

alter table medication_requests add constraint ck_med_req_self_bool
    check (self_provided in (0, 1));

alter table medication_requests add constraint ck_med_req_skin_bool
    check (skin_test_required_snapshot in (0, 1));

alter table medication_requests add constraint ck_med_req_antimic_bool
    check (antimicrobial_snapshot in (0, 1));
