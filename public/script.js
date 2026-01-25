const API_URL = '/api/siparisler';
let currentDate = new Date();
let selectedDateStr = "";
let tumSiparisler = []; 
let siparisListesi = []; 
let currentSort = { column: null, direction: 'default' };
let currentEditImages = []; 
let tumStoklar = [];

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Oturum Kontrolü
    const res = await fetch('/api/session-check');
    const data = await res.json();
    if (!data.loggedIn) {
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            window.location.href = '/';
        }
    } else {
        if (document.getElementById('loginEkrani')) ekraniAc();
    }

    // 2. Sayfa Yüklenince Çalışacak Fonksiyonlar
    if (document.getElementById('siparisTablosu')) getSiparisler();
    if (document.querySelector('.calendar-grid')) loadCalendar();
    if (document.getElementById('stokTablosu')) getStoklar();

    // 3. YENİ SİPARİŞ SAYFASI (new-order.html)
    if (document.getElementById('siparisForm')) {
        const kayıtlıVeri = sessionStorage.getItem('aktarilacakSiparis');
        const container = document.getElementById('urunListesiContainer');
        
        if (container) { 
            if (kayıtlıVeri) {
                const liste = JSON.parse(kayıtlıVeri);
                liste.forEach(urun => {
                    satirEkle('yeni', {
                        kategori: urun.kategori,
                        detay: `${urun.detay} ${urun.not ? '- ' + urun.not : ''}`,
                        fiyat: urun.fiyat
                    });
                });
                sessionStorage.removeItem('aktarilacakSiparis');
            } else {
                satirEkle('yeni');
            }
        }
    }
});

// --- STOK YÖNETİMİ ---
async function getStoklar() {
    try {
        const res = await fetch('/api/stoklar');
        tumStoklar = await res.json();
        renderStoklar(tumStoklar);
    } catch(e) { console.log(e); }
}

