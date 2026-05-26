// --- SİSTEM STATE YAPISI ---
let state = {
    transactions: [],
    installments: [],
    cashLogs: [],
    categories: {
        gelir: ['Maaş', 'Freelance Proje', 'Kira Geliri', 'Ek Gelir'],
        gider: ['Market Alışverişi', 'Kira Ödemesi', 'İnternet Faturası', 'Güneş Ada Giderleri'],
        yatirim: ['Hisse Senedi Alımı', 'Bireysel Emeklilik (BES)', 'Para Piyasası Fonu (PPF)', 'Altın/Emtia']
    },
    targetKasa: 100000,
    currentTab: 'gelir'
};

// LocalStorage Yükleme
function loadState() {
    const saved = localStorage.getItem('PREMIUM_FINANS_STATE');
    if (saved) {
        try { 
            state = JSON.parse(saved); 
        } catch (e) { 
            console.error("State yüklenirken hata oluştu, varsayılana dönülüyor:", e); 
        }
    }
}

// LocalStorage Kaydetme
function saveState() {
    localStorage.setItem('PREMIUM_FINANS_STATE', JSON.stringify(state));
}

// --- PARA FORMATLAYICI (1.000.000,00 TL Formatı) ---
function formatTL(amount) {
    let val = parseFloat(amount);
    if (isNaN(val)) val = 0;
    return val.toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' TL';
}

// --- MENÜ VE ÇEKMECELER (DRAWER) ---
function toggleDrawer() {
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('active');
        overlay.classList.toggle('active');
    }
}

function changePage(pageId, activeNavButton) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(n => n.classList.remove('active'));
    
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.add('active');
    
    if (activeNavButton) {
        activeNavButton.classList.add('active');
    } else {
        document.querySelectorAll('.nav-tab').forEach(btn => {
            if (btn.getAttribute('data-page') === pageId) btn.classList.add('active');
        });
    }
    renderApp();
}

// --- FİLTRE VE TARİH YÖNETİMİ ---
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

function initDateFilters() {
    const aySelect = document.getElementById('filter-ay');
    const yilSelect = document.getElementById('filter-yil');
    
    if (aySelect && aySelect.options.length === 0) {
        AYLAR.forEach((ay, idx) => {
            let opt = document.createElement('option');
            opt.value = idx + 1; 
            opt.text = ay;
            aySelect.appendChild(opt);
        });
        
        for (let y = 2026; y <= 2040; y++) {
            let opt = document.createElement('option');
            opt.value = y; 
            opt.text = y;
            yilSelect.appendChild(opt);
        }
        
        const bugun = new Date();
        aySelect.value = bugun.getMonth() + 1;
        yilSelect.value = 2026; // Varsayılan başlangıç yılı
    }
}

function getSelectedDate() {
    const aySelect = document.getElementById('filter-ay');
    const yilSelect = document.getElementById('filter-yil');
    return {
        ay: aySelect ? parseInt(aySelect.value) : new Date().getMonth() + 1,
        yil: yilSelect ? parseInt(yilSelect.value) : 2026
    };
}

// --- TAM SENKRONİZE TAKSİT MOTORU ---
function getActiveInstallmentsForMonth(targetAy, targetYil) {
    let monthlyInstallments = [];
    
    if (!state.installments) return monthlyInstallments;

    state.installments.forEach(ins => {
        if (!ins.startDate) return;
        
        let parts = ins.startDate.split('-');
        let startYear = parseInt(parts[0]);
        let startMonth = parseInt(parts[1]);
        
        // Hedef tarih ile başlangıç tarihi arasındaki ay farkı
        let diffMonths = (targetYil - startYear) * 12 + (targetAy - startMonth);
        
        if (diffMonths >= 0 && diffMonths < ins.count) {
            let runningNumber = diffMonths + 1;
            let monthlyAmount = parseFloat(ins.totalAmount || 0) / parseInt(ins.count || 1);
            
            monthlyInstallments.push({
                id: `ins-${ins.id}-${runningNumber}`,
                isInstallment: true,
                parentID: ins.id,
                type: 'gider',
                category: 'Taksitli Ödeme',
                description: `${ins.description} (${runningNumber}/${ins.count} Taksit)`,
                estimatedAmount: monthlyAmount,
                realizedAmount: monthlyAmount,
                date: `${targetYil}-${String(targetAy).padStart(2,'0')}-15`
            });
        }
    });
    return monthlyInstallments;
}

