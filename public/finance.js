// --- GELİR / GİDER TABLOSU ---
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const sayiFormat = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const finans = {
    yil: (() => {
        const y = Number(new URLSearchParams(location.search).get('yil'));
        return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : new Date().getFullYear();
    })(),
    kalemler: [],
    degerler: new Map() // "kalemId-ay" → tutar
};

const hucreAnahtari = (kalemId, ay) => `${kalemId}-${ay}`;
const tutarGetir = (kalemId, ay) => finans.degerler.get(hucreAnahtari(kalemId, ay)) || 0;
const sayiYaz = (n) => sayiFormat.format(n);
const paraYaz = (n) => `${sayiFormat.format(n)} ₺`;

// "1.250,50", "1250,5", "1250.50", "1.250" gibi girişleri sayıya çevirir. Boş → null, geçersiz → NaN.
function sayiCoz(text) {
    let s = String(text).replace(/[\s₺]|TL/gi, '');
    if (s === '') return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1 || /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

function durumGoster(mesaj, tip) {
    const el = document.getElementById('kayitDurumu');
    if (!el) return;
    el.textContent = mesaj;
    el.dataset.tip = tip || '';
    clearTimeout(durumGoster.t);
    if (tip === 'ok') durumGoster.t = setTimeout(() => { el.textContent = ''; }, 2000);
}

async function api(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined
    });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Yetkisiz'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Sunucu hatası');
    return data;
}

// --- VERİ ---
async function finansYukle() {
    document.getElementById('finansYil').textContent = finans.yil;
    history.replaceState(null, '', `?yil=${finans.yil}`);
    try {
        const data = await api('GET', `/api/finans?yil=${finans.yil}`);
        finans.kalemler = data.kalemler;
        finans.degerler = new Map(data.degerler.map(d => [hucreAnahtari(d.kalem_id, d.ay), Number(d.tutar)]));
        tumunuCiz();
    } catch (e) {
        if (e.message !== 'Yetkisiz') durumGoster('⚠️ Veriler yüklenemedi: ' + e.message, 'hata');
    }
}

function yilDegistir(fark) {
    finans.yil += fark;
    finansYukle();
}

// --- ÇİZİM ---
function tumunuCiz() {
    tabloCiz('gelir');
    tabloCiz('gider');
    netTabloCiz();
    toplamlariGuncelle();
}

function aktifAy() {
    const simdi = new Date();
    return simdi.getFullYear() === finans.yil ? simdi.getMonth() + 1 : 0;
}

function baslikSatiri(ilkKolon, sonKolonlar) {
    const aktif = aktifAy();
    return `<thead><tr>
        <th class="finans-kalem-kolon">${ilkKolon}</th>
        ${AYLAR.map((a, i) => `<th class="finans-ay${i + 1 === aktif ? ' aktif-ay' : ''}">${a}</th>`).join('')}
        ${sonKolonlar}
    </tr></thead>`;
}

function tabloCiz(tur) {
    const tablo = document.getElementById(`tablo-${tur}`);
    const kalemler = finans.kalemler.filter(k => k.tur === tur);
    const aktif = aktifAy();

    const satirlar = kalemler.map((k, i) => `
        <tr data-kalem="${k.id}">
            <td class="finans-kalem-kolon">
                <input type="text" class="finans-kalem-adi" value="${esc(k.ad)}" maxlength="100" data-eski="${esc(k.ad)}" aria-label="Kalem adı">
            </td>
            ${AYLAR.map((ay, a) => {
                const t = tutarGetir(k.id, a + 1);
                return `<td class="finans-ay${a + 1 === aktif ? ' aktif-ay' : ''}">
                    <input type="text" inputmode="decimal" class="finans-hucre" data-ay="${a + 1}"
                        value="${t ? sayiYaz(t) : ''}" aria-label="${esc(k.ad)} - ${ay}">
                </td>`;
            }).join('')}
            <td class="finans-toplam" data-satir-toplam>0</td>
            <td class="finans-islem">
                <button type="button" class="finans-ikon" onclick="kalemTasi(${k.id}, 'yukari')" ${i === 0 ? 'disabled' : ''} title="Yukarı taşı" aria-label="Yukarı taşı">▲</button>
                <button type="button" class="finans-ikon" onclick="kalemTasi(${k.id}, 'asagi')" ${i === kalemler.length - 1 ? 'disabled' : ''} title="Aşağı taşı" aria-label="Aşağı taşı">▼</button>
                <button type="button" class="finans-ikon sil" onclick="kalemSil(${k.id})" title="Kalemi sil" aria-label="Kalemi sil">🗑️</button>
            </td>
        </tr>`).join('');

    const bos = `<tr><td colspan="15" class="finans-bos"><span>Henüz ${tur} kalemi yok. Aşağıdan ekleyebilirsiniz.</span></td></tr>`;

    tablo.innerHTML = `
        ${baslikSatiri('Kalem', '<th class="finans-toplam">Toplam</th><th class="finans-islem"></th>')}
        <tbody>${kalemler.length ? satirlar : bos}</tbody>
        <tfoot><tr>
            <td class="finans-kalem-kolon">Aylık Toplam</td>
            ${AYLAR.map((_, a) => `<td class="finans-ay${a + 1 === aktif ? ' aktif-ay' : ''}" data-ay-toplam="${a + 1}">0</td>`).join('')}
            <td class="finans-toplam" data-genel-toplam>0</td>
            <td class="finans-islem"></td>
        </tr></tfoot>`;
}

