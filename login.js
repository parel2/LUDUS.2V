import {
  db,
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
} from "./firebase-config.js";
import { hashPassword, normalizeName, generateUid } from "./auth-helpers.js";
import { seedModules } from "./seed-modules.js";
import { waitForWriteSync } from "./sync-helpers.js";

// Seed sample modules on first load
seedModules();

window.switchRole = function (role) {
  const tabSiswa = document.getElementById("tabSiswa");
  const tabGuru = document.getElementById("tabGuru");
  const formSiswa = document.getElementById("formSiswa");
  const formGuru = document.getElementById("formGuru");
  const err = document.getElementById("errorMsg");
  err.classList.remove("show");

  if (role === "siswa") {
    tabSiswa.classList.add("active");
    tabGuru.classList.remove("active");
    formSiswa.style.display = "";
    formGuru.style.display = "none";
  } else {
    tabGuru.classList.add("active");
    tabSiswa.classList.remove("active");
    formGuru.style.display = "";
    formSiswa.style.display = "none";
  }
};

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.add("show");
}

window.loginSiswa = async function (event) {
  event.preventDefault();
  const nama = document.getElementById("siswaNama").value;
  const password = document.getElementById("siswaPassword").value;
  const kelas = document.getElementById("siswaKelas").value;

  if (!nama || !password || !kelas) {
    showError("Isi semua kolom terlebih dahulu.");
    return false;
  }

  const normNama = normalizeName(nama);
  const pwHash = hashPassword(password);

  try {
    const q = query(
      collection(db, "users"),
      where("nama", "==", normNama),
      where("kelas", "==", kelas),
      where("role", "==", "siswa")
    );
    const snap = await getDocs(q);

    let matched = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.passwordHash === pwHash) {
        matched = { id: d.id, ...data };
      }
    });

    if (matched) {
      sessionStorage.setItem("user", JSON.stringify(matched));
      window.location.href = "siswa.html";
      return false;
    }

    // Akun siswa hanya bisa dibuat oleh guru lewat Dashboard Guru.
    // Tidak ada lagi pendaftaran otomatis di sini.
    showError("Nama, kelas, atau password salah. Jika kamu belum punya akun, minta gurumu mendaftarkanmu terlebih dahulu.");
    return false;
  } catch (err) {
    console.error("Login siswa error:", err);
    showError("Gagal masuk. Periksa koneksi internet lalu coba lagi.");
    return false;
  }
};

window.loginGuru = async function (event) {
  event.preventDefault();
  const nama = document.getElementById("guruNama").value;
  const password = document.getElementById("guruPassword").value;
  const kode = document.getElementById("guruKode").value;

  if (!nama || !password || !kode) {
    showError("Isi semua kolom terlebih dahulu.");
    return false;
  }

  if (kode !== "n2oktena_3030") {
    showError("Kode Guru salah. Akses ditolak.");
    return false;
  }

  const normNama = normalizeName(nama);
  const pwHash = hashPassword(password);

  try {
    const q = query(
      collection(db, "users"),
      where("nama", "==", normNama),
      where("role", "==", "guru")
    );
    const snap = await getDocs(q);

    let matched = null;
    snap.forEach((d) => {
      const data = d.data();
      if (data.passwordHash === pwHash) {
        matched = { id: d.id, ...data };
      }
    });

    if (matched) {
      sessionStorage.setItem("user", JSON.stringify(matched));
      window.location.href = "guru.html";
      return false;
    }

    // Auto-register as new teacher profile
    const newUid = generateUid();
    const newProfile = {
      uid: newUid,
      nama: normNama,
      namaDisplay: nama.trim(),
      passwordHash: pwHash,
      role: "guru",
      isGuru: true,
      createdAt: Date.now(),
    };
    const newRef = doc(db, "users", newUid);
    await setDoc(newRef, newProfile);

    try {
      await waitForWriteSync(newRef, 10000);
    } catch (syncErr) {
      // Tetap lanjut login secara lokal supaya guru tidak terkunci saat
      // koneksi lemah, tapi beri peringatan supaya guru tahu akunnya belum
      // pasti tersimpan di server (misal belum bisa dipakai login dari
      // perangkat lain sampai koneksi pulih dan sempat sinkron).
      console.warn("Akun guru baru belum terkonfirmasi ke server:", syncErr);
      alert(
        "Peringatan: koneksi lemah/terputus. Akun guru barumu tersimpan sementara di perangkat ini, " +
        "tapi belum terkonfirmasi ke server. Sebaiknya tetap online sebentar sebelum menutup halaman ini."
      );
    }

    sessionStorage.setItem("user", JSON.stringify(newProfile));
    window.location.href = "guru.html";
    return false;
  } catch (err) {
    console.error("Login guru error:", err);
    showError("Gagal masuk. Periksa koneksi internet lalu coba lagi.");
    return false;
  }
};