// --- ANA HESAPLAMA VE RENDER MOTORU ---
function renderApp() {
    initDateFilters();
    const sel = getSelectedDate();
    
    // Seçili aya ait normal işlemler
    let currentTransactions = state.transactions.filter(t => {
        if (!t.date) return false;
        let d = new Date(t.date);
        return (d.getMonth() + 1 === sel.ay && d.getFullYear() === sel.yil);
    });
    
    // Seçili aya ait aktif taksitler
    let activeIns = getActiveInstallmentsForMonth(sel.ay, sel.yil);
    let totalTransactionsAndIns = [...currentTransactions, ...activeIns];

    let totals = {
        gelir: { est: 0, real: 0 },
        gider: { est: 0, real: 0 },
        yatirim: { est: 0, real: 0 }
    };

    totalTransactionsAndIns.forEach(t => {
        if (totals[t.type]) {
            totals[t.type].est += parseFloat(t.estimatedAmount || 0);
            totals[t.type].real += parseFloat(t.realizedAmount || 0);
        }
    });

    // Net Bakiye ve Renk Kodlaması (Eksi ise Kırmızı, Artı ise Yeşil)
    let netBakiye = totals.gelir.real - (totals.gider.real + totals.yatirim.real);
    const islemNet = document.getElementById('dash-net-bakiye');
    if (islemNet) {
        islemNet.innerText = formatTL(netBakiye);
        islemNet.style.color = (netBakiye < 0) ? 'var(--color-gider)' : 'var(--color-gelir)';
    }

    // Arayüz kart değerlerini güncelleme
    if(document.getElementById('dash-tahmini-gelir')) document.getElementById('dash-tahmini-gelir').innerText = formatTL(totals.gelir.est);
    if(document.getElementById('dash-gerceklesen-gelir')) document.getElementById('dash-gerceklesen-gelir').innerText = formatTL(totals.gelir.real);
    if(document.getElementById('dash-tahmini-gider')) document.getElementById('dash-tahmini-gider').innerText = formatTL(totals.gider.est);
    if(document.getElementById('dash-gider-degisim')) document.getElementById('dash-gerceklesen-gider').innerText = formatTL(totals.gider.real);
    if(document.getElementById('dash-tahmini-yatirim')) document.getElementById('dash-tahmini-yatirim').innerText = formatTL(totals.yatirim.est);
    if(document.getElementById('dash-gerceklesen-yatirim')) document.getElementById('dash-gerceklesen-yatirim').innerText = formatTL(totals.yatirim.real);

    // Kümülatif Kasa (Birikim) Hesaplama
    let totalKasaLogs = state.cashLogs.reduce((sum, log) => log.type === 'ekle' ? sum + parseFloat(log.amount || 0) : sum - parseFloat(log.amount || 0), 0);
    let allTimeGelir = state.transactions.reduce((sum, t) => t.type === 'gelir' ? sum + parseFloat(t.realizedAmount || 0) : sum, 0);
    let allTimeGiderYatirim = state.transactions.reduce((sum, t) => (t.type === 'gider' || t.type === 'yatirim') ? sum + parseFloat(t.realizedAmount || 0) : sum, 0);
    
    // Geçmişten seçili aya kadar olan tüm taksitlerin toplamını hesaplama
    let allTimeTaksitSum = 0;
    for (let y = 2026; y <= sel.yil; y++) {
        let maxM = (y === sel.yil) ? sel.ay : 12;
        for (let m = 1; m <= maxM; m++) {
            allTimeTaksitSum += getActiveInstallmentsForMonth(m, y).reduce((s, i) => s + parseFloat(i.realizedAmount || 0), 0);
        }
    }

    let netKasaBakiyesi = totalKasaLogs + allTimeGelir - (allTimeGiderYatirim + allTimeTaksitSum);
    
    // Kasa kartlarını doldurma
    const kasaAnaBakiye = document.getElementById('kasa-toplam-bakiye');
    if (kasaAnaBakiye) kasaAnaBakiye.innerText = formatTL(netKasaBakiyesi);
    
    const kasaSayfasiBakiye = document.getElementById('kasa-sayfasi-bakiye');
    if (kasaSayfasiBakiye) kasaSayfasiBakiye.innerText = formatTL(netKasaBakiyesi);

    // Hedef Kasa Kontrolleri
    if (document.getElementById('dash-hedef-text')) document.getElementById('dash-hedef-text').innerText = formatTL(state.targetKasa);
    let kalanHedef = state.targetKasa - netKasaBakiyesi;
    if (document.getElementById('dash-kalan-hedef')) document.getElementById('dash-kalan-hedef').innerText = formatTL(kalanHedef < 0 ? 0 : kalanHedef);
    
    let hedeflenYuzde = state.targetKasa > 0 ? Math.min(Math.round((netKasaBakiyesi / state.targetKasa) * 100), 100) : 0;
    if (hedeflenYuzde < 0) hedeflenYuzde = 0;
    if (document.getElementById('dash-kasa-hedef-yuzde')) document.getElementById('dash-kasa-hedef-yuzde').innerText = `%${hedeflenYuzde}`;
    
    const circle = document.querySelector('.circle-progress-container');
    if (circle) {
        circle.style.background = `conic-gradient(var(--color-gelir) ${hedeflenYuzde}%, #e2e8f0 ${hedeflenYuzde}%)`;
    }

    // Yatırıma Ayrılan Oran
    let yatirimOrani = totals.gelir.real > 0 ? Math.round((totals.yatirim.real / totals.gelir.real) * 100) : 0;
    if (document.getElementById('dash-yatirim-orani')) document.getElementById('dash-yatirim-orani').innerText = `%${yatirimOrani}`;

    // En Fazla Gelir / Gider Özeti
    let maxGelirItem = totalTransactionsAndIns.filter(t => t.type === 'gelir').sort((a,b) => b.realizedAmount - a.realizedAmount)[0];
    let maxGiderItem = totalTransactionsAndIns.filter(t => t.type === 'gider').sort((a,b) => b.realizedAmount - a.realizedAmount)[0];
    if (document.getElementById('high-max-gelir')) document.getElementById('high-max-gelir').innerText = maxGelirItem ? `${maxGelirItem.category} (${formatTL(maxGelirItem.realizedAmount)})` : '-';
    if (document.getElementById('high-max-gider')) document.getElementById('high-max-gider').innerText = maxGiderItem ? `${maxGiderItem.category} (${formatTL(maxGiderItem.realizedAmount)})` : '-';

    // Alt Alt Listeleri Tetikle
    renderIslemlerListesi();
    renderKasaListesi();
    renderTaksitListesi();
    renderAyarlarKategorileri();
}

