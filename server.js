require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600000 }
}));
app.use(express.static('public'));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Veritabanı Güncelleme
const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS siparisler (
                id SERIAL PRIMARY KEY,
                musteri_adi VARCHAR(100) NOT NULL,
                telefon VARCHAR(20),
                siparis_tarihi TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                teslim_tarihi DATE,
                fiyat DECIMAL(10, 2),
                durum VARCHAR(50) DEFAULT 'Bekliyor',
                kategori VARCHAR(50),
                siparis_notu TEXT,
                odenen_tutar DECIMAL(10, 2) DEFAULT 0
            );
        `);

        // Eski tablolarda bu sütun yoksa ekle
        await pool.query(`ALTER TABLE siparisler ADD COLUMN IF NOT EXISTS odenen_tutar DECIMAL(10, 2) DEFAULT 0;`);
        
        // Hatırlatıcılar
        await pool.query(`
            CREATE TABLE IF NOT EXISTS hatirlaticilar (
                id SERIAL PRIMARY KEY,
                not_icerik TEXT NOT NULL,
                tarih DATE NOT NULL
            );
        `);
        
        console.log("✅ Veritabanı güncellendi (Ödeme sistemi hazır).");
    } catch (err) { console.error("❌ Veritabanı hatası:", err); }
};
initDb();

const loginKontrol = (req, res, next) => {
    if (req.session.admin) { next(); } 
    else { res.status(401).json({ error: 'Yetkisiz Giriş' }); }
};

// --- API ROUTES ---

app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    if (pin === process.env.ADMIN_PIN) {
        req.session.admin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });
app.get('/api/session-check', (req, res) => { res.json({ loggedIn: !!req.session.admin }); });

app.get('/api/siparisler', loginKontrol, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM siparisler ORDER BY siparis_tarihi DESC');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/siparisler', loginKontrol, async (req, res) => {
    const { musteri_adi, telefon, teslim_tarihi, fiyat, kategori, siparis_notu } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO siparisler (musteri_adi, telefon, teslim_tarihi, fiyat, kategori, siparis_notu) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [musteri_adi, telefon, teslim_tarihi, fiyat, kategori, siparis_notu]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/siparisler/:id', loginKontrol, async (req, res) => {
    const { id } = req.params;
    // YENİ: odenen_tutar eklendi
    const { musteri_adi, telefon, teslim_tarihi, fiyat, kategori, siparis_notu, durum, odenen_tutar } = req.body;

    try {
        const result = await pool.query(
            `UPDATE siparisler SET 
                musteri_adi = $1, 
                telefon = $2, 
                teslim_tarihi = $3, 
                fiyat = $4,
                kategori = $5,
                siparis_notu = $6,
                durum = $7,
                odenen_tutar = $8
             WHERE id = $9 RETURNING *`,
            [musteri_adi, telefon, teslim_tarihi, fiyat, kategori, siparis_notu, durum, odenen_tutar, id]
        );
        res.json(result.rows[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/siparisler/:id', loginKontrol, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM siparisler WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Hatırlatıcı API (Kısa tuttum, aynı kalacak)
app.get('/api/hatirlaticilar', loginKontrol, async (req, res) => { const r = await pool.query('SELECT * FROM hatirlaticilar'); res.json(r.rows); });
app.post('/api/hatirlaticilar', loginKontrol, async (req, res) => { const {not_icerik, tarih} = req.body; await pool.query('INSERT INTO hatirlaticilar (not_icerik, tarih) VALUES ($1, $2)', [not_icerik, tarih]); res.json({success:true}); });
app.delete('/api/hatirlaticilar/:id', loginKontrol, async (req, res) => { const {id}=req.params; await pool.query('DELETE FROM hatirlaticilar WHERE id=$1', [id]); res.json({success:true}); });

app.listen(PORT, () => console.log(`🚀 Sunucu http://localhost:${PORT} adresinde çalışıyor...`));