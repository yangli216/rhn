package com.rhn.outpatient.ordering;

import java.util.List;

/** prescriptions、services 是本次新建的草稿；revisedMedications、revisedServices 是原地修改后的医嘱（均为未签署）。 */
record OrderDraftSaveResponse(String commandCode, Long encounterId,
                              List<PrescriptionResponse> prescriptions, List<ServiceRequestResponse> services,
                              List<MedicationRequestResponse> revisedMedications, List<ServiceRequestResponse> revisedServices) {}
