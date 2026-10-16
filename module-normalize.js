// LUDUS — Versi 2.1 (pembahasan + peninjauan guru)
// Normalisasi & penilaian soal. Dipakai bersama oleh siswa (kuis.js, siswa.js)
// dan guru (guru.js).
//
// Skema internal satu soal:
//   pg:             { tipe:"pg", pertanyaan, opsi:[...], jawaban:<index>, pembahasan }
//   isian:          { tipe:"isian", pertanyaan, jawaban:"teks", pembahasan }
//   isian_kompleks: { tipe:"isian_kompleks", pertanyaan, pembahasan }
//   sambung:        { tipe:"sambung", pertanyaan, kalimat:[...], bank:[...], jawaban:{0:"kata",...}, pembahasan }

export const TIPE_LABEL = {
  pg: "Pilihan Ganda",
  isian: "Isian",
  isian_kompleks: "Esai",
  sambung: "Menjodohkan",
};

export function normalizeAnswer(str) {
  return String(str == null ? "" : str).trim().toLowerCase().replace(/\s+/g, " ");
}

function pickPembahasan(raw) {
  const v = raw.pembahasan ?? raw.penjelasan ?? raw.alasan ?? "";
  return String(v).trim();
}

// Mengubah soal dari format AI (pilihan_ganda/...) maupun format internal
// (pg/...) menjadi satu format internal. Aman dipanggil berulang (idempoten).
export function normalizeQuestion(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const tipe = raw.tipe;
  const pembahasan = pickPembahasan(raw);

  if (tipe === "pg" || tipe === "pilihan_ganda") {
    const pilihan = (raw.opsi || raw.pilihan || []).map((o) => String(o));
    let jawaban;
    if (typeof raw.jawaban === "number") {
      jawaban = raw.jawaban;
    } else if (typeof raw.jawaban_benar === "string") {
      jawaban = pilihan.indexOf(raw.jawaban_benar);
      if (jawaban === -1) jawaban = 0;
    } else {
      jawaban = 0;
    }
    return {
      tipe: "pg",
      pertanyaan: raw.pertanyaan || "",
      opsi: pilihan,
      jawaban,
      pembahasan,
    };
  }

  if (tipe === "isian") {
    return {
      tipe: "isian",
      pertanyaan: raw.pertanyaan || "",
      jawaban: String(raw.jawaban_benar ?? raw.jawaban ?? ""),
      pembahasan,
    };
  }

  if (tipe === "isian_kompleks") {
    return {
      tipe: "isian_kompleks",
      pertanyaan: raw.pertanyaan || "",
      pembahasan,
    };
  }

  if (tipe === "sambung") {
    const kalimat = (raw.kalimat || []).map((k) => String(k));
    const bank = (raw.bank || raw.pilihan_kata || []).map((w) => String(w));
    let jawaban;
    if (Array.isArray(raw.jawaban)) {
      jawaban = {};
      raw.jawaban.forEach((w, i) => { jawaban[i] = String(w); });
    } else {
      jawaban = { ...(raw.jawaban || {}) };
    }
    return {
      tipe: "sambung",
      pertanyaan: raw.pertanyaan || "Lengkapi kalimat berikut.",
      kalimat,
      bank,
      jawaban,
      pembahasan,
    };
  }

  return null;
}

export function normalizeModule(mod) {
  const rawSoal = mod.soal || [];
  const soal = rawSoal.map((s, i) => normalizeQuestion(s, i)).filter(Boolean);
  return {
    id: mod.id,
    judul: mod.judul || "Tanpa Judul",
    kelas: String(mod.kelas),
    level: mod.level || 1,
    soal,
  };
}

// ============ PENILAIAN ============
// Dipindah ke sini (sebelumnya terkurung di dalam startQuiz() di kuis.js
// sehingga mode review modul yang sudah selesai error "gradeQuestion is not defined").
//
// Hasil:
//   { type, pending, correct }                       untuk semua tipe
//   + perBlank: [true/false,...]                     khusus sambung
export function gradeQuestion(soal, answer) {
  if (soal.tipe === "pg") {
    return { correct: answer === soal.jawaban, type: "pg", pending: false };
  }
  if (soal.tipe === "isian") {
    const correct = normalizeAnswer(soal.jawaban);
    const given = normalizeAnswer(answer);
    return { correct: given === correct && given !== "", type: "isian", pending: false };
  }
  if (soal.tipe === "isian_kompleks") {
    return { correct: null, type: "isian_kompleks", pending: true };
  }
  if (soal.tipe === "sambung") {
    const correctMap = soal.jawaban || {};
    const ansMap = answer || {};
    const perBlank = [];
    for (let i = 0; i < (soal.kalimat || []).length; i++) {
      const given = normalizeAnswer(ansMap[i]);
      perBlank.push(given !== "" && given === normalizeAnswer(correctMap[i]));
    }
    return {
      correct: perBlank.length > 0 && perBlank.every(Boolean),
      type: "sambung",
      pending: false,
      perBlank,
    };
  }
  return { correct: false, type: "unknown", pending: false };
}

