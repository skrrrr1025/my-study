// =====================================================================
//  src/firebase.js — Firebase 초기화
//  값은 Firebase 콘솔 → 프로젝트 설정 → 내 앱(Web)의 firebaseConfig
//  에서 복사해 .env 에 넣습니다.
// =====================================================================
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error("Firebase 설정이 비어 있어요. .env 를 확인하고 개발 서버를 재시작하세요.");
}

const app = initializeApp(firebaseConfig);
export const fbAuth = getAuth(app);
export const db = getFirestore(app);
