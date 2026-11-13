require('dotenv').config({ quiet: true });
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2; // CLOUDINARY_URL ortam değişkenini otomatik okur

// --- ZORUNLU ORTAM DEĞİŞKENLERİ ---
for (const key of ['DATABASE_URL', 'ADMIN_PIN', 'SESSION_SECRET', 'CLOUDINARY_URL']) {
    if (!process.env[key]) { console.error(`❌ ${key} ortam değişkeni tanımlı değil.`); process.exit(1); }
}
cloudinary.config({ secure: true });

const app = express();
const PORT = process.env.PORT || 3000;
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'papatya';
// Cloudinary'ye geçmeden önce sunucu diskine yüklenmiş eski görseller (yalnızca okunur/silinir).
const LEGACY_UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// Sunucu bir reverse proxy (Render, Railway, Nginx vb.) arkasındaysa TRUST_PROXY=1 olmalı;
// aksi halde gerçek istemci IP'si ve HTTPS bilgisi okunamaz.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.disable('x-powered-by');

// --- DB BAĞLANTISI ---
// sslmode URL'de belirtilmişse pg onu kullanır (sertifika doğrulamalı); değilse SSL'i doğrulamalı olarak aç.
const dbUrlHasSslMode = /[?&]sslmode=/.test(process.env.DATABASE_URL);
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ...(dbUrlHasSslMode ? {} : { ssl: true })
});

// --- GÜVENLİK BAŞLIKLARI ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
});

// Sağlık kontrolü / keep-alive hedefi. Veritabanına ve oturum deposuna dokunmaz;
// böylece pingler Neon veritabanını uyanık tutup ücretsiz compute saatini tüketmez.
app.get('/health', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(session({
    store: new PgSession({ pool, tableName: 'oturumlar', createTableIfMissing: true }),
    name: 'papatya.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000, httpOnly: true, sameSite: 'lax', secure: 'auto' }
}));

// Eski (diskteki) görseller yalnızca giriş yapmış kullanıcıya sunulur.
app.use('/uploads', (req, res, next) => {
    if (!req.session.admin) return res.status(401).end();
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
    next();
}, express.static(LEGACY_UPLOAD_DIR, { dotfiles: 'deny', index: false }));
app.use(express.static(path.join(__dirname, 'public'), { dotfiles: 'deny' }));

// --- MULTER AYARLARI ---
// Dosyalar diske yazılmaz; bellekte tutulup doğrudan Cloudinary'ye aktarılır.
const IZINLI_GORSEL_TIPLERI = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const GORSEL_ADI_REGEX = /^[A-Za-z0-9_-]+\.(jpe?g|png|webp|gif)$/i;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 50 },
    fileFilter: (req, file, cb) => {
        if (IZINLI_GORSEL_TIPLERI.includes(file.mimetype)) cb(null, true);
        else cb(new HttpError(400, 'Sadece JPEG, PNG, WEBP veya GIF görsel yüklenebilir.'));
    }
});

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// --- YARDIMCILAR ---
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const parseId = (value) => {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Geçersiz kayıt numarası.');
    return id;
};

const parseNumber = (value, { integer = false, fallback = 0 } = {}) => {
    if (value === undefined || value === null || value === '') return fallback;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) throw new HttpError(400, 'Geçersiz sayısal değer.');
    return n;
};

const parseDate = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, 'Geçersiz tarih.');
    return value;
};

const parseText = (value, max, { required = false, field = 'Alan' } = {}) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (required && !text) throw new HttpError(400, `${field} gerekli.`);
    if (text.length > max) throw new HttpError(400, `${field} en fazla ${max} karakter olabilir.`);
    return text;
};

