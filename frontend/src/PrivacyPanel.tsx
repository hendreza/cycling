import { useEffect, useState } from "react";

const keys = [
  "veld-session-v1",
  "veld-map-view-v1",
  "veld-basemap",
  "veld-avoided-ways",
];
const headers = { "X-Verge-Local-Action": "1" };
export const releaseWork = [
  [
    "Operator & privacy contact",
    "Identify the responsible party and publish a working contact and process for access, correction, objections and deletion.",
  ],
  [
    "POPIA & PAIA review",
    "Confirm applicability, register the Information Officer where required, complete the personal information impact assessment and required PAIA manual.",
  ],
  [
    "Purpose, retention & providers",
    "Approve lawful grounds, retention and backup periods, processor agreements and cross-border safeguards before collecting other riders’ data.",
  ],
  [
    "Public security & incidents",
    "Add accounts and authorisation, HTTPS, monitoring, an incident response and breach-notification process; independently review security.",
  ],
  [
    "Brand & copyright",
    "Record ownership or licences for the supplied kit and complete a Verge name/trademark clearance. No registration or clearance is claimed.",
  ],
  [
    "Maps & data licences",
    "Confirm imagery service rights for public/commercial use, a suitable tile provider, and redistribution terms for municipal datasets.",
  ],
  [
    "Public terms & field validation",
    "Review consumer terms, moderation, liability and insurance with a South African adviser. Validate on-bike navigation, junctions and scoring before public claims.",
  ],
];

