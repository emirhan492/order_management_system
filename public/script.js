const API_URL = '/api/siparisler';
let currentDate = new Date();
let selectedDateStr = "";
let tumSiparisler = []; 

// YENİ: Sıralama Durumunu Tutan Değişken
// direction: 'asc' (Artan), 'desc' (Azalan), 'default' (Yok)
let currentSort = { column: null, direction: 'default' };

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

    if (document.getElementById('siparisTablosu')) getSiparisler();
    if (document.querySelector('.calendar-grid')) loadCalendar();
});

// --- SİPARİŞ EKLEME ---
const formElement = document.getElementById('siparisForm');
if (formElement && !document.getElementById('editModal')) { 
    formElement.addEventListener('submit', async (e) => {
        e.preventDefault();
        const yeniSiparis = {
            musteri_adi: document.getElementById('musteri_adi').value,
            telefon: document.getElementById('telefon').value,
            kategori: document.getElementById('kategori').value,
            siparis_notu: document.getElementById('siparis_notu').value,
            fiyat: document.getElementById('fiyat').value,
            teslim_tarihi: document.getElementById('teslim_tarihi').value
        };
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(yeniSiparis)
        });
        if (response.ok) {
            alert('Sipariş başarıyla eklendi!');
            window.location.href = '/orders.html';
        } else {
            alert('Hata oluştu!');
        }
    });
}

// --- VERİ ÇEKME ---
async function getSiparisler() {
    const response = await fetch(API_URL);
    if (response.status === 401) { window.location.href = '/'; return; }
    tumSiparisler = await response.json();
    filterOrders();
}

// --- YENİ: SIRALAMA DEĞİŞTİRME FONKSİYONU ---
function toggleSort(column) {
    // 1. Yeni bir sütuna tıklandıysa
    if (currentSort.column !== column) {
        currentSort.column = column;
        
        // ÖZEL KURAL: Fiyat veya Tarih ise önce "Azalan" (Pahalı/Yeni) başlasın
        if (column === 'fiyat' || column === 'tarih') {
            currentSort.direction = 'desc'; 
        } else {
            // İsim gibi metinlerde önce "Artan" (A-Z) başlasın
            currentSort.direction = 'asc';
        }
    } 
    // 2. Aynı sütuna tekrar tıklandıysa (Döngü)
    else {
        // Fiyat ve Tarih Döngüsü: Desc (Pahalı) -> Asc (Ucuz) -> Default
        if (column === 'fiyat' || column === 'tarih') {
            if (currentSort.direction === 'desc') {
                currentSort.direction = 'asc'; // Pahalıdan -> Ucuza dön
            } else if (currentSort.direction === 'asc') {
                currentSort.direction = 'default'; // Sıfırla
                currentSort.column = null;
            }
        } 
        // Standart Döngü (İsim vb.): Asc (A-Z) -> Desc (Z-A) -> Default
        else {
            if (currentSort.direction === 'asc') {
                currentSort.direction = 'desc'; // A-Z'den -> Z-A'ya dön
            } else if (currentSort.direction === 'desc') {
                currentSort.direction = 'default'; // Sıfırla
                currentSort.column = null;
            }
        }
    }
    
    filterOrders(); // Tabloyu yenile
}

