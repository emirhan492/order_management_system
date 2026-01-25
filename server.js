require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');
const multer = require('multer'); 
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true })); 
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));
app.use(express.static('public'));

// --- MULTER AYARLARI ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'public/uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname)); }
});
const upload = multer({ storage: storage });

// --- DB BAĞLANTISI ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- TELEGRAM BOT AYARLARI ---
const TELEGRAM_TOKEN = '8502910514:AAG_dcVk3NzK5cKmC9nht6qDEew5DUsHdqw';
const TELEGRAM_CHAT_ID = '-1003774547298'; 

// Botu başlat (Polling kapalı, sadece mesaj atacağız)
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

// --- GÜNLÜK HATIRLATMA GÖREVİ (Her sabah 09:00) ---
cron.schedule('0 9 * * *', async () => {
    try {
        // 1. Yarının tarihini hesapla
        const bugun = new Date();
        const yarin = new Date(bugun);
        yarin.setDate(bugun.getDate() + 1); // Bugüne 1 gün ekle

        // Tarih formatını ayarla (YYYY-MM-DD)
        const offset = yarin.getTimezoneOffset() * 60000; 
        const teslimTarihi = new Date(yarin.getTime() - offset).toISOString().split('T')[0];

        console.log(`📅 Yarınki (${teslimTarihi}) teslimatlar kontrol ediliyor...`);

        // 2. Veritabanından YARIN teslim edilecekleri bul
        const query = "SELECT * FROM siparisler WHERE teslim_tarihi = $1";
        const result = await pool.query(query, [teslimTarihi]);

        if (result.rows.length > 0) {
            let mesaj = `📋 *YARINKİ TESLİMATLAR*\n--------------------------\n`;
            
            result.rows.forEach((sip) => {
                // Ürün ismini çekme mantığı (JSON kontrolü)
                let urunGoster = sip.kategori;
                if (sip.urunler) {
                    try {
                        const parsedUrunler = JSON.parse(sip.urunler);
                        if (parsedUrunler.length > 0) {
                            urunGoster = parsedUrunler.map(u => u.kategori).join(', ');
                        }
                    } catch (e) {}
                }
                urunGoster = urunGoster || 'Belirsiz';

                mesaj += `- *${sip.musteri_adi}* - ${urunGoster}\n`;
            });

            // 3. Telegram grubuna gönder
            bot.sendMessage(TELEGRAM_CHAT_ID, mesaj, { parse_mode: 'Markdown' });
            console.log("✅ Yarınki teslimatlar için bildirim gönderildi.");
        } else {
            console.log("ℹ️ Yarın için planlanmış bir teslimat bulunmuyor.");
        }
    } catch (err) {
        console.error("❌ Telegram Bot hatası:", err);
    }
});

// --- MANUEL TEST ROTASI ---
app.get('/api/test-telegram', async (req, res) => {
    // Cron mantığını test etmek için manuel tetikleyici
    const bugun = new Date();
    const yarin = new Date(bugun);
    yarin.setDate(bugun.getDate() + 1);
    
    const offset = yarin.getTimezoneOffset() * 60000; 
    const teslimTarihi = new Date(yarin.getTime() - offset).toISOString().split('T')[0];

    try {
        const result = await pool.query("SELECT * FROM siparisler WHERE teslim_tarihi = $1", [teslimTarihi]);
        if (result.rows.length > 0) {
            let mesaj = `📋 *YARINKİ TESLİMATLAR*\n--------------------------\n`;
            
            result.rows.forEach((sip) => {
                let urunGoster = sip.kategori;
                if (sip.urunler) {
                    try {
                        const parsedUrunler = JSON.parse(sip.urunler);
                        if (parsedUrunler.length > 0) {
                            urunGoster = parsedUrunler.map(u => u.kategori).join(', ');
                        }
                    } catch (e) {}
                }
                urunGoster = urunGoster || 'Belirsiz';
                
                mesaj += `- *${sip.musteri_adi}* - ${urunGoster}\n`;
            });

            bot.sendMessage(TELEGRAM_CHAT_ID, mesaj, { parse_mode: 'Markdown' });
            res.send(`Yarın (${teslimTarihi}) için ${result.rows.length} adet sipariş bulundu ve bildirimi gönderildi.`);
        } else {
            res.send(`Yarın (${teslimTarihi}) için teslimat bulunamadı.`);
        }
    } catch (e) {
        res.send("Hata: " + e.message);
    }
});

