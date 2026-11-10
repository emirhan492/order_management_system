// Açık / koyu tema. <head> içinde, sayfa çizilmeden önce yüklenir; böylece
// koyu temada sayfa açılırken beyaz bir anlık parlama (flash) olmaz.
(function () {
    var KEY = 'papatya-tema';
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function kayitliTema() {
        try { var t = localStorage.getItem(KEY); return t === 'dark' || t === 'light' ? t : null; } catch (e) { return null; }
    }
    function sistemTemasi() { return media && media.matches ? 'dark' : 'light'; }

    function uygula(tema) {
        root.setAttribute('data-theme', tema);
        var btn = document.getElementById('themeToggle');
        if (btn) {
            var koyu = tema === 'dark';
            btn.textContent = koyu ? '☀️' : '🌙';
            btn.setAttribute('aria-label', koyu ? 'Açık temaya geç' : 'Koyu temaya geç');
            btn.title = btn.getAttribute('aria-label');
        }
    }

    // Kullanıcı seçim yapmadıysa cihazın (telefon/bilgisayar) ayarını izle.
    uygula(kayitliTema() || sistemTemasi());
    if (media && media.addEventListener) {
        media.addEventListener('change', function () { if (!kayitliTema()) uygula(sistemTemasi()); });
    }

    window.temaDegistir = function () {
        var yeni = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, yeni); } catch (e) { /* gizli sekme vb. */ }
        uygula(yeni);
    };

    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'themeToggle';
        btn.className = 'theme-toggle';
        btn.addEventListener('click', window.temaDegistir);
        document.body.appendChild(btn);
        uygula(root.getAttribute('data-theme'));
    });
})();