const parseUrunler = (value) => {
    if (!value) return '[]';
    let urunler;
    try { urunler = JSON.parse(value); } catch { throw new HttpError(400, 'Ürün listesi geçersiz.'); }
    if (!Array.isArray(urunler) || urunler.length > 50) throw new HttpError(400, 'Ürün listesi geçersiz.');
    return JSON.stringify(urunler.map(u => ({
        kategori: parseText(String(u?.kategori ?? ''), 50, { field: 'Kategori' }),
        detay: parseText(String(u?.detay ?? ''), 500, { field: 'Detay' }),
        fiyat: parseNumber(u?.fiyat)
    })));
};

// --- GÖRSELLER (CLOUDINARY) ---
// DB'de görsel öğesi iki biçimde olabilir:
//   { public_id, url }  → Cloudinary'deki görsel
//   "123-abc.jpg"       → Cloudinary öncesi, sunucu diskindeki eski görsel
const cloudinaryGorselMi = (g) => g && typeof g === 'object'
    && typeof g.public_id === 'string' && g.public_id.startsWith(`${CLOUDINARY_FOLDER}/`)
    && typeof g.url === 'string' && g.url.startsWith('https://res.cloudinary.com/');
const eskiGorselMi = (g) => typeof g === 'string' && GORSEL_ADI_REGEX.test(g);
const gecerliGorsel = (g) => cloudinaryGorselMi(g) || eskiGorselMi(g);
const gorselAnahtari = (g) => (typeof g === 'string' ? g : g.public_id);

// siparisler.gorsel: JSON dizi | stoklar.gorsel: JSON nesne veya eski düz dosya adı
const gorselListesiOku = (raw) => {
    if (!raw) return [];
    let value;
    try { value = JSON.parse(raw); } catch { value = raw; }
    return (Array.isArray(value) ? value : [value]).filter(gecerliGorsel);
};

const cloudinaryyeYukle = (file) => new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
        { folder: CLOUDINARY_FOLDER, resource_type: 'image', overwrite: false },
        (err, result) => (err ? reject(err) : resolve({ public_id: result.public_id, url: result.secure_url }))
    );
    stream.end(file.buffer);
});

// Ya hepsi yüklenir ya hiçbiri: biri başarısız olursa yüklenenler geri silinir.
const gorselleriYukle = async (files = []) => {
    const sonuclar = await Promise.allSettled(files.map(cloudinaryyeYukle));
    const basarili = sonuclar.filter(s => s.status === 'fulfilled').map(s => s.value);
    const hata = sonuclar.find(s => s.status === 'rejected');
    if (hata) {
        console.error('❌ Cloudinary yükleme hatası:', hata.reason?.message || hata.reason);
        await gorselleriSil(basarili);
        throw new HttpError(502, 'Görsel yüklenemedi, lütfen tekrar deneyin.');
    }
    return basarili;
};

const gorselleriSil = async (gorseller = []) => {
    await Promise.all(gorseller.map(async (g) => {
        try {
            if (cloudinaryGorselMi(g)) {
                const r = await cloudinary.uploader.destroy(g.public_id, { resource_type: 'image', invalidate: true });
                if (r.result !== 'ok' && r.result !== 'not found') throw new Error(r.result);
            } else if (eskiGorselMi(g)) {
                await fs.promises.unlink(path.join(LEGACY_UPLOAD_DIR, g)).catch(() => {});
            }
        } catch (err) {
            console.error(`❌ Görsel silinemedi (${gorselAnahtari(g)}):`, err.message || err);
        }
    }));
};

// DB işlemi başarısız olursa bu istekte Cloudinary'ye yüklenenleri geri al.
const geriAlinacaklar = new WeakMap();
const yuklemeyiKaydet = (req, gorseller) => { geriAlinacaklar.set(req, gorseller); return gorseller; };

