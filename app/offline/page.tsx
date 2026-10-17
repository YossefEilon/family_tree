import type { Metadata } from "next";

export const metadata: Metadata = { title: "אין חיבור לאינטרנט - עץ משפחה" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="pwa-offline">
      <div className="pwa-offline-card">
        <div className="pwa-offline-icon" aria-hidden="true">📡</div>
        <h1>אין חיבור לאינטרנט</h1>
        <p>לא ניתן לטעון את הדף כרגע. בדקו את החיבור ונסו שוב.</p>
        <a className="pwa-offline-retry" href="/">נסו שוב</a>
      </div>
    </main>
  );
}