// --- İŞLEMLER LİSTELEME VE CRUD ---
function renderIslemlerListesi() {
    const container = document.getElementById('islem-listesi');
    if (!container) return;
    container.innerHTML = '';

    const sel = getSelectedDate();
    let items = state.transactions.filter(t => {
        if (!t.date) return false;
        let d = new Date(t.date);
        return (d.getMonth() + 1 === sel.ay && d.getFullYear() === sel.yil && t.type === state.currentTab);
    });

    if (state.currentTab === 'gider') {
        items = [...items, ...getActiveInstallmentsForMonth(sel.ay, sel.yil)];
    }

    if (items.length === 0) {
        container.innerHTML = '<p style="color:var(--text-gray); text-align:center; padding:20px; font-size:13px;">Kayıt bulunamadı.</p>';
        return;
    }

    items.forEach(item => {
        let row = document.createElement('div');
        row.className = 'item-row';
        
        let controls = item.isInstallment ? `<span style="font-size:11px; color:var(--color-accent); font-weight:600;">Otomatik Plan</span>` : `
            <div class="item-control-buttons">
                <button type="button" class="mini-btn m-edit" data-id="${item.id}">Düzenle</button>
                <button type="button" class="mini-btn m-delete" data-id="${item.id}">Sil</button>
            </div>
        `;

        row.innerHTML = `
            <div class="row-header-side">
                <h5>${item.category}</h5>
                <span>${item.description || ''}</span><br>
                <span>📅 ${item.date}</span>
            </div>
            <div class="row-value-side">
                <p>${formatTL(item.realizedAmount)}</p>
                <span>Tahmini: ${formatTL(item.estimatedAmount)}</span>
                ${controls}
            </div>
        `;
        container.appendChild(row);
    });

    container.querySelectorAll('.m-edit').forEach(btn => {
        btn.addEventListener('click', () => openEditIslem(btn.getAttribute('data-id')));
    });
    container.querySelectorAll('.m-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteIslem(btn.getAttribute('data-id')));
    });
}

