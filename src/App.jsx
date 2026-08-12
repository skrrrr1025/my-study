// =====================================================================
//  src/App.jsx — 외우자 (Firebase 버전)
//  기능: 로그인 · Firestore 저장 · 공유 라이브러리
//        문제 개수 선택 · 오답 보기 개선 · 틀린 것만 다시
//        + 다크모드(기기 저장) · 카드 시작화면(순서/섞기) · 책갈피(이어보기)
//        + 편집 검색 · 틀린 단어 강조 · 틀린 것만 모아보기
// =====================================================================
import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  Plus, Upload, Shuffle, Check, X, ChevronRight, Trash2, Share2, Library,
  Pencil, RotateCcw, Sparkles, ArrowLeft, FileSpreadsheet, GraduationCap,
  Layers, Download, Info, LogOut, Mail, Lock, Sun, Moon, Bookmark, List,
  Search,
} from "lucide-react";
import {
  auth, getMyRooms, saveMyRooms, listPublic,
  getPublicDeck, publishDeck, unpublishDeck,
} from "./api";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const PALETTE = {
  yellow: { name: "노랑", mark: "#FFE58A", ink: "#7A5B00", soft: "#FFF8E1" },
  pink:   { name: "분홍", mark: "#FBBAD0", ink: "#9B2456", soft: "#FDECF2" },
  mint:   { name: "민트", mark: "#A8E9CC", ink: "#0F7A52", soft: "#E6F8F0" },
  sky:    { name: "하늘", mark: "#AED4FF", ink: "#175BA0", soft: "#E7F2FF" },
  grape:  { name: "보라", mark: "#D3C2F6", ink: "#673BB0", soft: "#F1EBFC" },
  coral:  { name: "코랄", mark: "#FFC2A6", ink: "#B23F17", soft: "#FFECE1" },
};
const COLOR_KEYS = Object.keys(PALETTE);

const isMastered = (s) => s && (s.correct || 0) >= 2 && (s.correct || 0) > (s.wrong || 0);
const isStruggling = (s) => s && (s.wrong || 0) > 0 && !isMastered(s);
const masteryOf = (room) => {
  if (!room.cards.length) return 0;
  const stats = room.stats || {};
  const m = room.cards.filter((c) => isMastered(stats[c.id])).length;
  return Math.round((m / room.cards.length) * 100);
};
const strugglingCards = (room) => {
  const stats = room.stats || {};
  return room.cards.filter((c) => isStruggling(stats[c.id]));
};

/* ------------------------------------------------------------------ */
/*  Root: auth gate + theme                                            */
/* ------------------------------------------------------------------ */
export default function App() {
  const [user, setUser] = useState(undefined);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("wjmz-theme") || "light"; } catch { return "light"; }
  });
  const toggleTheme = () => setTheme((t) => {
    const nt = t === "dark" ? "light" : "dark";
    try { localStorage.setItem("wjmz-theme", nt); } catch {}
    return nt;
  });

  useEffect(() => {
    auth.getSession().then(setUser);
    const off = auth.onChange(setUser);
    return off;
  }, []);

  if (user === undefined) {
    return <Shell theme={theme}><div className="center-screen"><div className="pulse">불러오는 중…</div></div></Shell>;
  }
  if (!user) {
    return <Shell theme={theme}><AuthScreen theme={theme} onToggleTheme={toggleTheme} /></Shell>;
  }
  return <StudyApp key={user.uid} email={user.email} theme={theme} onToggleTheme={toggleTheme} onSignOut={() => auth.signOut()} />;
}

