# Verge private-app privacy and use notice

Version: 11 September 2026. Audience: the owner’s personal local installation. The same notice and controls are available in **Data & privacy**. Public operator details and legal review are outstanding in [the release checklist](RELEASE_CHECKLIST.md).

## What the app actually does

| Data | Purpose and location | Retention/control |
| --- | --- | --- |
| Chosen start/destination, route geometry, ride preferences and map view | Browser local storage; planning requests sent to the local API | Current session retained across refresh; export/delete in Data & privacy |
| Generated route snapshots and their request settings | Local SQLite database; enables exact GPX exports | Retained until explicit deletion; all snapshots are included in the data export |
| Access block points, highlighted geometry and notes | Local SQLite database; excludes sections from future rides and affected exports | Retained until individually reopened or deleted; included in local data export |
| Road reports and moderation history | Local SQLite database; current approved adverse reports affect new route searches | Stored until deletion; report scoring validity has an expiry, which does not delete the record |
| Browser location result | Requested only by “Use my location”; point/accuracy used for start selection | No continuous ride recording; permission managed by the browser/device |
| Downloaded OSM/municipal reference data | Local files for routing, display and inspection | Retained separately from personal app records |

There are no analytics, advertising trackers, accounts, marketing, cloud route uploads or training imports in this version. Figtree and Caprasimo fonts are served locally. Browser geolocation may use the device/browser provider’s own location services; that is outside Verge’s implementation.

**Road map** requests tiles from OpenStreetMap. **Satellite** requests imagery/labels from Esri. These providers receive the IP address, browser request information and viewed tile coordinates, which can reveal the viewed area. **Routes only** uses local route and reference overlays and makes no external tile requests. Switching does not erase earlier requests or provider/browser caches. Road/boundary refreshes contact configured sources for fixed coverage data. Following an external source link also contacts that website.

## Export and delete

**Export my app data** downloads a JSON file with server route snapshots, saved access blocks, reports/audit and this browser’s app storage. It contains precise coordinates. It does not export an administrator secret. Standard and Android GPX files also contain precise route/start coordinates.

**Delete my app data** first asks for explicit confirmation, then removes route snapshots, access blocks, reports and audit from the local database and clears this browser’s stored ride history. It leaves a fresh empty session and the Routes only preference. Downloaded road data remains. A search started before deletion cannot subsequently repopulate saved route records.

Deletion does not cover downloaded GPX/JSON files, system backups, copies on other devices, another browser’s local storage or provider logs/caches. Remove those separately as applicable. SQLite secure deletion is enabled, but the app does not claim forensic erasure of an SSD or encrypted storage. The app does not encrypt its database itself.

The current controls operate on the entire private installation, not individual user accounts. They must be replaced with authenticated, scoped rights handling before a shared/public service. The local server and frontend bind to loopback by default; the Docker frontend publishes to loopback and the backend is not published. Browser-origin/host checks and request limits are additional controls, not authentication.

## Use and route limitations

Verge plans on cached mapped roads. Its mapped-road score is a low-confidence comparison of available attributes and current approved local reports. It is not a crash/crime prediction, access permission, field verification or emergency service. Maps can omit gates, restrictions, surface changes and closures. Inspect the proposed roads before riding and stop to operate a phone.

Loop searches are bounded and may find fewer than three options or no suitable loop. The longest loop found is a search result, not proof of the longest possible route. Automatic loop totals meet the requested distance within the configured tolerance (3% by default). Fixed-lap plans accept a total within ±3%. Edits follow your selected roads and may change the total beyond that planning tolerance; the new distance and score are shown. Moving-time estimates use your selected speed; hills, stops and rider-history modelling are still unimplemented.

Android exports carry route geometry and turn metadata for OsmAnd. An initial rider test identified turnarounds and unmapped gates. Revised guidance, spoken turns, lap transitions and off-track behaviour still need structured device validation. There are no roundabout exit numbers. The road outline remains important for reviewing the receiving app’s behaviour.

## Copyright and attribution

Road data: © OpenStreetMap contributors, under [ODbL](https://www.openstreetmap.org/copyright). Attribution remains on every map mode and in route/data exports. The app does not bulk-download map tiles. Imagery credits remain visible on the satellite map. Municipal reference data identifies the City of Tshwane source and download date; public redistribution permission remains an open item.

The supplied Verge design is implemented for this private app. No brand-rights or trademark clearance is asserted. Figtree and Caprasimo use the SIL Open Font License; their original notices are bundled in `frontend/public/licenses`. Software metadata and available licence texts are bundled there too. Regenerate with `.venv/bin/python backend/scripts/license_inventory.py` after dependency changes. A release-specific licence review remains required.

## Private access observations and phone files

Saved access blocks include exact entrance coordinates, the highlighted road geometry, a note and date. They remain on the local server until individually reopened or deleted with app records. They apply to the owner’s future route calculations without community moderation and do not establish access rights or a verified estate boundary. Local JSON export includes these observations. Blocking a section prevents exporting saved routes that cross it; files already downloaded cannot be revoked.

The Android download is prepared locally. Where supported, Share route opens the operating system’s share sheet; the owner chooses the destination app and its handling/privacy terms apply. Verge does not silently upload or message the file. Downloaded/shared GPX files include precise route coordinates. “Create phone link” opens an optional GPX-only local listener for 10 minutes. It uses unencrypted HTTP: someone on the network who obtains or observes the token can download the route. Use trusted Wi-Fi. Only that file is held in memory; other records and the API remain private. Closing the link, changing access blocks or deleting records revokes it. This does not erase copies already downloaded. See PHONE_TRANSFER_PROPOSAL.md. Public-release obligations remain open.