function netTabloCiz() {
    const aktif = aktifAy();
    const satir = (etiket, attr) => `<tr>
        <td class="finans-kalem-kolon">${etiket}</td>
        ${AYLAR.map((_, a) => `<td class="finans-ay${a + 1 === aktif ? ' aktif-ay' : ''}" ${attr}="${a + 1}">0</td>`).join('')}
        <td class="finans-toplam" ${attr}="yil">0</td>
    </tr>`;
    document.getElementById('tablo-net').innerHTML = `
        ${baslikSatiri('', '<th class="finans-toplam">Yıllık</th>')}
        <tbody>
            ${satir('Gelir', 'data-net-gelir')}
            ${satir('Gider', 'data-net-gider')}
        </tbody>
        <tfoot>${satir('Net', 'data-net')}</tfoot>`;
}

function toplamlariGuncelle() {
    const toplam = { gelir: Array(13).fill(0), gider: Array(13).fill(0) }; // [0] = yıllık

    for (const tur of ['gelir', 'gider']) {
        const tablo = document.getElementById(`tablo-${tur}`);
        for (const k of finans.kalemler.filter(x => x.tur === tur)) {
            let satirToplam = 0;
            for (let ay = 1; ay <= 12; ay++) {
                const t = tutarGetir(k.id, ay);
                satirToplam += t;
                toplam[tur][ay] += t;
            }
            toplam[tur][0] += satirToplam;
            const hucre = tablo.querySelector(`tr[data-kalem="${k.id}"] [data-satir-toplam]`);
            if (hucre) hucre.textContent = sayiYaz(satirToplam);
        }
        for (let ay = 1; ay <= 12; ay++) tablo.querySelector(`[data-ay-toplam="${ay}"]`).textContent = sayiYaz(toplam[tur][ay]);
        tablo.querySelector('[data-genel-toplam]').textContent = sayiYaz(toplam[tur][0]);
    }

    const netTablo = document.getElementById('tablo-net');
    const yaz = (attr, key, deger, renkli) => {
        const el = netTablo.querySelector(`[${attr}="${key}"]`);
        el.textContent = sayiYaz(deger);
        if (renkli) el.dataset.isaret = deger > 0 ? 'arti' : deger < 0 ? 'eksi' : '';
    };
    for (let ay = 0; ay <= 12; ay++) {
        const key = ay === 0 ? 'yil' : ay;
        yaz('data-net-gelir', key, toplam.gelir[ay]);
        yaz('data-net-gider', key, toplam.gider[ay]);
        yaz('data-net', key, toplam.gelir[ay] - toplam.gider[ay], true);
    }

    const net = toplam.gelir[0] - toplam.gider[0];
    document.getElementById('ozetGelir').textContent = paraYaz(toplam.gelir[0]);
    document.getElementById('ozetGider').textContent = paraYaz(toplam.gider[0]);
    const ozetNet = document.getElementById('ozetNet');
    ozetNet.textContent = paraYaz(net);
    ozetNet.dataset.isaret = net > 0 ? 'arti' : net < 0 ? 'eksi' : '';
}

// --- HÜCRE DÜZENLEME ---
async function hucreKaydet(input) {
    const kalemId = Number(input.closest('tr').dataset.kalem);
    const ay = Number(input.dataset.ay);
    const eski = tutarGetir(kalemId, ay);
    const yeni = sayiCoz(input.value);

    if (Number.isNaN(yeni)) {
        input.classList.add('hata');
        durumGoster('⚠️ Geçersiz tutar. Örnek: 1250 veya 1.250,50', 'hata');
        input.value = eski ? sayiYaz(eski) : '';
        setTimeout(() => input.classList.remove('hata'), 1500);
        return;
    }
    if ((yeni || 0) === eski) { input.value = eski ? sayiYaz(eski) : ''; return; }

    // İyimser güncelleme: toplamlar hemen yenilenir, hata olursa geri alınır.
    const key = hucreAnahtari(kalemId, ay);
    if (yeni) finans.degerler.set(key, yeni); else finans.degerler.delete(key);
    input.value = yeni ? sayiYaz(yeni) : '';
    toplamlariGuncelle();
    durumGoster('Kaydediliyor…');

    try {
        await api('PUT', '/api/finans/deger', { kalem_id: kalemId, yil: finans.yil, ay, tutar: yeni ? yeni : '' });
        input.classList.add('kaydedildi');
        setTimeout(() => input.classList.remove('kaydedildi'), 800);
        durumGoster('✓ Kaydedildi', 'ok');
    } catch (e) {
        if (eski) finans.degerler.set(key, eski); else finans.degerler.delete(key);
        input.value = eski ? sayiYaz(eski) : '';
        toplamlariGuncelle();
        input.classList.add('hata');
        setTimeout(() => input.classList.remove('hata'), 1500);
        durumGoster('⚠️ Kaydedilemedi: ' + e.message, 'hata');
    }
}