// --- VERİTABANI OLUŞTURMA ---
const initDb = async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS siparisler (id SERIAL PRIMARY KEY, musteri_adi VARCHAR(100) NOT NULL, telefon VARCHAR(20), siparis_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP, teslim_tarihi DATE, fiyat DECIMAL(10, 2), durum VARCHAR(50) DEFAULT 'Bekliyor', kategori VARCHAR(50), siparis_notu TEXT, odenen_tutar DECIMAL(10, 2) DEFAULT 0, urunler TEXT, gorsel TEXT);`);
    await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odenen_tutar DECIMAL(10, 2) DEFAULT 0;`);
    await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS urunler TEXT;`);
    await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS gorsel TEXT;`);

    await pool.query(`CREATE TABLE IF NOT EXISTS hatirlaticilar (id SERIAL PRIMARY KEY, not_icerik TEXT NOT NULL, tarih DATE NOT NULL);`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS stoklar (
            id SERIAL PRIMARY KEY,
            urun_kodu VARCHAR(50),
            urun_ismi VARCHAR(100) NOT NULL,
            top_sayisi INTEGER DEFAULT 0,
            metre DECIMAL(10, 2) DEFAULT 0,
            alis_fiyati DECIMAL(10, 2) DEFAULT 0,
            alis_tarihi DATE,
            gorsel TEXT,
            ekleme_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`ALTER TABLE stoklar ADD COLUMN IF NOT EXISTS alis_fiyati DECIMAL(10, 2) DEFAULT 0;`);
    await pool.query(`ALTER TABLE stoklar ADD COLUMN IF NOT EXISTS alis_tarihi DATE;`);

    // GELİR / GİDER: kalemler (satırlar) yıllar arasında ortaktır, tutarlar yıl + ay bazında tutulur.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finans_kalemleri (
            id SERIAL PRIMARY KEY,
            tur VARCHAR(10) NOT NULL,
            ad VARCHAR(100) NOT NULL,
            sira INTEGER NOT NULL DEFAULT 0,
            olusturma TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS finans_degerleri (
            kalem_id INTEGER NOT NULL REFERENCES finans_kalemleri(id) ON DELETE CASCADE,
            yil INTEGER NOT NULL,
            ay INTEGER NOT NULL,
            tutar DECIMAL(12, 2) NOT NULL,
            PRIMARY KEY (kalem_id, yil, ay)
        );
    `);
    console.log('✅ Veritabanı Hazır.');
};

// --- KİMLİK DOĞRULAMA ---
const loginKontrol = (req, res, next) => { if (req.session.admin) next(); else res.status(401).json({ error: 'Yetkisiz' }); };

// Basit deneme sınırlayıcı: IP başına 15 dakikada 5 hatalı deneme.
const LOGIN_PENCERE_MS = 15 * 60 * 1000;
const LOGIN_MAX_DENEME = 5;
const loginDenemeleri = new Map();
setInterval(() => {
    const simdi = Date.now();
    for (const [ip, kayit] of loginDenemeleri) if (simdi - kayit.ilk > LOGIN_PENCERE_MS) loginDenemeleri.delete(ip);
}, LOGIN_PENCERE_MS).unref();

const pinDogruMu = (pin) => {
    if (typeof pin !== 'string') return false;
    const a = crypto.createHash('sha256').update(pin).digest();
    const b = crypto.createHash('sha256').update(process.env.ADMIN_PIN).digest();
    return crypto.timingSafeEqual(a, b);
};

app.post('/api/login', (req, res, next) => {
    const ip = req.ip;
    const simdi = Date.now();
    let kayit = loginDenemeleri.get(ip);
    if (kayit && simdi - kayit.ilk > LOGIN_PENCERE_MS) { loginDenemeleri.delete(ip); kayit = undefined; }
    if (kayit && kayit.sayi >= LOGIN_MAX_DENEME) {
        const kalanDk = Math.ceil((LOGIN_PENCERE_MS - (simdi - kayit.ilk)) / 60000);
        return res.status(429).json({ success: false, error: `Çok fazla hatalı deneme. ${kalanDk} dakika sonra tekrar deneyin.` });
    }

    if (!pinDogruMu(req.body?.pin)) {
        if (kayit) kayit.sayi++; else loginDenemeleri.set(ip, { sayi: 1, ilk: simdi });
        return res.status(401).json({ success: false });
    }

    loginDenemeleri.delete(ip);
    // Oturum sabitleme (session fixation) saldırısına karşı yeni oturum kimliği üret.
    req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.admin = true;
        req.session.save((err2) => err2 ? next(err2) : res.json({ success: true }));
    });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('papatya.sid');
        res.json({ success: true });
    });
});
app.get('/api/session-check', (req, res) => { res.json({ loggedIn: !!req.session.admin }); });

// --- SİPARİŞLER ---
const DURUMLAR = ['Bekliyor', 'Hazırlanıyor', 'Sipariş Tamamlandı', 'Teslim Edildi'];

const siparisAlanlari = (body) => ({
    musteri_adi: parseText(body.musteri_adi, 100, { required: true, field: 'Müşteri adı' }),
    telefon: parseText(body.telefon, 20, { field: 'Telefon' }),
    teslim_tarihi: parseDate(body.teslim_tarihi),
    fiyat: parseNumber(body.fiyat),
    siparis_notu: parseText(body.siparis_notu, 5000, { field: 'Not' }),
    urunler: parseUrunler(body.urunler)
});

app.get('/api/siparisler', loginKontrol, asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT * FROM siparisler ORDER BY siparis_tarihi DESC');
    res.json(r.rows);
}));

app.post('/api/siparisler', loginKontrol, upload.array('siparis_gorselleri', 10), asyncHandler(async (req, res) => {
    const s = siparisAlanlari(req.body);
    const gorseller = yuklemeyiKaydet(req, await gorselleriYukle(req.files));
    const r = await pool.query(
        `INSERT INTO siparisler (musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, urunler, gorsel) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [s.musteri_adi, s.telefon, s.teslim_tarihi, s.fiyat, s.siparis_notu, s.urunler, JSON.stringify(gorseller)]
    );
    res.json(r.rows[0]);
}));

