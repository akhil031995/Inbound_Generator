/*
 * One-time migration shim.
 *
 * Before this app dropped its server-side "Save" feature, a handful of
 * documents were saved to saved_edi_files/*.json on the server. Since that
 * feature is gone and every document now lives only in this browser's
 * localStorage, this script runs once on load, imports those old documents
 * as regular open tabs, and then gets out of the way for good.
 *
 * Safe to delete (along with saved_edi_files/) once you've confirmed the
 * imported tabs show up in the workspace.
 */
(function () {
  var DONE_KEY = "edi834_legacy_import_done_v1";
  var WORKSPACE_KEY = "edi834_workspace_v1";

  try {
    if (localStorage.getItem(DONE_KEY)) return;
  } catch (e) {
    return;
  }

  var LEGACY_RECORDS = [
    {
      id: "7cd70b03-3d73-40d8-bce2-72c5a403682b",
      title: "New 834 Document",
      description: "",
      payload: {"header":{"senderId":"SENDERID","receiverId":"RECEIVERID","controlNumber":"1","usageIndicator":"T","sponsorName":"sd","sponsorId":"","payerName":"111","payerId":""},"members":[{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"Akhil","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"P","cobOtherPayerName":"asda","cobOtherPayerId":"asd"}],"dependents":[],"reportingCategories":[{"description":"wqeq","refQualifier":"qwe","refValue":"qwewe"},{"description":"","refQualifier":"","refValue":""},{"description":"","refQualifier":"","refValue":""}]},{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"","cobOtherPayerName":"","cobOtherPayerId":""}],"dependents":[],"reportingCategories":[]},{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"","cobOtherPayerName":"","cobOtherPayerId":""}],"dependents":[{"memberId":"","relationshipCode":"19","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"","cobOtherPayerName":"","cobOtherPayerId":""}],"reportingCategories":[]}],"reportingCategories":[]},{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"","cobOtherPayerName":"","cobOtherPayerId":""}],"dependents":[],"reportingCategories":[]},{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":"","premiumAmount":"","providerName":"","providerNpi":"","providerPhone":"","cobPayerResponsibilityCode":"","cobOtherPayerName":"","cobOtherPayerId":""}],"dependents":[],"reportingCategories":[]}]}
    },
    {
      id: "44eb2d74-8d06-4f43-b719-799f35e9824f",
      title: "New 834 Document",
      description: "",
      payload: {"header":{"senderId":"SENDERID","receiverId":"RECEIVERID","controlNumber":"1","usageIndicator":"T","sponsorName":"","sponsorId":"","payerName":"","payerId":""},"members":[{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":""}],"dependents":[]},{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":""}],"dependents":[]}]}
    },
    {
      id: "f249a023-019a-4e53-9678-2b62660a72dc",
      title: "New 834 Document",
      description: "",
      payload: {"header":{"senderId":"SENDERID","receiverId":"RECEIVERID","controlNumber":"1","usageIndicator":"T","sponsorName":"","sponsorId":"","payerName":"","payerId":""},"members":[{"memberId":"","relationshipCode":"18","maintenanceTypeCode":"021","firstName":"","lastName":"","middleName":"","ssn":"","gender":"U","dob":"","address":{"line1":"","city":"","state":"","zip":""},"coverages":[{"lobKey":"","maintenanceTypeCode":"021","coverageLevelCode":"IND","startDate":"","endDate":"","customRefValue":""}],"dependents":[]}]}
    }
  ];

  try {
    var raw = localStorage.getItem(WORKSPACE_KEY);
    var snapshot = raw ? JSON.parse(raw) : { activeTabId: null, tabs: [] };
    if (!snapshot || !Array.isArray(snapshot.tabs)) snapshot = { activeTabId: null, tabs: [] };

    var existingIds = snapshot.tabs.map(function (t) { return t.id; });
    var imported = 0;
    LEGACY_RECORDS.forEach(function (record) {
      if (existingIds.indexOf(record.id) !== -1) return;
      snapshot.tabs.push({
        id: record.id,
        meta: { title: record.title, description: record.description },
        edi: record.payload,
        isDirty: false,
        collapsed: [],
      });
      imported++;
    });

    if (!snapshot.activeTabId && snapshot.tabs.length > 0) {
      snapshot.activeTabId = snapshot.tabs[0].id;
    }

    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(DONE_KEY, "true");
    if (imported > 0) {
      console.info("[EDI 834] Imported " + imported + " previously server-saved document(s) as open tabs.");
    }
  } catch (e) {
    // localStorage unavailable — nothing to migrate into, skip silently
  }
})();
