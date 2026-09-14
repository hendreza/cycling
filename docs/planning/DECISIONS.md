# Verge planning decisions

Started 14 September 2026. This is a working decision log, not a list of approved features. **Proposed** means discussion is still needed. Record the date and reason when a decision is accepted or changed.

The current instruction is to create a launcher and plan the next steps. The user has not authorised a deployment, subscription purchase, app-store submission or new feature build through this plan.

## Established context

- Verge is currently the owner’s private local Centurion app, and the owner uses Android.
- The owner has ridden an exported route and reported too many U-turns and an inaccessible entrance. Subsequent fixes still need further on-bike validation.
- Connected roads and major-road junctions should define riding choices, rather than suburb borders. Route evidence takes priority over fewer laps.
- Public legal and operational work must remain visible until there is evidence to close it.
- The owner now wants to plan phone use, publication and additional areas before returning to feature implementation.

## Decisions awaiting the owner

| ID | Decision | Proposed starting point | Status / evidence needed |
| --- | --- | --- | --- |
| D01 | First audience and release | 15–25 invited adult Android riders; mobile website first | Proposed; owner chooses audience and pilot format |
| D02 | First navigation workflow | Prepare on the phone; download/share into OsmAnd | Proposed; observe complete handoff on actual devices |
| D03 | Useful first scope | Plan, compare, save, navigate externally, remember blocked sections | Proposed; five short rider interviews and prototype review |
| D04 | First coverage | Centurion, using Rooihuiskraal as the field baseline | Proposed; name a maintainer and record next ride checks |
| D05 | Next region | One area with a regular local tester | Open; owner supplies area, reviewer and typical distances |
| D06 | Operator and contacts | Identify legal operator, privacy/support contact and incident backup | Open; then obtain SA legal review |
| D07 | Budget and capacity | Test an operating ceiling of R1,500/month, excluding development/professional reviews | Unapproved planning figure; owner supplies comfortable cap and weekly hours |
| D08 | Data model | Accounts with private routes/blocks; shared observations submitted separately for moderation | Proposed; review data flows, deletion and moderation responsibility |
| D09 | Commercial model | Free invited pilot, then interview repeat users before pricing | Proposed; no billing implementation or spending authorised |
| D10 | Android store decision | Evaluate after observed repeat use and reliable handoff | Proposed; assess costs, policies and maintenance owner then |

For each accepted item, add: **decision / date / decision-maker / reason / evidence link / review trigger**. Silence does not change a proposal into approval. Revisit D01–D05 if interviews show that the proposed workflow does not solve a recurring rider problem.

## First planning week

1. **Owner session:** choose D01, name the next candidate area, set the budget and weekly time available. Identify who can own operations and legal enquiries.
2. **Observe the owner’s ride preparation:** note each action from choosing a start to following the imported route. Count steps, delays and mistakes; do not collect a full ride trace by default.
3. **Five short rider conversations:** ask about the last route they planned, access problems, how they navigate now, and what would make them return. Avoid leading with a feature wishlist.
4. **Sketch one phone flow:** map and bottom panel → alternatives → selected ride → navigation handoff → stopped access report. Review it before coding.
5. **Prepare quotes and scope:** use the legal brief and region request template; estimate hosting only after measuring graph memory and calculation time. No purchases are part of this document.
6. **Choose the smallest next implementation:** describe the rider outcome, acceptance evidence, data/privacy effects, estimated upkeep and items explicitly deferred. Create tasks only after that scope is agreed.

## Evidence note to copy for each pilot observation

- **Date / anonymised rider ID / device and browser:** ___
- **Task and area (avoid recording an exact home address):** ___
- **Completed without help? Time/actions needed:** ___
- **Route version, distance and laps if relevant:** ___
- **Observed issue and minimally necessary evidence:** ___
- **Severity / affected section / temporary action:** ___
- **Owner / follow-up / resolution evidence:** ___

Location details should stay in an appropriately protected issue record with the participant’s understanding, not a public spreadsheet or repository. A known serious route/access defect is investigated before expanding invitations.

See the [release plan](../RELEASE_PLAN.md), [area process](../AREA_EXPANSION_PLAN.md), [legal brief](../LEGAL_REVIEW_BRIEF.md) and [open release checklist](../RELEASE_CHECKLIST.md).
