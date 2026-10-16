"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  initialStoriesData,
  type StoriesData,
  type StoryChapter,
  type GeoStation,
  type NameChain,
  type RosterPerson,
} from "@/lib/stories-data";
import { storyPortraits } from "@/lib/stories-portraits";

const LOCAL_STORAGE_KEY = "family_stories_custom_data";

export default function StoriesPage() {
  const [data, setData] = useState<StoriesData>(initialStoriesData);
  const [activeTab, setActiveTab] = useState<"overview" | "elbaz" | "amzalag" | "atlas" | "generations">("overview");

  // Flow navigation index state
  const [elbazIdx, setElbazIdx] = useState(0);
  const [amzalagIdx, setAmzalagIdx] = useState(0);
  const [geoIdx, setGeoIdx] = useState(0);
  const [activeNameChainKey, setActiveNameChainKey] = useState("moshe");

  // Roster filtering
  const [rosterSearch, setRosterSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<"all" | "elbaz" | "amzalag" | "eilon">("all");

  // Modals & Panels
  const [selectedPerson, setSelectedPerson] = useState<RosterPerson | null>(null);
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [managePasswordOpen, setManagePasswordOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Manager edit state
  const [canEdit, setCanEdit] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active item edit modal
  const [editingChapter, setEditingChapter] = useState<{ branch: "elbaz" | "amzalag"; index: number; draft: StoryChapter } | null>(null);
  const [editingStation, setEditingStation] = useState<{ index: number; draft: GeoStation } | null>(null);
  const [editingPerson, setEditingPerson] = useState<{ index: number; draft: RosterPerson } | null>(null);
  const [editingStats, setEditingStats] = useState(false);
  const [statsDraft, setStatsDraft] = useState(initialStoriesData.stats);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Check manage authorization on mount & load custom data if available
  useEffect(() => {
    // Check if user is already manager
    fetch("/api/manage")
      .then((res) => (res.ok ? res.json() : { authorized: false }))
      .then((json: { authorized?: boolean }) => {
        if (json.authorized) setCanEdit(true);
      })
      .catch(() => {});

    // Load stories data from server or localStorage
    fetch("/api/stories")
      .then((res) => (res.ok ? res.json() : null))
      .then((serverData: StoriesData | null) => {
        if (serverData && serverData.elbazChapters) {
          setData(serverData);
          setStatsDraft(serverData.stats);
        } else {
          // fallback to localStorage
          const local = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (local) {
            try {
              const parsed = JSON.parse(local) as StoriesData;
              setData(parsed);
              setStatsDraft(parsed.stats);
            } catch {
              // use default
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  // Manager password submit handler
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSubmitting(true);
    try {
      const res = await fetch("/api/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      if (res.ok) {
        setCanEdit(true);
        setManagePasswordOpen(false);
        setPasswordInput("");
        showToast("מצב עריכה הופעל בהצלחה!");
      } else {
        const json = await res.json().catch(() => ({ error: "הסיסמה שגויה" })) as { error?: string };
        setPasswordError(json.error || "הסיסמה שגויה");
      }
    } catch {
      setPasswordError("שגיאה בהתחברות");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  // Leave manager edit mode
  const handleLeaveEdit = async () => {
    await fetch("/api/manage", { method: "DELETE" }).catch(() => {});
    setCanEdit(false);
    showToast("יציאה ממצב עריכה");
  };

  // Save all changes to server and local storage
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
      const res = await fetch("/api/stories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setHasUnsavedChanges(false);
        showToast("כל השינויים נשמרו בהצלחה!");
      } else {
        showToast("השינויים נשמרו מקומית בדפדפן.");
      }
    } catch {
      showToast("שגיאה בשמירה לשרת, השינויים נשמרו מקומית.");
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to initial stories data
  const handleResetData = async () => {
    if (!window.confirm("האם ברצונך לאפס את כל הסיפורים והפרקים לגרסת המקור?")) return;
    try {
      await fetch("/api/stories", { method: "DELETE" }).catch(() => {});
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setData(initialStoriesData);
      setStatsDraft(initialStoriesData.stats);
      setHasUnsavedChanges(false);
      showToast("הנתונים אופסו לברירת המחדל.");
    } catch {
      showToast("שגיאה באיפוס הנתונים");
    }
  };

  // Copy helper
  const copyToClipboard = (text: string, msg: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    showToast(msg);
  };

  // Filter roster
  const filteredRoster = data.peopleRoster.filter((p) => {
    const matchesBranch = branchFilter === "all" || p.branch === branchFilter;
    const q = rosterSearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.dates.toLowerCase().includes(q) ||
      p.burial.toLowerCase().includes(q) ||
      p.bio.toLowerCase().includes(q) ||
      p.rel.toLowerCase().includes(q);
    return matchesBranch && matchesQuery;
  });

  const activeChain = data.nameChains[activeNameChainKey] ?? data.nameChains.moshe;
  const currentElbazChapter = data.elbazChapters[elbazIdx] || data.elbazChapters[0];
  const currentAmzalagChapter = data.amzalagChapters[amzalagIdx] || data.amzalagChapters[0];
  const currentStation = data.geoStations[geoIdx] || data.geoStations[0];

  return (
    <div className="stories-shell" dir="rtl" lang="he">
      {/* Top Header Navigation */}
      <header className="stories-topbar">
        <div className="stories-topbar-nav">
          <div className="stories-topbar-header-row">
            <Link href="/" className="stories-brand">
              <span style={{ fontSize: "1.5rem" }}>🌳</span>
              <div>
                <strong style={{ fontSize: "1.05rem", display: "block", color: "var(--ink)", lineHeight: 1.2 }}>משפחת אילון</strong>
                <small style={{ fontSize: "0.75rem", color: "var(--muted)" }}>מסע השורשים</small>
              </div>
            </Link>

            <div className="stories-topbar-actions">
              {canEdit && (
                <>
                  <span className="edit-badge">עריכה</span>
                  {hasUnsavedChanges && (
                    <button
                      type="button"
                      className="button primary"
                      style={{ padding: "0.35rem 0.65rem", fontSize: "0.8rem", minHeight: "32px" }}
                      onClick={handleSaveChanges}
                      disabled={isSaving}
                      title="שמירת כל השינויים שבוצעו"
                    >
                      💾 {isSaving ? "שומר..." : "שמור"}
                    </button>
                  )}
                  <button
                    type="button"
                    className="button ghost"
                    style={{ padding: "0.35rem 0.55rem", fontSize: "0.78rem", minHeight: "32px" }}
                    onClick={handleResetData}
                    title="איפוס לגרסת המקור"
                  >
                    🔄
                  </button>
                </>
              )}

              <button
                type="button"
                className={`button ${canEdit ? "danger" : "ghost"}`}
                style={{ padding: "0.35rem 0.65rem", fontSize: "0.82rem", minHeight: "32px" }}
                onClick={() => (canEdit ? handleLeaveEdit() : setManagePasswordOpen(true))}
                title={canEdit ? "יציאה ממצב עריכה" : "עריכת סיפורי המשפחה באמצעות סיסמת מנהל"}
              >
                {canEdit ? "יציאה" : "✏️ עריכה"}
              </button>

              <button
                type="button"
                className="embed-trigger stories-header-export"
                onClick={() => setEmbedModalOpen(true)}
                title="הטמעה וייצוא JSON של הסיפורים"
              >
                ייצוא JSON
              </button>
            </div>
          </div>

          <nav className="view-switcher stories-view-switcher" aria-label="ניווט באפליקציה">
            <Link href="/" className="view-tab">
              🌳 <span>מפת העץ</span>
            </Link>
            <Link href="/?view=explorer" className="view-tab">
              🧭 <span>סייר משפחה</span>
            </Link>
            <Link href="/?view=directory" className="view-tab">
              📖 <span>אלפון</span>
            </Link>
            <span className="view-tab active" aria-current="page">
              📜 <span>סיפורי המשפחות</span>
            </span>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="stories-content-wrap">
        {/* HERO SECTION */}
        <section className="story-hero">
          <div className="hero-grid">
            <div>
              <span className="hero-badge">{data.heroBadge}</span>
              <h1>{data.title}</h1>
              <p>{data.subtitle}</p>
            </div>
            <div className="hero-stats" aria-label="נתוני שושלות אלבז ואמזלג">
              <div className="story-stat-box">
                <b>{data.stats.generations}</b>
                <span>{data.stats.generationsDesc}</span>
              </div>
              <div className="story-stat-box">
                <b>{data.stats.branches}</b>
                <span>{data.stats.branchesDesc}</span>
              </div>
              <div className="story-stat-box">
                <b>{data.stats.aliyahWaves}</b>
                <span>{data.stats.aliyahWavesDesc}</span>
              </div>
              <div className="story-stat-box">
                <b>{data.stats.figuresCount}</b>
                <span>{data.stats.figuresCountDesc}</span>
              </div>
              {canEdit && (
                <div style={{ gridColumn: "1 / -1", textAlign: "left" }}>
                  <button
                    type="button"
                    className="edit-action-btn"
                    onClick={() => {
                      setStatsDraft(data.stats);
                      setEditingStats(true);
                    }}
                  >
                    ✏️ ערוך נתונים וכותרות
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* STICKY TAB NAVIGATION */}
        <nav className="flow-nav" aria-label="פרקי הסיפור המשפחתי">
          <div className="flow-tabs" role="tablist">
            <button
              type="button"
              className={`flow-tab ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
              role="tab"
              aria-selected={activeTab === "overview"}
            >
              <span className="flow-step-num">1</span>
              <span className="flow-tab-full">מפגש השושלות</span>
              <span className="flow-tab-short">מפגש</span>
            </button>
            <button
              type="button"
              className={`flow-tab ${activeTab === "elbaz" ? "active" : ""}`}
              onClick={() => setActiveTab("elbaz")}
              role="tab"
              aria-selected={activeTab === "elbaz"}
            >
              <span className="flow-step-num">2</span>
              <span className="flow-tab-full">סיפור משפחת אלבז וזנו</span>
              <span className="flow-tab-short">אלבז וזנו</span>
            </button>
            <button
              type="button"
              className={`flow-tab ${activeTab === "amzalag" ? "active" : ""}`}
              onClick={() => setActiveTab("amzalag")}
              role="tab"
              aria-selected={activeTab === "amzalag"}
            >
              <span className="flow-step-num">3</span>
              <span className="flow-tab-full">סיפור משפחת אמזלג ושריקי</span>
              <span className="flow-tab-short">אמזלג ושריקי</span>
            </button>
            <button
              type="button"
              className={`flow-tab ${activeTab === "atlas" ? "active" : ""}`}
              onClick={() => setActiveTab("atlas")}
              role="tab"
              aria-selected={activeTab === "atlas"}
            >
              <span className="flow-step-num">4</span>
              <span className="flow-tab-full">אטלס הקהילות והקברים</span>
              <span className="flow-tab-short">אטלס קהילות</span>
            </button>
            <button
              type="button"
              className={`flow-tab ${activeTab === "generations" ? "active" : ""}`}
              onClick={() => setActiveTab("generations")}
              role="tab"
              aria-selected={activeTab === "generations"}
            >
              <span className="flow-step-num">5</span>
              <span className="flow-tab-full">גשר הדורות והשמות</span>
              <span className="flow-tab-short">דורות ושמות</span>
            </button>
          </div>
        </nav>

        {/* TAB 1: OVERVIEW & CONVERGENCE */}
        {activeTab === "overview" && (
          <section>
            <div className="convergence-banner">
              {/* Amzalag Wing */}
              <article className="wing-card amzalag-wing">
                <div>
                  <span className="wing-tag">הענף המערבי · מרוקו וספרד</span>
                  <h2>בית אמזלג ובית שריקי</h2>
                  <p>
                    משורשי הצורפים וחרשי הכסף של מרוקו (<em>Amzallag</em>) וצאצאי מגורשי ולנסיה ומבצר שֶׁרִיקָה (
                    <em>Chriqui</em>). שתי משפחות שהתבססו בעיר הנמל קזבלנקה, צלחו את תקופת שלטון וישי במלחמת העולם
                    השנייה, התאחדו בנישואי <strong>משה (מוריס) אמזלג</strong> ו<strong>פרלה שריקי</strong> ב־1952, ועלו
                    לישראל ב״מבצע יכין״ בשנת 1964.
                  </p>
                </div>
                <button className="wing-cta" type="button" onClick={() => setActiveTab("amzalag")}>
                  לסיפור המלא של אמזלג ושריקי ←
                </button>
              </article>

              {/* Union Bridge */}
              <div className="union-bridge">
                <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "#163a47" }}>נקודת האיחוד ההיסטורית</span>
                <strong>יצחק אילון (אמזלג) &amp; לבנת אלבז</strong>
                <span>נישאו בכ״ג באלול תשמ״א (1981)</span>
                <p style={{ fontSize: "0.84rem", color: "var(--muted)", margin: "10px 0 0" }}>
                  איחוד שני הנתיבים מצפון אפריקה לשושלת משפחת אילון בישראל — 9 ילדים ועשרות נכדים הנושאים את שמות האבות
                  והאמהות מדמנאת, אפלו וקזבלנקה.
                </p>
                <Link
                  href="/?person=2"
                  className="wing-cta"
                  style={{ marginTop: "14px", alignSelf: "center", textDecoration: "none" }}
                >
                  צפה בעץ המשפחה 🌳
                </Link>
              </div>

              {/* Elbaz Wing */}
              <article className="wing-card elbaz-wing">
                <div>
                  <span className="wing-tag">הענף המזרחי · דמנאת, גרדאיה ואפלו</span>
                  <h2>בית אלבז ובית זנו</h2>
                  <p>
                    משושלת המקובלים של <strong>דמנאת</strong> בהרי האטלס (<strong>רבי משה אלבז</strong> ובנו{" "}
                    <strong>המקובל רבי יוסף אלבז</strong> שעלה לירושלים ב־1924 ונטמן בהר הזיתים), דרך נווה המדבר{" "}
                    <strong>גַרְדָאיָה</strong> וברית החיתון עם <strong>משפחת זנו-ביהי</strong>, ועד הנהגת קהילת{" "}
                    <strong>אַפְלוּ</strong> על ידי <strong>הרב בן ציון אלבז</strong> (ה״אל-קאייד״), מסירות הנפש של בנו{" "}
                    <strong>אליהו אלבז הי״ד</strong> (הרוג מלכות, 1956), ואיחוד בני הדודים{" "}
                    <strong>יעקב ומרים אלבז</strong> בקריית אתא.
                  </p>
                </div>
                <button className="wing-cta" type="button" onClick={() => setActiveTab("elbaz")}>
                  לסיפור המלא של אלבז וזנו ←
                </button>
              </article>
            </div>

            {/* Founding Portraits Strip */}
            <h3 style={{ margin: "0 0 16px", fontSize: "1.35rem" }}>
              דיוקנאות הדורות המייסדים (מתוך אלבום עץ המשפחה)
            </h3>
            <div className="portraits-strip">
              <button
                type="button"
                className="portrait-pill"
                onClick={() => {
                  const p = data.peopleRoster.find((r) => r.key === "bentzion");
                  if (p) setSelectedPerson(p);
                }}
              >
                {storyPortraits.bentzion && <img src={storyPortraits.bentzion} alt="הרב בן ציון אלבז" />}
                <div>
                  <strong>הרב בן ציון אלבז זצ״ל</strong>
                  <span>יליד גרדאיה (1892) · ״אל-קאייד״ באפלו</span>
                  <em>לתעודת דמות</em>
                </div>
              </button>

              <button
                type="button"
                className="portrait-pill"
                onClick={() => {
                  const p = data.peopleRoster.find((r) => r.key === "nedjma");
                  if (p) setSelectedPerson(p);
                }}
              >
                {storyPortraits.nedjma && <img src={storyPortraits.nedjma} alt="נג׳מה אלבז לבית זנו" />}
                <div>
                  <strong>נג׳מה אלבז לבית זנו</strong>
                  <span>בת אברהם זנו · נפטרה כ״א באב תשמ״ב</span>
                  <em>לתעודת דמות</em>
                </div>
              </button>

              <button
                type="button"
                className="portrait-pill"
                onClick={() => {
                  const p = data.peopleRoster.find((r) => r.key === "yaakov");
                  if (p) setSelectedPerson(p);
                }}
              >
                {storyPortraits.yaakov && <img src={storyPortraits.yaakov} alt="יעקב אלבז ז״ל" />}
                <div>
                  <strong>יעקב אלבז ז״ל</strong>
                  <span>בן מרדכי ולבנה · 1946–1985</span>
                  <em>לתעודת דמות</em>
                </div>
              </button>

              <button
                type="button"
                className="portrait-pill"
                onClick={() => {
                  const p = data.peopleRoster.find((r) => r.key === "moshe_m");
                  if (p) setSelectedPerson(p);
                }}
              >
                {storyPortraits.moshe_m && <img src={storyPortraits.moshe_m} alt="משה (מוריס) אמזלג" />}
                <div>
                  <strong>משה (מוריס) אמזלג ז״ל</strong>
                  <span>בן יוסף ורחל · 1925–2016</span>
                  <em>לתעודת דמות</em>
                </div>
              </button>

              <button
                type="button"
                className="portrait-pill"
                onClick={() => {
                  const p = data.peopleRoster.find((r) => r.key === "perla");
                  if (p) setSelectedPerson(p);
                }}
              >
                {storyPortraits.perla && <img src={storyPortraits.perla} alt="פרלה אמזלג לבית שריקי" />}
                <div>
                  <strong>פרלה אמזלג לבית שריקי ז״ל</strong>
                  <span>בת שלום וסולטנה · 1930–2026</span>
                  <em>לתעודת דמות</em>
                </div>
              </button>
            </div>

            {/* Etymology Heritage Cards */}
            {data.etymologies && data.etymologies.length > 0 && (
              <div className="etymology-grid">
                {data.etymologies.map((ety, i) => (
                  <div key={i} className="ety-card">
                    <h4>{ety.title}</h4>
                    <p>{ety.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ELBAZ & ZENOU STORYBOARD */}
        {activeTab === "elbaz" && (
          <section>
            <div className="storyboard">
              {/* Chapters list */}
              <div className="chapter-list">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px" }}>
                  <strong style={{ fontSize: "0.95rem" }}>פרקי שושלת אלבז וזנו</strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="edit-action-btn"
                      onClick={() => {
                        const newCh: StoryChapter = {
                          era: "תקופה חדשה",
                          loc: "מיקום",
                          title: "כותרת פרק חדש",
                          body: ["תוכן הפרק..."],
                          quote: "ציטוט מרכזי",
                          cite: "מקור הציטוט",
                          highlights: [],
                        };
                        const next = { ...data, elbazChapters: [...data.elbazChapters, newCh] };
                        setData(next);
                        setHasUnsavedChanges(true);
                        setElbazIdx(data.elbazChapters.length);
                      }}
                    >
                      + הוסף פרק
                    </button>
                  )}
                </div>
                {data.elbazChapters.map((ch, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chapter-btn ${elbazIdx === i ? "active" : ""}`}
                    onClick={() => setElbazIdx(i)}
                    aria-selected={elbazIdx === i}
                  >
                    <small>{ch.era}</small>
                    <strong>{ch.title}</strong>
                  </button>
                ))}
              </div>

              {/* Stage Card */}
              {currentElbazChapter && (
                <div className="chapter-stage">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div className="stage-meta">
                      <span className="stage-era">{currentElbazChapter.era}</span>
                      <span className="stage-loc">{currentElbazChapter.loc}</span>
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="edit-action-btn"
                          onClick={() =>
                            setEditingChapter({ branch: "elbaz", index: elbazIdx, draft: { ...currentElbazChapter } })
                          }
                        >
                          ✏️ ערוך פרק
                        </button>
                        {data.elbazChapters.length > 1 && (
                          <button
                            type="button"
                            className="edit-action-btn"
                            style={{ color: "#b91c1c" }}
                            onClick={() => {
                              if (!window.confirm("למחוק פרק זה?")) return;
                              const nextChapters = data.elbazChapters.filter((_, idx) => idx !== elbazIdx);
                              setData({ ...data, elbazChapters: nextChapters });
                              setHasUnsavedChanges(true);
                              setElbazIdx(Math.max(0, elbazIdx - 1));
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <h3>{currentElbazChapter.title}</h3>

                  {currentElbazChapter.body.map((paragraph, pIdx) => (
                    <p key={pIdx}>{paragraph}</p>
                  ))}

                  {currentElbazChapter.quote && (
                    <blockquote className="stage-quote">
                      {currentElbazChapter.quote}
                      {currentElbazChapter.cite && <cite>— {currentElbazChapter.cite}</cite>}
                    </blockquote>
                  )}

                  {currentElbazChapter.highlights && currentElbazChapter.highlights.length > 0 && (
                    <div className="stage-highlights">
                      {currentElbazChapter.highlights.map((h, hIdx) => (
                        <div key={hIdx} className="hi-box">
                          <span>{h.label}</span>
                          <strong>{h.val}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="stage-nav">
                    <button
                      type="button"
                      className="stage-nav-btn"
                      disabled={elbazIdx === 0}
                      onClick={() => setElbazIdx(elbazIdx - 1)}
                    >
                      → הפרק הקודם
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      פרק {elbazIdx + 1} מתוך {data.elbazChapters.length}
                    </span>
                    <button
                      type="button"
                      className="stage-nav-btn"
                      disabled={elbazIdx === data.elbazChapters.length - 1}
                      onClick={() => setElbazIdx(elbazIdx + 1)}
                    >
                      הפרק הבא ←
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 3: AMZALAG & SHERIKI STORYBOARD */}
        {activeTab === "amzalag" && (
          <section>
            <div className="storyboard">
              {/* Chapters list */}
              <div className="chapter-list">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px" }}>
                  <strong style={{ fontSize: "0.95rem" }}>פרקי שושלת אמזלג ושריקי</strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="edit-action-btn"
                      onClick={() => {
                        const newCh: StoryChapter = {
                          era: "תקופה חדשה",
                          loc: "קזבלנקה, מרוקו",
                          title: "כותרת פרק חדש",
                          body: ["תוכן הפרק..."],
                          quote: "ציטוט מרכזי",
                          cite: "מקור",
                          highlights: [],
                        };
                        const next = { ...data, amzalagChapters: [...data.amzalagChapters, newCh] };
                        setData(next);
                        setHasUnsavedChanges(true);
                        setAmzalagIdx(data.amzalagChapters.length);
                      }}
                    >
                      + הוסף פרק
                    </button>
                  )}
                </div>
                {data.amzalagChapters.map((ch, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chapter-btn ${amzalagIdx === i ? "active" : ""}`}
                    onClick={() => setAmzalagIdx(i)}
                    aria-selected={amzalagIdx === i}
                  >
                    <small>{ch.era}</small>
                    <strong>{ch.title}</strong>
                  </button>
                ))}
              </div>

              {/* Stage Card */}
              {currentAmzalagChapter && (
                <div className="chapter-stage">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div className="stage-meta">
                      <span className="stage-era">{currentAmzalagChapter.era}</span>
                      <span className="stage-loc">{currentAmzalagChapter.loc}</span>
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="edit-action-btn"
                          onClick={() =>
                            setEditingChapter({ branch: "amzalag", index: amzalagIdx, draft: { ...currentAmzalagChapter } })
                          }
                        >
                          ✏️ ערוך פרק
                        </button>
                        {data.amzalagChapters.length > 1 && (
                          <button
                            type="button"
                            className="edit-action-btn"
                            style={{ color: "#b91c1c" }}
                            onClick={() => {
                              if (!window.confirm("למחוק פרק זה?")) return;
                              const nextChapters = data.amzalagChapters.filter((_, idx) => idx !== amzalagIdx);
                              setData({ ...data, amzalagChapters: nextChapters });
                              setHasUnsavedChanges(true);
                              setAmzalagIdx(Math.max(0, amzalagIdx - 1));
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <h3>{currentAmzalagChapter.title}</h3>

                  {currentAmzalagChapter.body.map((paragraph, pIdx) => (
                    <p key={pIdx}>{paragraph}</p>
                  ))}

                  {currentAmzalagChapter.quote && (
                    <blockquote className="stage-quote">
                      {currentAmzalagChapter.quote}
                      {currentAmzalagChapter.cite && <cite>— {currentAmzalagChapter.cite}</cite>}
                    </blockquote>
                  )}

                  {currentAmzalagChapter.highlights && currentAmzalagChapter.highlights.length > 0 && (
                    <div className="stage-highlights">
                      {currentAmzalagChapter.highlights.map((h, hIdx) => (
                        <div key={hIdx} className="hi-box">
                          <span>{h.label}</span>
                          <strong>{h.val}</strong>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="stage-nav">
                    <button
                      type="button"
                      className="stage-nav-btn"
                      disabled={amzalagIdx === 0}
                      onClick={() => setAmzalagIdx(amzalagIdx - 1)}
                    >
                      → הפרק הקודם
                    </button>
                    <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                      פרק {amzalagIdx + 1} מתוך {data.amzalagChapters.length}
                    </span>
                    <button
                      type="button"
                      className="stage-nav-btn"
                      disabled={amzalagIdx === data.amzalagChapters.length - 1}
                      onClick={() => setAmzalagIdx(amzalagIdx + 1)}
                    >
                      הפרק הבא ←
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 4: HERITAGE ATLAS & GRAVES */}
        {activeTab === "atlas" && (
          <section>
            <div className="geo-layout">
              {/* Stations List */}
              <div className="geo-stations">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px" }}>
                  <strong style={{ fontSize: "0.95rem" }}>תחנות גיאוגרפיות</strong>
                  {canEdit && (
                    <button
                      type="button"
                      className="edit-action-btn"
                      onClick={() => {
                        const newSt: GeoStation = {
                          id: `station_${Date.now()}`,
                          name: "שם תחנה חדשה",
                          region: "אזור / ארץ",
                          branch: "ענף",
                          desc: "תיאור היסטורי של התחנה...",
                          figures: ["דמויות שחיו כאן"],
                          memorial: "בתי עלמין וציוני זיכרון",
                        };
                        const next = { ...data, geoStations: [...data.geoStations, newSt] };
                        setData(next);
                        setHasUnsavedChanges(true);
                        setGeoIdx(data.geoStations.length);
                      }}
                    >
                      + הוסף תחנה
                    </button>
                  )}
                </div>
                {data.geoStations.map((g, i) => (
                  <button
                    key={g.id || i}
                    type="button"
                    className={`geo-btn ${geoIdx === i ? "active" : ""}`}
                    onClick={() => setGeoIdx(i)}
                    aria-selected={geoIdx === i}
                  >
                    <div>
                      <strong>{g.name}</strong>
                      <span>{g.region}</span>
                    </div>
                    <span>←</span>
                  </button>
                ))}
              </div>

              {/* Station Detail Stage */}
              {currentStation && (
                <div className="geo-detail">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span className="stage-era">{currentStation.branch}</span>
                    {canEdit && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          type="button"
                          className="edit-action-btn"
                          onClick={() => setEditingStation({ index: geoIdx, draft: { ...currentStation } })}
                        >
                          ✏️ ערוך תחנה
                        </button>
                        {data.geoStations.length > 1 && (
                          <button
                            type="button"
                            className="edit-action-btn"
                            style={{ color: "#b91c1c" }}
                            onClick={() => {
                              if (!window.confirm("למחוק תחנה זו?")) return;
                              const nextSt = data.geoStations.filter((_, idx) => idx !== geoIdx);
                              setData({ ...data, geoStations: nextSt });
                              setHasUnsavedChanges(true);
                              setGeoIdx(Math.max(0, geoIdx - 1));
                            }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <h3 style={{ margin: "10px 0 6px", fontSize: "1.75rem" }}>{currentStation.name}</h3>
                  <p style={{ margin: "0 0 14px", color: "var(--amber, #b86b28)", fontWeight: 700, fontSize: "0.94rem" }}>
                    {currentStation.region}
                  </p>
                  <p style={{ margin: "0 0 18px" }}>{currentStation.desc}</p>

                  <div style={{ background: "var(--bg-alt, #f2ebe0)", padding: "16px 20px", borderRadius: "14px", marginBottom: "16px" }}>
                    <strong style={{ display: "block", marginBottom: "8px" }}>דמויות המשפחה בתחנה זו:</strong>
                    <ul style={{ margin: 0, paddingRight: "20px", color: "var(--muted)" }}>
                      {currentStation.figures.map((fig, fIdx) => (
                        <li key={fIdx}>{fig}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ borderTop: "1px solid #e2d9c8", paddingTop: "14px", fontSize: "0.92rem" }}>
                    <strong>ציוני זיכרון ובתי עלמין:</strong> {currentStation.memorial}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 5: GENERATIONS & NAME CONTINUITY */}
        {activeTab === "generations" && (
          <section>
            {/* Names Lab */}
            <div className="names-lab">
              <h3 style={{ margin: "0 0 6px", fontSize: "1.5rem" }}>
                מעבדת השמות: רצף ההנצחה הבין-דורי (1785–2025)
              </h3>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.94rem" }}>
                הצלבת רשומות העץ חושפת כיצד שמות האבות והאמהות מדמנאת, אפלו וקזבלנקה נישאים כיום על ידי הנינים בישראל,
                ומאפשרת לשחזר לפי המסורת המרוקאית את שמות האבות בדורות שלפני המאה ה־20. בחרו שם לבדיקת השרשרת:
              </p>

              <div className="name-selectors">
                {Object.keys(data.nameChains).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`name-btn ${activeNameChainKey === k ? "active" : ""}`}
                    onClick={() => setActiveNameChainKey(k)}
                    aria-pressed={activeNameChainKey === k}
                  >
                    {data.nameChains[k].label}
                  </button>
                ))}
              </div>

              {activeChain && (
                <div>
                  <h4 style={{ margin: "0 0 14px", fontSize: "1.15rem", color: "#163a47" }}>{activeChain.title}</h4>
                  <div className="chain-flow">
                    {activeChain.nodes.map((node, nIdx) => (
                      <div key={nIdx} className="chain-node">
                        <small>{node.gen}</small>
                        <strong>{node.name}</strong>
                        <span>{node.info}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Roster of Family Figures */}
            <h3 style={{ margin: "0 0 12px", fontSize: "1.45rem" }}>
              מאגר הדמויות המוצלב: שושלות אלבז, זנו, אמזלג, שריקי ואילון
            </h3>

            <div className="story-filter-bar">
              <input
                type="search"
                className="story-search-input"
                placeholder="חיפוש דמות לפי שם, עיר, שנה או בית עלמין..."
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                aria-label="חיפוש דמות"
              />
              <div className="branch-chips-scroll">
                <button
                  type="button"
                  className={`branch-chip ${branchFilter === "all" ? "active" : ""}`}
                  onClick={() => setBranchFilter("all")}
                  aria-pressed={branchFilter === "all"}
                >
                  כל הענפים ({data.peopleRoster.length})
                </button>
                <button
                  type="button"
                  className={`branch-chip ${branchFilter === "elbaz" ? "active" : ""}`}
                  onClick={() => setBranchFilter("elbaz")}
                  aria-pressed={branchFilter === "elbaz"}
                >
                  אלבז וזנו
                </button>
                <button
                  type="button"
                  className={`branch-chip ${branchFilter === "amzalag" ? "active" : ""}`}
                  onClick={() => setBranchFilter("amzalag")}
                  aria-pressed={branchFilter === "amzalag"}
                >
                  אמזלג ושריקי
                </button>
                <button
                  type="button"
                  className={`branch-chip ${branchFilter === "eilon" ? "active" : ""}`}
                  onClick={() => setBranchFilter("eilon")}
                  aria-pressed={branchFilter === "eilon"}
                >
                  דור האיחוד (אילון)
                </button>
              </div>

              {canEdit && (
                <button
                  type="button"
                  className="button primary"
                  style={{ minHeight: "38px", fontSize: "0.85rem" }}
                  onClick={() => {
                    const newP: RosterPerson = {
                      key: `person_${Date.now()}`,
                      name: "שם הדמות",
                      branch: "elbaz",
                      branchLabel: "שושלת אלבז",
                      dates: "שנים / עיר",
                      burial: "מקום קבורה",
                      bio: "ביוגרפיה ותיאור...",
                      rel: "קשרי משפחה",
                    };
                    const next = { ...data, peopleRoster: [newP, ...data.peopleRoster] };
                    setData(next);
                    setHasUnsavedChanges(true);
                    setEditingPerson({ index: 0, draft: newP });
                  }}
                >
                  + הוסף דמות חדשה
                </button>
              )}
            </div>

            <div className="roster-grid">
              {filteredRoster.map((p, idx) => (
                <article
                  key={p.key || idx}
                  className="member-card"
                  onClick={() => setSelectedPerson(p)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setSelectedPerson(p);
                  }}
                >
                  <div>
                    <div className="member-top">
                      <h4>{p.name}</h4>
                      <span className="wing-tag" style={{ background: "#f2ebe0", color: "#163a47", margin: 0 }}>
                        {p.branchLabel}
                      </span>
                    </div>
                    <div className="member-dates">{p.dates}</div>
                    <p className="member-bio">{p.bio}</p>
                  </div>
                  <div className="member-foot">
                    <span>📍 {p.burial}</span>
                    <strong style={{ color: "#b86b28" }}>לכרטיס המלא ←</strong>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* PERSON DETAILS MODAL */}
      {selectedPerson && (
        <div className="stories-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setSelectedPerson(null)}>
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <div>
                <span className="wing-tag" style={{ background: "#f5e4d2", color: "#b86b28" }}>
                  {selectedPerson.branchLabel}
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "1.5rem" }}>{selectedPerson.name}</h3>
              </div>
              <button
                type="button"
                className="stories-modal-close"
                onClick={() => setSelectedPerson(null)}
                aria-label="סגור חלון"
              >
                ✕
              </button>
            </div>

            {storyPortraits[selectedPerson.key] && (
              <div style={{ textAlign: "center", marginBottom: "16px" }}>
                <img
                  src={storyPortraits[selectedPerson.key]}
                  alt={selectedPerson.name}
                  style={{
                    width: "120px",
                    height: "120px",
                    borderRadius: "50%",
                    objectFit: "cover",
                    border: "3px solid #b86b28",
                    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
                  }}
                />
              </div>
            )}

            <p style={{ color: "#b86b28", fontWeight: 700, margin: "0 0 12px" }}>{selectedPerson.dates}</p>
            <p style={{ margin: "0 0 16px", fontSize: "1rem", lineHeight: 1.6 }}>{selectedPerson.bio}</p>

            <div style={{ background: "#f2ebe0", padding: "14px 16px", borderRadius: "12px", marginBottom: "12px" }}>
              <strong>קשרי משפחה בעץ:</strong>
              <br />
              <span style={{ fontSize: "0.92rem", color: "var(--muted)" }}>{selectedPerson.rel}</span>
            </div>

            <div style={{ background: "#f2ebe0", padding: "14px 16px", borderRadius: "12px", marginBottom: "18px" }}>
              <strong>מקום קבורה / מושב:</strong>
              <br />
              <span style={{ fontSize: "0.92rem", color: "var(--muted)" }}>{selectedPerson.burial}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <Link
                href={
                  selectedPerson.key === "bentzion"
                    ? "/?person=80"
                    : selectedPerson.key === "yaakov"
                    ? "/?person=30"
                    : selectedPerson.key === "miriam"
                    ? "/?person=12"
                    : selectedPerson.key === "moshe_m"
                    ? "/?person=23"
                    : selectedPerson.key === "perla"
                    ? "/?person=24"
                    : selectedPerson.key === "yitzhak_livnat"
                    ? "/?person=2"
                    : selectedPerson.key === "elazar"
                    ? "/?person=87"
                    : selectedPerson.key === "eliyahu"
                    ? "/?person=72"
                    : selectedPerson.key === "yosef_k"
                    ? "/?person=81"
                    : selectedPerson.key === "yosef_am"
                    ? "/?person=85"
                    : selectedPerson.key === "moshe_d"
                    ? "/?person=82"
                    : "/"
                }
                className="wing-cta"
                style={{ textDecoration: "none", background: "#163a47", color: "#fff" }}
              >
                🌳 צפה בעץ המשפחה
              </Link>

              {canEdit && (
                <button
                  type="button"
                  className="edit-action-btn"
                  onClick={() => {
                    const idx = data.peopleRoster.findIndex((p) => p.key === selectedPerson.key);
                    if (idx !== -1) {
                      setEditingPerson({ index: idx, draft: { ...selectedPerson } });
                      setSelectedPerson(null);
                    }
                  }}
                >
                  ✏️ ערוך דמות זו
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EMBED & EXPORT MODAL */}
      {embedModalOpen && (
        <div className="stories-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEmbedModalOpen(false)}>
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <div>
                <span className="wing-tag" style={{ background: "#dce8ec", color: "#163a47" }}>
                  שילוב בעץ המשפחתי
                </span>
                <h3 style={{ margin: "4px 0 0", fontSize: "1.4rem" }}>הטמעה וייצוא JSON</h3>
              </div>
              <button
                type="button"
                className="stories-modal-close"
                onClick={() => setEmbedModalOpen(false)}
                aria-label="סגור חלון"
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: "0.92rem" }}>
              הסיפורים, הדמויות והתחנות ההיסטוריות זמינים לייצוא מלא במבנה JSON או כקישור ישיר לעמוד זה:
            </p>

            <div style={{ display: "grid", gap: "12px" }}>
              <button
                type="button"
                className="wing-cta"
                style={{ width: "100%", textAlign: "center", background: "#163a47", color: "#fff" }}
                onClick={() => {
                  copyToClipboard(JSON.stringify(data, null, 2), "נתוני הסיפורים הועתקו ללוח בפורמט JSON!");
                }}
              >
                📋 העתק JSON מלא של שושלות אלבז ואמזלג
              </button>

              <button
                type="button"
                className="wing-cta"
                style={{ width: "100%", textAlign: "center", background: "#b86b28", color: "#fff" }}
                onClick={() => {
                  const url = typeof window !== "undefined" ? window.location.href : "https://family-tree-kappa-wine.vercel.app/stories";
                  copyToClipboard(url, "קישור ישיר לעמוד הסיפורים הועתק ללוח!");
                }}
              >
                🔗 העתק קישור ישיר לעמוד זה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER PASSCODE MODAL */}
      {managePasswordOpen && (
        <div
          className="stories-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setManagePasswordOpen(false)}
        >
          <div className="stories-modal-card" style={{ maxWidth: "440px" }} onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <div>
                <h3 style={{ margin: 0, fontSize: "1.3rem" }}>כניסה לעריכת הסיפורים</h3>
                <small style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                  הזן את סיסמת המנהל של האתר כדי לערוך את הסיפורים, התחנות והדמויות.
                </small>
              </div>
              <button
                type="button"
                className="stories-modal-close"
                onClick={() => setManagePasswordOpen(false)}
                aria-label="סגור חלון"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit}>
              <div className="edit-form-field">
                <label htmlFor="stories-passcode">סיסמת מנהל</label>
                <input
                  id="stories-passcode"
                  type="password"
                  autoFocus
                  placeholder="הזן סיסמת מנהל..."
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>

              {passwordError && (
                <p style={{ color: "#b91c1c", fontSize: "0.85rem", margin: "0 0 12px" }}>{passwordError}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" className="button ghost" onClick={() => setManagePasswordOpen(false)}>
                  ביטול
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={passwordSubmitting || !passwordInput.trim()}
                >
                  {passwordSubmitting ? "מאמת..." : "אישור וכניסה"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CHAPTER MODAL */}
      {editingChapter && (
        <div
          className="stories-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingChapter(null)}
        >
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <h3 style={{ margin: 0 }}>עריכת פרק</h3>
              <button type="button" className="stories-modal-close" onClick={() => setEditingChapter(null)}>
                ✕
              </button>
            </div>

            <div className="edit-form-field">
              <label>תקופה (למשל: פרק א׳ · 1785–1850)</label>
              <input
                type="text"
                value={editingChapter.draft.era}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: { ...editingChapter.draft, era: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>מיקום (למשל: דמנאת, מרוקו)</label>
              <input
                type="text"
                value={editingChapter.draft.loc}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: { ...editingChapter.draft, loc: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>כותרת הפרק</label>
              <input
                type="text"
                value={editingChapter.draft.title}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: { ...editingChapter.draft, title: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>תוכן הפרק (כל פסקה בשורה נפרדת)</label>
              <textarea
                rows={6}
                value={editingChapter.draft.body.join("\n\n")}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: {
                      ...editingChapter.draft,
                      body: e.target.value.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>ציטוט מרכזי (אופציונלי)</label>
              <input
                type="text"
                value={editingChapter.draft.quote}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: { ...editingChapter.draft, quote: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>מקור הציטוט (אופציונלי)</label>
              <input
                type="text"
                value={editingChapter.draft.cite}
                onChange={(e) =>
                  setEditingChapter({
                    ...editingChapter,
                    draft: { ...editingChapter.draft, cite: e.target.value },
                  })
                }
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" className="button ghost" onClick={() => setEditingChapter(null)}>
                ביטול
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const branchKey = editingChapter.branch === "elbaz" ? "elbazChapters" : "amzalagChapters";
                  const nextChapters = [...data[branchKey]];
                  nextChapters[editingChapter.index] = editingChapter.draft;
                  setData({ ...data, [branchKey]: nextChapters });
                  setHasUnsavedChanges(true);
                  setEditingChapter(null);
                  showToast("הפרק עודכן! זכור ללחוץ על 'שמור שינויים'.");
                }}
              >
                שמור פרק
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT STATION MODAL */}
      {editingStation && (
        <div
          className="stories-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingStation(null)}
        >
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <h3 style={{ margin: 0 }}>עריכת תחנה גיאוגרפית</h3>
              <button type="button" className="stories-modal-close" onClick={() => setEditingStation(null)}>
                ✕
              </button>
            </div>

            <div className="edit-form-field">
              <label>שם התחנה</label>
              <input
                type="text"
                value={editingStation.draft.name}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: { ...editingStation.draft, name: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>אזור / ארץ</label>
              <input
                type="text"
                value={editingStation.draft.region}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: { ...editingStation.draft, region: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>ענף / הקשר</label>
              <input
                type="text"
                value={editingStation.draft.branch}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: { ...editingStation.draft, branch: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>תיאור היסטורי</label>
              <textarea
                rows={5}
                value={editingStation.draft.desc}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: { ...editingStation.draft, desc: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>דמויות בתחנה זו (מופרדות בפסיקים או שורות חדשות)</label>
              <textarea
                rows={3}
                value={editingStation.draft.figures.join("\n")}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: {
                      ...editingStation.draft,
                      figures: e.target.value.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean),
                    },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>ציוני זיכרון ובתי עלמין</label>
              <input
                type="text"
                value={editingStation.draft.memorial}
                onChange={(e) =>
                  setEditingStation({
                    ...editingStation,
                    draft: { ...editingStation.draft, memorial: e.target.value },
                  })
                }
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" className="button ghost" onClick={() => setEditingStation(null)}>
                ביטול
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const nextStations = [...data.geoStations];
                  nextStations[editingStation.index] = editingStation.draft;
                  setData({ ...data, geoStations: nextStations });
                  setHasUnsavedChanges(true);
                  setEditingStation(null);
                  showToast("התחנה עודכנה! זכור ללחוץ על 'שמור שינויים'.");
                }}
              >
                שמור תחנה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PERSON MODAL */}
      {editingPerson && (
        <div
          className="stories-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingPerson(null)}
        >
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <h3 style={{ margin: 0 }}>עריכת דמות</h3>
              <button type="button" className="stories-modal-close" onClick={() => setEditingPerson(null)}>
                ✕
              </button>
            </div>

            <div className="edit-form-field">
              <label>שם מלא ותואר</label>
              <input
                type="text"
                value={editingPerson.draft.name}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, name: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>ענף</label>
              <select
                value={editingPerson.draft.branch}
                onChange={(e) => {
                  const b = e.target.value as "elbaz" | "amzalag" | "eilon";
                  const bLabel =
                    b === "elbaz" ? "שושלת אלבז" : b === "amzalag" ? "שושלת אמזלג" : "דור האיחוד";
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, branch: b, branchLabel: bLabel },
                  });
                }}
              >
                <option value="elbaz">אלבז וזנו</option>
                <option value="amzalag">אמזלג ושריקי</option>
                <option value="eilon">דור האיחוד (אילון)</option>
              </select>
            </div>

            <div className="edit-form-field">
              <label>תאריכים ושנים</label>
              <input
                type="text"
                value={editingPerson.draft.dates}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, dates: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>מקום קבורה / מושב</label>
              <input
                type="text"
                value={editingPerson.draft.burial}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, burial: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>ביוגרפיה ותיאור</label>
              <textarea
                rows={5}
                value={editingPerson.draft.bio}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, bio: e.target.value },
                  })
                }
              />
            </div>

            <div className="edit-form-field">
              <label>קשרי משפחה בעץ</label>
              <input
                type="text"
                value={editingPerson.draft.rel}
                onChange={(e) =>
                  setEditingPerson({
                    ...editingPerson,
                    draft: { ...editingPerson.draft, rel: e.target.value },
                  })
                }
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" className="button ghost" onClick={() => setEditingPerson(null)}>
                ביטול
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  const nextRoster = [...data.peopleRoster];
                  nextRoster[editingPerson.index] = editingPerson.draft;
                  setData({ ...data, peopleRoster: nextRoster });
                  setHasUnsavedChanges(true);
                  setEditingPerson(null);
                  showToast("הדמות עודכנה! זכור ללחוץ על 'שמור שינויים'.");
                }}
              >
                שמור דמות
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HERO STATS MODAL */}
      {editingStats && (
        <div className="stories-modal-backdrop" role="dialog" aria-modal="true" onClick={() => setEditingStats(false)}>
          <div className="stories-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="stories-modal-header">
              <h3 style={{ margin: 0 }}>עריכת נתוני פתיחה וכותרות</h3>
              <button type="button" className="stories-modal-close" onClick={() => setEditingStats(false)}>
                ✕
              </button>
            </div>

            <div className="edit-form-field">
              <label>כותרת ראשית</label>
              <input
                type="text"
                value={data.title}
                onChange={(e) => setData({ ...data, title: e.target.value })}
              />
            </div>

            <div className="edit-form-field">
              <label>תת-כותרת / תיאור</label>
              <textarea
                rows={3}
                value={data.subtitle}
                onChange={(e) => setData({ ...data, subtitle: e.target.value })}
              />
            </div>

            <div className="edit-form-field">
              <label>תגית כותרת</label>
              <input
                type="text"
                value={data.heroBadge}
                onChange={(e) => setData({ ...data, heroBadge: e.target.value })}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className="edit-form-field">
                <label>דורות</label>
                <input
                  type="text"
                  value={statsDraft.generations}
                  onChange={(e) => setStatsDraft({ ...statsDraft, generations: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>תיאור דורות</label>
                <input
                  type="text"
                  value={statsDraft.generationsDesc}
                  onChange={(e) => setStatsDraft({ ...statsDraft, generationsDesc: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>ענפים</label>
                <input
                  type="text"
                  value={statsDraft.branches}
                  onChange={(e) => setStatsDraft({ ...statsDraft, branches: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>תיאור ענפים</label>
                <input
                  type="text"
                  value={statsDraft.branchesDesc}
                  onChange={(e) => setStatsDraft({ ...statsDraft, branchesDesc: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>שנות עלייה</label>
                <input
                  type="text"
                  value={statsDraft.aliyahWaves}
                  onChange={(e) => setStatsDraft({ ...statsDraft, aliyahWaves: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>תיאור גלי עלייה</label>
                <input
                  type="text"
                  value={statsDraft.aliyahWavesDesc}
                  onChange={(e) => setStatsDraft({ ...statsDraft, aliyahWavesDesc: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>מספר דמויות</label>
                <input
                  type="text"
                  value={statsDraft.figuresCount}
                  onChange={(e) => setStatsDraft({ ...statsDraft, figuresCount: e.target.value })}
                />
              </div>
              <div className="edit-form-field">
                <label>תיאור דמויות</label>
                <input
                  type="text"
                  value={statsDraft.figuresCountDesc}
                  onChange={(e) => setStatsDraft({ ...statsDraft, figuresCountDesc: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <button type="button" className="button ghost" onClick={() => setEditingStats(false)}>
                ביטול
              </button>
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  setData({ ...data, stats: statsDraft });
                  setHasUnsavedChanges(true);
                  setEditingStats(false);
                  showToast("הנתונים עודכנו! זכור ללחוץ על 'שמור שינויים'.");
                }}
              >
                שמור נתונים
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toastMessage && <div className="stories-toast">{toastMessage}</div>}
    </div>
  );
}