// --- AKILLI FİLTRELEME VE SIRALAMA ---
function filterOrders() {
    const searchText = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : "";
    const status = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : "Tümü";
    const tablo = document.getElementById('siparisTablosu');
    
    if (!tablo) return;

    // 1. ADIM: FİLTRELEME
    let filteredData = tumSiparisler.filter(siparis => {
        const isimMatch = siparis.musteri_adi.toLowerCase().includes(searchText);
        const telMatch = siparis.telefon.includes(searchText);
        const searchMatch = isimMatch || telMatch;
        const statusMatch = (status === 'Tümü') || (siparis.durum === status);
        return searchMatch && statusMatch;
    });

    // 2. ADIM: SIRALAMA (YENİ MANTIK)
    if (currentSort.column && currentSort.direction !== 'default') {
        filteredData.sort((a, b) => {
            let valA, valB;

            // Hangi veriyi kıyaslayacağız?
            if (currentSort.column === 'musteri') {
                valA = a.musteri_adi.toLowerCase();
                valB = b.musteri_adi.toLowerCase();
                // Metin kıyaslama
                if (valA < valB) return currentSort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return currentSort.direction === 'asc' ? 1 : -1;
                return 0;
            } 
            else if (currentSort.column === 'tarih') {
                valA = new Date(a.teslim_tarihi);
                valB = new Date(b.teslim_tarihi);
                // Tarih kıyaslama
                return currentSort.direction === 'asc' ? valA - valB : valB - valA;
            } 
            else if (currentSort.column === 'fiyat') {
                valA = Number(a.fiyat);
                valB = Number(b.fiyat);
                // Sayı kıyaslama
                return currentSort.direction === 'asc' ? valA - valB : valB - valA;
            }
        });
    }

    // 3. ADIM: OK İŞARETLERİNİ GÜNCELLEME
    // Önce tüm ikonları temizle
    ['musteri', 'tarih', 'fiyat'].forEach(col => {
        const icon = document.getElementById(`icon-${col}`);
        if(icon) icon.innerText = '';
    });

    // Aktif sütuna ok koy
    if (currentSort.column && currentSort.direction !== 'default') {
        const activeIcon = document.getElementById(`icon-${currentSort.column}`);
        if (activeIcon) {
            // Asc (A-Z) = Aşağı Ok (▼), Desc (Z-A) = Yukarı Ok (▲)
            activeIcon.innerText = currentSort.direction === 'asc' ? '▼' : '▲';
        }
    }

    // 4. ADIM: ÇİZİM
    tablo.innerHTML = ''; 
    if (filteredData.length === 0) {
        tablo.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Kayıt bulunamadı.</td></tr>';
        return;
    }

    filteredData.forEach(siparis => {
        const tarih = new Date(siparis.siparis_tarihi).toLocaleDateString('tr-TR');
        const teslim = new Date(siparis.teslim_tarihi).toLocaleDateString('tr-TR');
        const kategoriGoster = siparis.kategori || 'Genel';
        const notGoster = siparis.siparis_notu || siparis.urun_detayi || '-';

        const fiyat = Number(siparis.fiyat);
        const odenen = Number(siparis.odenen_tutar || 0);
        const kalan = fiyat - odenen;
        
        let borcDurumuHTML = '';
        if (kalan <= 0) {
            borcDurumuHTML = '<span style="color: green; font-weight: bold; font-size: 12px;">✅ Ödendi</span>';
        } else {
            borcDurumuHTML = `<span style="color: red; font-weight: bold; font-size: 12px;">Kalan: ${kalan} TL</span>`;
        }

        let durumRenk = '#ecf0f1';
        if (siparis.durum === 'Teslim Edildi') durumRenk = '#d4edda';
        if (siparis.durum === 'Sipariş Tamamlandı') durumRenk = '#c3e6cb';
        if (siparis.durum === 'Hazırlanıyor') durumRenk = '#fff3cd';

        const satir = `
            <tr>
                <td>${siparis.musteri_adi}<br><small>${siparis.telefon}</small></td>
                <td>
                    <strong>${kategoriGoster}</strong><br>
                    <span style="font-size:12px; color:#555;">${notGoster}</span>
                </td>
                <td>Tes: ${teslim}</td>
                <td>
                    ${siparis.fiyat} TL<br>
                    ${borcDurumuHTML}
                </td>
                <td>
                    <span style="padding: 5px 10px; border-radius: 4px; background-color: ${durumRenk}; font-weight: bold; font-size: 13px; display:inline-block; min-width: 100px; text-align:center;">
                        ${siparis.durum}
                    </span>
                </td>
                <td>
                    <button class="btn-duzenle" onclick='openEditModal(${JSON.stringify(siparis)})'>Düzenle</button>
                    <button class="btn-sil" onclick="siparisSil(${siparis.id})">Sil</button>
                </td>
            </tr>
        `;
        tablo.innerHTML += satir;
    });
}

// --- DÜZENLEME PENCERESİ FONKSİYONLARI (AYNI) ---
function openEditModal(siparis) {
    const modal = document.getElementById('editModal');
    document.getElementById('editId').value = siparis.id;
    document.getElementById('editMusteri').value = siparis.musteri_adi;
    document.getElementById('editTelefon').value = siparis.telefon;
    document.getElementById('editFiyat').value = siparis.fiyat;
    document.getElementById('editKategori').value = siparis.kategori || 'Güneşlik';
    document.getElementById('editNot').value = siparis.siparis_notu || siparis.urun_detayi || '';
    document.getElementById('editDurum').value = siparis.durum || 'Bekliyor';

    const odenenDeger = siparis.odenen_tutar || 0;
    document.getElementById('editOdenen').value = odenenDeger;
    
    if (Number(odenenDeger) >= Number(siparis.fiyat) && Number(siparis.fiyat) > 0) {
        document.getElementById('editTamamiOdendi').checked = true;
    } else {
        document.getElementById('editTamamiOdendi').checked = false;
    }

    if (siparis.teslim_tarihi) {
        const rawDate = new Date(siparis.teslim_tarihi);
        const offset = rawDate.getTimezoneOffset() * 60000; 
        const localDate = new Date(rawDate.getTime() - offset);
        document.getElementById('editTarih').value = localDate.toISOString().split('T')[0];
    }
    modal.style.display = 'block';
}

function closeEditModal() { document.getElementById('editModal').style.display = 'none'; }