export default function PrivacyPanel({ onDeleted }: { onDeleted: () => void }) {
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [message, setMessage] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/privacy/data", { headers })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setCounts)
      .catch(() => setMessage("Local data totals could not be loaded."));
  }, []);
  async function exportData() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/privacy/export", { headers });
      if (!response.ok)
        throw Error("Data export failed. Your saved data is unchanged.");
      const data = await response.json();
      const browser = Object.fromEntries(
        keys.map((key) => [key, localStorage.getItem(key)]),
      );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify({ ...data, browser }, null, 2)], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "verge-private-data.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(
        "Export downloaded. It includes precise route and start coordinates; keep it private.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function deleteData() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/privacy/data", {
        method: "DELETE",
        headers,
      });
      if (!response.ok)
        throw Error(
          "Deletion failed. Try again before assuming the data is removed.",
        );
      onDeleted();
      setCounts({ saved_routes: 0, reports: 0, audit: 0 });
      setConfirming(false);
      try {
        keys.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem("veld-basemap", "none");
        setMessage(
          "App records and this browser’s ride history cleared. Downloaded files, other browsers and backups must be deleted separately.",
        );
      } catch {
        setMessage(
          "Server records were deleted. Browser storage could not be cleared; clear this site’s browser data separately, along with downloaded files and backups.",
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="privacy-panel">
      <div className="privacy-intro">
        <span className="private-chip">
          Private preview · 10 September 2026
        </span>
        <h2>Your data. Your rides.</h2>
        <p>
          Verge currently runs for your personal use. This notice describes the
          private app; the public-release work below remains open.
        </p>
      </div>
      <section className="privacy-controls" aria-labelledby="local-data-title">
        <h3 id="local-data-title">Stored on this device</h3>
        <p>
          Your browser remembers the route, precise chosen points, ride settings
          and map view. The local server stores generated route snapshots, road
          reports and moderation history. They remain until you delete them;
          there is no automatic expiry of saved routes.
        </p>
        {counts && (
          <p className="data-counts">
            {counts.saved_routes} saved route snapshots · {counts.reports}{" "}
            reports · {counts.audit} moderation records
          </p>
        )}
        <div className="point-actions">
          <button className="outline" disabled={busy} onClick={exportData}>
            Export my app data
          </button>
          <button
            className="outline"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete my app data
          </button>
        </div>
        {confirming && (
          <div
            className="delete-confirm"
            role="group"
            aria-label="Confirm data deletion"
          >
            <p>
              This removes all route snapshots, reports and moderation records
              from the local server, plus ride history in this browser. Your
              downloaded road map data remains. This cannot be undone.
            </p>
            <div className="point-actions">
              <button
                className="danger-button"
                disabled={busy}
                onClick={deleteData}
              >
                Delete all app records
              </button>
              <button
                className="outline"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      <details open>
        <summary>Privacy notice</summary>
        <p>
          <strong>Purpose.</strong> Coordinates and settings are used to plan,
          compare, edit and export rides. Reports are used to review mapped road
          conditions. There are no accounts, ads, analytics, marketing trackers
          or training imports in this version. Fonts are served with the app.
        </p>
        <p>
          <strong>Location.</strong> “Use my location” requests your browser’s
          permission. Verge uses the reported point and accuracy for start
          selection; it does not continuously track your ride. Your browser or
          phone may use its own location services. Map selection also works
          without GPS.
        </p>
        <p>
          <strong>External requests.</strong> Road map tiles go to OpenStreetMap
          and satellite tiles to Esri. Providers receive your IP address,
          browser request details and the viewed tile area, from which location
          can be inferred. Select <strong>Routes only</strong> on the map to
          stop external tile requests. Downloading road or boundary updates
          contacts their data providers for the fixed pilot area.
        </p>
        <p>
          <strong>Control and retention.</strong> Export or delete app records
          above. Correct your chosen points in the planner; remove inaccurate
          reports by clearing local app records. Deletion does not erase
          GPX/JSON downloads, browser caches, backups or another browser’s local
          history. The app database is not encrypted by the app; device access
          controls matter.
        </p>
        <p>
          <strong>Before adding other riders.</strong> A responsible party,
          privacy contact, individual rights process and reviewed public notice
          are still required. The checklist below records that work. See the{" "}
          <a
            href="https://www.gov.za/documents/protection-personal-information-act"
            target="_blank"
            rel="noreferrer"
          >
            POPIA Act
          </a>{" "}
          and{" "}
          <a
            href="https://inforegulator.org.za/popia/"
            target="_blank"
            rel="noreferrer"
          >
            Information Regulator’s guidance and rights forms
          </a>
          .
        </p>
      </details>
      <details>
        <summary>Use, maps & credits</summary>
        <p>
          Verge is a personal route-planning preview. Its mapped-road score
          compares available map attributes with low confidence; it is not a
          prediction of traffic, crime or collision likelihood. Road access,
          gates, surface and junction conditions can differ on the ground. No
          emergency response is provided. Time estimates currently use a chosen
          moving speed; elevation and rider-history modelling are unfinished.
        </p>
        <p>
          Review your route before riding and stop to operate the phone. Route
          downloads include the selected geometry; Android guidance depends on
          the receiving app and still needs on-bike validation. Public consumer
          terms, operator details and any paid-service obligations remain open.
        </p>
        <p>
          Roads: ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            OpenStreetMap contributors, ODbL
          </a>
          . Standard tiles follow the{" "}
          <a
            href="https://operations.osmfoundation.org/policies/tiles/"
            target="_blank"
            rel="noreferrer"
          >
            OSM tile policy
          </a>
          ; this app does not bulk download or package those tiles. Imagery:
          Esri and the suppliers shown on the map, subject to{" "}
          <a
            href="https://www.esri.com/en-us/legal/terms/web-site-service"
            target="_blank"
            rel="noreferrer"
          >
            Esri service terms
          </a>
          . Public/commercial imagery rights need confirmation. Municipal
          boundaries: City of Tshwane; redistribution permissions remain to be
          confirmed before public distribution.
        </p>
        <p>
          Caprasimo and Figtree are bundled under the SIL Open Font License:{" "}
          <a href="/licenses/caprasimo-OFL.txt">Caprasimo licence</a> ·{" "}
          <a href="/licenses/figtree-OFL.txt">Figtree licence</a>. Supplied
          Verge branding is applied for this private prototype; ownership and
          trademark clearance remain open.{" "}
          <a href="/licenses/dependencies.json">Software licence inventory</a> ·{" "}
          <a href="/licenses/THIRD_PARTY_NOTICES.txt">Third-party notices</a>.
        </p>
      </details>
      <section className="release-checklist" aria-labelledby="release-title">
        <span className="private-chip">Public release: not ready</span>
        <h3 id="release-title">Work that stays on the list</h3>
        <p>
          These items are deliberately recorded here and in the project’s
          release checklist. Private testing does not mark them complete.
        </p>
        <ul>
          {releaseWork.map(([title, detail]) => (
            <li key={title}>
              <span className="open-tag">Open</span>
              <div>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
