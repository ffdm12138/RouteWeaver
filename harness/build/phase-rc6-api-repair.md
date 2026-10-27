# rc.6 API replay maintenance

Scope: repair the two API regressions disclosed in the latest release without changing generated client entries, running clients or published tags/assets.

Preserve original FAIL receipts and affected harness bytes; first replay the unchanged public baseline with the same core hash. Harden only the owned replay controller, add failure-path unit tests, then run two full and two empty-provider passes plus cold-download, Mac and Verge regression. Bind all new evidence to actual executed source and retain both original FAIL and unchanged-baseline PASS records.

The original trigger was not reproduced. A readiness/transport weakness can be fixed and independently tested without claiming a production routing defect or device acceptance. Local generation, static contracts, metadata binding, extracted package replay and content scans are separate completion checks. This maintenance candidate remains unpublished.