function openQuickAdd() {
    document.getElementById('form-islem-id').value = '';
    document.getElementById('modal-islem-baslik').innerText = `Yeni ${state.currentTab.toUpperCase()} Girişi`;
    
    const katSelect = document.getElementById('form-islem-kategori');
    if (katSelect) {
        katSelect.innerHTML = '';
        state.categories[state.currentTab].forEach(k => {
            let opt = document.createElement('option');
            opt.value = k; 
            opt.text = k;
            katSelect.appendChild(opt);
        });
    }

    document.getElementById('form-islem-tahmini').value = '';
    document.getElementById('form-islem-gerceklesen').value = '';
    document.getElementById('form-islem-tarih').value = new Date().toISOString().split('T')[0];
    document.getElementById('form-islem-aciklama').value = '';
    
    document.getElementById('modal-islem').classList.add('active');
}

function openEditIslem(id) {
    let item = state.transactions.find(t => t.id === id);
    if (!item) return;

    document.getElementById('form-islem-id').value = item.id;
    document.getElementById('modal-islem-baslik').innerText = "İşlem Düzenle";

    const katSelect = document.getElementById('form-islem-kategori');
    if (katSelect) {
        katSelect.innerHTML = '';
        state.categories[item.type].forEach(k => {
            let opt = document.createElement('option');
            opt.value = k; 
            opt.text = k;
            if (k === item.category) opt.selected = true;
            katSelect.appendChild(opt);
        });
    }

    document.getElementById('form-islem-tahmini').value = item.estimatedAmount;
    document.getElementById('form-islem-gerceklesen').value = item.realizedAmount;
    document.getElementById('form-islem-tarih').value = item.date;
    document.getElementById('form-islem-aciklama').value = item.description;

    document.getElementById('modal-islem').classList.add('active');
}

function saveIslem() {
    let id = document.getElementById('form-islem-id').value;
    let category = document.getElementById('form-islem-kategori').value;
    let est = parseFloat(document.getElementById('form-islem-tahmini').value) || 0;
    let real = parseFloat(document.getElementById('form-islem-gerceklesen').value) || 0;
    let date = document.getElementById('form-islem-tarih').value;
    let desc = document.getElementById('form-islem-aciklama').value;

    if (!date) {
        alert("Lütfen bir tarih seçin.");
        return;
    }

    if (id) {
        let idx = state.transactions.findIndex(t => t.id === id);
        if (idx > -1) {
            state.transactions[idx].category = category;
            state.transactions[idx].estimatedAmount = est;
            state.transactions[idx].realizedAmount = real;
            state.transactions[idx].date = date;
            state.transactions[idx].description = desc;
        }
    } else {
        state.transactions.push({
            id: 'tx-' + Date.now(),
            type: state.currentTab,
            category: category,
            estimatedAmount: est,
            realizedAmount: real,
            date: date,
            description: desc
        });
    }
    saveState();
    document.getElementById('modal-islem').classList.remove('active');
    renderApp();
}

function deleteIslem(id) {
    if (confirm("Bu işlemi silmek istediğinize emin misiniz?")) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveState();
        renderApp();
    }
}

// --- MANUEL KASA HAREKETLERİ ---
function openKasaModal(type) {
    document.getElementById('form-kasa-turu').value = type;
    document.getElementById('modal-kasa-baslik').innerText = type === 'ekle' ? 'Kasaya Nakit Girişi' : 'Kasadan Nakit Çıkışı';
    document.getElementById('form-kasa-tutar').value = '';
    document.getElementById('form-kasa-aciklama').value = '';
    document.getElementById('modal-kasa').classList.add('active');
}

function saveKasaHareket() {
    let type = document.getElementById('form-kasa-turu').value;
    let amount = parseFloat(document.getElementById('form-kasa-tutar').value) || 0;
    let desc = document.getElementById('form-kasa-aciklama').value;
    const sel = getSelectedDate();

    if (amount <= 0 || !desc) {
        alert("Lütfen geçerli bir tutar ve açıklama girin.");
        return;
    }

    state.cashLogs.push({
        id: 'klog-' + Date.now(),
        type: type,
        amount: amount,
        description: desc,
        ay: sel.ay,
        yil: sel.yil,
        date: new Date().toISOString().split('T')[0]
    });
    saveState();
    document.getElementById('modal-kasa').classList.remove('active');
    renderApp();
}

