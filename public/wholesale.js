// --- TOPTANCI SİPARİŞLERİ ---
// Ürün satırı (satirEkle / urunleriTopla / fiyatHesapla), görsel düzenleme (currentEditImages,
// renderEditImages) ve modal yardımcıları script.js'den gelir.
const TOPTANCI_API = '/api/toptanci-siparisleri';
let tumToptanciSiparisleri = [];

const bugunTarih = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};
const tarihGoster = (t) => (t ? new Date(t).toLocaleDateString('tr-TR') : '-');
const tarihInput = (t) => {
    if (!t) return '';
    const d = new Date(t);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

async function hataMesaji(res) {
    const err = await res.json().catch(() => ({}));
    return err.error || 'Bilinmeyen hata';
}

// --- LİSTE ---
async function toptanciSiparisleriniGetir() {
    const res = await fetch(TOPTANCI_API);
    if (res.status === 401) { window.location.href = '/'; return; }
    tumToptanciSiparisleri = await res.json();
    toptanciFiltrele();
}

function toptanciFiltrele() {
    const tablo = document.getElementById('toptanciTablosu');
    if (!tablo) return;
    const ara = (document.getElementById('toptanciArama')?.value || '').toLocaleLowerCase('tr-TR');

    const liste = tumToptanciSiparisleri.filter(s => {
        if (!ara) return true;
        if ((s.toptanci_adi || '').toLocaleLowerCase('tr-TR').includes(ara)) return true;
        if ((s.siparis_notu || '').toLocaleLowerCase('tr-TR').includes(ara)) return true;
        return (urunListesiOku(s.urunler) || []).some(u =>
            `${u.kategori || ''} ${u.detay || ''}`.toLocaleLowerCase('tr-TR').includes(ara));
    });

    if (liste.length === 0) {
        tablo.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">${tumToptanciSiparisleri.length ? 'Kayıt bulunamadı.' : 'Henüz toptancı siparişi yok.'}</td></tr>`;
        return;
    }

    tablo.innerHTML = liste.map(s => {
        const id = Number(s.id);
        const urunler = urunListesiOku(s.urunler) || [];
        const urunOzet = urunler.length
            ? urunler.map(u => `<div>• ${esc(u.kategori)}${u.detay ? `: <small>${esc(u.detay)}</small>` : ''}</div>`).join('')
            : '<small style="color:var(--text-muted)">-</small>';
        const fotoSayisi = gorselListesi(s.gorsel).length;
        return `
            <tr onclick="toptanciDetayAc(${id})" style="cursor:pointer;">
                <td><strong>${esc(s.toptanci_adi)}</strong>${fotoSayisi ? `<br><small style="color:var(--text-secondary);">📷 ${fotoSayisi} fotoğraf</small>` : ''}</td>
                <td>${urunOzet}</td>
                <td>${tarihGoster(s.tarih)}</td>
                <td><strong>${esc(Number(s.fiyat || 0))} TL</strong></td>
                <td>
                    <button class="btn-duzenle" onclick="event.stopPropagation(); toptanciDuzenleAc(${id})">Düzenle</button>
                    <button class="btn-sil" onclick="event.stopPropagation(); toptanciSil(${id})">Sil</button>
                </td>
            </tr>`;
    }).join('');
}

// --- DETAY ---
function toptanciDetayAc(id) {
    const s = tumToptanciSiparisleri.find(x => x.id === id);
    if (!s) return;
    const urunler = urunListesiOku(s.urunler) || [];
    const satirlar = urunler.length
        ? urunler.map((u, i) => `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px;">${i + 1}</td>
                <td style="padding:10px;"><strong>${esc(u.kategori)}</strong></td>
                <td style="padding:10px; color:var(--text-secondary);">${esc(u.detay)}</td>
                <td style="padding:10px; text-align:right; font-weight:bold;">${esc(u.fiyat)} TL</td>
            </tr>`).join('')
        : '<tr><td colspan="4" style="padding:10px; color:var(--text-muted);">Ürün eklenmemiş.</td></tr>';

    const gorseller = gorselListesi(s.gorsel);
    const galeri = gorseller.length ? `
        <h4 style="margin:20px 0 10px 0; color:var(--text-strong);">📸 Fotoğraflar</h4>
        <div class="gallery-grid">
            ${gorseller.map(g => `
                <div class="gallery-item">
                    <img src="${esc(gorselUrl(g, 300))}" onclick="openImageModal('${esc(gorselUrl(g))}')" style="cursor:pointer;" alt="Sipariş fotoğrafı">
                </div>`).join('')}
        </div>` : '';

    document.getElementById('detailContent').innerHTML = `
        <div style="display:flex; gap:20px; margin-bottom:20px; background:var(--bg-subtle); padding:15px; border-radius:8px;">
            <div style="flex:1;"><small style="color:var(--text-secondary);">TOPTANCI</small><br><strong style="font-size:16px;">${esc(s.toptanci_adi)}</strong></div>
            <div style="flex:1; text-align:right;"><small style="color:var(--text-secondary);">TARİH</small><br><strong>${tarihGoster(s.tarih)}</strong></div>
        </div>
        <table style="width:100%; min-width:0; border-collapse:collapse; margin-bottom:20px; font-size:14px;">
            <thead style="background:var(--bg-subtle);"><tr><th style="padding:10px;">#</th><th style="padding:10px;">Ürün</th><th style="padding:10px;">Detay</th><th style="padding:10px; text-align:right;">Fiyat</th></tr></thead>
            <tbody>${satirlar}</tbody>
        </table>
        <div style="text-align:right; font-size:1.1rem;">Toplam: <strong>${esc(Number(s.fiyat || 0))} TL</strong></div>
        ${galeri}
        <div style="margin-top:20px; padding:10px; background:var(--note-bg); border-radius:5px; color:var(--note-text); font-size:13px;"><strong>📝 Not:</strong> ${esc(s.siparis_notu || '-')}</div>`;
    document.getElementById('detailModal').style.display = 'flex';
}

// --- DÜZENLE ---
function toptanciDuzenleAc(id) {
    const s = tumToptanciSiparisleri.find(x => x.id === id);
    if (!s) return;
    document.getElementById('editId').value = s.id;
    document.getElementById('editToptanciAdi').value = s.toptanci_adi || '';
    document.getElementById('editTarih').value = tarihInput(s.tarih);
    document.getElementById('editNot').value = s.siparis_notu || '';
    document.getElementById('editYeniGorseller').value = '';

    const container = document.getElementById('editUrunListesiContainer');
    container.innerHTML = '';
    const urunler = urunListesiOku(s.urunler) || [];
    if (urunler.length) urunler.forEach(u => satirEkle('edit', u)); else satirEkle('edit');

    currentEditImages = gorselListesi(s.gorsel);
    renderEditImages();
    fiyatHesapla('edit');
    document.getElementById('editModal').style.display = 'flex';
}

async function toptanciGuncelle(e) {
    e.preventDefault();
    const urunler = urunleriTopla('editUrunListesiContainer');
    if (urunler === null) return;

    const id = document.getElementById('editId').value;
    const fd = new FormData();
    fd.append('toptanci_adi', document.getElementById('editToptanciAdi').value);
    fd.append('tarih', document.getElementById('editTarih').value);
    fd.append('siparis_notu', document.getElementById('editNot').value);
    fd.append('fiyat', document.getElementById('editFiyat').value || 0);
    fd.append('urunler', urunler);
    currentEditImages.forEach(g => fd.append('mevcut_gorseller', gorselAnahtari(g)));
    for (const f of document.getElementById('editYeniGorseller').files) fd.append('yeni_gorseller', f);

    const btn = document.querySelector('button[form="editToptanciForm"]');
    btn.disabled = true;
    try {
        const res = await fetch(`${TOPTANCI_API}/${id}`, { method: 'PUT', body: fd });
        if (!res.ok) { alert('Güncelleme hatası: ' + await hataMesaji(res)); return; }
        closeEditModal();
        await toptanciSiparisleriniGetir();
    } catch (err) {
        alert('Sunucuya ulaşılamadı.');
    } finally {
        btn.disabled = false;
    }
}

async function toptanciSil(id) {
    const s = tumToptanciSiparisleri.find(x => x.id === id);
    if (!s || !confirm(`"${s.toptanci_adi}" siparişi silinsin mi?\n\nFotoğrafları da silinir ve geri alınamaz.`)) return;
    const res = await fetch(`${TOPTANCI_API}/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Silinemedi: ' + await hataMesaji(res)); return; }
    await toptanciSiparisleriniGetir();
}

// --- YENİ SİPARİŞ ---
async function toptanciKaydet(e) {
    e.preventDefault();
    const urunler = urunleriTopla('urunListesiContainer');
    if (urunler === null) return;

    const fd = new FormData();
    fd.append('toptanci_adi', document.getElementById('toptanci_adi').value);
    fd.append('tarih', document.getElementById('tarih').value);
    fd.append('siparis_notu', document.getElementById('siparis_notu').value);
    fd.append('fiyat', document.getElementById('fiyat').value || 0);
    fd.append('urunler', urunler);
    for (const f of document.getElementById('gorseller').files) fd.append('gorseller', f);

    const btn = document.getElementById('toptanciKaydetBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Kaydediliyor...';
    try {
        const res = await fetch(TOPTANCI_API, { method: 'POST', body: fd });
        if (!res.ok) { alert('Hata: ' + await hataMesaji(res)); return; }
        window.location.href = '/wholesale-orders.html';
    } catch (err) {
        alert('Sunucuya ulaşılamadı.');
    } finally {
        btn.disabled = false;
        btn.textContent = '✅ Toptancı Siparişini Oluştur';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('toptanciTablosu')) toptanciSiparisleriniGetir();
    if (document.getElementById('toptanciForm')) {
        document.getElementById('tarih').value = bugunTarih();
        if (!document.querySelector('#urunListesiContainer .urun-satiri')) satirEkle('yeni');
    }
});
