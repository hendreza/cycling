import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { api, post } from "./api";

type Link = { id: string; url: string; expires_at: number };
type Network = { name: string; address: string };
const close = (id: string) =>
  api(`/transfer/${id}`, { method: "DELETE", keepalive: true });

export default function WifiTransfer({
  routeId,
  speed,
  laps,
  disabled,
  revision,
}: {
  routeId: string;
  speed: number;
  laps: string;
  disabled: boolean;
  revision: number;
}) {
  const [networks, setNetworks] = useState<Network[]>([]);
  const [address, setAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [link, setLink] = useState<Link | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);
  const currentLink = useRef<Link | null>(null);
  const key = `${routeId}:${speed}:${laps}:${revision}:${disabled}`;
  useEffect(() => {
    let current = true;
    api<Network[]>("/transfer/interfaces")
      .then((items) => {
        if (current) {
          setNetworks(items);
          setAddress(items[0]?.address ?? "");
          setLoaded(true);
        }
      })
      .catch(() => {
        if (current) {
          setLoaded(true);
          setError("Could not check your network. Use Download for Android.");
        }
      });
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    setLink(null);
    setQr("");
    setBusy(false);
    return () => {
      generation.current++;
      const old = currentLink.current;
      currentLink.current = null;
      if (old)
        void close(old.id).catch(() => {
          /* Server expiry remains the fallback. */
        });
    };
  }, [key]);
  useEffect(() => {
    if (!link) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [link]);
  const seconds = link
    ? Math.max(0, Math.ceil(link.expires_at - now / 1000))
    : 0;
  async function create() {
    if (disabled || busy || !address) return;
    const id = generation.current;
    setBusy(true);
    setError("");
    setQr("");
    try {
      const result = await api<Link>(
        `/routes/${routeId}/transfer`,
        post({ address, laps, speed_kmh: speed }),
      );
      if (generation.current !== id) {
        await close(result.id);
        return;
      }
      currentLink.current = result;
      setLink(result);
      setNow(Date.now());
      const picture = await QRCode.toDataURL(result.url, {
        width: 240,
        margin: 3,
        errorCorrectionLevel: "M",
        color: { dark: "#2f2a24", light: "#ffffff" },
      });
      if (generation.current === id) setQr(picture);
    } catch (e) {
      if (generation.current === id) setError((e as Error).message);
    } finally {
      if (generation.current === id) setBusy(false);
    }
  }
  async function stop() {
    if (!link) return;
    setBusy(true);
    setError("");
    try {
      await close(link.id);
      currentLink.current = null;
      setLink(null);
      setQr("");
    } catch {
      setError(
        "Could not confirm the link closed. It will still expire automatically.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="wifi-transfer" open={!!link}>
      <summary>Send to phone over Wi-Fi</summary>
      <p>
        Connect your phone and computer to the same trusted Wi-Fi. Create a
        link, scan it with your Android camera, then open the download with
        OsmAnd.
      </p>
      <p className="transfer-privacy">
        Opens a private link for 10 minutes. Anyone on this network who obtains
        the link can download your precise route. The local connection is
        unencrypted; your other app records stay private.
      </p>
      {networks.length > 1 && !link && (
        <label>
          Computer network
          <select
            aria-label="Phone transfer network"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          >
            {networks.map((n) => (
              <option key={n.address} value={n.address}>
                {n.name} · {n.address}
              </option>
            ))}
          </select>
        </label>
      )}
      {!loaded && <p role="status">Checking your network…</p>}
      {loaded && !networks.length && (
        <p>
          No available local network. Connect the computer to Wi-Fi, or use the
          Android download. Docker installations use the download option.
        </p>
      )}
      {!link && (
        <button
          className="outline"
          disabled={disabled || busy || !address}
          onClick={create}
        >
          {busy ? "Creating link…" : "Create phone link"}
        </button>
      )}
      {link && (
        <div className="phone-link" aria-label="Phone download link">
          {seconds > 0 ? (
            <>
              {qr && (
                <img
                  src={qr}
                  width={240}
                  height={240}
                  alt="Scan this QR code with your Android camera to download the selected route"
                />
              )}
              <p>Scan with your Android camera. Keep this computer running.</p>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.url}
              </a>
              <p>
                Closes in {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </p>
            </>
          ) : (
            <p role="status">
              This phone link has expired. Close it to create a new one.
            </p>
          )}
          <button className="outline" disabled={busy} onClick={stop}>
            Close link now
          </button>
          <small>
            If the phone cannot connect, check it is on the same Wi-Fi.
            Guest-network isolation or a firewall may prevent transfer. The
            Android download remains available.
          </small>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