function ThemeToggle({ theme, onToggle, className = "" }) {
  return (
    <button className={"theme-toggle " + className} onClick={onToggle} aria-label="테마 전환" title="라이트/다크 전환">
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Auth screen                                                        */
/* ------------------------------------------------------------------ */
function translateAuthError(code = "") {
  const c = String(code);
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found"))
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  if (c.includes("email-already-in-use")) return "이미 가입된 이메일이에요. 로그인해 주세요.";
  if (c.includes("weak-password")) return "비밀번호는 6자 이상이어야 해요.";
  if (c.includes("invalid-email")) return "이메일 형식을 확인해 주세요.";
  if (c.includes("too-many-requests")) return "시도가 많았어요. 잠시 후 다시 시도해 주세요.";
  if (c.includes("network")) return "네트워크 연결을 확인해 주세요.";
  return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}

function AuthScreen({ theme, onToggleTheme }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (busy) return;
    setErr(null); setBusy(true);
    try {
      if (mode === "signup") await auth.signUp(email.trim(), pw);
      else await auth.signIn(email.trim(), pw);
    } catch (e) {
      setErr(translateAuthError(e.code || e.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="auth-toggle" />
      <div className="auth-head">
        <span className="brand-mark">외우자</span>
        <p className="auth-lead">엑셀을 암기 카드와 문제로 바꿔주는 공부방</p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button className={"auth-tab" + (mode === "signin" ? " on" : "")} onClick={() => { setMode("signin"); setErr(null); }}>로그인</button>
          <button className={"auth-tab" + (mode === "signup" ? " on" : "")} onClick={() => { setMode("signup"); setErr(null); }}>회원가입</button>
        </div>

        <div className="auth-field">
          <Mail size={17} />
          <input className="auth-input" type="email" placeholder="이메일" autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="auth-field">
          <Lock size={17} />
          <input className="auth-input" type="password" placeholder="비밀번호 (6자 이상)"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>

        {err && <p className="auth-err">{err}</p>}

        <button className="btn primary full" disabled={busy} onClick={submit}>
          {busy ? "잠시만요…" : mode === "signup" ? "가입하고 시작하기" : "로그인"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Study app (로그인 후)                                              */
/* ------------------------------------------------------------------ */
function StudyApp({ email, theme, onToggleTheme, onSignOut }) {
  const [loading, setLoading] = useState(true);
  const [persistOk, setPersistOk] = useState(true);
  const [view, setView] = useState("home");
  const [rooms, setRooms] = useState([]);
  const [pubIndex, setPubIndex] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [toast, setToast] = useState(null);

  const activeRoom = rooms.find((r) => r.id === activeId) || null;

  useEffect(() => {
    (async () => {
      const [mine, pub] = await Promise.all([getMyRooms(), listPublic()]);
      setRooms(mine);
      setPubIndex(pub);
      setLoading(false);
    })();
  }, []);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 2200); };

  const persist = useCallback(async (nextRooms) => {
    setRooms(nextRooms);
    const ok = await saveMyRooms(nextRooms);
    setPersistOk(ok);
  }, []);

  const openRoom = (id) => { setActiveId(id); setView("room"); };

  const saveRoom = async (room) => {
    const exists = rooms.some((r) => r.id === room.id);
    const next = exists ? rooms.map((r) => (r.id === room.id ? room : r)) : [room, ...rooms];
    await persist(next);
    setActiveId(room.id);
    setView("room");
  };

  const deleteRoom = async (id) => {
    const room = rooms.find((r) => r.id === id);
    if (room?.sharedId) { await unpublishDeck(room.sharedId); setPubIndex(await listPublic()); }
    await persist(rooms.filter((r) => r.id !== id));
    setView("home");
  };

  const updateStats = async (roomId, results) => {
    const next = rooms.map((r) => {
      if (r.id !== roomId) return r;
      const stats = { ...(r.stats || {}) };
      Object.entries(results).forEach(([cid, d]) => {
        const cur = stats[cid] || { correct: 0, wrong: 0 };
        stats[cid] = {
          correct: (cur.correct || 0) + (d.correct || 0),
          wrong: (cur.wrong || 0) + (d.wrong || 0),
        };
      });
      return { ...r, stats, updatedAt: Date.now() };
    });
    await persist(next);
  };

  const setBookmark = async (roomId, index) => {
    await persist(rooms.map((r) => (r.id === roomId ? { ...r, lastIndex: index } : r)));
  };

  const resetProgress = async (roomId) => {
    await persist(rooms.map((r) => (r.id === roomId ? { ...r, stats: {}, lastIndex: 0 } : r)));
    flash("진도를 초기화했어요");
  };

  const share = async (room) => {
    const id = await publishDeck(room);
    if (!id) { flash("공유에 실패했어요"); return; }
    await persist(rooms.map((r) => (r.id === room.id ? { ...r, sharedId: id } : r)));
    setPubIndex(await listPublic());
    flash("라이브러리에 공유했어요");
  };

  const unshare = async (room) => {
    if (!room.sharedId) return;
    await unpublishDeck(room.sharedId);
    await persist(rooms.map((r) => (r.id === room.id ? { ...r, sharedId: null } : r)));
    setPubIndex(await listPublic());
    flash("공유를 취소했어요");
  };

  const cloneFromLibrary = async (meta) => {
    const pub = await getPublicDeck(meta.sharedId);
    if (!pub) { flash("이 자료를 더 이상 불러올 수 없어요"); return; }
    const room = {
      id: uid(),
      name: pub.name + " (복사본)",
      subject: pub.subject || "",
      color: pub.color || "sky",
      cards: (pub.cards || []).map((c) => ({ id: uid(), front: c.front, back: c.back })),
      stats: {}, sharedId: null, lastIndex: 0, updatedAt: Date.now(),
    };
    await persist([room, ...rooms]);
    setActiveId(room.id);
    setView("room");
    flash("내 방에 담았어요");
  };

  const loadDemo = async () => {
    const demo = {
      id: uid(), name: "한국사 핵심 연도", subject: "한국사", color: "coral",
      cards: [
        { id: uid(), front: "훈민정음 반포 연도", back: "1446년" },
        { id: uid(), front: "임진왜란 발발", back: "1592년" },
        { id: uid(), front: "병자호란 발발", back: "1636년" },
        { id: uid(), front: "갑오개혁", back: "1894년" },
        { id: uid(), front: "3·1 운동", back: "1919년" },
        { id: uid(), front: "8·15 광복", back: "1945년" },
      ],
      stats: {}, sharedId: null, lastIndex: 0, updatedAt: Date.now(),
    };
    await persist([demo, ...rooms]);
    setActiveId(demo.id);
    setView("room");
  };

  if (loading) {
    return <Shell theme={theme}><div className="center-screen"><div className="pulse">불러오는 중…</div></div></Shell>;
  }

  return (
    <Shell theme={theme}>
      {toast && <div className="toast">{toast}</div>}
      {!persistOk && <div className="warn"><Info size={14} /> 저장에 실패했어요. 네트워크나 로그인 상태를 확인해 주세요.</div>}

      {view === "home" && (
        <HomeView rooms={rooms} email={email} theme={theme} onToggleTheme={onToggleTheme}
          onOpen={openRoom}
          onNew={() => { setActiveId(null); setView("editor"); }}
          onLibrary={() => setView("library")}
          onDemo={loadDemo}
          onSignOut={onSignOut} />
      )}
      {view === "library" && (
        <LibraryView pubIndex={pubIndex} onBack={() => setView("home")} onClone={cloneFromLibrary} />
      )}
      {view === "editor" && (
        <EditorView existing={activeRoom} onCancel={() => setView(activeRoom ? "room" : "home")}
          onSave={saveRoom} flash={flash} />
      )}
      {view === "room" && activeRoom && (
        <RoomView room={activeRoom} onBack={() => setView("home")}
          onFlash={() => setView("flash")} onQuiz={() => setView("quiz")}
          onEdit={() => setView("editor")} onDelete={() => deleteRoom(activeRoom.id)}
          onShare={() => share(activeRoom)} onUnshare={() => unshare(activeRoom)}
          onReset={() => resetProgress(activeRoom.id)} />
      )}
      {view === "flash" && activeRoom && (
        <FlashView room={activeRoom} onBack={() => setView("room")}
          onResult={(res) => updateStats(activeRoom.id, res)}
          onBookmark={setBookmark} />
      )}
      {view === "quiz" && activeRoom && (
        <QuizView room={activeRoom} onBack={() => setView("room")}
          onResult={(res) => updateStats(activeRoom.id, res)} />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared UI pieces                                                   */
/* ------------------------------------------------------------------ */
function Shell({ theme, children }) {
  return (
    <div className={"app-root" + (theme === "dark" ? " dark" : "")}>
      <style>{CSS}</style>
      <div className="app-inner">{children}</div>
    </div>
  );
}

function Highlight({ color = "yellow", children }) {
  const c = PALETTE[color] || PALETTE.yellow;
  return (
    <span className="hl" style={{ background: `linear-gradient(100deg, rgba(0,0,0,0) 0.5%, ${c.mark} 1.6%, ${c.mark} 92%, rgba(0,0,0,0) 98%)` }}>
      {children}
    </span>
  );
}

function Progress({ value, color = "yellow" }) {
  const c = PALETTE[color] || PALETTE.yellow;
  return <div className="prog"><div className="prog-fill" style={{ width: `${value}%`, background: c.mark }} /></div>;
}

function TopBar({ title, onBack, onEdit, right }) {
  return (
    <div className="topbar">
      <button className="icon-btn" onClick={onBack} aria-label="뒤로"><ArrowLeft size={19} /></button>
      <span className="topbar-title">{title}</span>
      <div className="topbar-right">
        {onEdit && <button className="icon-btn" onClick={onEdit} aria-label="편집"><Pencil size={17} /></button>}
        {right}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Home                                                               */
/* ------------------------------------------------------------------ */
function HomeView({ rooms, email, theme, onToggleTheme, onOpen, onNew, onLibrary, onDemo, onSignOut }) {
  return (
    <div className="page">
      <header className="masthead">
        <div className="masthead-top">
          <span className="brand-mark">외우자</span>
          <div className="masthead-actions">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button className="signout" onClick={onSignOut} title={email}>
              <LogOut size={15} /> 로그아웃
            </button>
          </div>
        </div>
        <p className="tagline">
          엑셀을 올리면 <Highlight color="yellow">암기 카드</Highlight>와 <Highlight color="mint">문제</Highlight>로 바꿔주는 공부방
        </p>
      </header>

      <div className="row-between">
        <h2 className="section-title">내 공부방 <span className="count">{rooms.length}</span></h2>
        <button className="link-btn" onClick={onLibrary}><Library size={16} /> 공유 라이브러리</button>
      </div>

      {rooms.length === 0 ? (
        <div className="empty">
          <Layers size={30} strokeWidth={1.5} />
          <p className="empty-title">아직 공부방이 없어요</p>
          <p className="empty-sub">과목·주제별로 방을 만들고 카드를 채워보세요.</p>
          <div className="empty-actions">
            <button className="btn primary" onClick={onNew}><Plus size={17} /> 공부방 만들기</button>
            <button className="btn ghost" onClick={onDemo}><Sparkles size={16} /> 샘플로 체험</button>
          </div>
        </div>
      ) : (
        <div className="grid">
          {rooms.map((r) => {
            const c = PALETTE[r.color] || PALETTE.yellow;
            const m = masteryOf(r);
            const struggling = strugglingCards(r).length;
            return (
              <button key={r.id} className="room-card" onClick={() => onOpen(r.id)}>
                <div className="room-swatch" style={{ background: c.mark }} />
                <div className="room-body">
                  {r.subject && <span className="room-subject" style={{ color: c.ink }}>{r.subject}</span>}
                  <h3 className="room-name">{r.name}</h3>
                  <div className="room-meta">
                    <span>{r.cards.length}장</span><span className="dot">·</span><span>익힘 {m}%</span>
                    {struggling > 0 && <><span className="dot">·</span><span className="meta-wrong">틀림 {struggling}</span></>}
                    {r.sharedId && <><span className="dot">·</span><Share2 size={12} /></>}
                  </div>
                  <Progress value={m} color={r.color} />
                </div>
              </button>
            );
          })}
          <button className="room-card add" onClick={onNew}><Plus size={22} /><span>새 공부방</span></button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Library                                                            */
/* ------------------------------------------------------------------ */
function LibraryView({ pubIndex, onBack, onClone }) {
  return (
    <div className="page">
      <TopBar title="공유 라이브러리" onBack={onBack} />
      <p className="page-lead">다른 사람이 공유한 공부방을 내 방으로 담아 그대로 공부할 수 있어요.</p>
      {pubIndex.length === 0 ? (
        <div className="empty">
          <Library size={28} strokeWidth={1.5} />
          <p className="empty-title">아직 공유된 자료가 없어요</p>
          <p className="empty-sub">공부방 안의 “라이브러리에 공유”를 누르면 여기에 올라와요.</p>
        </div>
      ) : (
        <div className="grid">
          {pubIndex.map((m) => {
            const c = PALETTE[m.color] || PALETTE.sky;
            return (
              <div key={m.sharedId} className="room-card static">
                <div className="room-swatch" style={{ background: c.mark }} />
                <div className="room-body">
                  {m.subject && <span className="room-subject" style={{ color: c.ink }}>{m.subject}</span>}
                  <h3 className="room-name">{m.name}</h3>
                  <div className="room-meta"><span>{m.count}장</span></div>
                  <button className="btn small primary" onClick={() => onClone(m)}><Download size={15} /> 내 방에 담기</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editor (Excel import + 검색 + 틀린 단어 강조)                       */
/* ------------------------------------------------------------------ */
function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function EditorView({ existing, onCancel, onSave, flash }) {
  const [name, setName] = useState(existing?.name || "");
  const [subject, setSubject] = useState(existing?.subject || "");
  const [color, setColor] = useState(existing?.color || "sky");
  const [cards, setCards] = useState(existing?.cards?.map((c) => ({ ...c })) || [{ id: uid(), front: "", back: "" }]);
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true);
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState("");
  const fileRef = useRef(null);
  const stats = existing?.stats || {};

  const setCard = (id, field, val) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  const addCard = () => { setSearch(""); setCards((cs) => [...cs, { id: uid(), front: "", back: "" }]); };
  const removeCard = (id) => setCards((cs) => cs.filter((c) => c.id !== id));

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      let data = await parseFile(file);
      if (firstRowIsHeader && data.length) data = data.slice(1);
      const imported = data
        .map((r) => ({ id: uid(), front: String(r[0] ?? "").trim(), back: String(r[1] ?? "").trim() }))
        .filter((c) => c.front || c.back);
      if (!imported.length) flash("불러올 내용이 없어요. 1열=질문, 2열=답 형식인지 확인해 주세요");
      else {
        setCards((cs) => [...cs.filter((c) => c.front || c.back), ...imported]);
        flash(`${imported.length}개 카드를 불러왔어요`);
      }
    } catch { flash("파일을 읽지 못했어요. xlsx/xls/csv 파일인지 확인해 주세요"); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = () => {
    const clean = cards.map((c) => ({ ...c, front: c.front.trim(), back: c.back.trim() })).filter((c) => c.front || c.back);
    if (!name.trim()) { flash("공부방 이름을 적어주세요"); return; }
    if (!clean.length) { flash("카드를 한 장 이상 만들어주세요"); return; }
    onSave({
      id: existing?.id || uid(), name: name.trim(), subject: subject.trim(), color,
      cards: clean, stats: existing?.stats || {}, sharedId: existing?.sharedId || null,
      lastIndex: existing?.lastIndex || 0, updatedAt: Date.now(),
    });
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? cards.filter((c) => (c.front + " " + c.back).toLowerCase().includes(q))
    : cards;

  return (
    <div className="page">
      <TopBar title={existing ? "공부방 편집" : "새 공부방"} onBack={onCancel} />

      <div className="field">
        <label>이름</label>
        <input className="input" value={name} placeholder="예) 생명과학 세포 소기관" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>과목 · 주제</label>
        <input className="input" value={subject} placeholder="예) 생명과학" onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="field">
        <label>형광펜 색</label>
        <div className="swatches">
          {COLOR_KEYS.map((k) => (
            <button key={k} type="button" className={"swatch" + (color === k ? " on" : "")}
              style={{ background: PALETTE[k].mark }} onClick={() => setColor(k)} aria-label={PALETTE[k].name} />
          ))}
        </div>
      </div>

      <div className="import-box">
        <div className="import-head">
          <FileSpreadsheet size={18} />
          <div>
            <p className="import-title">엑셀 · CSV 불러오기</p>
            <p className="import-sub">1열은 질문(앞면), 2열은 답(뒷면)</p>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={firstRowIsHeader} onChange={(e) => setFirstRowIsHeader(e.target.checked)} />
          첫 번째 줄은 제목 줄(건너뛰기)
        </label>
        <button className="btn ghost full" disabled={importing} onClick={() => fileRef.current?.click()}>
          <Upload size={16} /> {importing ? "읽는 중…" : "파일 선택"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={handleFile} />
      </div>

      <div className="row-between tight">
        <h3 className="section-title sm">카드 <span className="count">{cards.length}</span></h3>
        <button className="link-btn" onClick={addCard}><Plus size={15} /> 카드 추가</button>
      </div>

      {cards.length > 6 && (
        <div className="search-field">
          <Search size={16} />
          <input className="search-input" value={search} placeholder="카드 검색 (질문·답)"
            onChange={(e) => setSearch(e.target.value)} />
          {search && <button className="icon-btn sm" onClick={() => setSearch("")}><X size={15} /></button>}
        </div>
      )}
      {q && <p className="search-count">{visible.length}개 찾음</p>}

      <div className="card-list">
        {visible.map((c) => {
          const idx = cards.findIndex((x) => x.id === c.id);
          const s = stats[c.id];
          const state = isMastered(s) ? " mastered" : (isStruggling(s) ? " wrong" : "");
          return (
            <div key={c.id} className={"edit-card" + state}>
              <span className="edit-idx">{idx + 1}</span>
              <div className="edit-fields">
                <input className="input flat" value={c.front} placeholder="질문 / 앞면" onChange={(e) => setCard(c.id, "front", e.target.value)} />
                <div className="edit-divider" />
                <input className="input flat" value={c.back} placeholder="답 / 뒷면" onChange={(e) => setCard(c.id, "back", e.target.value)} />
              </div>
              <button className="icon-btn" onClick={() => removeCard(c.id)} aria-label="삭제"><X size={16} /></button>
            </div>
          );
        })}
        {visible.length === 0 && <p className="search-count">검색 결과가 없어요.</p>}
      </div>

      <div className="sticky-actions">
        <button className="btn ghost" onClick={onCancel}>취소</button>
        <button className="btn primary grow" onClick={save}><Check size={17} /> 저장하기</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Room detail                                                        */
/* ------------------------------------------------------------------ */
function RoomView({ room, onBack, onFlash, onQuiz, onEdit, onDelete, onShare, onUnshare, onReset }) {
  const c = PALETTE[room.color] || PALETTE.yellow;
  const m = masteryOf(room);
  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <div className="page">
      <TopBar title="" onBack={onBack} onEdit={onEdit} />
      <div className="room-hero" style={{ background: c.soft }}>
        {room.subject && <span className="hero-subject" style={{ color: c.ink }}>{room.subject}</span>}
        <h1 className="hero-name">{room.name}</h1>
        <div className="hero-stats">
          <div><strong>{room.cards.length}</strong><span>카드</span></div>
          <div><strong>{m}%</strong><span>익힘</span></div>
        </div>
        <Progress value={m} color={room.color} />
      </div>

      <div className="study-actions">
        <button className="study-btn" onClick={onFlash} style={{ borderColor: c.mark }}>
          <Layers size={20} /><div><strong>카드 넘기기</strong><span>앞뒤 보며 암기</span></div>
        </button>
        <button className="study-btn" onClick={onQuiz} style={{ borderColor: c.mark }}>
          <GraduationCap size={20} /><div><strong>문제 풀기</strong><span>객관식으로 확인</span></div>
        </button>
      </div>

      <div className="room-tools">
        {room.sharedId
          ? <button className="tool" onClick={onUnshare}><Share2 size={15} /> 공유 취소</button>
          : <button className="tool" onClick={onShare}><Share2 size={15} /> 라이브러리에 공유</button>}
        <button className="tool" onClick={onReset}><RotateCcw size={15} /> 진도 초기화</button>
        <button className="tool danger" onClick={() => setConfirmDel(true)}><Trash2 size={15} /> 삭제</button>
      </div>

      {confirmDel && (
        <div className="confirm">
          <p>이 공부방을 삭제할까요? 되돌릴 수 없어요.</p>
          <div className="confirm-actions">
            <button className="btn ghost" onClick={() => setConfirmDel(false)}>취소</button>
            <button className="btn danger" onClick={onDelete}>삭제</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Flashcards — 시작화면(순서/섞기/이어보기/틀린것만) + 책갈피         */
/* ------------------------------------------------------------------ */
function FlashView({ room, onBack, onResult, onBookmark }) {
  const c = PALETTE[room.color] || PALETTE.yellow;
  const [config, setConfig] = useState(null);
  const wrong = strugglingCards(room);
  const hasBookmark = Number.isInteger(room.lastIndex) && room.lastIndex > 0 && room.lastIndex < room.cards.length;

  if (room.cards.length === 0) {
    return (
      <div className="page">
        <TopBar title="카드 넘기기" onBack={onBack} />
        <div className="empty"><p className="empty-title">카드가 없어요</p>
          <p className="empty-sub">편집에서 카드를 추가해 주세요.</p></div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="page">
        <TopBar title="카드 넘기기" onBack={onBack} />
        <div className="setup-hero" style={{ background: c.soft }}>
          <p className="setup-lead">어떻게 볼까요?</p>
          <p className="setup-sub" style={{ color: c.ink }}>전체 {room.cards.length}장</p>
        </div>
        <div className="setup-list">
          {hasBookmark && (
            <button className="setup-row" onClick={() => setConfig({ deck: room.cards, start: room.lastIndex, track: true })}>
              <Bookmark size={18} /><div><strong>이어보기</strong><span>{room.lastIndex + 1}번부터 이어서</span></div>
            </button>
          )}
          <button className="setup-row" onClick={() => setConfig({ deck: room.cards, start: 0, track: true })}>
            <List size={18} /><div><strong>처음부터</strong><span>1번부터 순서대로</span></div>
          </button>
          <button className="setup-row" onClick={() => setConfig({ deck: shuffle(room.cards), start: 0, track: false })}>
            <Shuffle size={18} /><div><strong>섞어서</strong><span>무작위 순서로</span></div>
          </button>
          {wrong.length > 0 && (
            <button className="setup-row" onClick={() => setConfig({ deck: wrong, start: 0, track: false })}>
              <X size={18} /><div><strong>틀린 단어만</strong><span>{wrong.length}개 집중 복습</span></div>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <FlashSession room={room} deck={config.deck} startAt={config.start} track={config.track}
      onExit={onBack} onResult={onResult} onBookmark={onBookmark} />
  );
}

function FlashSession({ room, deck, startAt, track, onExit, onResult, onBookmark }) {
  const [i, setI] = useState(startAt || 0);
  const [flipped, setFlipped] = useState(false);
  const [results, setResults] = useState({});
  const [done, setDone] = useState(false);
  const c = PALETTE[room.color] || PALETTE.yellow;
  const card = deck[i];

  const exit = () => {
    if (track && !done) onBookmark(room.id, i); // 나갈 때 현재 위치 저장
    onExit();
  };

  const mark = (known) => {
    const nextRes = { ...results, [card.id]: known ? { correct: 1 } : { wrong: 1 } };
    setResults(nextRes);
    if (i + 1 >= deck.length) {
      onResult(nextRes);
      if (track) onBookmark(room.id, 0); // 끝까지 봤으면 책갈피 리셋
      setDone(true);
    } else {
      setI(i + 1); setFlipped(false);
    }
  };

  const again = () => { setI(0); setFlipped(false); setResults({}); setDone(false); };

  useEffect(() => {
    const onKey = (e) => {
      if (done) return;
      if (e.code === "Space") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.code === "ArrowRight") mark(true);
      if (e.code === "ArrowLeft") mark(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    const known = Object.values(results).filter((r) => r.correct).length;
    return <SessionDone title="한 바퀴 끝!" lines={[`${deck.length}장 중 `, `${known}장`, ` 익힘 표시`]}
      color={room.color} onAgain={again} onBack={onExit} />;
  }

  return (
    <div className="page study">
      <TopBar title={`${i + 1} / ${deck.length}`} onBack={exit} />
      <div className="flash-stage" onClick={() => setFlipped((f) => !f)}>
        <div className={"flashcard" + (flipped ? " flipped" : "")}>
          <div className="face front">
            <span className="face-tag">질문</span>
            <p className="face-text">{card.front || "—"}</p>
            <span className="tap-hint">눌러서 뒤집기</span>
          </div>
          <div className="face back" style={{ background: c.soft }}>
            <span className="face-tag" style={{ color: c.ink }}>답</span>
            <p className="face-text">{card.back || "—"}</p>
          </div>
        </div>
      </div>
      <div className="flash-controls">
        <button className="grade wrong" onClick={() => mark(false)}><X size={18} /> 아직</button>
        <button className="grade right" onClick={() => mark(true)}><Check size={18} /> 외웠어요</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quiz — 개수 선택 + 오답 개선 + 틀린 것만                            */
/* ------------------------------------------------------------------ */
function pickSmartDistractors(target, pool, need = 3) {
  const cleanNum = (s) => String(s).replace(/[^\d]/g, "");
  const isNum = (s) => /\d/.test(String(s)) && /^[\d,\s년월일.]+$/.test(String(s));
  const num = (s) => parseInt(cleanNum(s), 10);
  const t = String(target);

  const scored = pool.map((o) => {
    const os = String(o);
    let score = Math.random();
    if (isNum(t) && isNum(os)) {
      const d = Math.abs(num(t) - num(os));
      if (!Number.isNaN(d)) score += Math.max(0, 100 - d);
    }
    score += Math.max(0, 10 - Math.abs(t.length - os.length));
    if (t[0] && os[0] && t[0] === os[0]) score += 5;
    return { value: o, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, need).map((s) => s.value);
}

function buildQuiz(cards, onlyIds = null, max = null) {
  let pool = cards.filter((c) => c.front);
  if (onlyIds) pool = pool.filter((c) => onlyIds.includes(c.id));
  pool = shuffle(pool);
  if (max && max > 0) pool = pool.slice(0, max);
  return pool.map((c) => {
    const others = cards
      .filter((o) => o.id !== c.id && o.back && o.back !== c.back)
      .map((o) => o.back);
    const uniqueOthers = [...new Set(others)];
    const distractors = pickSmartDistractors(c.back, uniqueOthers, 3);
    return { card: c, options: shuffle([c.back, ...distractors]), mc: distractors.length >= 1 };
  });
}

function QuizSetup({ total, wrongCount, color, onBack, onStart, onStartWrong }) {
  const c = PALETTE[color] || PALETTE.yellow;
  const presets = [10, 20, 50].filter((n) => n < total);
  const [showCustom, setShowCustom] = useState(false);
  const [custom, setCustom] = useState("");

  const startCustom = () => {
    const n = parseInt(custom, 10);
    if (!n || n < 1) return;
    onStart(Math.min(n, total));
  };

  return (
    <div className="page">
      <TopBar title="문제 풀기" onBack={onBack} />
      <div className="setup-hero" style={{ background: c.soft }}>
        <p className="setup-lead">몇 문제 풀까요?</p>
        <p className="setup-sub" style={{ color: c.ink }}>이 방에서 낼 수 있는 문제 {total}개</p>
      </div>
      <div className="setup-grid">
        {presets.map((n) => (
          <button key={n} className="setup-btn" onClick={() => onStart(n)}>{n}문제</button>
        ))}
        <button className="setup-btn" onClick={() => onStart("all")}>전체 {total}문제</button>
        <button className={"setup-btn" + (showCustom ? " on" : "")} onClick={() => setShowCustom((s) => !s)}>사용자 지정</button>
      </div>
      {showCustom && (
        <div className="setup-custom">
          <input className="input" type="number" min={1} max={total} value={custom}
            placeholder={`1 ~ ${total} 사이`} onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startCustom()} />
          <button className="btn primary" onClick={startCustom}>시작</button>
        </div>
      )}
      {wrongCount > 0 && (
        <button className="btn ghost full" style={{ marginTop: 14 }} onClick={onStartWrong}>
          <X size={16} /> 틀린 단어만 풀기 ({wrongCount}개)
        </button>
      )}
    </div>
  );
}

function QuizView({ room, onBack, onResult }) {
  const answerable = room.cards.filter((c) => c.front);
  const total = answerable.length;
  const wrongCards = strugglingCards(room).filter((c) => c.front);
  const [limit, setLimit] = useState(null);
  const [quiz, setQuiz] = useState([]);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [results, setResults] = useState({});
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const c = PALETTE[room.color] || PALETTE.yellow;
  const q = quiz[i];

  const begin = (builtQuiz, lim) => {
    setLimit(lim);
    setQuiz(builtQuiz);
    setI(0); setPicked(null); setRevealed(false); setResults({}); setScore(0); setDone(false);
  };
  const start = (n) => {
    const count = n === "all" ? total : Math.min(n, total);
    begin(buildQuiz(room.cards, null, count), count);
  };
  const startWrong = () => {
    const ids = wrongCards.map((x) => x.id);
    begin(buildQuiz(room.cards, ids, null), ids.length);
  };
  const restart = (ids) => {
    begin(buildQuiz(room.cards, ids, ids ? null : limit), ids ? ids.length : limit);
  };

  if (total === 0) {
    return (
      <div className="page">
        <TopBar title="문제 풀기" onBack={onBack} />
        <div className="empty"><p className="empty-title">낼 문제가 없어요</p>
          <p className="empty-sub">질문이 있는 카드를 추가해 주세요.</p></div>
      </div>
    );
  }

  if (limit === null) {
    return <QuizSetup total={total} wrongCount={wrongCards.length} color={room.color}
      onBack={onBack} onStart={start} onStartWrong={startWrong} />;
  }

  const answer = (opt) => {
    if (picked !== null) return;
    setPicked(opt);
    const correct = opt === q.card.back;
    if (correct) setScore((s) => s + 1);
    setResults((r) => ({ ...r, [q.card.id]: correct ? { correct: 1 } : { wrong: 1 } }));
  };
  const selfGrade = (correct) => {
    if (correct) setScore((s) => s + 1);
    setResults((r) => ({ ...r, [q.card.id]: correct ? { correct: 1 } : { wrong: 1 } }));
    setPicked(correct ? q.card.back : "__wrong__");
  };
  const next = () => {
    if (i + 1 >= quiz.length) { onResult({ ...results }); setDone(true); }
    else { setI(i + 1); setPicked(null); setRevealed(false); }
  };

  if (done) {
    const pct = quiz.length ? Math.round((score / quiz.length) * 100) : 0;
    const wrong = Object.entries(results).filter(([, v]) => v.wrong).map(([id]) => id);
    return (
      <div className="page">
        <div className="done" style={{ background: c.soft }}>
          <div className="done-badge" style={{ background: c.mark }}><Check size={28} strokeWidth={2.5} /></div>
          <h2 className="done-title">{pct >= 80 ? "훌륭해요!" : pct >= 50 ? "잘 하고 있어요" : "다시 한 번!"}</h2>
          <p className="done-line">
            {quiz.length}문제 중 <Highlight color={room.color}><strong>{score}문제</strong></Highlight> 정답 · {pct}점
          </p>
          <div className="done-actions">
            {wrong.length > 0 && (
              <button className="btn primary" onClick={() => restart(wrong)}>
                <RotateCcw size={16} /> 틀린 {wrong.length}문제만 다시
              </button>
            )}
            <button className="btn ghost" onClick={() => restart(null)}>다시 풀기</button>
            <button className="btn ghost" onClick={() => setLimit(null)}>문제 수 바꾸기</button>
            <button className="btn ghost" onClick={onBack}>공부방으로</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page study">
      <TopBar title={`${i + 1} / ${quiz.length}`} onBack={onBack} />
      <div className="quiz-progress"><div className="quiz-progress-fill" style={{ width: `${(i / quiz.length) * 100}%`, background: c.mark }} /></div>
      <div className="quiz-q"><span className="face-tag">문제</span><p className="quiz-q-text">{q.card.front}</p></div>

      {q.mc ? (
        <div className="options">
          {q.options.map((opt, idx) => {
            let cls = "option";
            if (picked !== null) {
              if (opt === q.card.back) cls += " correct";
              else if (opt === picked) cls += " wrong";
              else cls += " dim";
            }
            return (
              <button key={idx} className={cls} disabled={picked !== null} onClick={() => answer(opt)}>
                <span className="opt-key">{String.fromCharCode(65 + idx)}</span>
                <span className="opt-text">{opt}</span>
                {picked !== null && opt === q.card.back && <Check size={17} className="opt-icon" />}
                {picked !== null && opt === picked && opt !== q.card.back && <X size={17} className="opt-icon" />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="selfgrade">
          {!revealed ? (
            <button className="btn ghost full" onClick={() => setRevealed(true)}>정답 보기</button>
          ) : (
            <>
              <div className="reveal" style={{ background: c.soft }}>
                <span className="face-tag" style={{ color: c.ink }}>답</span>
                <p className="face-text">{q.card.back}</p>
              </div>
              {picked === null && (
                <div className="flash-controls">
                  <button className="grade wrong" onClick={() => selfGrade(false)}><X size={18} /> 틀렸어요</button>
                  <button className="grade right" onClick={() => selfGrade(true)}><Check size={18} /> 맞았어요</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {picked !== null && (
        <div className="sticky-actions single">
          <button className="btn primary grow" onClick={next}>
            {i + 1 >= quiz.length ? "결과 보기" : "다음 문제"} <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function SessionDone({ title, lines, color, onAgain, onBack, againLabel, hideBack }) {
  const c = PALETTE[color] || PALETTE.yellow;
  return (
    <div className="page">
      <div className="done" style={{ background: c.soft }}>
        <div className="done-badge" style={{ background: c.mark }}><Check size={28} strokeWidth={2.5} /></div>
        <h2 className="done-title">{title}</h2>
        <p className="done-line">{lines[0]}<Highlight color={color}><strong>{lines[1]}</strong></Highlight>{lines[2]}</p>
        <div className="done-actions">
          <button className="btn primary" onClick={onAgain}><RotateCcw size={16} /> {againLabel || "한 번 더"}</button>
          {!hideBack && <button className="btn ghost" onClick={onBack}>공부방으로</button>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles (라이트 + 다크)                                             */
/* ------------------------------------------------------------------ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap');
* { box-sizing:border-box; margin:0; padding:0; }
.app-root {
  --paper:#F6F6F1; --card:#FFFFFF; --ink:#17171F; --ink-soft:#6B6B76; --line:#E7E7DF;
  --danger:#C6412B; --pri-bg:#17171F; --pri-fg:#FFFFFF;
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif; -webkit-font-smoothing:antialiased;
  transition:background .2s ease, color .2s ease;
}
.app-root.dark {
  --paper:#141419; --card:#20202A; --ink:#ECECEF; --ink-soft:#9A9AA6; --line:#31313C;
  --danger:#FF6B52; --pri-bg:#ECECEF; --pri-fg:#161620;
}
.app-inner { max-width:560px; margin:0 auto; min-height:100vh; position:relative; }
.page { padding:16px 18px 120px; }
.page.study { padding-bottom:24px; }
h1,h2,h3,.brand-mark,.hero-name,.done-title { font-family:'Space Grotesk',sans-serif; }
.center-screen { min-height:100vh; display:flex; align-items:center; justify-content:center; }
.pulse { color:var(--ink-soft); animation:pulse 1.2s ease-in-out infinite; font-size:15px; }
@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:1} }

/* theme toggle */
.theme-toggle { width:36px; height:36px; display:inline-flex; align-items:center; justify-content:center; border-radius:10px; border:1px solid var(--line); background:var(--card); color:var(--ink); cursor:pointer; }
.theme-toggle:hover { border-color:var(--ink-soft); }
.auth-toggle { position:absolute; top:18px; right:18px; }

.auth-wrap { min-height:100vh; display:flex; flex-direction:column; justify-content:center; padding:24px 20px; }
.auth-head { text-align:center; margin-bottom:26px; }
.auth-lead { margin-top:12px; font-size:14.5px; color:var(--ink-soft); }
.auth-card { background:var(--card); border:1px solid var(--line); border-radius:20px; padding:20px; }
.auth-tabs { display:flex; gap:6px; background:var(--paper); border-radius:12px; padding:4px; margin-bottom:18px; }
.auth-tab { flex:1; border:none; background:transparent; padding:9px; border-radius:9px; font-size:14px; font-weight:600; color:var(--ink-soft); cursor:pointer; font-family:inherit; }
.auth-tab.on { background:var(--card); color:var(--ink); box-shadow:0 1px 4px rgba(0,0,0,.12); }
.auth-field { display:flex; align-items:center; gap:10px; border:1px solid var(--line); border-radius:12px; padding:0 13px; margin-bottom:11px; color:var(--ink-soft); background:var(--card); }
.auth-field:focus-within { border-color:var(--ink); color:var(--ink); }
.auth-input { flex:1; border:none; outline:none; background:transparent; padding:13px 0; font-size:15px; font-family:inherit; color:var(--ink); }
.auth-err { color:var(--danger); font-size:13px; margin:2px 2px 12px; }

.masthead { padding:14px 0 20px; }
.masthead-top { display:flex; align-items:center; justify-content:space-between; }
.masthead-actions { display:flex; align-items:center; gap:8px; }
.brand-mark { font-size:30px; font-weight:700; letter-spacing:-0.03em; color:#1A1A22; background:linear-gradient(100deg,rgba(0,0,0,0) 0.5%,#FFE58A 1.6%,#FFE58A 90%,rgba(0,0,0,0) 97%); padding:0 .18em; border-radius:.35em; }
.signout { display:inline-flex; align-items:center; gap:5px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:7px 11px; font-size:13px; font-weight:500; color:var(--ink-soft); cursor:pointer; font-family:inherit; }
.signout:hover { color:var(--ink); border-color:var(--ink-soft); }
.tagline { margin-top:14px; font-size:16px; line-height:1.55; max-width:22em; }
.hl { border-radius:.35em; padding:0 .1em; color:#1A1A22; -webkit-box-decoration-break:clone; box-decoration-break:clone; }

.row-between { display:flex; align-items:center; justify-content:space-between; margin:8px 0 14px; }
.row-between.tight { margin:20px 0 10px; }
.section-title { font-size:18px; font-weight:600; letter-spacing:-0.02em; }
.section-title.sm { font-size:16px; }
.count { color:var(--ink-soft); font-weight:500; font-family:'Space Grotesk'; }
.link-btn { display:inline-flex; align-items:center; gap:5px; background:none; border:none; color:var(--ink); font-size:14px; font-weight:500; cursor:pointer; padding:6px 4px; font-family:inherit; }
.link-btn:hover { opacity:.7; }

.grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.room-card { text-align:left; background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; cursor:pointer; font-family:inherit; color:inherit; padding:0; transition:transform .12s ease, box-shadow .12s ease; display:flex; flex-direction:column; }
.room-card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,.10); }
.room-card.static, .room-card.static:hover { cursor:default; transform:none; box-shadow:none; }
.room-swatch { height:8px; width:100%; }
.room-body { padding:13px 14px 15px; display:flex; flex-direction:column; gap:6px; flex:1; }
.room-subject { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
.room-name { font-size:15.5px; font-weight:600; line-height:1.3; letter-spacing:-0.01em; }
.room-meta { display:flex; align-items:center; gap:5px; font-size:12.5px; color:var(--ink-soft); font-family:'Space Grotesk'; flex-wrap:wrap; }
.room-meta .dot { opacity:.5; }
.meta-wrong { color:var(--danger); font-weight:600; }
.room-card.add { align-items:center; justify-content:center; gap:8px; color:var(--ink-soft); border-style:dashed; background:transparent; min-height:120px; flex-direction:column; font-weight:500; }
.room-card.add:hover { color:var(--ink); border-color:var(--ink-soft); }
.prog { height:6px; background:var(--line); border-radius:99px; overflow:hidden; margin-top:2px; }
.prog-fill { height:100%; border-radius:99px; transition:width .4s ease; }

.empty { text-align:center; padding:48px 20px; color:var(--ink-soft); display:flex; flex-direction:column; align-items:center; gap:6px; border:1px dashed var(--line); border-radius:18px; margin-top:8px; }
.empty-title { font-size:16px; font-weight:600; color:var(--ink); margin-top:6px; }
.empty-sub { font-size:14px; max-width:24em; line-height:1.5; }
.empty-actions { display:flex; gap:10px; margin-top:16px; flex-wrap:wrap; justify-content:center; }

.btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:12px; padding:11px 16px; font-size:14.5px; font-weight:600; cursor:pointer; border:1px solid transparent; font-family:inherit; transition:background .12s ease, transform .1s ease, opacity .12s ease; }
.btn:active { transform:scale(.98); }
.btn.primary { background:var(--pri-bg); color:var(--pri-fg); }
.btn.primary:hover { opacity:.88; }
.btn.ghost { background:var(--card); border-color:var(--line); color:var(--ink); }
.btn.ghost:hover { border-color:var(--ink-soft); }
.btn.danger { background:var(--danger); color:#fff; }
.btn.small { padding:8px 12px; font-size:13px; border-radius:10px; }
.btn.full { width:100%; }
.btn.grow { flex:1; }
.btn:disabled { opacity:.55; cursor:default; }

.topbar { display:flex; align-items:center; gap:8px; height:44px; margin:-2px -4px 10px; }
.topbar-title { flex:1; text-align:center; font-size:15px; font-weight:600; font-family:'Space Grotesk'; }
.topbar-right { display:flex; gap:4px; min-width:32px; justify-content:flex-end; }
.icon-btn { width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center; border-radius:11px; border:none; background:transparent; color:var(--ink); cursor:pointer; }
.icon-btn.sm { width:30px; height:30px; }
.icon-btn:hover { background:rgba(125,125,125,.14); }
.page-lead { font-size:14.5px; color:var(--ink-soft); line-height:1.55; margin-bottom:18px; }

.field { margin-bottom:16px; }
.field label { display:block; font-size:13px; font-weight:600; color:var(--ink-soft); margin-bottom:7px; }
.input { width:100%; padding:12px 13px; border:1px solid var(--line); border-radius:12px; font-size:15px; font-family:inherit; background:var(--card); color:var(--ink); outline:none; }
.input:focus { border-color:var(--ink); }
.input.flat { border:none; border-radius:0; padding:10px 12px; background:transparent; }
.swatches { display:flex; gap:9px; flex-wrap:wrap; }
.swatch { width:36px; height:36px; border-radius:10px; border:2px solid transparent; cursor:pointer; }
.swatch.on { border-color:var(--ink); transform:scale(1.06); }

.search-field { display:flex; align-items:center; gap:8px; border:1px solid var(--line); border-radius:12px; padding:0 12px; margin-bottom:10px; color:var(--ink-soft); background:var(--card); }
.search-field:focus-within { border-color:var(--ink); }
.search-input { flex:1; border:none; outline:none; background:transparent; padding:11px 0; font-size:14.5px; font-family:inherit; color:var(--ink); }
.search-count { font-size:12.5px; color:var(--ink-soft); margin:2px 2px 10px; }

.import-box { border:1px solid var(--line); border-radius:14px; padding:14px; background:var(--card); margin-bottom:18px; }
.import-head { display:flex; gap:11px; align-items:flex-start; }
.import-title { font-size:14.5px; font-weight:600; }
.import-sub { font-size:12.5px; color:var(--ink-soft); margin-top:2px; }
.check { display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--ink-soft); margin:12px 0; cursor:pointer; }
.check input { width:16px; height:16px; accent-color:var(--ink); }

.card-list { display:flex; flex-direction:column; gap:9px; }
.edit-card { display:flex; align-items:center; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:4px 6px 4px 10px; border-left-width:3px; }
.edit-card.wrong { border-left-color:#E8896B; }
.edit-card.mastered { border-left-color:#5FC79A; }
.edit-idx { font-family:'Space Grotesk'; font-size:12px; color:var(--ink-soft); width:20px; text-align:center; flex-shrink:0; }
.edit-fields { flex:1; display:flex; flex-direction:column; }
.edit-divider { height:1px; background:var(--line); margin:0 8px; }

.sticky-actions { position:sticky; bottom:0; display:flex; gap:10px; padding:14px 0 6px; margin-top:20px; background:linear-gradient(to top,var(--paper) 70%,transparent); }

.room-hero { border-radius:20px; padding:22px 20px; margin-bottom:20px; color:#1C1C24; }
.hero-subject { font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; }
.hero-name { font-size:25px; font-weight:700; letter-spacing:-0.03em; line-height:1.15; margin:8px 0 16px; }
.hero-stats { display:flex; gap:26px; margin-bottom:14px; }
.hero-stats div { display:flex; flex-direction:column; }
.hero-stats strong { font-family:'Space Grotesk'; font-size:24px; font-weight:600; letter-spacing:-0.02em; }
.hero-stats span { font-size:12px; color:#5B5B63; }
.study-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:14px; }
.study-btn { display:flex; flex-direction:column; align-items:flex-start; gap:12px; text-align:left; background:var(--card); border:1.5px solid var(--line); border-radius:16px; padding:16px 15px; cursor:pointer; font-family:inherit; color:var(--ink); transition:transform .12s ease; }
.study-btn:hover { transform:translateY(-2px); }
.study-btn strong { display:block; font-size:15px; font-weight:600; }
.study-btn span { font-size:12.5px; color:var(--ink-soft); }
.room-tools { display:flex; flex-wrap:wrap; gap:8px; }
.tool { display:inline-flex; align-items:center; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:10px; padding:9px 12px; font-size:13px; font-weight:500; color:var(--ink); cursor:pointer; font-family:inherit; }
.tool:hover { border-color:var(--ink-soft); }
.tool.danger { color:var(--danger); }
.confirm { margin-top:18px; padding:16px; border:1px solid var(--line); border-radius:14px; background:var(--card); }
.confirm p { font-size:14.5px; margin-bottom:14px; }
.confirm-actions { display:flex; gap:10px; justify-content:flex-end; }

/* start screen (flash + quiz) */
.setup-hero { border-radius:20px; padding:26px 20px; margin-bottom:18px; text-align:center; color:#1C1C24; }
.setup-lead { font-family:'Space Grotesk'; font-size:22px; font-weight:700; letter-spacing:-0.02em; }
.setup-sub { font-size:13.5px; margin-top:8px; font-weight:600; }
.setup-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.setup-btn { background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:18px 12px; font-size:16px; font-weight:600; font-family:'Space Grotesk'; color:var(--ink); cursor:pointer; transition:transform .1s ease, border-color .12s ease; }
.setup-btn:hover { transform:translateY(-2px); border-color:var(--ink-soft); }
.setup-btn.on { border-color:var(--ink); }
.setup-custom { display:flex; gap:10px; margin-top:12px; }
.setup-custom .input { flex:1; }
.setup-list { display:flex; flex-direction:column; gap:10px; }
.setup-row { display:flex; align-items:center; gap:13px; text-align:left; width:100%; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:15px 16px; cursor:pointer; font-family:inherit; color:var(--ink); transition:transform .1s ease, border-color .12s ease; }
.setup-row:hover { transform:translateY(-2px); border-color:var(--ink-soft); }
.setup-row strong { display:block; font-size:15px; font-weight:600; font-family:'Space Grotesk'; }
.setup-row span { font-size:12.5px; color:var(--ink-soft); }

.flash-stage { perspective:1400px; margin:12px 0 20px; cursor:pointer; }
.flashcard { position:relative; width:100%; min-height:340px; transform-style:preserve-3d; transition:transform .5s cubic-bezier(.2,.8,.25,1); }
.flashcard.flipped { transform:rotateY(180deg); }
.face { position:absolute; inset:0; backface-visibility:hidden; -webkit-backface-visibility:hidden; border:1px solid var(--line); border-radius:22px; padding:28px 24px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; box-shadow:0 4px 24px rgba(0,0,0,.08); overflow:auto; background:#FFFFFF; color:#1C1C24; }
.face.back { transform:rotateY(180deg); }
.face-tag { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; color:#8B8B93; }
.face-text { font-family:'Space Grotesk',sans-serif; font-size:24px; font-weight:600; line-height:1.35; text-align:center; letter-spacing:-0.02em; word-break:keep-all; }
.tap-hint { position:absolute; bottom:16px; font-size:11.5px; color:#9A9AA2; }
.flash-controls { display:flex; gap:12px; }
.grade { flex:1; display:inline-flex; align-items:center; justify-content:center; gap:7px; padding:15px; border-radius:14px; font-size:15px; font-weight:600; cursor:pointer; border:1.5px solid var(--line); background:var(--card); font-family:inherit; transition:transform .1s ease; }
.grade:active { transform:scale(.97); }
.grade.right { color:#0F7A52; border-color:#A8E9CC; }
.grade.wrong { color:#B23F17; border-color:#FFC2A6; }

.quiz-progress { height:6px; background:var(--line); border-radius:99px; overflow:hidden; margin:4px 0 20px; }
.quiz-progress-fill { height:100%; transition:width .3s ease; }
.quiz-q { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:24px 20px; margin-bottom:16px; text-align:center; }
.quiz-q-text { font-family:'Space Grotesk'; font-size:21px; font-weight:600; line-height:1.4; letter-spacing:-0.02em; margin-top:10px; word-break:keep-all; }
.options { display:flex; flex-direction:column; gap:10px; }
.option { display:flex; align-items:center; gap:12px; text-align:left; width:100%; background:var(--card); border:1.5px solid var(--line); border-radius:14px; padding:14px 15px; font-size:15px; cursor:pointer; font-family:inherit; color:var(--ink); transition:border-color .12s ease, background .12s ease; }
.option:hover:not(:disabled) { border-color:var(--ink-soft); }
.opt-key { font-family:'Space Grotesk'; font-weight:600; font-size:13px; color:var(--ink-soft); width:24px; height:24px; border-radius:7px; background:var(--paper); display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; }
.opt-text { flex:1; line-height:1.4; word-break:keep-all; }
.opt-icon { flex-shrink:0; }
.option.correct { border-color:#8FDDBC; background:#E6F8F0; color:#0F7A52; }
.option.correct .opt-key { background:#A8E9CC; color:#0F7A52; }
.option.wrong { border-color:#FFB699; background:#FFECE1; color:#B23F17; }
.option.wrong .opt-key { background:#FFC2A6; color:#B23F17; }
.option.dim { opacity:.5; }
.selfgrade { display:flex; flex-direction:column; gap:14px; }
.reveal { border-radius:16px; padding:22px; display:flex; flex-direction:column; align-items:center; gap:10px; color:#1C1C24; }

.done { border-radius:22px; padding:40px 24px; text-align:center; display:flex; flex-direction:column; align-items:center; margin-top:12px; color:#1C1C24; }
.done-badge { width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#1C1C24; margin-bottom:18px; }
.done-title { font-size:26px; font-weight:700; letter-spacing:-0.03em; }
.done-line { font-size:16px; margin-top:12px; line-height:1.6; }
.done-actions { display:flex; gap:10px; margin-top:26px; flex-wrap:wrap; justify-content:center; }

.toast { position:fixed; bottom:26px; left:50%; transform:translateX(-50%); background:#2A2A33; color:#fff; padding:11px 18px; border-radius:12px; font-size:14px; font-weight:500; z-index:50; box-shadow:0 8px 30px rgba(0,0,0,.3); max-width:90%; animation:rise .25s ease; }
@keyframes rise { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }
.warn { display:flex; align-items:center; gap:7px; justify-content:center; font-size:12.5px; color:#8a5a00; background:#FFF8E1; padding:8px; }
@media (max-width:380px){ .grid, .setup-grid { grid-template-columns:1fr; } }
`;
