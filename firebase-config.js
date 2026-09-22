
Firebase config · JS
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  getDoc,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
 
const firebaseConfig = {
  apiKey: "AIzaSyD5irtLsfYyqcyh12HZzzTiNhUWuqGleoI",
  authDomain: "asek-60b15.firebaseapp.com",
  projectId: "asek-60b15",
  storageBucket: "asek-60b15.firebasestorage.app",
  messagingSenderId: "302731234397",
  appId: "1:302731234397:web:980e72e3448a7ba83151b4",
};
 
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
 
try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code !== "failed-precondition" && err.code !== "unimplemented") {
      console.warn("Persistence error:", err);
    }
  });
} catch (e) {
  console.warn("Persistence init error:", e);
}
 
export {
  db,
  collection,
  query,
  where,
  getDocs,
  getDocsFromServer,
  getDoc,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  arrayUnion,
};
 
