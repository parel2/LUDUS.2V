import {
  db,
  collection,
  getDocs,
  setDoc,
  doc,
} from "./firebase-config.js";

const sampleModules = [
  {
    judul: "Wawasan Kebangsaan",
    kelas: "4",
    level: 2,
    soal: [
      {
        tipe: "pilihan_ganda",
        pertanyaan: "Apa lambang negara Indonesia?",
        pilihan: ["Garuda Pancasila", "Burung Merpati", "Burung Elang", "Burung Nuri", "Burung Beo"],
        jawaban_benar: "Garuda Pancasila",
      },
      {
        tipe: "pilihan_ganda",
        pertanyaan: "Berapa jumlah sila dalam Pancasila?",
        pilihan: ["3 sila", "4 sila", "5 sila", "6 sila", "7 sila"],
        jawaban_benar: "5 sila",
      },
      {
        tipe: "isian",
        pertanyaan: "Ibukota Indonesia adalah ...",
        jawaban_benar: "Jakarta",
      },
      {
        tipe: "isian",
        pertanyaan: "Lagu kebangsaan Indonesia berjudul ...",
        jawaban_benar: "Indonesia Raya",
      },
      {
        tipe: "sambung",
        kalimat: [
          "Bendera Indonesia berwarna",
          "dan",
          "Sang Saka Merah Putih adalah",
          "negara Indonesia.",
        ],
        pilihan_kata: ["Merah", "Putih", "bendera", "negara", "biru"],
        jawaban: ["Merah", "Putih", "bendera", "negara"],
      },
      {
        tipe: "isian_kompleks",
        pertanyaan: "Jelaskan makna dari lambang Garuda Pancasila!",
      },
    ],
  },
  {
    judul: "Bahasa Inggris - Animals",
    kelas: "4",
    level: 2,
    soal: [
      {
        tipe: "pilihan_ganda",
        pertanyaan: "What is the English word for 'kucing'?",
        pilihan: ["Dog", "Cat", "Bird", "Fish", "Cow"],
        jawaban_benar: "Cat",
      },
      {
        tipe: "pilihan_ganda",
        pertanyaan: "What is the English word for 'anjing'?",
        pilihan: ["Dog", "Cat", "Horse", "Sheep", "Goat"],
        jawaban_benar: "Dog",
      },
      {
        tipe: "isian",
        pertanyaan: "The English word for 'gajah' is ...",
        jawaban_benar: "elephant",
      },
      {
        tipe: "isian",
        pertanyaan: "The English word for 'harimau' is ...",
        jawaban_benar: "tiger",
      },
      {
        tipe: "sambung",
        kalimat: [
          "A dog says",
          "A cat says",
          "A cow says",
          "A duck says",
        ],
        pilihan_kata: ["moo", "quack", "woof", "meow", "buzz"],
        jawaban: ["woof", "meow", "moo", "quack"],
      },
      {
        tipe: "isian_kompleks",
        pertanyaan: "Write 3 sentences about your favorite animal!",
      },
    ],
  },
];

export async function seedModules() {
  try {
    const existing = await getDocs(collection(db, "modules"));
    if (existing.size > 0) {
      console.log("Modules already exist, skipping seed.");
      return;
    }
    for (const mod of sampleModules) {
      const id = "mod_" + Math.random().toString(36).slice(2, 8);
      await setDoc(doc(db, "modules", id), mod);
    }
    console.log("Sample modules seeded successfully.");
  } catch (err) {
    console.error("Seed error:", err);
  }
}