function renderStoklar(data) {
    const tbody = document.getElementById('stokTablosu');
    if(!tbody) return;
    tbody.innerHTML = '';

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#999;">Kayıtlı ürün yok.</td></tr>';
        return;
    }

    data.forEach(item => {
        let imgHTML = '<span style="font-size:24px;">📦</span>';
        if (item.gorsel) {
            imgHTML = `<img src="/uploads/${item.gorsel}" class="stok-img" onclick="openImageModal('/uploads/${item.gorsel}')">`;
        }

        const tarihGoster = item.alis_tarihi ? new Date(item.alis_tarihi).toLocaleDateString('tr-TR') : '-';

        const row = `
            <tr>
                <td>${imgHTML}</td>
                <td><strong>${item.urun_kodu || '-'}</strong></td>
                <td>${item.urun_ismi}</td>
                <td><span style="background:#e8f6f3; color:#16a085; padding:3px 8px; border-radius:4px; font-weight:bold;">${item.top_sayisi} Top / ${item.metre} mt</span></td>
                <td><span style="color:#d35400; font-weight:bold;">${item.alis_fiyati} TL</span></td>
                <td>${tarihGoster}</td>
                <td>
                    <button class="btn-duzenle" onclick='openEditStockModal(${JSON.stringify(item)})'>Düzenle</button>
                    <button class="btn-sil" onclick="stokSil(${item.id})">Sil</button>
                </td>
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

function filterStocks() {
    const text = document.getElementById('searchStock').value.toLowerCase();
    const filtered = tumStoklar.filter(s => 
        (s.urun_kodu && s.urun_kodu.toLowerCase().includes(text)) || 
        s.urun_ismi.toLowerCase().includes(text)
    );
    renderStoklar(filtered);
}

async function addStok() {
    const form = document.getElementById('stockForm');
    const formData = new FormData();
    formData.append('urun_kodu', document.getElementById('urun_kodu').value);
    formData.append('urun_ismi', document.getElementById('urun_ismi').value);
    formData.append('top_sayisi', document.getElementById('top_sayisi').value || 0);
    formData.append('metre', document.getElementById('metre').value || 0);
    formData.append('alis_fiyati', document.getElementById('alis_fiyati').value || 0);
    formData.append('alis_tarihi', document.getElementById('alis_tarihi').value);
    
    const fi = document.getElementById('stok_gorseli');
    if (fi.files.length > 0) formData.append('stok_gorseli', fi.files[0]);

    if (!document.getElementById('urun_ismi').value) { alert('Ürün ismi gerekli!'); return; }

    try {
        const res = await fetch('/api/stoklar', { method: 'POST', body: formData });
        if (res.ok) {
            alert('Stok eklendi!');
            closeStockModal();
            getStoklar();
            form.reset();
        } else {
            const errData = await res.json();
            alert('Hata: ' + (errData.error || 'Bilinmeyen Hata'));
        }
    } catch (e) { console.error(e); alert('Sunucu hatası!'); }
}

async function updateStok() {
    const id = document.getElementById('edit_stok_id').value;
    const formData = new FormData();
    formData.append('urun_kodu', document.getElementById('edit_urun_kodu').value);
    formData.append('urun_ismi', document.getElementById('edit_urun_ismi').value);
    formData.append('top_sayisi', document.getElementById('edit_top_sayisi').value || 0);
    formData.append('metre', document.getElementById('edit_metre').value || 0);
    formData.append('alis_fiyati', document.getElementById('edit_alis_fiyati').value || 0);
    formData.append('alis_tarihi', document.getElementById('edit_alis_tarihi').value);
    formData.append('mevcut_gorsel', document.getElementById('edit_mevcut_gorsel').value);

    const fi = document.getElementById('edit_stok_gorseli');
    if (fi.files.length > 0) formData.append('stok_gorseli', fi.files[0]);

    try {
        const res = await fetch(`/api/stoklar/${id}`, { method: 'PUT', body: formData });
        if (res.ok) {
            alert('Stok güncellendi! ✅');
            closeEditStockModal();
            getStoklar();
        } else {
            const err = await res.json();
            alert('Hata: ' + err.error);
        }
    } catch (e) { console.error(e); }
}

function openStockModal() { document.getElementById('stockModal').style.display = 'flex'; }
function closeStockModal() { document.getElementById('stockModal').style.display = 'none'; }

function openEditStockModal(item) {
    document.getElementById('editStockModal').style.display = 'flex';
    document.getElementById('edit_stok_id').value = item.id;
    document.getElementById('edit_urun_kodu').value = item.urun_kodu || '';
    document.getElementById('edit_urun_ismi').value = item.urun_ismi || '';
    document.getElementById('edit_top_sayisi').value = item.top_sayisi || 0;
    document.getElementById('edit_metre').value = item.metre || 0;
    document.getElementById('edit_alis_fiyati').value = item.alis_fiyati || 0;
    document.getElementById('edit_mevcut_gorsel').value = item.gorsel || ''; 
    
    if (item.alis_tarihi) {
        const date = new Date(item.alis_tarihi);
        document.getElementById('edit_alis_tarihi').value = date.toISOString().split('T')[0];
    } else {
        document.getElementById('edit_alis_tarihi').value = '';
    }

    const preview = document.getElementById('editStokImagePreview');
    if (item.gorsel) {
        preview.innerHTML = `<img src="/uploads/${item.gorsel}" style="height:60px; border-radius:4px; border:1px solid #ccc;">`;
    } else {
        preview.innerHTML = '<small style="color:#999">Görsel yok</small>';
    }
}
function closeEditStockModal() { document.getElementById('editStockModal').style.display = 'none'; }

async function stokSil(id) { 
    if(confirm('Silinsin mi?')) { 
        await fetch(`/api/stoklar/${id}`, { method: 'DELETE' }); 
        getStoklar(); 
    } 
}

// --- SİPARİŞ YÖNETİMİ ---
function satirEkle(mod = 'yeni', veri = null) {
    const containerId = mod === 'edit' ? 'editUrunListesiContainer' : 'urunListesiContainer';
    const container = document.getElementById(containerId);
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'urun-satiri';
    
    const k = veri ? veri.kategori : 'Zebra';
    const d = veri ? veri.detay : '';
    const f = veri ? veri.fiyat : 0;

    div.innerHTML = `
        <select class="u-kat">
            <option value="Zebra" ${k==='Zebra'?'selected':''}>Zebra</option>
            <option value="Stor" ${k==='Stor'?'selected':''}>Stor</option>
            <option value="Tül" ${k==='Tül'?'selected':''}>Tül</option>
            <option value="Güneşlik" ${k==='Güneşlik'?'selected':''}>Güneşlik</option>
            <option value="Plicell" ${k==='Plicell'?'selected':''}>Plicell</option>
            <option value="Nevresim" ${k==='Nevresim'?'selected':''}>Nevresim</option>
            <option value="Yastık" ${k==='Yastık'?'selected':''}>Yastık</option>
            <option value="Çarşaf" ${k==='Çarşaf'?'selected':''}>Çarşaf</option>
        </select>
        <input type="text" class="u-detay" placeholder="Detay" value="${d}">
        <input type="number" class="u-fiyat" placeholder="Fiyat" value="${f}" oninput="fiyatHesapla('${mod}')" style="text-align:right;">
        <button type="button" class="btn-sil-satir" onclick="satirSil(this, '${mod}')">🗑️</button>
    `;
    
    container.appendChild(div);
    fiyatHesapla(mod);
}

function satirSil(btn, mod) {
    btn.parentElement.remove();
    fiyatHesapla(mod);
}

function fiyatHesapla(mod) {
    const containerId = mod === 'edit' ? 'editUrunListesiContainer' : 'urunListesiContainer';
    const displayId = mod === 'edit' ? 'editToplamFiyatGoster' : 'toplamFiyatGoster';
    const inputId = mod === 'edit' ? 'editFiyat' : 'fiyat';

    const container = document.getElementById(containerId);
    if (!container) return;

    const fiyatlar = container.querySelectorAll('.u-fiyat');
    let toplam = 0;
    fiyatlar.forEach(input => { toplam += Number(input.value) || 0; });

    if(document.getElementById(displayId)) document.getElementById(displayId).innerText = toplam;
    if(document.getElementById(inputId)) document.getElementById(inputId).value = toplam;
    
    if (mod === 'edit' && document.getElementById('editOdenen')) {
        const odenen = Number(document.getElementById('editOdenen').value) || 0;
        const tamamiOdendiChb = document.getElementById('editTamamiOdendi');
        if(tamamiOdendiChb) {
            tamamiOdendiChb.checked = (odenen >= toplam && toplam > 0);
        }
    }
}

function urunleriTopla(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return "[]";
    const satirlar = container.querySelectorAll('.urun-satiri');
    let urunListesi = [];
    satirlar.forEach(row => {
        urunListesi.push({
            kategori: row.querySelector('.u-kat').value,
            detay: row.querySelector('.u-detay').value,
            fiyat: row.querySelector('.u-fiyat').value
        });
    });
    return JSON.stringify(urunListesi);
}

const formElement = document.getElementById('siparisForm');
if (formElement && !document.getElementById('editModal')) { 
    formElement.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const urunlerJSON = urunleriTopla('urunListesiContainer');
        const formData = new FormData();
        
        formData.append('musteri_adi', document.getElementById('musteri_adi').value);
        formData.append('telefon', document.getElementById('telefon').value);
        formData.append('teslim_tarihi', document.getElementById('teslim_tarihi').value);
        formData.append('siparis_notu', document.getElementById('siparis_notu').value);
        formData.append('fiyat', document.getElementById('fiyat').value);
        formData.append('urunler', urunlerJSON);

        const fileInput = document.getElementById('siparis_gorselleri');
        if (fileInput && fileInput.files.length > 0) {
            for (let i = 0; i < fileInput.files.length; i++) {
                formData.append('siparis_gorselleri', fileInput.files[i]);
            }
        }

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                body: formData 
            });
            if (response.ok) {
                alert('Sipariş başarıyla eklendi!');
                window.location.href = '/orders.html';
            } else {
                const err = await response.json();
                alert('Hata: ' + err.error);
            }
        } catch (error) { console.error('Hata:', error); }
    });
}

async function updateSiparis(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const urunlerJSON = urunleriTopla('editUrunListesiContainer');
    const formData = new FormData();

    formData.append('musteri_adi', document.getElementById('editMusteri').value);
    formData.append('telefon', document.getElementById('editTelefon').value);
    formData.append('siparis_notu', document.getElementById('editNot').value);
    formData.append('teslim_tarihi', document.getElementById('editTarih').value);
    formData.append('durum', document.getElementById('editDurum').value);
    formData.append('odenen_tutar', document.getElementById('editOdenen').value || 0);
    formData.append('fiyat', document.getElementById('editFiyat').value);
    formData.append('urunler', urunlerJSON);

    currentEditImages.forEach(imgName => {
        formData.append('mevcut_gorseller', imgName);
    });

    const newFiles = document.getElementById('editYeniGorseller');
    if (newFiles && newFiles.files.length > 0) {
        for (let i = 0; i < newFiles.files.length; i++) {
            formData.append('yeni_gorseller', newFiles.files[i]);
        }
    }

    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            body: formData
        });
        if (response.ok) {
            alert('Sipariş güncellendi! ✅');
            closeEditModal();
            getSiparisler();
        } else { alert('Güncelleme hatası!'); }
    } catch (error) { console.error('Hata:', error); }
}

async function getSiparisler() {
    const response = await fetch(API_URL);
    if (response.status === 401) { window.location.href = '/'; return; }
    tumSiparisler = await response.json();
    filterOrders();
}

function toggleSort(column) {
    if (currentSort.column !== column) {
        currentSort.column = column;
        if (column === 'fiyat' || column === 'tarih') { currentSort.direction = 'desc'; } 
        else { currentSort.direction = 'asc'; }
    } else {
        if (column === 'fiyat' || column === 'tarih') {
            if (currentSort.direction === 'desc') currentSort.direction = 'asc';
            else if (currentSort.direction === 'asc') { currentSort.direction = 'default'; currentSort.column = null; }
        } else {
            if (currentSort.direction === 'asc') currentSort.direction = 'desc';
            else if (currentSort.direction === 'desc') { currentSort.direction = 'default'; currentSort.column = null; }
        }
    }
    filterOrders();
}

function filterOrders() {
    const searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : "";
    const status = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : "Tümü";
    const tablo = document.getElementById('siparisTablosu');
    if (!tablo) return;

    let filteredData = tumSiparisler.filter(siparis => {
        // 1. İsim ve Telefon Araması (Mevcut)
        const isimMatch = siparis.musteri_adi.toLowerCase().includes(searchText);
        const telMatch = siparis.telefon.includes(searchText);
        
        // 2. Ürün İçeriği Araması (YENİ EKLENDİ)
        let urunMatch = false;
        if (siparis.urunler) {
            try {
                const urunler = JSON.parse(siparis.urunler);
                // Ürün listesindeki kategori veya detayda aranan kelime var mı?
                urunMatch = urunler.some(u => 
                    u.kategori.toLowerCase().includes(searchText) || 
                    (u.detay && u.detay.toLowerCase().includes(searchText))
                );
            } catch (e) {
                // Eğer JSON parse edilemezse veya eski veri tipindeyse
                if (siparis.kategori && siparis.kategori.toLowerCase().includes(searchText)) {
                    urunMatch = true;
                }
            }
        } else {
            // urunler sütunu boşsa, kategoriye bak (Eski kayıtlar için)
            if (siparis.kategori && siparis.kategori.toLowerCase().includes(searchText)) {
                urunMatch = true;
            }
        }

        const searchMatch = isimMatch || telMatch || urunMatch; // Ürün araması buraya eklendi
        const statusMatch = (status === 'Tümü') || (siparis.durum === status);
        return searchMatch && statusMatch;
    });

    if (currentSort.column && currentSort.direction !== 'default') {
        filteredData.sort((a, b) => {
            let valA, valB;
            if (currentSort.column === 'musteri') { valA = a.musteri_adi.toLowerCase(); valB = b.musteri_adi.toLowerCase(); return (valA < valB) ? (currentSort.direction === 'asc' ? -1 : 1) : (currentSort.direction === 'asc' ? 1 : -1); }
            else if (currentSort.column === 'tarih') { valA = new Date(a.teslim_tarihi); valB = new Date(b.teslim_tarihi); return currentSort.direction === 'asc' ? valA - valB : valB - valA; }
            else if (currentSort.column === 'fiyat') { valA = Number(a.fiyat); valB = Number(b.fiyat); return currentSort.direction === 'asc' ? valA - valB : valB - valA; }
        });
    }

    ['musteri', 'tarih', 'fiyat'].forEach(col => { const icon = document.getElementById(`icon-${col}`); if(icon) icon.innerText = ''; });
    if (currentSort.column && currentSort.direction !== 'default') {
        const activeIcon = document.getElementById(`icon-${currentSort.column}`);
        if (activeIcon) activeIcon.innerText = currentSort.direction === 'asc' ? '▼' : '▲';
    }

    tablo.innerHTML = ''; 
    if (filteredData.length === 0) { tablo.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Kayıt bulunamadı.</td></tr>'; return; }

    filteredData.forEach(siparis => {
        const tarih = new Date(siparis.siparis_tarihi).toLocaleDateString('tr-TR');
        const teslim = new Date(siparis.teslim_tarihi).toLocaleDateString('tr-TR');
        
        let urunOzet = "";
        let kategoriGoster = "Genel";

        if (siparis.urunler) {
            try {
                const urunler = JSON.parse(siparis.urunler);
                if(urunler.length > 0) kategoriGoster = urunler[0].kategori;
                if(urunler.length > 1) kategoriGoster += ` (+${urunler.length-1} Ürün)`;
                urunler.forEach(u => { urunOzet += `<div>• ${u.kategori}: <small>${u.detay}</small></div>`; });
            } catch(e) { urunOzet = siparis.siparis_notu || '-'; }
        } else {
            kategoriGoster = siparis.kategori || 'Genel';
            urunOzet = `<small>${siparis.siparis_notu || '-'}</small>`;
        }

        const fiyat = Number(siparis.fiyat);
        const odenen = Number(siparis.odenen_tutar || 0);
        const kalan = fiyat - odenen;
        let borcHTML = kalan <= 0 ? '<span style="color:green;font-weight:bold;font-size:12px;">✅ Ödendi</span>' : `<span style="color:red;font-weight:bold;font-size:12px;">Kalan: ${kalan} TL</span>`;
        
        let durumRenk = '#ecf0f1';
        if (siparis.durum === 'Teslim Edildi') durumRenk = '#d4edda';
        if (siparis.durum === 'Sipariş Tamamlandı') durumRenk = '#c3e6cb';
        if (siparis.durum === 'Hazırlanıyor') durumRenk = '#fff3cd';

        const satir = `
            <tr onclick='openDetailModal(${JSON.stringify(siparis)})'>
                <td>${siparis.musteri_adi}<br><small>${siparis.telefon}</small></td>
                <td><strong>${kategoriGoster}</strong><br>${urunOzet}</td>
                <td>Tes: ${teslim}</td>
                <td>${siparis.fiyat} TL<br>${borcHTML}</td>
                <td><span style="padding:5px 10px; border-radius:4px; background:${durumRenk}; font-weight:bold; font-size:13px; display:inline-block; min-width: 100px; text-align:center;">${siparis.durum}</span></td>
                <td>
                    <button class="btn-duzenle" onclick='event.stopPropagation(); openEditModal(${JSON.stringify(siparis)})'>Düzenle</button>
                    <button class="btn-sil" onclick="event.stopPropagation(); siparisSil(${siparis.id})">Sil</button>
                </td>
            </tr>`;
        tablo.innerHTML += satir;
    });
}

function openDetailModal(siparis) {
    const modal = document.getElementById('detailModal');
    const content = document.getElementById('detailContent');
    if(!modal) return;

    const sipTarih = new Date(siparis.siparis_tarihi).toLocaleDateString('tr-TR');
    const tesTarih = siparis.teslim_tarihi ? new Date(siparis.teslim_tarihi).toLocaleDateString('tr-TR') : '-';

    let urunlerHTML = '';
    if (siparis.urunler) {
        try {
            const urunler = JSON.parse(siparis.urunler);
            urunler.forEach((u, i) => {
                urunlerHTML += `
                    <tr style="border-bottom:1px solid #eee;">
                        <td style="padding:10px;">${i+1}</td>
                        <td style="padding:10px;"><strong>${u.kategori}</strong></td>
                        <td style="padding:10px; color:#555;">${u.detay}</td>
                        <td style="padding:10px; text-align:right; font-weight:bold;">${u.fiyat} TL</td>
                    </tr>`;
            });
        } catch(e) { urunlerHTML = '<tr><td colspan="4">Veri hatası.</td></tr>'; }
    } else {
        urunlerHTML = `<tr><td>1</td><td>${siparis.kategori||'Genel'}</td><td>${siparis.siparis_notu||'-'}</td><td style="text-align:right;">${siparis.fiyat} TL</td></tr>`;
    }

    let galeriHTML = '';
    if (siparis.gorsel) {
        try {
            let gorseller = [];
            if (siparis.gorsel.startsWith('[')) {
                gorseller = JSON.parse(siparis.gorsel);
            } else {
                gorseller = [siparis.gorsel];
            }

            if (gorseller.length > 0) {
                galeriHTML = `<h4 style="margin:20px 0 10px 0; color:#2c3e50;">📸 Görseller</h4><div class="gallery-grid">`;
                gorseller.forEach(img => {
                    galeriHTML += `
                        <div class="gallery-item">
                            <img src="/uploads/${img}" onclick="openImageModal('/uploads/${img}')" style="cursor:pointer;" alt="Sipariş Fotosu">
                        </div>`;
                });
                galeriHTML += `</div>`;
            }
        } catch (e) { console.log(e); }
    }

    const fiyat = Number(siparis.fiyat);
    const odenen = Number(siparis.odenen_tutar || 0);
    const kalan = fiyat - odenen;
    let borcDurumu = kalan <= 0 ? '<span style="color:green; font-weight:bold;">Tümü Ödendi ✅</span>' : `<span style="color:red; font-weight:bold;">Kalan: ${kalan} TL</span>`;

    content.innerHTML = `
        <div style="display:flex; gap:20px; margin-bottom:20px; background:#f8f9fa; padding:15px; border-radius:8px;">
            <div style="flex:1;"><small style="color:#7f8c8d;">MÜŞTERİ</small><br><strong style="font-size:16px;">${siparis.musteri_adi}</strong><br>${siparis.telefon}</div>
            <div style="flex:1; text-align:right;"><small style="color:#7f8c8d;">TESLİM</small><br><strong>${tesTarih}</strong></div>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px;"><thead style="background:#ecf0f1;"><tr><th style="padding:10px; text-align:left;">#</th><th style="padding:10px; text-align:left;">Ürün</th><th style="padding:10px; text-align:left;">Detay</th><th style="padding:10px; text-align:right;">Fiyat</th></tr></thead><tbody>${urunlerHTML}</tbody></table>
        
        <div style="display:flex; justify-content:flex-end;">
            <div style="width:250px; background:#f1f2f6; padding:15px; border-radius:8px;">
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>Toplam:</span> <strong>${fiyat} TL</strong></div>
                <div style="display:flex; justify-content:space-between; margin-bottom:5px; color:#7f8c8d;"><span>Ödenen:</span> <span>${odenen} TL</span></div>
                <div style="border-top:1px solid #ccc; margin:5px 0;"></div>
                <div style="text-align:right;">${borcDurumu}</div>
            </div>
        </div>

        ${galeriHTML}

        <div style="margin-top:20px; padding:10px; background:#fff3cd; border-radius:5px; color:#856404; font-size:13px;"><strong>📝 Not:</strong> ${siparis.siparis_notu || '-'}</div>
    `;
    modal.style.display = 'flex';
}

function closeDetailModal() { document.getElementById('detailModal').style.display = 'none'; }

function openEditModal(siparis) {
    const modal = document.getElementById('editModal');
    document.getElementById('editId').value = siparis.id;
    document.getElementById('editMusteri').value = siparis.musteri_adi;
    document.getElementById('editTelefon').value = siparis.telefon;
    document.getElementById('editNot').value = siparis.siparis_notu || '';
    document.getElementById('editDurum').value = siparis.durum || 'Bekliyor';
    document.getElementById('editOdenen').value = siparis.odenen_tutar || 0;
    
    if (siparis.teslim_tarihi) {
        const rawDate = new Date(siparis.teslim_tarihi);
        const offset = rawDate.getTimezoneOffset() * 60000; 
        const localDate = new Date(rawDate.getTime() - offset);
        document.getElementById('editTarih').value = localDate.toISOString().split('T')[0];
    }

    const container = document.getElementById('editUrunListesiContainer');
    container.innerHTML = ''; 
    if (siparis.urunler) {
        try {
            const urunler = JSON.parse(siparis.urunler);
            urunler.forEach(u => { satirEkle('edit', u); });
        } catch(e) { satirEkle('edit', { kategori: siparis.kategori, detay: siparis.siparis_notu, fiyat: siparis.fiyat }); }
    } else { satirEkle('edit', { kategori: siparis.kategori, detay: siparis.siparis_notu, fiyat: siparis.fiyat }); }

    const imgContainer = document.getElementById('editMevcutGorseller');
    if(imgContainer) {
        imgContainer.innerHTML = '';
        currentEditImages = []; 
        if (siparis.gorsel) {
            try {
                let gorseller = siparis.gorsel.startsWith('[') ? JSON.parse(siparis.gorsel) : [siparis.gorsel];
                currentEditImages = [...gorseller];
                renderEditImages();
            } catch(e) {}
        }
    }

    fiyatHesapla('edit');
    modal.style.display = 'flex';
}

function renderEditImages() {
    const container = document.getElementById('editMevcutGorseller');
    if(!container) return;
    container.innerHTML = '';
    currentEditImages.forEach((img, index) => {
        container.innerHTML += `
            <div class="gallery-item">
                <img src="/uploads/${img}">
                <button type="button" class="img-delete-btn" onclick="removeEditImage(${index})">×</button>
            </div>
        `;
    });
}

function removeEditImage(index) {
    if(confirm('Bu görsel silinsin mi? (Kaydet butonuna basınca işlem tamamlanır)')) {
        currentEditImages.splice(index, 1);
        renderEditImages();
    }
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

if (document.getElementById('editTamamiOdendi')) {
    document.getElementById('editTamamiOdendi').addEventListener('change', function() {
        const toplamFiyat = document.getElementById('editFiyat').value;
        const odenenInput = document.getElementById('editOdenen');
        odenenInput.value = this.checked ? toplamFiyat : 0;
    });
}

// --- FİYAT HESAPLAMA ROBOTU ---
function yapHesap() {
    const kategori = document.getElementById('calcKategori').value;
    const enInput = document.getElementById('calcEn');
    const boyInput = document.getElementById('calcBoy');
    
    let deger1 = Number(enInput.value) || 0; 
    let deger2 = Number(boyInput.value) || 0; 
    const birimFiyat = Number(document.getElementById('calcBirimFiyat').value) || 0;
    
    const pileDiv = document.getElementById('pileSecenekleri');
    const storDiv = document.getElementById('storSecenekleri');
    const carsafDiv = document.getElementById('carsafSecenekleri');
    
    if(pileDiv) pileDiv.style.display = (kategori === 'Tül') ? 'block' : 'none';
    if(storDiv) storDiv.style.display = (kategori === 'Stor' || kategori === 'Zebra') ? 'block' : 'none';
    if(carsafDiv) carsafDiv.style.display = (kategori === 'Çarşaf') ? 'block' : 'none';

    const enLabel = enInput.previousElementSibling; 
    const enContainer = enInput.parentElement;
    const boyContainer = boyInput.parentElement;
    
    enLabel.innerText = "En (cm):";
    enInput.placeholder = "Örn: 200";
    enContainer.style.display = 'block';
    boyContainer.style.display = 'block';

    if (kategori === 'Yastık') {
        enLabel.innerText = "Yastık Adedi:";
        enInput.placeholder = "Örn: 4";
        boyContainer.style.display = 'none';
    } 
    else if (kategori === 'Çarşaf') {
        const seciliCarsaf = document.querySelector('input[name="carsafTip"]:checked');
        const tip = seciliCarsaf ? seciliCarsaf.value : 'cift';
        if (tip === 'diger') {
            enLabel.innerText = "Kumaş Miktarı (mt):";
            enInput.placeholder = "Örn: 3.5";
            boyContainer.style.display = 'none';
        } else {
            enContainer.style.display = 'none';
            boyContainer.style.display = 'none';
        }
    }

    let hesaplananDeger = 0; 
    let hamM2 = (deger1 * deger2) / 10000; 
    let anaFiyat = 0;
    let ekstraFiyat = 0; 
    let aciklama = ""; 
    let birim = "m²"; 

    switch (kategori) {
        case 'Plicell':
            birim = "m²";
            if (hamM2 < 1.00 && hamM2 > 0) { hesaplananDeger = 1.00; aciklama = "(Min. 1m² Kuralı)"; }
            else { hesaplananDeger = Math.round(hamM2 * 100) / 100; }
            break;
        case 'Güneşlik':
            birim = "mt"; 
            if (deger1 > 0) {
                hesaplananDeger = (deger1 + 20) / 100;
                hesaplananDeger = Math.round(hesaplananDeger * 100) / 100;
                aciklama = `(En + 20cm pay)`;
            }
            break;
        case 'Nevresim':
            birim = "mt"; 
            if (deger1 > 0) {
                let kumasCm = (deger1 * 2) + 5;
                hesaplananDeger = kumasCm / 100;
                hesaplananDeger = Math.round(hesaplananDeger * 100) / 100;
                aciklama = `(En x 2 + 5cm pay)`;
            }
            ekstraFiyat += 250; // YENİ: Nevresim için +250 TL sabit ekleme
            if (aciklama) aciklama += " (+250 TL Dikim)"; else aciklama = "(+250 TL Dikim)";
            break;
        case 'Yastık':
            birim = "mt"; 
            if (deger1 > 0) {
                hesaplananDeger = deger1 * 0.60;
                hesaplananDeger = Math.round(hesaplananDeger * 100) / 100;
                aciklama = `(${deger1} Adet x 60cm)`;
            }
            break;
        case 'Çarşaf':
            birim = "mt";
            const seciliCarsaf = document.querySelector('input[name="carsafTip"]:checked');
            const tip = seciliCarsaf ? seciliCarsaf.value : 'cift';
            if (tip === 'cift') { hesaplananDeger = 2.50; aciklama = "(Çift Kişilik)"; } 
            else if (tip === 'tek') { hesaplananDeger = 1.80; aciklama = "(Tek Kişilik)"; }
            else if (tip === 'lastik') { hesaplananDeger = 2.85; ekstraFiyat = 100; aciklama = "(Lastikli: 2.85m + 100 TL)"; }
            else if (tip === 'diger' && deger1 > 0) { hesaplananDeger = deger1; aciklama = "(Özel Ölçü)"; }
            break;
        case 'Tül':
            birim = "mt"; 
            const seciliPile = document.querySelector('input[name="pileOrani"]:checked');
            const carpan = seciliPile ? Number(seciliPile.value) : 3;
            if (deger1 > 0) {
                let harcananKumasCm = (deger1 * carpan) + 30;
                hesaplananDeger = harcananKumasCm / 100;
                hesaplananDeger = Math.round(hesaplananDeger * 100) / 100;
                let pileIsmi = carpan === 3 ? "Sık" : (carpan === 2.5 ? "Orta" : "Seyrek");
                aciklama = `(${pileIsmi} Pile)`;
            }
            break;
        case 'Stor':
        case 'Zebra':
            birim = "m²";
            hesaplananDeger = Math.round(hamM2 * 100) / 100;
            const enMetre = deger1 / 100;
            let ekstralar = [];
            if (document.getElementById('optEtek').checked) { ekstraFiyat += enMetre * 100; ekstralar.push("Etek"); }
            if (document.getElementById('optBoncuk').checked) { ekstraFiyat += enMetre * 200; ekstralar.push("Boncuk"); }
            if (document.getElementById('optLazer').checked) { ekstraFiyat += enMetre * 400; ekstralar.push("Lazer"); }
            if (document.getElementById('optCita').checked) { ekstraFiyat += enMetre * 1300; ekstralar.push("Çıta"); }
            if (ekstralar.length > 0) aciklama = `(+${ekstralar.join(', ')})`;
            break;
        default:
            birim = "m²"; hesaplananDeger = Math.round(hamM2 * 100) / 100; break;
    }

    anaFiyat = Math.round(hesaplananDeger * birimFiyat);
    let toplamFiyat = anaFiyat + Math.round(ekstraFiyat);

    if (document.getElementById('sonucM2')) {
        let sonucMetni = `${hesaplananDeger} ${birim}`;
        if (ekstraFiyat > 0) sonucMetni += `<br><span style="font-size:12px; color:#555;">Kumaş: ${anaFiyat} TL + Ekstra: ${Math.round(ekstraFiyat)} TL</span>`;
        document.getElementById('sonucM2').innerHTML = sonucMetni;
        if(document.getElementById('hesapAciklama')) document.getElementById('hesapAciklama').innerHTML = aciklama;
        document.getElementById('sonucFiyat').innerText = toplamFiyat + " TL";
    }
}

// --- TOPLU SİPARİŞ / LİSTE YÖNETİMİ ---
function listeyeEkle() {
    const fiyatText = document.getElementById('sonucFiyat').innerText;
    const fiyat = Number(fiyatText.replace(' TL', ''));
    if (fiyat <= 0) { alert("Lütfen geçerli bir hesaplama yapın."); return; }

    const kategori = document.getElementById('calcKategori').value;
    const en = document.getElementById('calcEn').value;
    const boy = document.getElementById('calcBoy').value;
    const m2Text = document.getElementById('sonucM2').innerText.split('\n')[0];
    
    let aciklama = "";
    if(document.getElementById('hesapAciklama')) aciklama = document.getElementById('hesapAciklama').innerText;

    const urun = { id: Date.now(), kategori: kategori, detay: `${en}x${boy} cm (${m2Text})`, not: aciklama, fiyat: fiyat };
    siparisListesi.push(urun);
    renderListe();
}

function renderListe() {
    const ul = document.getElementById('siparisListesi');
    const toplamEl = document.getElementById('genelToplam');
    ul.innerHTML = "";
    let toplamTutar = 0;

    if (siparisListesi.length === 0) {
        ul.innerHTML = '<li style="padding: 20px; text-align: center; color: #999;">Henüz ürün eklenmedi.</li>';
        toplamEl.innerText = "0 TL";
        return;
    }

    siparisListesi.forEach((urun, index) => {
        toplamTutar += urun.fiyat;
        const li = document.createElement('li');
        li.className = 'order-item';
        li.innerHTML = `<div><strong>${urun.kategori}</strong> <br><small>${urun.detay}</small><br><small style="color:orange">${urun.not}</small></div><div style="text-align:right; font-weight:bold; color:#2c3e50;">${urun.fiyat} TL</div><button class="del-btn" onclick="listedenCikar(${index})">Sil</button>`;
        ul.appendChild(li);
    });
    toplamEl.innerText = toplamTutar + " TL";
}

function listedenCikar(index) { siparisListesi.splice(index, 1); renderListe(); }

function topluSipariseGec() {
    if (siparisListesi.length === 0) { alert("Listeniz boş!"); return; }
    sessionStorage.setItem('aktarilacakSiparis', JSON.stringify(siparisListesi));
    window.location.href = '/new-order.html';
}

// --- TAKVİM VE ORTAK FONKSİYONLAR ---
async function loadCalendar() {
    const resSiparis = await fetch('/api/siparisler'); const siparisler = await resSiparis.json();
    const resNotlar = await fetch('/api/hatirlaticilar'); const notlar = await resNotlar.json();
    renderCalendar(siparisler, notlar);
}

function renderCalendar(siparisler, notlar) {
    const grid = document.querySelector('.calendar-grid');
    const monthYear = document.getElementById('currentMonthYear');
    if (!grid) return; 
    
    grid.innerHTML = ''; 
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    
    if(monthYear) monthYear.innerText = `${monthNames[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startDay = firstDay === 0 ? 6 : firstDay - 1;
    
    for (let i = 0; i < startDay; i++) { 
        const emptyDiv = document.createElement('div'); 
        emptyDiv.className = 'calendar-day'; 
        emptyDiv.style.backgroundColor = '#f9f9f9'; 
        grid.appendChild(emptyDiv); 
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div'); dayDiv.className = 'calendar-day';
        const fullDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const todayStr = new Date().toISOString().split('T')[0];
        
        if (fullDateStr === todayStr) dayDiv.classList.add('today');
        
        dayDiv.innerHTML = `<strong>${day}</strong>`;
        
        const gununSiparisleri = siparisler.filter(s => { 
            if (!s.teslim_tarihi) return false; 
            const yerelTarih = new Date(s.teslim_tarihi).toLocaleDateString('en-CA'); 
            return yerelTarih === fullDateStr; 
        });
        
        const gununNotlari = notlar.filter(n => { 
            if (!n.tarih) return false; 
            const yerelTarih = new Date(n.tarih).toLocaleDateString('en-CA'); 
            return yerelTarih === fullDateStr; 
        });
        
        dayDiv.onclick = () => openModal(fullDateStr, gununSiparisleri, gununNotlari);
        
        gununSiparisleri.forEach(sip => { dayDiv.innerHTML += `<div class="tag tag-siparis">📦 ${sip.musteri_adi}</div>`; });
        gununNotlari.forEach(not => { dayDiv.innerHTML += `<div class="tag tag-not">📌 ${not.not_icerik}</div>`; });
        
        grid.appendChild(dayDiv);
    }
}

function openModal(dateStr, siparisler, notlar) {
    selectedDateStr = dateStr;
    const modal = document.getElementById('dayModal');
    const title = document.getElementById('modalDateTitle');
    const body = document.getElementById('modalBody');
    const dateObj = new Date(dateStr);
    title.innerText = dateObj.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
    body.innerHTML = '';
    
    if (siparisler.length === 0 && notlar.length === 0) { 
        body.innerHTML = '<p style="text-align:center; color:#999;">Kayıt yok.</p>'; 
    }
    
    siparisler.forEach(sip => { 
        let detay = `${sip.kategori || 'Genel'}`;
        if(sip.urunler) { 
            try { 
                const u = JSON.parse(sip.urunler); 
                if(u.length > 0) detay = `${u[0].kategori} (+${u.length-1})`; 
            } catch(e) {} 
        }
        body.innerHTML += `<div class="modal-item" style="border-left: 4px solid #e67e22; padding:5px; margin-bottom:5px; background:#fff;"><div><strong>📦 ${sip.musteri_adi}</strong> (${detay})<br><small>${sip.siparis_notu || ''}</small></div><span style="font-weight:bold;">${sip.fiyat} TL</span></div>`; 
    });
    
    notlar.forEach(not => { 
        body.innerHTML += `<div class="modal-item" style="border-left: 4px solid #9b59b6; padding:5px; margin-bottom:5px; background:#fff;"><span>📌 ${not.not_icerik}</span><button class="btn-sil" onclick="notSil(${not.id})" style="float:right; padding:2px 5px;">Sil</button></div>`; 
    });
    
    modal.style.display = 'flex';
}

function changeMonth(direction) { currentDate.setMonth(currentDate.getMonth() + direction); loadCalendar(); }

async function saveModalNote() {
    const input = document.getElementById('modalNoteInput');
    const text = input.value;
    if (!text) return alert("Not yazın.");
    await fetch('/api/hatirlaticilar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ not_icerik: text, tarih: selectedDateStr }) });
    input.value = ''; closeModal(); loadCalendar();
}

async function notSil(id) { 
    if(confirm('Not silinsin mi?')) { 
        await fetch(`/api/hatirlaticilar/${id}`, { method: 'DELETE' }); 
        closeModal(); 
        loadCalendar(); 
    } 
}

function closeModal() { 
    if(document.getElementById('dayModal')) document.getElementById('dayModal').style.display = 'none'; 
}

// Global window click handler for closing modals
window.onclick = function(event) {
    const dayModal = document.getElementById('dayModal'); 
    const editModal = document.getElementById('editModal');
    const detailModal = document.getElementById('detailModal');
    const stockModal = document.getElementById('stockModal');
    const editStockModal = document.getElementById('editStockModal');
    const imageModal = document.getElementById('imageModal');
    
    if (event.target == dayModal) dayModal.style.display = 'none'; 
    if (event.target == editModal) editModal.style.display = 'none';
    if (event.target == detailModal) detailModal.style.display = 'none';
    if (event.target == stockModal) stockModal.style.display = 'none';
    if (event.target == editStockModal) editStockModal.style.display = 'none';
    if (event.target == imageModal) closeImageModal(); 
}

// --- RESİM GÖRÜNTÜLEYİCİ FONKSİYONLARI ---
function openImageModal(src) {
    const modal = document.getElementById('imageModal');
    const img = document.getElementById('imgViewer');
    img.src = src;
    modal.style.display = 'flex'; // CSS'te flex tanımlı olduğu için
}

function closeImageModal() {
    document.getElementById('imageModal').style.display = 'none';
}

async function girisYap() {
    const pin = document.getElementById('pinInput').value;
    const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({pin}) });
    const data = await res.json();
    if (data.success) ekraniAc(); else document.getElementById('loginHata').style.display='block';
}

async function cikisYap() { await fetch('/api/logout'); window.location.reload(); }

function ekraniAc() { 
    if(document.getElementById('loginEkrani')) { 
        document.getElementById('loginEkrani').style.display = 'none'; 
        document.getElementById('dashboard').style.display = 'block'; 
    } 
}

async function siparisSil(id) { 
    if(confirm('Sipariş silinsin mi?')) { 
        await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); 
        getSiparisler(); 
    } 
}