async function updateSiparis(e) {
    e.preventDefault();
    const id = document.getElementById('editId').value;
    const guncelVeri = {
        musteri_adi: document.getElementById('editMusteri').value,
        telefon: document.getElementById('editTelefon').value,
        kategori: document.getElementById('editKategori').value,
        siparis_notu: document.getElementById('editNot').value,
        fiyat: document.getElementById('editFiyat').value,
        teslim_tarihi: document.getElementById('editTarih').value,
        durum: document.getElementById('editDurum').value,
        odenen_tutar: document.getElementById('editOdenen').value || 0
    };
    try {
        const response = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(guncelVeri)
        });
        if (response.ok) {
            alert('Sipariş güncellendi! ✅');
            closeEditModal();
            getSiparisler();
        } else {
            alert('Güncelleme hatası!');
        }
    } catch (error) { console.error('Hata:', error); }
}

if (document.getElementById('editTamamiOdendi')) {
    document.getElementById('editTamamiOdendi').addEventListener('change', function() {
        const toplamFiyat = document.getElementById('editFiyat').value;
        const odenenInput = document.getElementById('editOdenen');
        if (this.checked) odenenInput.value = toplamFiyat;
        else odenenInput.value = 0;
    });
}

// --- TAKVİM VE ORTAK FONKSİYONLAR ---
async function loadCalendar() {
    const resSiparis = await fetch('/api/siparisler');
    const siparisler = await resSiparis.json();
    const resNotlar = await fetch('/api/hatirlaticilar');
    const notlar = await resNotlar.json();
    renderCalendar(siparisler, notlar);
}

function renderCalendar(siparisler, notlar) {
    const grid = document.querySelector('.calendar-grid');
    const monthYear = document.getElementById('currentMonthYear');
    document.querySelectorAll('.calendar-day').forEach(e => e.remove());
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    monthYear.innerText = `${monthNames[month]} ${year}`;
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startDay = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < startDay; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'calendar-day';
        emptyDiv.style.backgroundColor = '#f4f4f4';
        grid.appendChild(emptyDiv);
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
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
        gununSiparisleri.forEach(sip => {
            dayDiv.innerHTML += `<div class="tag tag-siparis">📦 ${sip.musteri_adi}</div>`;
        });
        gununNotlari.forEach(not => {
            dayDiv.innerHTML += `<div class="tag tag-not">📌 ${not.not_icerik}</div>`;
        });
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
        body.innerHTML += `
            <div class="modal-item" style="border-left: 4px solid #e67e22;">
                <div>
                    <strong>📦 ${sip.musteri_adi}</strong> (${sip.kategori || 'Genel'})<br>
                    <small>${sip.siparis_notu || sip.urun_detayi || ''}</small>
                </div>
                <span style="font-weight:bold;">${sip.fiyat} TL</span>
            </div>
        `;
    });
    notlar.forEach(not => {
        body.innerHTML += `
            <div class="modal-item" style="border-left: 4px solid #9b59b6;">
                <span>📌 ${not.not_icerik}</span>
                <button class="btn-sil" onclick="notSil(${not.id})">Sil</button>
            </div>
        `;
    });
    modal.style.display = 'block';
}

function changeMonth(direction) { currentDate.setMonth(currentDate.getMonth() + direction); loadCalendar(); }
async function saveModalNote() {
    const input = document.getElementById('modalNoteInput');
    const text = input.value;
    if (!text) return alert("Not yazın.");
    await fetch('/api/hatirlaticilar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ not_icerik: text, tarih: selectedDateStr }) });
    input.value = ''; closeModal(); loadCalendar();
}
async function notSil(id) { if(confirm('Not silinsin mi?')) { await fetch(`/api/hatirlaticilar/${id}`, { method: 'DELETE' }); closeModal(); loadCalendar(); } }
function closeModal() { if(document.getElementById('dayModal')) document.getElementById('dayModal').style.display = 'none'; }
window.onclick = function(event) {
    const dayModal = document.getElementById('dayModal');
    const editModal = document.getElementById('editModal');
    if (event.target == dayModal) dayModal.style.display = 'none';
    if (event.target == editModal) editModal.style.display = 'none';
}
async function girisYap() {
    const pin = document.getElementById('pinInput').value;
    const res = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({pin}) });
    const data = await res.json();
    if (data.success) ekraniAc(); else document.getElementById('loginHata').style.display='block';
}
async function cikisYap() { await fetch('/api/logout'); window.location.reload(); }
function ekraniAc() { if(document.getElementById('loginEkrani')) { document.getElementById('loginEkrani').style.display = 'none'; document.getElementById('dashboard').style.display = 'block'; } }
async function siparisSil(id) { if(confirm('Sipariş silinsin mi?')) { await fetch(`${API_URL}/${id}`, { method: 'DELETE' }); getSiparisler(); } }