// ============ EDITOR GURU ============
export function blankQuestion(tipe) {
  if (tipe === "pg") {
    return { tipe: "pg", pertanyaan: "", opsi: ["", "", "", "", ""], jawaban: 0, pembahasan: "" };
  }
  if (tipe === "isian") {
    return { tipe: "isian", pertanyaan: "", jawaban: "", pembahasan: "" };
  }
  if (tipe === "isian_kompleks") {
    return { tipe: "isian_kompleks", pertanyaan: "", pembahasan: "" };
  }
  return {
    tipe: "sambung",
    pertanyaan: "Lengkapi kalimat berikut.",
    kalimat: ["", ""],
    bank: ["", "", ""],
    jawaban: {},
    pembahasan: "",
  };
}

// Pemeriksaan wajib sebelum modul boleh diterapkan ke siswa.
// Mengembalikan array { index, msg } (index = nomor soal 0-based, -1 = level modul).
export function validateSoalForPublish(soalList) {
  const errors = [];
  if (!Array.isArray(soalList) || soalList.length === 0) {
    errors.push({ index: -1, msg: "Modul belum punya soal." });
    return errors;
  }

  soalList.forEach((s, i) => {
    const add = (msg) => errors.push({ index: i, msg: `Soal ${i + 1}: ${msg}` });
    if (!String(s.pertanyaan || "").trim()) add("pertanyaan masih kosong.");

    if (s.tipe === "pg") {
      const opsi = s.opsi || [];
      if (opsi.length < 2) add("pilihan ganda minimal punya 2 pilihan.");
      if (opsi.some((o) => !String(o).trim())) add("ada pilihan jawaban yang masih kosong.");
      const norm = opsi.map(normalizeAnswer);
      if (new Set(norm).size !== norm.length) add("ada dua pilihan jawaban yang sama.");
      if (!(Number.isInteger(s.jawaban) && s.jawaban >= 0 && s.jawaban < opsi.length)) {
        add("jawaban benar belum dipilih.");
      }
    } else if (s.tipe === "isian") {
      if (!String(s.jawaban || "").trim()) add("kunci jawaban isian masih kosong.");
    } else if (s.tipe === "sambung") {
      const kalimat = s.kalimat || [];
      const bank = s.bank || [];
      if (kalimat.length === 0) add("belum ada bagian kalimat.");
      if (kalimat.some((k) => !String(k).trim())) add("ada bagian kalimat yang masih kosong.");
      if (bank.length === 0) add("bank kata masih kosong.");
      if (bank.some((w) => !String(w).trim())) add("ada kata di bank kata yang masih kosong.");
      const normBank = bank.map(normalizeAnswer);
      if (new Set(normBank).size !== normBank.length) add("ada dua kata yang sama di bank kata.");
      for (let k = 0; k < kalimat.length; k++) {
        const ans = (s.jawaban || {})[k];
        if (!ans || !bank.includes(ans)) {
          add(`bagian kosong ke-${k + 1} belum punya jawaban yang benar dari bank kata.`);
        }
      }
    } else if (s.tipe !== "isian_kompleks") {
      add("tipe soal tidak dikenali.");
    }
  });

  return errors;
}

// Jumlah soal (selain esai) yang belum punya pembahasan — hanya peringatan, bukan error.
export function countMissingPembahasan(soalList) {
  return (soalList || []).filter(
    (s) => s.tipe !== "isian_kompleks" && !String(s.pembahasan || "").trim()
  ).length;
}

export function countByTipe(soalList) {
  const c = { pg: 0, isian: 0, isian_kompleks: 0, sambung: 0 };
  (soalList || []).forEach((s) => { if (c[s.tipe] !== undefined) c[s.tipe]++; });
  return c;
}

// ============ JUDUL MODUL ============
export function normalizeTitle(title) {
  let cleaned = String(title || "").trim().toLowerCase().replace(/\s+/g, " ");
  // Strip [pengulangan] / pengulangan prefix so remedial modules group with their parent
  cleaned = cleaned.replace(/^\[?\s*pengulangan\s*\]?\s*/i, "");
  if (/\bsemester\s+\d+\s*$/i.test(cleaned)) return cleaned;
  return cleaned.replace(/[\s\d*.,&%$#!_+\-]+$/, "").trim();
}

export function isRemedial(title) {
  return /\[?\s*pengulangan\s*\]?/i.test(String(title || "").trim());
}

export function stripRemedialPrefix(title) {
  return String(title || "").trim().replace(/^\[?\s*pengulangan\s*\]?\s*/i, "").trim();
}
