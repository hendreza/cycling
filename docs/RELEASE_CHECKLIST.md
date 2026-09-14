# Verge public-release checklist

Status: **private personal preview**. Updated 14 September 2026.

The owner has explicitly chosen to keep Verge private for now and requested that unfinished legal and operational work remain visible. The app repeats these open items under **Data & privacy → Work that stays on the list**. They are not dismissed by using the app, downloading a route or deleting local data. This document records release requirements; it is not a statement that Verge is compliant or cleared for public launch.

The [release plan](RELEASE_PLAN.md) sequences the work; the [legal review brief](LEGAL_REVIEW_BRIEF.md) supplies proposed notices, responsible roles and review evidence. All items below remain open. An invited hosted pilot also needs the preparation appropriate to processing other riders’ data.

| Status | Work before public use | Evidence needed to close it |
| --- | --- | --- |
| Open | Identify the responsible party and privacy contact | Legal operator details, monitored contact and individual access/correction/objection/deletion procedure |
| Open | Review POPIA/PAIA applicability and governance | South African legal review, Information Officer registration where required, personal information impact assessment and applicable PAIA manual |
| Open | Approve data purposes and lifecycle | Lawful grounds for each new data use, retention/deletion and backup schedule, processor agreements, cross-border review |
| Open | Secure a public service | Authentication, per-user authorisation, HTTPS, abuse limits, operational monitoring, tested backups, independent security assessment |
| Open | Prepare incident handling | Incident owner, response procedure and reviewed notification process |
| Open | Clear the brand | Written ownership/licence record for the supplied artwork and a Verge name/trademark clearance; domain registration is not clearance |
| Open | Confirm map/data permissions and capacity | Applicable Esri imagery licence, tile capacity/provider arrangement, municipal dataset redistribution permissions and release-specific software licence review |
| Open | Review public consumer terms | Operator details, service scope, consumer/paid-service obligations if applicable, moderation/reporting rules, liability and insurance review |
| Open | Validate cycling claims and phone guidance | Recorded on-bike checks, junction/access review, Android/OsmAnd testing, documented scoring limitations and process for corrections |
| Open | Review future training imports separately | Purpose and permissions, minimisation, possible health-information handling, provider contracts, deletion and retention design before imports are enabled |

All items require evidence and an identified owner before being marked complete. Update this file and the in-app list together. Private testing may proceed while these items remain open; public launch must not silently inherit the private prototype’s assumptions.

## References used for this checklist

POPIA addresses retention, notices, security, access/correction and cross-border transfers in sections 14, 18–24 and 72. Its section 6 personal/household exclusion needs to be evaluated against the actual activity; private hosting alone does not establish an exemption. [Official Act](https://www.gov.za/sites/default/files/gcis_document/201409/3706726-11act4of2013popi.pdf).

The Information Regulator provides Information Officer registration guidance, impact-assessment/PAIA duties, rights forms and security-compromise procedures. Confirm the applicable process at launch. [Regulator guidance](https://inforegulator.org.za/popia/).

OSM standard tiles require attribution and compliant caching, and prohibit bulk/offline tile downloading. A public service needs to assess provider capacity and terms. [Tile policy](https://operations.osmfoundation.org/policies/tiles/), [OSM copyright](https://www.openstreetmap.org/copyright).

Esri’s general service terms distinguish internal noncommercial access from uses requiring separate permission; additional service terms may apply. Confirm the specific imagery licence before public/commercial use. [Esri terms](https://www.esri.com/en-us/legal/terms/web-site-service).

CIPC provides a preliminary trademark-search process. No trademark search, registration or brand ownership verification has been completed by this implementation. [CIPC trademark information](https://www.cipc.co.za/?page_id=149).