function renderKasaListesi() {
    const container = document.getElementById('kasa-hareket-listesi');
    if (!container) return;
    container.innerHTML = '';
    
    const sel = getSelectedDate();
    let logs = state.cashLogs.filter(l => l.ay === sel.ay && l.yil === sel.yil);

    if (logs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-gray); text-align:center; padding:20px; font-size:13px;">Bu aya ait kasa hareketi yok.</p>';
        return;
    }

    logs.forEach(log => {
        let row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <div class="row-header-side">
                <h5>${log.description}</h5>
                <span>📅 ${log.date}</span>
            </div>
            <div class="row-value-side">
                <p style="color:${log.type === 'ekle' ? 'var(--color-gelir)':'var(--color-gider)'}">
                    ${log.type === 'ekle' ? '+' : '-'} ${formatTL(log.amount)}
                </p>
                <div class="item-control-buttons">
                    <button type="button" class="mini-btn m-delete" data-id="${log.id}">Sil</button>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
    
    container.querySelectorAll('.m-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            state.cashLogs = state.cashLogs.filter(c => c.id !== btn.getAttribute('data-id'));
            saveState(); 
            renderApp();
        });
    });
}

// --- TAKSİT PLANLAMA ---
function saveTaksit() {
    let type = document.getElementById('form-taksit-turu').value;
    let desc = document.getElementById('form-taksit-aciklama').value;
    let total = parseFloat(document.getElementById('form-taksit-toplam').value) || 0;
    let count = parseInt(document.getElementById('form-taksit-sayisi').value) || 0;
    let date = document.getElementById('form-taksit-tarih').value;

    if (!desc || total <= 0 || count < 2 || !date) {
        alert("Lütfen tüm alanları eksiksiz ve doğru doldurun (En az 2 taksit).");
        return;
    }

    state.installments.push({
        id: 'ins-' + Date.now(), 
        type, 
        description: desc, 
        totalAmount: total, 
        count, 
        startDate: date
    });
    saveState();
    document.getElementById('modal-taksit').classList.remove('active');
    renderApp();
}

function renderTaksitPlanListesi() {
    const container = document.getElementById('taksit-plan-listesi');
    if (!container) return; 
    container.innerHTML = '';
    
    if (state.installments.length === 0) {
        container.innerHTML = '<p style="color:var(--text-gray); text-align:center; padding:20px; font-size:13px;">Aktif taksitli plan bulunmuyor.</p>';
        return;
    }

    state.installments.forEach(ins => {
        let row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <div class="row-header-side">
                <h5>${ins.description}</h5>
                <span>${ins.type} (${ins.count} Ay)</span>
            </div>
            <div class="row-value-side">
                <p>${formatTL(ins.totalAmount)}</p>
                <div class="item-control-buttons">
                    <button type="button" class="mini-btn m-delete" data-id="${ins.id}">Planı İptal Et</button>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
    
    container.querySelectorAll('.m-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            if(confirm("Bu taksit planını ve tüm taksitlerini tamamen silmek istiyor musunuz?")) {
                state.installments = state.installments.filter(i => i.id !== btn.getAttribute('data-id'));
                saveState(); 
                renderApp();
            }
        });
    });
}

// Global ismi sarmalayıcıya yönlendiriyoruz
function renderTaksitListesi() {
    renderTaksitPlanListesi();
}

// --- KATEGORİ VE AYARLAR ---
function renderAyarlarKategorileri() {
    const container = document.getElementById('ayar-kategori-listesi');
    if (!container) return; 
    container.innerHTML = '';
    
    let type = document.getElementById('ayar-kategori-turu').value;
    if(document.getElementById('input-hedef-kasa')) {
        document.getElementById('input-hedef-kasa').value = state.targetKasa;
    }

    state.categories[type].forEach(kat => {
        let chip = document.createElement('div');
        chip.className = 'category-chip';
        chip.innerHTML = `${kat} <b data-kat="${kat}">×</b>`;
        container.appendChild(chip);
    });

    container.querySelectorAll('b').forEach(btn => {
        btn.addEventListener('click', () => {
            state.categories[type] = state.categories[type].filter(k => k !== btn.getAttribute('data-kat'));
            saveState(); 
            renderApp();
        });
    });
}

