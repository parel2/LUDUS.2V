// Helper bersama: pastikan operasi tulis/hapus ke Firestore BENAR-BENAR sampai
// ke server sebelum aplikasi menganggapnya berhasil.
//
// Kenapa ini penting: Firestore offline persistence membuat setDoc/updateDoc/
// deleteDoc "resolve" (selesai) begitu perubahan tersimpan di cache lokal
// perangkat itu — BUKAN berarti sudah sampai ke server. Kalau koneksi lemah/
// putus lalu tab ditutup sebelum sempat sinkron, perubahan itu bisa hilang
// (tidak pernah benar-benar sampai ke database), dan perangkat lain (siswa lain,
// guru lain) tidak akan pernah melihatnya. Fungsi di file ini memastikan kita
// menunggu sampai `metadata.hasPendingWrites` bernilai false (artinya server
// sudah mengonfirmasi) sebelum bilang "berhasil" ke pengguna.

import { onSnapshot } from "./firebase-config.js";

/**
 * Menunggu sampai sebuah dokumen (hasil setDoc/updateDoc) terkonfirmasi
 * tersimpan di server Firestore, bukan cuma di cache lokal.
 *
 * @param {import("./firebase-config.js").db} db
 * @param {ReturnType<typeof import("./firebase-config.js").doc>} docRef
 * @param {number} timeoutMs - batas waktu tunggu (default 15 detik)
 * @returns {Promise<void>} resolve kalau terkonfirmasi, reject kalau timeout/error
 */
export function waitForWriteSync(docRef, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      const err = new Error("TIMEOUT");
      err.isTimeout = true;
      reject(err);
    }, timeoutMs);

    const unsubscribe = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.exists() && !snap.metadata.hasPendingWrites) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve();
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        unsubscribe();
        reject(err);
      }
    );
  });
}

/**
 * Menunggu sampai sebuah dokumen yang DIHAPUS terkonfirmasi hilang dari server
 * (bukan cuma hilang dari cache lokal).
 *
 * @param {ReturnType<typeof import("./firebase-config.js").doc>} docRef
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
export function waitForDeleteSync(docRef, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unsubscribe();
      const err = new Error("TIMEOUT");
      err.isTimeout = true;
      reject(err);
    }, timeoutMs);

    const unsubscribe = onSnapshot(
      docRef,
      { includeMetadataChanges: true },
      (snap) => {
        if (!snap.exists() && !snap.metadata.hasPendingWrites) {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve();
        }
      },
      (err) => {
        clearTimeout(timeoutId);
        unsubscribe();
        reject(err);
      }
    );
  });
}

/**
 * Cek cepat apakah browser sedang online. Dipakai sebagai pengaman tambahan
 * sebelum melakukan aksi penting/berbahaya (misal Reset Total).
 */
export function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
