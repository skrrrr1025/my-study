// =====================================================================
//  src/api.js — Firebase 인증 + Firestore 데이터 계층
//  (앱에서 부르는 함수 이름/모양은 그대로. 내부만 Firestore로 구현)
//
//  데이터 구조
//   users/{uid}              → { rooms: [...], updatedAt }   개인 공부방 전체
//   public_decks/{id}        → { ownerId, name, subject, color, cardCount, createdAt }  공유 목록(가벼움)
//   public_deck_cards/{id}   → { ownerId, cards: [...] }      공유 카드 본문(담을 때만 읽음)
// =====================================================================
import { fbAuth, db } from "./firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  doc, getDoc, setDoc, deleteDoc,
  collection, getDocs, query, orderBy, serverTimestamp,
} from "firebase/firestore";

/* ------------------------------------------------------------------ */
/*  인증                                                               */
/* ------------------------------------------------------------------ */
export const auth = {
  // 초기 로그인 상태를 한 번 확인
  getSession: () =>
    new Promise((resolve) => {
      const unsub = onAuthStateChanged(fbAuth, (user) => {
        unsub();
        resolve(user); // Firebase user 객체(로그아웃이면 null)
      });
    }),
  // 로그인/로그아웃 변화를 구독 (unsubscribe 함수를 반환)
  onChange: (cb) => onAuthStateChanged(fbAuth, (user) => cb(user)),
  signUp: (email, password) => createUserWithEmailAndPassword(fbAuth, email, password),
  signIn: (email, password) => signInWithEmailAndPassword(fbAuth, email, password),
  signOut: () => signOut(fbAuth),
};

/* ------------------------------------------------------------------ */
/*  개인 공부방 — users/{uid} 문서 하나에 rooms 배열로 보관             */
/* ------------------------------------------------------------------ */
export async function getMyRooms() {
  const u = fbAuth.currentUser;
  if (!u) return [];
  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    return snap.exists() ? (snap.data().rooms ?? []) : [];
  } catch (e) { console.error(e); return []; }
}

export async function saveMyRooms(rooms) {
  const u = fbAuth.currentUser;
  if (!u) return false;
  try {
    await setDoc(doc(db, "users", u.uid), { rooms, updatedAt: serverTimestamp() });
    return true;
  } catch (e) { console.error(e); return false; }
}

/* ------------------------------------------------------------------ */
/*  공유 라이브러리                                                     */
/* ------------------------------------------------------------------ */
export async function listPublic() {
  try {
    const q = query(collection(db, "public_decks"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        sharedId: d.id,
        name: x.name,
        subject: x.subject,
        color: x.color,
        count: x.cardCount,
        sharedAt: x.createdAt?.toMillis?.() ?? null,
      };
    });
  } catch (e) { console.error(e); return []; }
}

export async function getPublicDeck(sharedId) {
  try {
    const [meta, cards] = await Promise.all([
      getDoc(doc(db, "public_decks", sharedId)),
      getDoc(doc(db, "public_deck_cards", sharedId)),
    ]);
    if (!meta.exists()) return null;
    const m = meta.data();
    return {
      name: m.name,
      subject: m.subject,
      color: m.color,
      cards: cards.exists() ? (cards.data().cards ?? []) : [],
    };
  } catch (e) { console.error(e); return null; }
}

// 신규 공유 또는 재공유(업데이트). 공유 문서 id 를 반환.
export async function publishDeck(room) {
  const u = fbAuth.currentUser;
  if (!u) return null;
  try {
    const isNew = !room.sharedId;
    const id = room.sharedId || doc(collection(db, "public_decks")).id;
    const cards = room.cards.map((c) => ({ front: c.front, back: c.back }));

    const meta = {
      ownerId: u.uid,
      name: room.name,
      subject: room.subject || "",
      color: room.color || "sky",
      cardCount: room.cards.length,
    };
    if (isNew) meta.createdAt = serverTimestamp(); // 재공유 시엔 createdAt 유지

    await Promise.all([
      setDoc(doc(db, "public_decks", id), meta, { merge: true }),
      setDoc(doc(db, "public_deck_cards", id), { ownerId: u.uid, cards }),
    ]);
    return id;
  } catch (e) { console.error(e); return null; }
}

export async function unpublishDeck(sharedId) {
  try {
    await Promise.all([
      deleteDoc(doc(db, "public_decks", sharedId)),
      deleteDoc(doc(db, "public_deck_cards", sharedId)),
    ]);
  } catch (e) { console.error(e); }
}
