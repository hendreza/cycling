# Verge legal and operational review brief

Planning draft · 14 September 2026 · For review by a South African lawyer and relevant specialists. **Not approved public terms, a completed privacy policy or a compliance certification.**

The owner wants unfinished obligations kept visible. Nothing below closes the [release checklist](RELEASE_CHECKLIST.md), and it must not replace the private app’s [current privacy notice](PRIVACY.md) until the real service changes. No operator identity, privacy contact, brand-rights evidence or insurance cover has been supplied.

## The service to review

Current product: one owner’s local cycling planner using cached OSM roads, personal route records/access exclusions, GPX exports and optional short-lived LAN transfer. Proposed next service: an invited adult Android pilot through a hosted mobile website, initially Centurion. Routes and exact starts would become personal information handled by the operator. Turn-by-turn navigation would initially remain in the rider’s chosen external app.

Proposed exclusions from pilot scope: children, health/training imports, payment processing, emergency monitoring and owned background tracking. These are scope proposals, not claims that all related legal issues disappear. Confirm operator/entity, intended audience, providers, hosting countries, support capacity and commercial intentions before drafting final documents.

## Protection means more than a disclaimer

Use accurate claims, tested access controls, correction/report handling, clear notices, secure data handling, reviewed contracts and appropriate insurance together. Do not promise a “safe route”, perfect GPS or guaranteed public access. Disclosing uncertainty does not excuse ignoring known defects.

