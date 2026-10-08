package com.rhn.outpatient.ordering;

import java.util.List;

record OrderDraftSaveResponse(String commandCode, Long encounterId,
                              List<PrescriptionResponse> prescriptions, List<ServiceRequestResponse> services) {}