async function kalemAdiKaydet(input) {
    const kalemId = Number(input.closest('tr').dataset.kalem);
    const ad = input.value.trim();
    if (!ad) { input.value = input.dataset.eski; return; }
    if (ad === input.dataset.eski) return;
    try {
        await api('PUT', `/api/finans/kalemler/${kalemId}`, { ad });
        input.dataset.eski = ad;
        const k = finans.kalemler.find(x => x.id === kalemId);
        if (k) k.ad = ad;
        durumGoster('✓ Kaydedildi', 'ok');
    } catch (e) {
        input.value = input.dataset.eski;
        durumGoster('⚠️ Kaydedilemedi: ' + e.message, 'hata');
    }
}

function tabloOlaylariniBagla(tablo) {
    // Odaklanınca biçimsiz değeri göster (ör. "1.250,5" → "1250,5"), kolay düzenleme için.
    tablo.addEventListener('focusin', (e) => {
        const input = e.target;
        if (!input.classList.contains('finans-hucre')) return;
        const t = tutarGetir(Number(input.closest('tr').dataset.kalem), Number(input.dataset.ay));
        input.value = t ? String(t).replace('.', ',') : '';
        input.select();
    });
    tablo.addEventListener('focusout', (e) => {
        const input = e.target;
        if (input.classList.contains('finans-hucre')) hucreKaydet(input);
        else if (input.classList.contains('finans-kalem-adi')) kalemAdiKaydet(input);
    });
    // Enter: alttaki satırın aynı ayına geç (son satırda alanı bırak). Esc: değişikliği iptal et.
    tablo.addEventListener('keydown', (e) => {
        const input = e.target;
        if (input.tagName !== 'INPUT') return;
        if (e.key === 'Enter') {
            e.preventDefault();
            const ay = input.dataset.ay;
            const sonraki = ay && input.closest('tr').nextElementSibling?.querySelector(`.finans-hucre[data-ay="${ay}"]`);
            if (sonraki) sonraki.focus(); else input.blur();
        } else if (e.key === 'Escape') {
            if (input.classList.contains('finans-kalem-adi')) input.value = input.dataset.eski;
            else {
                const t = tutarGetir(Number(input.closest('tr').dataset.kalem), Number(input.dataset.ay));
                input.value = t ? String(t).replace('.', ',') : '';
            }
            input.blur();
        }
    });
}

// --- KALEM (SATIR) İŞLEMLERİ ---
async function kalemEkle(e, tur) {
    e.preventDefault();
    const input = e.target.querySelector('input');
    const ad = input.value.trim();
    if (!ad) { input.focus(); return; }
    try {
        const kalem = await api('POST', '/api/finans/kalemler', { tur, ad });
        finans.kalemler.push(kalem);
        input.value = '';
        tabloCiz(tur);
        toplamlariGuncelle();
        durumGoster('✓ Kalem eklendi', 'ok');
        document.querySelector(`#tablo-${tur} tr[data-kalem="${kalem.id}"] .finans-hucre[data-ay="${aktifAy() || 1}"]`)?.focus();
    } catch (err) {
        durumGoster('⚠️ Eklenemedi: ' + err.message, 'hata');
    }
}

async function kalemTasi(id, yon) {
    try {
        await api('POST', `/api/finans/kalemler/${id}/tasi`, { yon });
        await finansYukle();
    } catch (e) {
        durumGoster('⚠️ Taşınamadı: ' + e.message, 'hata');
    }
}

async function kalemSil(id) {
    const k = finans.kalemler.find(x => x.id === id);
    if (!k) return;
    if (!confirm(`"${k.ad}" kalemi silinsin mi?\n\nBu kalemin TÜM YILLARDAKİ tutarları da silinir ve geri alınamaz.`)) return;
    try {
        await api('DELETE', `/api/finans/kalemler/${id}`);
        finans.kalemler = finans.kalemler.filter(x => x.id !== id);
        for (let ay = 1; ay <= 12; ay++) finans.degerler.delete(hucreAnahtari(id, ay));
        tabloCiz(k.tur);
        toplamlariGuncelle();
        durumGoster('✓ Kalem silindi', 'ok');
    } catch (e) {
        durumGoster('⚠️ Silinemedi: ' + e.message, 'hata');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    tabloOlaylariniBagla(document.getElementById('tablo-gelir'));
    tabloOlaylariniBagla(document.getElementById('tablo-gider'));
    finansYukle();
});