Ask counsel how the Consumer Protection Act applies to the chosen service and transactions. Its sections 48–51 address unfair terms and risk/liability provisions; section 49 requires particular attention to certain risk notices, and section 51 prohibits specified exclusions, including supplier gross negligence. A blanket “ride entirely at your own risk; we have no liability” statement is not an adequate solution. [Official Act](https://www.gov.za/sites/default/files/32186_467.pdf).

## Deliverables and evidence to keep

All statuses below are **open**. Names, dates and reviewed documents belong in the decision/release records; none is satisfied merely by accepting an onboarding checkbox.

| Work | Evidence to obtain | Proposed accountable role |
| --- | --- | --- |
| Operator and governance | Legal name/entity, monitored privacy/support contact, responsibility allocation; assess Information Officer registration, impact assessment and PAIA manual | Owner with SA privacy adviser |
| Privacy notice and processing register | Actual purposes, lawful grounds, recipients, countries, rights process and retention schedule, matching implemented behaviour | Operator/privacy lead |
| Security and providers | Per-user controls, administrator security, provider/operator agreements, deletion/restore evidence, logging and access reviews | Technical owner |
| Service terms and risk notices | Plain-language scope, limitations, permitted use, reporting, complaints, suspension and lawful liability wording | SA lawyer |
| Incident and serious-route-defect response | Named responder, triage/containment, evidence preservation, region suspension and assessed notification procedure | Operator and technical owner |
| Brand and copyright | Verge name clearance; written artwork/font/content rights; developer/contractor IP record and dependency inventory | Owner/IP adviser |
| Map and regional data use | Display/export attribution, OSM licence obligations, tile/imagery capacity and rights, municipal dataset redistribution terms | Data maintainer/legal reviewer |
| Insurance | Broker assessment of relevant professional, public/product liability and cyber cover; exclusions, limits and premium quote | Owner and broker |
| Distribution | Accurate website/store policies, permission/SDK inventory, release ownership and account-deletion flow where required | Release owner |
| Future payments/imports | Separate consumer/electronic-contract/tax review and training-data permissions before enabling either | Owner and specialist advisers |

A policy should identify the real operator and contact. Do not publish placeholders. A private or invitation-only deployment is not automatically exempt from POPIA merely because it is small; section 6’s personal/household exclusion must be assessed against the actual activity. [Official POPIA Act](https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf).

## Data decisions needed before the hosted pilot

| Information | Proposed handling to review | Implementation/evidence needed |
| --- | --- | --- |
| Account/contact details | Minimum information needed for invitations and recovery; avoid collecting ID documents directly without a justified requirement | Chosen authentication provider, access/deletion controls and country/contract review |
| Starts, saved rides and GPX | Private by default; exact coordinates shared only by a deliberate rider action | Per-user ownership, privacy-preserving logs, export warnings and scoped download URLs |
| Personal access blocks | Immediately affect that rider only; separate explicit submission for shared observations | Scope enforcement, correction/reopening and deletion tests |
| Shared observations/photos | Collect only the road issue; discourage faces, number plates and private-home details; moderate allegations and abuse | Removal/escalation policy, metadata handling, expiry/review and restricted moderator access |
| Device/browser storage | State what remains on the phone; clear account-sensitive caches on sign-out and explain downloaded-file limits | Shared-device tests and documented cache behaviour |
| Errors/security events | Minimise coordinates, route bodies, tokens and identifiers; restrict access | Redaction, access audit, retention jobs and incident evidence process |
| Backups | A documented expiry and deletion/restore process; do not promise immediate erasure from every backup | Tested expiry, restricted restoration and reapplication of deletion records |
| Future training data | Separate purpose, permissions and possible health-information assessment | No import until provider, security and retention design is reviewed |

**Proposed retention choices to discuss, not current behaviour:** delete unsaved server route results after 24 hours; retain saved rides/private blocks until the rider deletes them or an agreed inactivity rule applies; start with 30 days for routine operational logs and a 30-day backup expiry. Review shared observations every 90 days and mark stale/unverified observations explicitly. Confirm necessity and exceptions before adopting these numbers. The current private app retains local records until the owner deletes them.

POPIA’s retention, notice, security, access/correction and cross-border provisions inform this design (sections 14, 18–24 and 72). Record lawful grounds by purpose; one general consent checkbox is not a complete processing strategy. The Information Regulator provides governance, rights and breach-reporting guidance. Confirm the applicable current notification process, rather than assuming GDPR’s timing applies. [Regulator POPIA guidance](https://inforegulator.org.za/popia/), [PAIA guidance and resources](https://inforegulator.org.za/paia/).

## Original draft notices for discussion

These short examples demonstrate placement and tone. They are not a substitute for reviewed terms/privacy documents or accurate interface behaviour. Keep essential information readable, accessible and available later in settings.

**First-use route limitation:**

> Verge plans routes from mapped roads and recorded access information. Maps can miss closed entrances, changed roads and other conditions. Check the route before riding, follow signs and road rules, and stop where access is uncertain. Verge does not monitor your ride or provide emergency assistance.

**Beside the score:**

> Mapped-road score: a comparison using road tags and recorded observations. It is not a prediction of crashes, crime or current traffic. Open the assessment to see missing information and major-road junctions.

**Before requesting start location:**

> Use your phone’s location to suggest a start. Check the pin before confirming it. Your device’s accuracy estimate does not guarantee your exact position. You can choose a start on the map instead.

The hosted privacy explanation must also say that confirmed start coordinates are sent to the routing service. Do not add that claim to the private notice as if it already happens remotely.

**Before route sharing/export:**

> This file contains your route and start/end coordinates, which may reveal your home or routine. Share it only with people or apps you choose. Check the imported path and lap count before riding; navigation behaviour depends on the receiving app.

**Before submitting a shared access observation:**

> Report the road section and what you observed. Avoid personal details, faces and accusations about individuals. Your private block can apply immediately; a shared observation needs review. Stop somewhere appropriate before using the reporting controls.

**Offline saved-route state:**

> Saved copy — access information last checked [actual date/time]. Reconnect to check for changes. A previously exported file may be out of date.

Use a real timestamp only where the system has that evidence. Do not conceal consequential notices in a long terms page or require repeated acknowledgements on every ordinary action. Counsel should determine where specific risk acknowledgement is needed.

## Brand, maps and third parties

The supplied brand kit has been implemented; that does not establish ownership or clearance of the Verge name. Obtain written permission/assignment for the artwork and check the name in relevant markets/classes with an IP adviser. Company/domain registration is not a trademark clearance. No clearance search has been completed in this task. [CIPC IP reference guide](https://www.cipc.co.za/wp-content/uploads/2025/05/Intellectual-Property-Reference-Guide-for-Small-Law-Firms-SMMEs.pdf).

Keep an inventory of software/font licences and notices, OSM attribution/database obligations, municipal source terms and imagery permissions. Display maps and downloadable offline packs may need different rights. OSM standard tiles do not allow bulk offline downloading; choose an explicitly permitted provider or self-hosted approach for that future feature. Esri imagery needs service-specific licence review before public/commercial use. [OSM copyright](https://www.openstreetmap.org/copyright), [tile policy](https://operations.osmfoundation.org/policies/tiles/), [Esri service terms](https://www.esri.com/en-us/legal/terms/web-site-service).

External navigation has its own terms and data practices. Describe compatibility based on tested versions, without implying an official partnership or guaranteed voice guidance. Proposed public reporting also needs correction/appeal rules and a contact for copyright, privacy and inaccurate-access complaints; publish observations about roads rather than unverified accusations about people.

## Publication, later revenue and responsibility

For Android distribution, match the privacy policy and Play Data safety answers to the actual app and all included SDKs. Where the app allows account creation, Google requires in-app and web account-deletion routes. A website-first pilot still needs its own appropriate notices and rights process. [Play user-data policy](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en-GB), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en).

Before charging, have counsel/accounting advisers assess applicable consumer rights, electronic contracts/disclosures, cancellations/refunds, subscription renewal, tax and payment-provider/store rules. ECTA should be included in that assessment. Do not activate subscriptions as a simple payment-button addition. [Electronic Communications and Transactions Act](https://www.gov.za/documents/electronic-communications-and-transactions-act).

Before invitations, identify who receives a data complaint or dangerous-routing report, how they suspend affected functionality, and who covers them when unavailable. Before public release, obtain the actual review evidence and decide whether residual risks and insurance terms are acceptable. Neither a lawyer’s review nor insurance removes the need to maintain the product and respond to known problems.