app.put('/api/siparisler/:id', loginKontrol, upload.array('yeni_gorseller', 10), asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = siparisAlanlari(req.body);
    const durum = DURUMLAR.includes(req.body.durum) ? req.body.durum : 'Bekliyor';
    const odenen_tutar = parseNumber(req.body.odenen_tutar);

    const mevcut = await pool.query('SELECT gorsel FROM siparisler WHERE id = $1', [id]);
    if (mevcut.rows.length === 0) throw new HttpError(404, 'Sipariş bulunamadı.');
    const eskiGorseller = gorselListesiOku(mevcut.rows[0].gorsel);

    // İstemcinin "koru" dediği görseller yalnızca bu siparişe zaten ait olanlardan seçilebilir.
    const istenen = [].concat(req.body.mevcut_gorseller || []);
    const korunan = eskiGorseller.filter(g => istenen.includes(gorselAnahtari(g)));
    const silinecek = eskiGorseller.filter(g => !korunan.includes(g));
    const yeni = yuklemeyiKaydet(req, await gorselleriYukle(req.files));

    const r = await pool.query(
        `UPDATE siparisler SET musteri_adi=$1, telefon=$2, teslim_tarihi=$3, fiyat=$4, siparis_notu=$5, durum=$6, odenen_tutar=$7, urunler=$8, gorsel=$9 WHERE id=$10 RETURNING *`,
        [s.musteri_adi, s.telefon, s.teslim_tarihi, s.fiyat, s.siparis_notu, durum, odenen_tutar, s.urunler, JSON.stringify([...korunan, ...yeni]), id]
    );
    // Kayıt güncellendikten sonra kaldırılan görseller Cloudinary'den de silinir.
    await gorselleriSil(silinecek);
    res.json(r.rows[0]);
}));

app.delete('/api/siparisler/:id', loginKontrol, asyncHandler(async (req, res) => {
    const r = await pool.query('DELETE FROM siparisler WHERE id = $1 RETURNING gorsel', [parseId(req.params.id)]);
    if (r.rows[0]) await gorselleriSil(gorselListesiOku(r.rows[0].gorsel));
    res.json({ success: true });
}));

