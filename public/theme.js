// Tema: "light" (açık), "dark" (koyu) veya "system" (cihazın ayarını izler).
// <head> içinde, sayfa çizilmeden önce yüklenir; böylece açılışta beyaz parlama olmaz.
// Tercih Ayarlar sayfasından değiştirilir ve bu tarayıcıda saklanır.
(function () {
    var KEY = 'papatya-tema';
    var root = document.documentElement;
    var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function tercih() {
        try {
            var t = localStorage.getItem(KEY);
            return t === 'dark' || t === 'light' || t === 'system' ? t : 'system';
        } catch (e) { return 'system'; }
    }
    function uygula() {
        var t = tercih();
        var koyu = t === 'dark' || (t === 'system' && media && media.matches);
        root.setAttribute('data-theme', koyu ? 'dark' : 'light');
    }

    uygula();
    if (media && media.addEventListener) media.addEventListener('change', uygula);
    // Başka bir sekmede tema değişirse bu sekme de güncellenir.
    window.addEventListener('storage', function (e) { if (e.key === KEY) uygula(); });

    window.temaTercihi = tercih;
    window.temaAyarla = function (t) {
        try { localStorage.setItem(KEY, t); } catch (e) { /* gizli sekme vb. */ }
        uygula();
    };
})();
