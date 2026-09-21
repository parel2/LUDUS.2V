// Normalizes questions from both old internal schema (pg/isian/isian_kompleks/sambung)
// and new AI-generated JSON schema (pilihan_ganda/isian/isian_kompleks/sambung)
// into a single internal format the quiz engine understands.

export function normalizeQuestion(raw, index) {
  const tipe = raw.tipe;

  if (tipe === "pg" || tipe === "pilihan_ganda") {
    const pilihan = raw.opsi || raw.pilihan || [];
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
    };
  }

  if (tipe === "isian") {
    return {
      tipe: "isian",
      pertanyaan: raw.pertanyaan || "",
      jawaban: raw.jawaban_benar || raw.jawaban || "",
    };
  }

  if (tipe === "isian_kompleks") {
    return {
      tipe: "isian_kompleks",
      pertanyaan: raw.pertanyaan || "",
    };
  }

  if (tipe === "sambung") {
    const kalimat = raw.kalimat || [];
    const bank = raw.bank || raw.pilihan_kata || [];
    let jawaban;
    if (Array.isArray(raw.jawaban)) {
      jawaban = {};
      raw.jawaban.forEach((w, i) => { jawaban[i] = w; });
    } else {
      jawaban = raw.jawaban || {};
    }
    return {
      tipe: "sambung",
      pertanyaan: raw.pertanyaan || "Lengkapi kalimat berikut.",
      kalimat,
      bank,
      jawaban,
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