// --- STOKLAR ---
const stokAlanlari = (body) => ({
    urun_kodu: parseText(body.urun_kodu, 50, { field: 'Ürün kodu' }),
    urun_ismi: parseText(body.urun_ismi, 100, { required: true, field: 'Ürün ismi' }),
    top_sayisi: parseNumber(body.top_sayisi, { integer: true }),
    metre: parseNumber(body.metre),
    alis_fiyati: parseNumber(body.alis_fiyati),
    alis_tarihi: parseDate(body.alis_tarihi)
});

app.get('/api/stoklar', loginKontrol, asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT * FROM stoklar ORDER BY ekleme_tarihi DESC');
    res.json(r.rows);
}));

app.post('/api/stoklar', loginKontrol, upload.single('stok_gorseli'), asyncHandler(async (req, res) => {
    const s = stokAlanlari(req.body);
    const [gorsel] = yuklemeyiKaydet(req, await gorselleriYukle(req.file ? [req.file] : []));
    const r = await pool.query(
        `INSERT INTO stoklar (urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi, gorsel) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [s.urun_kodu, s.urun_ismi, s.top_sayisi, s.metre, s.alis_fiyati, s.alis_tarihi, gorsel ? JSON.stringify(gorsel) : null]
    );
    res.json(r.rows[0]);
}));

app.put('/api/stoklar/:id', loginKontrol, upload.single('stok_gorseli'), asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = stokAlanlari(req.body);

    const mevcut = await pool.query('SELECT gorsel FROM stoklar WHERE id = $1', [id]);
    if (mevcut.rows.length === 0) throw new HttpError(404, 'Stok bulunamadı.');
    const [eskiGorsel] = gorselListesiOku(mevcut.rows[0].gorsel);

    // Yeni görsel yüklendiyse eskisinin yerine geçer; "gorsel_sil" ile görsel tamamen kaldırılabilir.
    const [yeniGorsel] = yuklemeyiKaydet(req, await gorselleriYukle(req.file ? [req.file] : []));
    const gorselSil = req.body.gorsel_sil === '1';
    const sonGorsel = yeniGorsel || (gorselSil ? null : eskiGorsel || null);

    const r = await pool.query(
        `UPDATE stoklar SET urun_kodu=$1, urun_ismi=$2, top_sayisi=$3, metre=$4, alis_fiyati=$5, alis_tarihi=$6, gorsel=$7 WHERE id=$8 RETURNING *`,
        [s.urun_kodu, s.urun_ismi, s.top_sayisi, s.metre, s.alis_fiyati, s.alis_tarihi, sonGorsel ? JSON.stringify(sonGorsel) : null, id]
    );
    if (eskiGorsel && sonGorsel !== eskiGorsel) await gorselleriSil([eskiGorsel]);
    res.json(r.rows[0]);
}));

app.delete('/api/stoklar/:id', loginKontrol, asyncHandler(async (req, res) => {
    const r = await pool.query('DELETE FROM stoklar WHERE id = $1 RETURNING gorsel', [parseId(req.params.id)]);
    if (r.rows[0]) await gorselleriSil(gorselListesiOku(r.rows[0].gorsel));
    res.json({ success: true });
}));

// --- HATIRLATICILAR ---
app.get('/api/hatirlaticilar', loginKontrol, asyncHandler(async (req, res) => {
    const r = await pool.query('SELECT * FROM hatirlaticilar');
    res.json(r.rows);
}));

app.post('/api/hatirlaticilar', loginKontrol, asyncHandler(async (req, res) => {
    const not = parseText(req.body.not_icerik, 1000, { required: true, field: 'Not' });
    const tarih = parseDate(req.body.tarih);
    if (!tarih) throw new HttpError(400, 'Tarih gerekli.');
    await pool.query('INSERT INTO hatirlaticilar (not_icerik, tarih) VALUES ($1, $2)', [not, tarih]);
    res.json({ success: true });
}));

app.delete('/api/hatirlaticilar/:id', loginKontrol, asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM hatirlaticilar WHERE id=$1', [parseId(req.params.id)]);
    res.json({ success: true });
}));

// --- GELİR / GİDER TABLOSU ---
const FINANS_TURLERI = ['gelir', 'gider'];
const MAX_TUTAR = 9999999999.99; // DECIMAL(12, 2) sınırı

const parseYil = (value) => {
    const yil = Number(value);
    if (!Number.isInteger(yil) || yil < 2000 || yil > 2100) throw new HttpError(400, 'Geçersiz yıl.');
    return yil;
};

app.get('/api/finans', loginKontrol, asyncHandler(async (req, res) => {
    const yil = parseYil(req.query.yil);
    const kalemler = await pool.query('SELECT id, tur, ad, sira FROM finans_kalemleri ORDER BY tur, sira, id');
    const degerler = await pool.query('SELECT kalem_id, ay, tutar FROM finans_degerleri WHERE yil = $1', [yil]);
    res.json({ yil, kalemler: kalemler.rows, degerler: degerler.rows });
}));

app.post('/api/finans/kalemler', loginKontrol, asyncHandler(async (req, res) => {
    const tur = req.body.tur;
    if (!FINANS_TURLERI.includes(tur)) throw new HttpError(400, 'Geçersiz tür.');
    const ad = parseText(req.body.ad, 100, { required: true, field: 'Kalem adı' });
    const r = await pool.query(
        `INSERT INTO finans_kalemleri (tur, ad, sira)
         VALUES ($1::varchar, $2, (SELECT COALESCE(MAX(sira), 0) + 1 FROM finans_kalemleri WHERE tur = $1::varchar))
         RETURNING id, tur, ad, sira`,
        [tur, ad]
    );
    res.json(r.rows[0]);
}));

app.put('/api/finans/kalemler/:id', loginKontrol, asyncHandler(async (req, res) => {
    const ad = parseText(req.body.ad, 100, { required: true, field: 'Kalem adı' });
    const r = await pool.query('UPDATE finans_kalemleri SET ad = $1 WHERE id = $2 RETURNING id, tur, ad, sira', [ad, parseId(req.params.id)]);
    if (r.rows.length === 0) throw new HttpError(404, 'Kalem bulunamadı.');
    res.json(r.rows[0]);
}));

// Satırı aynı türdeki komşusuyla yer değiştirerek yukarı/aşağı taşır.
app.post('/api/finans/kalemler/:id/tasi', loginKontrol, asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const yon = req.body.yon;
    if (yon !== 'yukari' && yon !== 'asagi') throw new HttpError(400, 'Geçersiz yön.');

    const kalem = (await pool.query('SELECT id, tur, sira FROM finans_kalemleri WHERE id = $1', [id])).rows[0];
    if (!kalem) throw new HttpError(404, 'Kalem bulunamadı.');
    const liste = (await pool.query('SELECT id, sira FROM finans_kalemleri WHERE tur = $1 ORDER BY sira, id', [kalem.tur])).rows;
    const i = liste.findIndex(k => k.id === id);
    const j = yon === 'yukari' ? i - 1 : i + 1;
    if (j < 0 || j >= liste.length) return res.json({ success: true });

    // Sıraları 1..n olarak yeniden numaralandır, iki satırı yer değiştir.
    [liste[i], liste[j]] = [liste[j], liste[i]];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (let k = 0; k < liste.length; k++) {
            await client.query('UPDATE finans_kalemleri SET sira = $1 WHERE id = $2', [k + 1, liste[k].id]);
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
    res.json({ success: true });
}));

app.delete('/api/finans/kalemler/:id', loginKontrol, asyncHandler(async (req, res) => {
    await pool.query('DELETE FROM finans_kalemleri WHERE id = $1', [parseId(req.params.id)]);
    res.json({ success: true });
}));

// Tek hücre kaydı: tutar boş gönderilirse hücre temizlenir.
app.put('/api/finans/deger', loginKontrol, asyncHandler(async (req, res) => {
    const kalemId = parseId(req.body.kalem_id);
    const yil = parseYil(req.body.yil);
    const ay = Number(req.body.ay);
    if (!Number.isInteger(ay) || ay < 1 || ay > 12) throw new HttpError(400, 'Geçersiz ay.');

    const kalem = await pool.query('SELECT 1 FROM finans_kalemleri WHERE id = $1', [kalemId]);
    if (kalem.rows.length === 0) throw new HttpError(404, 'Kalem bulunamadı.');

    const bos = req.body.tutar === null || req.body.tutar === undefined || req.body.tutar === '';
    if (bos) {
        await pool.query('DELETE FROM finans_degerleri WHERE kalem_id = $1 AND yil = $2 AND ay = $3', [kalemId, yil, ay]);
        return res.json({ kalem_id: kalemId, yil, ay, tutar: null });
    }
    const tutar = Math.round(parseNumber(req.body.tutar) * 100) / 100;
    if (tutar > MAX_TUTAR) throw new HttpError(400, 'Tutar çok büyük.');
    await pool.query(
        `INSERT INTO finans_degerleri (kalem_id, yil, ay, tutar) VALUES ($1, $2, $3, $4)
         ON CONFLICT (kalem_id, yil, ay) DO UPDATE SET tutar = EXCLUDED.tutar`,
        [kalemId, yil, ay, tutar]
    );
    res.json({ kalem_id: kalemId, yil, ay, tutar });
}));

// --- HATA YÖNETİMİ ---
// İç hata detayları (SQL, dosya yolu vb.) istemciye gönderilmez, sadece loglanır.
app.use(async (err, req, res, next) => {
    const yuklenen = geriAlinacaklar.get(req);
    if (yuklenen?.length) await gorselleriSil(yuklenen);
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof multer.MulterError) {
        const mesaj = err.code === 'LIMIT_FILE_SIZE' ? 'Dosya boyutu en fazla 10 MB olabilir.' : 'Dosya yükleme hatası.';
        return res.status(400).json({ error: mesaj });
    }
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return res.status(400).json({ error: 'Geçersiz istek.' });
    console.error('❌ Sunucu hatası:', err);
    res.status(500).json({ error: 'Sunucu hatası oluştu.' });
});

// --- KEEP-ALIVE (Render ücretsiz planı 15 dk istek gelmezse sunucuyu uyutur) ---
// Render, RENDER_EXTERNAL_URL değişkenini otomatik tanımlar; sunucu kendi /health adresini
// dışarıdan (Render proxy'si üzerinden) pingleyerek uyumasını engeller.
const keepAliveBaslat = () => {
    if (process.env.KEEP_ALIVE === '0') return;
    const base = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!base) return; // yerelde çalışırken pingleme yapılmaz
    const url = new URL('/health', base).toString();
    const dakika = Math.max(Number(process.env.KEEP_ALIVE_DAKIKA) || 10, 0.05);

    let ardisikHata = 0;
    const ping = async () => {
        try {
            const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'papatya-keep-alive' } });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            if (ardisikHata > 0) console.log('✅ Keep-alive pingi yeniden başarılı.');
            ardisikHata = 0;
        } catch (err) {
            ardisikHata++;
            console.warn(`⚠️ Keep-alive pingi başarısız (${ardisikHata}. kez): ${err.message}`);
        }
    };
    setInterval(ping, dakika * 60 * 1000);
    console.log(`🔁 Keep-alive aktif: ${url} her ${dakika} dakikada pinglenecek.`);
};

initDb()
    .then(() => app.listen(PORT, () => {
        console.log(`🚀 Sunucu http://localhost:${PORT} adresinde hazır.`);
        keepAliveBaslat();
    }))
    .catch((err) => { console.error('❌ Veritabanı hatası:', err); process.exit(1); });