// --- EVENT LISTENERS (OLAY DİNLEYİCİLERİ) ---
document.addEventListener("DOMContentLoaded", function() {
    loadState();
    renderApp();

    // Filtre Değişimleri
    document.getElementById('filter-ay').addEventListener('change', renderApp);
    document.getElementById('filter-yil').addEventListener('change', renderApp);

    // Alt Navigasyon Sekme Geçişleri
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', function() {
            changePage(this.getAttribute('data-page'), this);
        });
    });

    // Drawer Tetikleyicileri
    document.getElementById('btn-open-drawer').addEventListener('click', toggleDrawer);
    document.getElementById('btn-close-drawer').addEventListener('click', toggleDrawer);
    document.getElementById('drawer-overlay').addEventListener('click', toggleDrawer);

    document.querySelectorAll('.drawer-menu a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            toggleDrawer();
            changePage(this.getAttribute('data-target'), null);
        });
    });

    // İşlemler Sayfası İç Sekme Yönetimi (Gelir/Gider/Yatırım)
    document.getElementById('tab-gelir').addEventListener('click', () => { 
        state.currentTab = 'gelir'; 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
        document.getElementById('tab-gelir').classList.add('active'); 
        renderIslemlerListesi(); 
    });
    
    document.getElementById('tab-gider').addEventListener('click', () => { 
        state.currentTab = 'gider'; 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
        document.getElementById('tab-gider').classList.add('active'); 
        renderIslemlerListesi(); 
    });
    
    document.getElementById('tab-yatirim').addEventListener('click', () => { 
        state.currentTab = 'yatirim'; 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
        document.getElementById('tab-yatirim').classList.add('active'); 
        renderIslemlerListesi(); 
    });

    // Hızlı İşlem Ekleme & Kaydetme
    document.getElementById('btn-quick-add').addEventListener('click', openQuickAdd);
    document.getElementById('btn-save-islem').addEventListener('click', saveIslem);

    // Manuel Kasa Kontrolleri
    document.getElementById('btn-kasa-ekle').addEventListener('click', () => openKasaModal('ekle'));
    document.getElementById('btn-kasa-cikar').addEventListener('click', () => openKasaModal('cikar'));
    document.getElementById('btn-save-kasa-hareket').addEventListener('click', saveKasaHareket);

    // Taksit Modalı Tetikleme & Kaydetme
    document.getElementById('btn-add-taksit').addEventListener('click', () => {
        document.getElementById('form-taksit-aciklama').value = '';
        document.getElementById('form-taksit-toplam').value = '';
        document.getElementById('form-taksit-sayisi').value = '';
        document.getElementById('form-taksit-tarih').value = new Date().toISOString().split('T')[0];
        document.getElementById('modal-taksit').classList.add('active');
    });
    document.getElementById('btn-save-taksit').addEventListener('click', saveTaksit);

    // Kasa Yıllık Hedef Güncelleme
    document.getElementById('btn-save-hedef').addEventListener('click', () => {
        state.targetKasa = parseFloat(document.getElementById('input-hedef-kasa').value) || 0;
        saveState(); 
        renderApp(); 
        alert("Yıllık kasa hedefi güncellendi!");
    });
    
    // Ayarlar Kategori Yönetimi
    document.getElementById('ayar-kategori-turu').addEventListener('change', renderAyarlarKategorileri);
    document.getElementById('btn-add-category').addEventListener('click', () => {
        let type = document.getElementById('ayar-kategori-turu').value;
        let name = document.getElementById('ayar-yeni-kategori').value.trim();
        if (name && !state.categories[type].includes(name)) {
            state.categories[type].push(name);
            document.getElementById('ayar-yeni-kategori').value = '';
            saveState(); 
            renderApp();
        }
    });

    // Ortak Modal Kapatıcı Sınıf Tetikleyicisi
    document.querySelectorAll('.close-modal-trigger').forEach(btn => {
        btn.addEventListener('click', function() {
            const modalId = this.getAttribute('data-modal');
            const targetModal = document.getElementById(modalId);
            if(targetModal) targetModal.classList.remove('active');
        });
    });
});