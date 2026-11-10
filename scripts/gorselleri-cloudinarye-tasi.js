// Cloudinary öncesinde sunucu diskine (public/uploads) kaydedilmiş görselleri Cloudinary'ye taşır
// ve veritabanındaki kayıtları yeni adreslerle günceller.
//
// Görsellerin bulunduğu sunucuda (production) çalıştırılmalıdır:
//   node scripts/gorselleri-cloudinarye-tasi.js           → sadece rapor (hiçbir şey değişmez)
//   node scripts/gorselleri-cloudinarye-tasi.js --uygula  → taşı ve veritabanını güncelle
//
// Yerel dosyalar silinmez; kontrol ettikten sonra elle silebilirsiniz.
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;

const UYGULA = process.argv.includes('--uygula');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const FOLDER = process.env.CLOUDINARY_FOLDER || 'papatya';
const ESKI_AD = /^[A-Za-z0-9_-]+\.(jpe?g|png|webp|gif)$/i;

if (!process.env.DATABASE_URL || !process.env.CLOUDINARY_URL) {
    console.error('DATABASE_URL ve CLOUDINARY_URL tanımlı olmalı.');
    process.exit(1);
}
cloudinary.config({ secure: true });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(/[?&]sslmode=/.test(process.env.DATABASE_URL) ? {} : { ssl: true })
});

const oku = (raw) => {
    if (!raw) return [];
    let v;
    try { v = JSON.parse(raw); } catch { v = raw; }
    return Array.isArray(v) ? v : [v];
};

const sayac = { tasinan: 0, eksik: 0, hata: 0 };

const tasi = async (g) => {
    if (typeof g !== 'string' || !ESKI_AD.test(g)) return g; // zaten Cloudinary'de
    const dosya = path.join(UPLOAD_DIR, g);
    if (!fs.existsSync(dosya)) { console.warn(`  ⚠️  Dosya bulunamadı: ${g}`); sayac.eksik++; return g; }
    if (!UYGULA) { console.log(`  → taşınacak: ${g}`); sayac.tasinan++; return g; }
    try {
        const r = await cloudinary.uploader.upload(dosya, { folder: FOLDER, resource_type: 'image' });
        console.log(`  ✅ ${g} → ${r.public_id}`);
        sayac.tasinan++;
        return { public_id: r.public_id, url: r.secure_url };
    } catch (err) {
        console.error(`  ❌ ${g} yüklenemedi: ${err.message}`);
        sayac.hata++;
        return g;
    }
};

const tabloyuTasi = async (tablo, tekGorsel) => {
    const { rows } = await pool.query(`SELECT id, gorsel FROM ${tablo} WHERE gorsel IS NOT NULL AND gorsel <> ''`);
    for (const row of rows) {
        const eski = oku(row.gorsel);
        if (!eski.some(g => typeof g === 'string')) continue;
        console.log(`${tablo} #${row.id}`);
        const yeni = [];
        for (const g of eski) yeni.push(await tasi(g));
        if (!UYGULA) continue;
        const deger = tekGorsel ? (yeni[0] ? JSON.stringify(yeni[0]) : null) : JSON.stringify(yeni);
        await pool.query(`UPDATE ${tablo} SET gorsel = $1 WHERE id = $2`, [deger, row.id]);
    }
};

(async () => {
    console.log(UYGULA ? '🚚 Görseller taşınıyor...\n' : '🔎 Deneme modu (değişiklik yapılmayacak). Uygulamak için --uygula ekleyin.\n');
    await tabloyuTasi('siparisler', false);
    await tabloyuTasi('stoklar', true);
    console.log(`\n${UYGULA ? 'Taşınan' : 'Taşınacak'}: ${sayac.tasinan}  |  Diskte bulunamayan: ${sayac.eksik}  |  Hata: ${sayac.hata}`);
    await pool.end();
})().catch(async (err) => { console.error(err); await pool.end(); process.exit(1); });