// --- VERİTABANI OLUŞTURMA ---
const initDb = async () => {
    try {
        // Siparişler
        await pool.query(`CREATE TABLE IF NOT EXISTS siparisler (id SERIAL PRIMARY KEY, musteri_adi VARCHAR(100) NOT NULL, telefon VARCHAR(20), siparis_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP, teslim_tarihi DATE, fiyat DECIMAL(10, 2), durum VARCHAR(50) DEFAULT 'Bekliyor', kategori VARCHAR(50), siparis_notu TEXT, odenen_tutar DECIMAL(10, 2) DEFAULT 0, urunler TEXT, gorsel TEXT);`);
        await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odenen_tutar DECIMAL(10, 2) DEFAULT 0;`);
        await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS urunler TEXT;`);
        await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS gorsel TEXT;`);
        
        // Hatırlatıcılar
        await pool.query(`CREATE TABLE IF NOT EXISTS hatirlaticilar (id SERIAL PRIMARY KEY, not_icerik TEXT NOT NULL, tarih DATE NOT NULL);`);
        
        // STOKLAR TABLOSU
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

        console.log("✅ Veritabanı Hazır.");
    } catch (err) { console.error("❌ Veritabanı hatası:", err); }
};
initDb();

const loginKontrol = (req, res, next) => { if (req.session.admin) { next(); } else { res.status(401).json({ error: 'Yetkisiz' }); } };

// --- ROUTES ---
app.post('/api/login', (req, res) => { const { pin } = req.body; if (pin === process.env.ADMIN_PIN) { req.session.admin = true; res.json({ success: true }); } else { res.status(401).json({ success: false }); } });
app.get('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/session-check', (req, res) => { res.json({ loggedIn: !!req.session.admin }); });

// Sipariş İşlemleri
app.get('/api/siparisler', loginKontrol, async (req, res) => { try { const r = await pool.query('SELECT * FROM siparisler ORDER BY siparis_tarihi DESC'); res.json(r.rows); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post('/api/siparisler', loginKontrol, upload.array('siparis_gorselleri', 10), async (req, res) => {
    const { musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, urunler } = req.body;
    let gorseller = []; if (req.files) gorseller = req.files.map(f => f.filename);
    try { const r = await pool.query(`INSERT INTO siparisler (musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, urunler, gorsel) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, urunler, JSON.stringify(gorseller)]); res.json(r.rows[0]); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/siparisler/:id', loginKontrol, upload.array('yeni_gorseller', 10), async (req, res) => {
    const { id } = req.params;
    const { musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, durum, odenen_tutar, urunler, mevcut_gorseller } = req.body;
    try {
        let kg = []; if (mevcut_gorseller) kg = Array.isArray(mevcut_gorseller) ? mevcut_gorseller : [mevcut_gorseller];
        let yg = []; if (req.files) yg = req.files.map(f => f.filename);
        const sonGorsel = JSON.stringify([...kg, ...yg]);
        const r = await pool.query(`UPDATE siparisler SET musteri_adi=$1, telefon=$2, teslim_tarihi=$3, fiyat=$4, siparis_notu=$5, durum=$6, odenen_tutar=$7, urunler=$8, gorsel=$9 WHERE id=$10 RETURNING *`, [musteri_adi, telefon, teslim_tarihi, fiyat, siparis_notu, durum, odenen_tutar, urunler, sonGorsel, id]);
        res.json(r.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/siparisler/:id', loginKontrol, async (req, res) => { try { await pool.query('DELETE FROM siparisler WHERE id = $1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// --- STOKLAR API ---
app.get('/api/stoklar', loginKontrol, async (req, res) => { 
    try { const r = await pool.query('SELECT * FROM stoklar ORDER BY ekleme_tarihi DESC'); res.json(r.rows); } 
    catch (e) { res.status(500).json({ error: e.message }); } 
});

app.post('/api/stoklar', loginKontrol, upload.single('stok_gorseli'), async (req, res) => {
    let { urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi } = req.body;
    const gorsel = req.file ? req.file.filename : null;
    
    top_sayisi = top_sayisi ? parseInt(top_sayisi) : 0;
    metre = metre ? parseFloat(metre) : 0.00;
    alis_fiyati = alis_fiyati ? parseFloat(alis_fiyati) : 0.00;
    if (alis_tarihi === '') alis_tarihi = null;

    try {
        const r = await pool.query(
            `INSERT INTO stoklar (urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi, gorsel) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, 
            [urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi, gorsel]
        );
        res.json(r.rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

app.put('/api/stoklar/:id', loginKontrol, upload.single('stok_gorseli'), async (req, res) => {
    const { id } = req.params;
    let { urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi, mevcut_gorsel } = req.body;
    const gorsel = req.file ? req.file.filename : mevcut_gorsel;
    
    top_sayisi = top_sayisi ? parseInt(top_sayisi) : 0;
    metre = metre ? parseFloat(metre) : 0.00;
    alis_fiyati = alis_fiyati ? parseFloat(alis_fiyati) : 0.00;
    if (alis_tarihi === '') alis_tarihi = null;

    try {
        const result = await pool.query(
            `UPDATE stoklar SET urun_kodu=$1, urun_ismi=$2, top_sayisi=$3, metre=$4, alis_fiyati=$5, alis_tarihi=$6, gorsel=$7 WHERE id=$8 RETURNING *`,
            [urun_kodu, urun_ismi, top_sayisi, metre, alis_fiyati, alis_tarihi, gorsel, id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/stoklar/:id', loginKontrol, async (req, res) => { try { await pool.query('DELETE FROM stoklar WHERE id = $1', [req.params.id]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); } });

// Hatırlatıcılar
app.get('/api/hatirlaticilar', loginKontrol, async (req, res) => { try { const r = await pool.query('SELECT * FROM hatirlaticilar'); res.json(r.rows); } catch (e) { res.status(500).json({error: e.message}); } });
app.post('/api/hatirlaticilar', loginKontrol, async (req, res) => { try { await pool.query('INSERT INTO hatirlaticilar (not_icerik, tarih) VALUES ($1, $2)', [req.body.not_icerik, req.body.tarih]); res.json({success:true}); } catch (e) { res.status(500).json({error: e.message}); } });
app.delete('/api/hatirlaticilar/:id', loginKontrol, async (req, res) => { try { await pool.query('DELETE FROM hatirlaticilar WHERE id=$1', [req.params.id]); res.json({success:true}); } catch (e) { res.status(500).json({error: e.message}); } });

app.listen(PORT, () => console.log(`🚀 Sunucu http://localhost:${PORT} adresinde hazır.`));