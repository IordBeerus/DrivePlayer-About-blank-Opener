// ==================== DATA STORE ====================
const HOSTED_LIBRARY_URL = 'https://raw.githubusercontent.com/IordBeerus/DrivePlayer-About-blank-Opener/refs/heads/main/library.json';
let movies = JSON.parse(localStorage.getItem('sf_movies')) || [];
let tvShows = JSON.parse(localStorage.getItem('sf_tvshows')) || [];
let myList = JSON.parse(localStorage.getItem('sf_mylist')) || [];
let settings = JSON.parse(localStorage.getItem('sf_settings')) || {
    cloakTitle: '',
    cloakFavicon: '',
    cloakLogoText: 'MILKBOX',
    cloakLogoImage: 'https://64.media.tumblr.com/852704dade978a00bb28009588f6a0c8/tumblr_pb06ch8vDo1rnhv8oo1_500.png',
    tmdbAuth: '',
    playerServer: 'auto',
    bgColor: '#141414',
    bgImage: '',
    bgOpacity: 30,
    bgBlur: 0,
    activeTheme: '',
    heroLogo: '',
    heroLogoData: ''
};
// Rename old default branding so their saved settings reflect the new site name/logo.
(function migrateBranding() {
    let changed = false;
    if (settings.cloakLogoText === 'LUCKYFLIX') { settings.cloakLogoText = 'MILKBOX'; changed = true; }
    if (settings.cloakTitle === 'LUCKYFLIX') { settings.cloakTitle = ''; changed = true; }
    if (settings.cloakLogoImage === 'LUCKYFLIX') { settings.cloakLogoImage = 'https://64.media.tumblr.com/852704dade978a00bb28009588f6a0c8/tumblr_pb06ch8vDo1rnhv8oo1_500.png'; changed = true; }
    if (!settings.cloakLogoImage) { settings.cloakLogoImage = 'https://64.media.tumblr.com/852704dade978a00bb28009588f6a0c8/tumblr_pb06ch8vDo1rnhv8oo1_500.png'; changed = true; }
    if (changed) localStorage.setItem('sf_settings', JSON.stringify(settings));
})();
let uploadedDriveEps = [];
let uploadedFileEps = [];
let currentInfoItem = null;
let currentInfoType = null;

// ==================== UTILITY ====================
function saveData() {
    const keys = ['sf_movies', 'sf_tvshows', 'sf_mylist', 'sf_settings'];
    try {
        localStorage.setItem('sf_movies', JSON.stringify(movies));
        localStorage.setItem('sf_tvshows', JSON.stringify(tvShows));
        localStorage.setItem('sf_mylist', JSON.stringify(myList));
        localStorage.setItem('sf_settings', JSON.stringify(settings));
    } catch (err) {
        if (err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014)) {
            trimLibraryForStorage();
            try {
                localStorage.setItem('sf_movies', JSON.stringify(movies));
                localStorage.setItem('sf_tvshows', JSON.stringify(tvShows));
                localStorage.setItem('sf_mylist', JSON.stringify(myList));
                localStorage.setItem('sf_settings', JSON.stringify(settings));
                toast('Library was too large for storage, so older items were trimmed.', 'error');
            } catch (e) { toast('Storage is full. Clear some items via Edit > Remove.', 'error'); }
        } else { throw err; }
    }
}

// Estimated byte size of the current serialized library.
function libraryBytes() {
    try { return JSON.stringify(movies).length + JSON.stringify(tvShows).length + JSON.stringify(myList).length + JSON.stringify(settings).length; }
    catch (e) { return 0; }
}

// When storage is full, drop the oldest half of movies and shows (keeping My List) so the site keeps working.
function trimLibraryForStorage() {
    const dropM = Math.floor(movies.length / 2);
    const dropT = Math.floor(tvShows.length / 2);
    if (dropM > 0) movies = movies.slice(dropM);
    if (dropT > 0) tvShows = tvShows.slice(dropT);
}

// Auto-loads the full library on every open so the Load Library button isn't needed:
// first tries the hosted JSON, then always auto-runs the TMDB genre loader to top up any missing titles.
async function autoLoadHostedLibrary() {
    const alreadyHasData = movies.length > 0 || tvShows.length > 0;
    if (alreadyHasData) return;
    let loaded = false;
    if (HOSTED_LIBRARY_URL) {
        try {
            const res = await fetch(HOSTED_LIBRARY_URL, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                const m = Array.isArray(data.movies) ? data.movies.filter(x => x && x.title) : [];
                const t = Array.isArray(data.tvshows) ? data.tvshows.filter(x => x && x.title) : [];
                if (m.length || t.length) {
                    const hadNoData = !(movies.length || tvShows.length);
                    if (hadNoData) {
                        movies = m;
                        tvShows = t;
                        saveData();
                        refreshCurrent();
                        loaded = true;
                        enrichMissingLogos().catch(() => {});
                    }
                }
            }
        } catch (e) { /* fall through to TMDB auto-load */ }
    }
    // Always auto-load popular TMDB library on open — no button press needed (adds only missing titles, skips dupes)
    const before = movies.length + tvShows.length;
    try { await loadPopularContent(true); } catch (e) { /* no auto-load if TMDB fails */ }
    if (movies.length + tvShows.length > before && typeof toast === 'function') toast('Library loaded!');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function toast(msg, type = '') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (type ? ' ' + type : '');
    setTimeout(() => t.className = 'toast', 3000);
}

function convertDriveLink(url) {
    if (!url) return '';
    const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`;
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2) return `https://drive.google.com/file/d/${match2[1]}/preview`;
    if (url.includes('drive.google.com')) {
        return url.replace('/view', '/preview').replace('/edit', '/preview');
    }
    return url;
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const GENRES = [
    'anime', 'action', 'adventure', 'animation', 'biography', 'comedy', 'crime',
    'documentary', 'drama', 'family', 'fantasy', 'history', 'horror',
    'mystery', 'musical', 'romance', 'scifi', 'sport', 'thriller',
    'war', 'western'
];

const defaultPosters = {
    anime: '🌸', action: '🎬', adventure: '🧭', animation: '✨', biography: '📖',
    comedy: '😂', crime: '🕵️', documentary: '🎥', drama: '🎭',
    family: '👨‍👩‍👧', fantasy: '🐉', history: '🏛️', horror: '👻',
    mystery: '🔍', musical: '🎵', romance: '❤️', scifi: '🚀',
    sport: '🏆', thriller: '🔪', war: '🎖️', western: '🤠'
};

function genArr(genre) {
    if (Array.isArray(genre)) return genre;
    if (!genre) return [];
    return String(genre).split(',').map(g => g.trim()).filter(Boolean);
}

function isLightColor(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return false;
    const r = parseInt(m[1].substr(0, 2), 16);
    const g = parseInt(m[1].substr(2, 2), 16);
    const b = parseInt(m[1].substr(4, 2), 16);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 150;
}

// ==================== TAB CLOAK ====================
const LOCKED_LOGO = 'https://64.media.tumblr.com/852704dade978a00bb28009588f6a0c8/tumblr_pb06ch8vDo1rnhv8oo1_500.png';
const LOCKED_LOGO_FALLBACK = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2212%22%20fill%3D%22%23ffb6d8%22/%3E%3Ctext%20x%3D%2232%22%20y%3D%2242%22%20font-family%3D%22Arial%22%20font-size%3D%2232%22%20font-weight%3D%22900%22%20fill%3D%22white%22%20text-anchor%3D%22middle%22%3EM%3C/text%3E%3C/svg%3E';
function applyCloak() {
    // uploaded icon (data URL) is preferred — never blocked, no external URL needed
    try {
        const logoImg = document.querySelector('.logo-wrap .logo-image');
        const uploaded = settings.cloakLogoData || '';
        const targetSrc = uploaded || LOCKED_LOGO;
        if (logoImg) {
            logoImg.referrerPolicy = 'no-referrer';
            logoImg.onerror = function() { this.onerror = null; this.src = LOCKED_LOGO_FALLBACK; };
            logoImg.src = targetSrc;
            logoImg.style.display = '';
        }
        const inp = document.getElementById('cloakLogoImage');
        if (inp) { inp.value = uploaded ? '(uploaded image — not blocked)' : LOCKED_LOGO; inp.disabled = true; inp.style.opacity = '0.5'; inp.title = 'Use the upload below — no URL needed'; }
        // keep settings consistent
        if (!uploaded) settings.cloakLogoImage = LOCKED_LOGO;
    } catch {}
    const title = settings.cloakTitle || 'MILKBOX';
    const favicon = settings.cloakFavicon;
    const logoText = settings.cloakLogoText || 'MILKBOX';
    const logoImage = settings.cloakLogoImage;

    document.getElementById('siteTitle').textContent = title;
    document.title = title;

    if (favicon) {
        const link = document.getElementById('siteFavicon');
        link.href = favicon;
    }

    const logoEl = document.getElementById('siteLogo');
    const logoWrap = document.getElementById('logoWrap');
    const existingLogoImg = logoWrap.querySelector('img.logo-image');

    logoEl.textContent = logoText;

    if (logoImage) {
        if (!existingLogoImg) {
            const img = document.createElement('img');
            img.className = 'logo-image';
            img.src = logoImage;
            img.alt = logoText;
            img.onerror = () => img.remove();
            logoWrap.insertBefore(img, logoEl);
        } else {
            existingLogoImg.src = logoImage;
        }
    } else {
        if (existingLogoImg) existingLogoImg.remove();
    }

    document.getElementById('footerTitle').textContent = `${title} - Your Personal Streaming Platform`;
    document.querySelectorAll('.footer-brand').forEach(el => el.textContent = title);

    const cloakTitleInput = document.getElementById('cloakTitle');
    const cloakFaviconInput = document.getElementById('cloakFavicon');
    const cloakLogoTextInput = document.getElementById('cloakLogoText');
    const cloakLogoImageInput = document.getElementById('cloakLogoImage');
    if (cloakTitleInput) cloakTitleInput.value = settings.cloakTitle;
    if (cloakFaviconInput) cloakFaviconInput.value = settings.cloakFavicon;
    if (cloakLogoTextInput) cloakLogoTextInput.value = settings.cloakLogoText;
    if (cloakLogoImageInput) cloakLogoImageInput.value = settings.cloakLogoImage;

    updateLogoPreview();
}

function updateLogoPreview() {
    const preview = document.getElementById('logoPreview');
    const textEl = document.getElementById('logoPreviewText');
    if (!preview || !textEl) return;
    const logoImage = settings.cloakLogoImage;
    const logoText = settings.cloakLogoText || 'MILKBOX';

    const existingImg = preview.querySelector('img');
    if (existingImg) existingImg.remove();

    if (logoImage) {
        textEl.textContent = logoText;
        textEl.style.display = '';
        const img = document.createElement('img');
        img.src = logoImage;
        img.alt = logoText;
        img.style.maxHeight = '36px';
        img.style.marginLeft = '10px';
        img.onerror = () => { img.remove(); };
        textEl.parentNode.insertBefore(img, textEl.nextSibling);
    } else {
        textEl.style.display = '';
        textEl.textContent = logoText;
    }
}

// ==================== BACKGROUND ====================
function computeShadowColor(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return 'rgba(0,0,0,0.5)';
    let r = parseInt(m[1].substr(0, 2), 16);
    let g = parseInt(m[1].substr(2, 2), 16);
    let b = parseInt(m[1].substr(4, 2), 16);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 150) return 'rgba(0,0,0,0.45)';
    // Darken the color for a natural shadow that blends with dark themes
    r = Math.round(r * 0.55);
    g = Math.round(g * 0.55);
    b = Math.round(b * 0.55);
    return `rgba(${r},${g},${b},0.55)`;
}

function rgbString(r, g, b, a) {
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
}

function hexToRgb(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    return [
        parseInt(m[1].substr(0, 2), 16),
        parseInt(m[1].substr(2, 2), 16),
        parseInt(m[1].substr(4, 2), 16)
    ];
}

// Sample the average color of a background image so the hero shadow can match it
// Falls back to a strong dark shadow if the image can't be read (e.g. cross-origin block).
function getImageAverageColor(url, callback) {
    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const size = 32;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, size, size);
                const data = ctx.getImageData(0, 0, size, size).data;
                let r = 0, g = 0, b = 0, count = 0;
                for (let i = 0; i < data.length; i += 4) {
                    r += data[i];
                    g += data[i + 1];
                    b += data[i + 2];
                    count++;
                }
                r = r / count; g = g / count; b = b / count;
                callback(rgbString(r, g, b, 1));
            } catch (e) {
                callback(null);
            }
        };
        img.onerror = () => callback(null);
        img.src = url;
    } catch (e) {
        callback(null);
    }
}

// Compute a readable shadow color that matches the given rgb base color
function matchShadowFromRgb(r, g, b) {
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 150) return 'rgba(0,0,0,0.5)';
    return rgbString(r * 0.5, g * 0.5, b * 0.5, 0.65);
}

function applyBackground() {
    const overlay = document.getElementById('bgOverlay');
    const body = document.getElementById('siteBody');
    if (!overlay || !body) return;
    const color = settings.bgColor || '#141414';
    const image = settings.bgImage;
    const opacity = (settings.bgOpacity || 30) / 100;
    const blur = settings.bgBlur || 0;

    body.style.backgroundColor = color;
    overlay.style.setProperty('--bg-opacity', opacity);
    overlay.style.setProperty('--bg-blur', blur + 'px');
    overlay.style.setProperty('--bg-color', color);

    const colorRgb = hexToRgb(color);

    if (image) {
        // Custom background image: sample its average color so the hero shadow matches it,
        // falling back to a strong dark shadow if the image can't be read.
        body.style.setProperty('--bg-shadow', 'rgba(0,0,0,0.5)');
        body.style.setProperty('--hero-shadow', 'rgba(0,0,0,0.8)');
        getImageAverageColor(image, (avg) => {
            const p = avg ? avg.match(/\d+/g) : null;
            if (p && p.length >= 3) {
                body.style.setProperty('--hero-shadow', matchShadowFromRgb(+p[0], +p[1], +p[2]));
            }
        });
        body.style.setProperty('--hero-fade', 'rgba(0,0,0,0.9)');
        body.style.setProperty('--hero-fade-top', 'rgba(0,0,0,0)');
    } else {
        // Custom (or theme) background color: derive the hero shadow from the exact color
        const shadow = colorRgb ? matchShadowFromRgb(colorRgb[0], colorRgb[1], colorRgb[2]) : computeShadowColor(color);
        body.style.setProperty('--bg-shadow', shadow);
        body.style.setProperty('--hero-shadow', shadow);
        body.style.setProperty('--hero-fade', color);
        // Top of the fade uses the same color at 0 alpha so it blends seamlessly
        // for any background color (fixes the gray haze on white/light colors).
        body.style.setProperty('--hero-fade-top', colorRgb ? `rgba(${colorRgb[0]},${colorRgb[1]},${colorRgb[2]},0)` : 'rgba(0,0,0,0)');
    }

    const isLight = isLightColor(color);
    body.classList.toggle('light-mode', isLight);

    overlay.classList.remove('has-image', 'solid-color');

    if (image) {
        overlay.style.backgroundImage = `url("${escapeHtml(image)}")`;
        overlay.classList.add('has-image');
    } else {
        overlay.style.backgroundImage = '';
        overlay.classList.add('solid-color');
    }

    document.getElementById('bgColor').value = color;
    document.getElementById('bgColorText').value = color;
    document.getElementById('bgImage').value = image;
    document.getElementById('bgOpacity').value = settings.bgOpacity || 30;
    document.getElementById('bgOpacityVal').textContent = (settings.bgOpacity || 30) + '%';
    document.getElementById('bgBlur').value = blur;
    document.getElementById('bgBlurVal').textContent = blur + 'px';

    updateBgPreview();
}

function updateBgPreview() {
    const box = document.getElementById('bgPreviewBox');
    if (!box) return;
    const color = settings.bgColor || '#141414';
    const image = settings.bgImage;
    const opacity = (settings.bgOpacity || 30) / 100;

    box.style.backgroundColor = color;
    if (image) {
        box.style.backgroundImage = `url("${escapeHtml(image)}")`;
        box.style.backgroundSize = 'cover';
        box.style.opacity = opacity;
    } else {
        box.style.backgroundImage = '';
        box.style.opacity = 1;
    }
}

function applyTheme(themeName) {
    const themes = {
        default: { bgColor: '#141414', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        midnight: { bgColor: '#0a0a1a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        crimson: { bgColor: '#1a0a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        forest: { bgColor: '#0a1a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        ocean: { bgColor: '#0a1a2e', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        sunset: { bgColor: '#2e1a0a', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        light: { bgColor: '#f0f0f0', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        dracula: { bgColor: '#282a36', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        nord: { bgColor: '#2e3440', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        cyberpunk: { bgColor: '#0d0221', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        retro: { bgColor: '#2a1b3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        coffee: { bgColor: '#3e2723', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        lavender: { bgColor: '#2b1b3d', bgImage: '', bgOpacity: 30, bgBlur: 0 },
        matrix: { bgColor: '#021c0a', bgImage: '', bgOpacity: 30, bgBlur: 0 }
    };
    const theme = themes[themeName];
    if (!theme) return;
    Object.assign(settings, theme);
    settings.activeTheme = themeName;
    saveData();
    applyBackground();
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.dataset.theme === themeName);
    });
    toast(`Applied "${themeName}" theme`, 'success');
}

// ==================== HERO LOGO ====================
function getHeroLogoSource() {
    return settings.heroLogoData || settings.heroLogo;
}

function applyHeroLogo() {
    const src = getHeroLogoSource();
    const logo = document.getElementById('heroLogo');
    if (!logo) return;
    if (src) {
        logo.onerror = () => { logo.style.display = 'none'; };
        logo.src = src;
        logo.style.display = 'block';
    } else {
        logo.onerror = null;
        logo.removeAttribute('src');
        logo.style.display = 'none';
    }
}

// ==================== RENDER ====================
function initGenreOptions() {
    ['movieGenreOptions', 'tvGenreOptions'].forEach(id => {
        const ctn = document.getElementById(id);
        if (!ctn) return;
        ctn.innerHTML = '';
        GENRES.forEach(genre => {
            const label = document.createElement('label');
            label.className = 'genre-chip';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = genre;
            cb.className = 'genre-cb';
            const span = document.createElement('span');
            span.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
            label.appendChild(cb);
            label.appendChild(span);
            ctn.appendChild(label);
        });
    });
}

function getSelectedGenres(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)).map(cb => cb.value);
}

function setSelectedGenres(containerId, genresArr) {
    const arr = genArr(genresArr);
    document.querySelectorAll(`#${containerId} input[type=checkbox]`).forEach(cb => {
        cb.checked = arr.includes(cb.value);
    });
}

function renderAll() {
    renderMovies();
    renderTvShows();
    renderMyList();
    renderGenreRows();
    try { renderCollections(); } catch {}
    updateHero();
}

function qualityFor(key) {
    let h = 0;
    const s = String(key || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const v = h % 100;
    if (v < 50) return 'HD';
    if (v < 80) return 'HDCAM';
    return 'CAM';
}
function scheduleIdle(fn) { if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 900 }); else setTimeout(fn, 32); }
function parseRuntimeMins(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && !isNaN(v)) return v;
    const s = String(v).toLowerCase().trim();
    if (/^\d+$/.test(s)) return parseInt(s,10);
    let m=0;
    const h=s.match(/(\d+)\s*h/);
    const mm=s.match(/(\d+)\s*m/);
    if (h) m+=parseInt(h[1],10)*60;
    if (mm) m+=parseInt(mm[1],10);
    return m||null;
}

// Persist a CAM/HDCAM/HD quality label to every movie that doesn't have one yet.
// Runs once so each existing movie keeps a stable, stored badge. TV is skipped
// (always HD), and manually set qualities are never overwritten.
function scanMovieQualities(noRender) {
    let changed = false;
    movies.forEach(m => {
        if (!m || m.type === 'tv') return;
        if (m.quality === 'CAM' || m.quality === 'HDCAM' || m.quality === 'HD') return;
        m.quality = qualityFor(m.tmdbId || m.id);
        changed = true;
    });
    if (changed) {
        saveData();
        if (!noRender) refreshCurrent();
    }
    return changed;
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const effType = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const inList = myList.some(m => m.id === item.id);
    const genre = genArr(item.genre)[0] || 'action';
    const safeTitle = escapeHtml(item.title);
    const safePoster = escapeHtml(item.poster || '');
    let imgHTML = '';
    if (item.poster) {
        imgHTML = `<img class="card-img" src="${safePoster}" alt="${safeTitle}" loading="lazy" decoding="async" fetchpriority="low" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
    }
    imgHTML += `<div class="card-placeholder" style="${item.poster ? 'display:none' : ''}">${defaultPosters[genre] || '🎬'}</div>`;
    // TV shows (and anime shows) are always HD. Movies use their saved quality
    // (assigned by scanMovieQualities), falling back to a hash-based tier.
    const mcBadge = effType === 'tv' || item.type === 'tv'
        ? 'HD'
        : (item.quality === 'CAM' || item.quality === 'HDCAM' || item.quality === 'HD' ? item.quality : qualityFor(item.tmdbId || item.id));
    const badgeCls = mcBadge === 'CAM' ? 'cam' : mcBadge === 'HDCAM' ? 'hdcam' : 'hd';
    const rtMins = parseRuntimeMins(item.runtime || item.duration);
    const hashMins = (()=>{ let h=0; const s=String(item.id||item.title||''); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return 88 + (h%58); })();
    const mins = rtMins || hashMins;
    const rtLabel = `${mins}m`;
    const typeLabel = effType === 'tv' ? 'TV Show' : 'Movie';
    card.innerHTML = `
        <div class="card-badge ${badgeCls}">${mcBadge}</div>
        ${imgHTML}
        <div class="card-actions">
            <button class="card-action-btn play-btn" data-action="play" title="Play"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#000000"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg></button>
            <button class="card-action-btn" data-action="list" title="${inList ? 'Remove from My List' : 'Add to My List'}">${inList ? '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : '+'}</button>
            <button class="card-action-btn" data-action="info" title="More Info"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M440-280h80v-240h-80v240Zm68.5-331.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>
        </div>
        <div class="card-info">
            <div class="card-title">${safeTitle}</div>
            <div class="card-meta">
                <span class="card-year-runtime">${item.year || '2026'} <span class="dot">•</span> ${rtLabel}</span>
                <span class="card-type-pill">${typeLabel}</span>
            </div>
        </div>
    `;
    card.addEventListener('click', (e) => {
        const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
        if (action === 'play') playItem(item, effType);
        else if (action === 'list') toggleMyList(item, effType);
        else if (action === 'info') showInfo(item, effType);
        else if (!action) showInfo(item, effType);
    });
    return card;
}

// Per-slider lazy-load state: each row keeps its full list but only renders a window.
const SLIDER_WINDOW = 24;   // initial cards built per row
const sliderState = {};

function renderSlider(containerId, items, type) {
    const slider = document.getElementById(containerId);
    slider.innerHTML = '';
    if (items.length === 0) {
        let icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m160-800 80 160h120l-80-160h80l80 160h120l-80-160h80l80 160h120l-80-160h120q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800Zm0 240v320h640v-320H160Zm0 0v320-320Z"/></svg>', msg = 'No movies yet.';
        if (type === 'tv') { icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m853-221-53-53v-486H314l-80-80h566q33 0 56.5 23.5T880-760v480q0 18-6.5 32.5T853-221ZM127-833l73 73h-40v480h406L28-820l56-56L876-84l-56 56-172-172h-8v80H320v-80H160q-33 0-56.5-23.5T80-280v-480q0-37 23.5-55l23.5-18Zm237 351Zm195-33Z"/></svg>'; msg = 'No TV shows yet.'; }
        else if (type === 'mixed') { icon = '<svg xmlns="http://www.w3.org/2000/svg" height="48px" viewBox="0 -960 960 960" width="48px" fill="#FFFFFF"><path d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"/></svg>'; msg = 'No items in your list yet.'; }
        slider.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${icon}</div><p>${msg}<br>Click "+ Add Content" to get started!</p></div>`;
        delete sliderState[containerId];
        return;
    }
    // Store full list; render only the first window, then lazy-load the rest on scroll.
    sliderState[containerId] = { items, type, shown: Math.min(SLIDER_WINDOW, items.length) };
    const frag = document.createDocumentFragment();
    for (let i = 0; i < sliderState[containerId].shown; i++) {
        frag.appendChild(createCard(items[i], type));
    }
    slider.appendChild(frag);
}

// Appends the next batch of cards when a slider is scrolled near its end.
function sliderLoadMore(slider) {
    const st = sliderState[slider.id];
    if (!st || st.shown >= st.items.length) return;
    const next = Math.min(st.shown + SLIDER_WINDOW, st.items.length);
    const frag = document.createDocumentFragment();
    for (let i = st.shown; i < next; i++) {
        frag.appendChild(createCard(st.items[i], st.type));
    }
    slider.appendChild(frag);
    st.shown = next;
}

// Any slider scroll near the right edge triggers loading the next batch (debounced per slider).
const _sliderScrollTimers = new WeakMap();
document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('slider')) return;
    if (el.scrollLeft + el.clientWidth < el.scrollWidth - 400) return;
    if (_sliderScrollTimers.has(el)) return;
    _sliderScrollTimers.set(el, setTimeout(() => {
        _sliderScrollTimers.delete(el);
        sliderLoadMore(el);
    }, 120));
}, true);

function renderMovies() {
    const sec = document.getElementById('moviesSection');
    if (sec) sec.classList.add('catalog-grid');
    const title = document.querySelector('#moviesSection .section-title');
    if (title && title.textContent !== 'Movies') title.textContent = 'Movies';
    renderCatalogGrid('movies', 'home');
}
function renderTvShows() {
    const sec = document.getElementById('tvShowsSection');
    if (sec) sec.classList.add('catalog-grid');
    const title = document.querySelector('#tvShowsSection .section-title');
    if (title && title.textContent !== 'TV Shows') title.textContent = 'TV Shows';
    renderCatalogGrid('tvshows', 'home');
}
function renderMyList() { renderSlider('myListSlider', myList, 'mixed'); }

// ---- Paginated catalog grids (Movies / TV / Anime tab views) ----
const CATALOG_PER_PAGE = 14;
const catalogPage = { movies: 1, tvshows: 1, animeMovie: 1, animeTv: 1 };

function inYearRange(item, min, max) {
    const y = parseInt(item && item.year, 10);
    return !isNaN(y) && y >= min && y <= max;
}

function hasMovieInfo(m) {
    if (!m) return false;
    const poster = m.poster || m.poster_path || '';
    const desc = (m.description || m.overview || '').trim();
    const genre = Array.isArray(m.genre) ? m.genre.filter(Boolean).length : (m.genre ? 1 : 0);
    const rating = (m.rating || m.vote_average || '') !== '';
    return (poster && genre) || (desc && genre) || (poster && desc);
}

// Media-base completeness (year within 1895-2026 plus rating, backdrop and
// poster). Used for live feeds, which get their brand logos enriched later.
function baseComplete(m) {
    if (!m) return false;
    const y = parseInt(m.year, 10);
    if (isNaN(y) || y < 1895 || y > 2026) return false;
    if (!m.rating) return false;
    if (!(m.backdrop || '').trim()) return false;
    if (!(m.poster || '').trim()) return false;
    return true;
}

// Full library completeness: baseComplete plus a brand logo. Items missing any
// of these (rating / logo / backdrop / poster) aren't shown anywhere.
function completeItem(m) {
    return !!m && baseComplete(m) && !!((m.logo || '').trim());
}

function renderCatalogGrid(section, source) {
    const excludeAnime = source === 'home';
    const cfg = {
        movies: { items: movies.filter(m => completeItem(m) && (!excludeAnime || !isAnime(m))), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'movies' },
        tvshows: { items: tvShows.filter(m => completeItem(m) && (!excludeAnime || !isAnime(m))), type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'tvshows' },
        animeMovie: { items: (()=>{ const local=movies.filter(m=>completeItem(m)&&isAnime(m)); const live=animeLive.fed?animeLive.movies.filter(baseComplete):[]; const seen=new Set(local.map(x=>x.tmdbId||x.id)); const merged=[...local]; live.forEach(x=>{const k=x.tmdbId||x.id; if(!seen.has(k)){merged.push(x); seen.add(k);}}); return merged; })(), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'animeMovie' },
        animeTv: { items: (()=>{ const local=tvShows.filter(m=>completeItem(m)&&isAnime(m)); const live=animeLive.fed?animeLive.tv.filter(baseComplete):[]; const seen=new Set(local.map(x=>x.tmdbId||x.id)); const merged=[...local]; live.forEach(x=>{const k=x.tmdbId||x.id; if(!seen.has(k)){merged.push(x); seen.add(k);}}); return merged; })(), type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'animeTv' }
    }[section];
    if (!cfg) return;
    const slider = document.getElementById(cfg.slider);
    const pager = document.getElementById(cfg.pager);
    if (!slider) return;
    const items = cfg.items;
    slider.innerHTML = '';
    if (!items.length) {
        renderSlider(cfg.slider, items, cfg.type);
        if (pager) pager.style.display = 'none';
        return;
    }
    const total = Math.ceil(items.length / CATALOG_PER_PAGE);
    const page = Math.min(Math.max(1, catalogPage[cfg.pkey]), total);
    catalogPage[cfg.pkey] = page;
    const start = (page - 1) * CATALOG_PER_PAGE;
    const slice = items.slice(start, start + CATALOG_PER_PAGE);
    slice.forEach(item => slider.appendChild(createCard(item, cfg.type)));
    if (pager) {
        pager.style.display = '';
        let html = `<button class="pager-btn pager-nav" data-catpage="${cfg.pkey}" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 56-56-64-64h168v-80H472l64-64-56-56-160 160 160 160Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg> Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, page - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) {
            html += `<button class="pager-btn ${i === page ? 'current' : ''}" data-catpage="${cfg.pkey}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="pager-btn pager-nav" data-catpage="${cfg.pkey}" data-page="${page + 1}" ${page === total ? 'disabled' : ''}>Next <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 160-160-160-160-56 56 64 64H320v80h168l-64 64 56 56Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>`;
        pager.innerHTML = html;
    } else if (pager) {
        pager.style.display = 'none';
    }
}

// Catalog pager clicks (shared handler with live pager markup via distinct data-catpage).
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-catpage]');
    if (!btn) return;
    const key = btn.dataset.catpage;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page)) return;
    catalogPage[key] = page;
    renderCatalogGrid(key);
});

// Genre category rows for the Home page (only genres with enough content are shown).
const GENRE_ROWS = [
    { key: 'action', label: 'Action' },
    { key: 'adventure', label: 'Adventure' },
    { key: 'animation', label: 'Animation' },
    { key: 'comedy', label: 'Comedy' },
    { key: 'crime', label: 'Crime' },
    { key: 'documentary', label: 'Documentary' },
    { key: 'drama', label: 'Drama' },
    { key: 'family', label: 'Family' },
    { key: 'fantasy', label: 'Fantasy' },
    { key: 'history', label: 'History' },
    { key: 'horror', label: 'Horror' },
    { key: 'musical', label: 'Musical' },
    { key: 'mystery', label: 'Mystery' },
    { key: 'romance', label: 'Romance' },
    { key: 'scifi', label: 'Sci-Fi' },
    { key: 'sport', label: 'Sports' },
    { key: 'thriller', label: 'Thriller' },
    { key: 'war', label: 'War' },
    { key: 'western', label: 'Western' },
    { key: 'anime', label: 'Anime' }
];

const PROVIDERS = [
    { id: '8', key: 'netflix', label: 'Netflix', short: 'N', bg: '#E50914', color: '#fff' },
    { id: '9', key: 'prime', label: 'Amazon Prime Video', short: 'prime', bg: '#00A8E1', color: '#fff' },
    { id: '337', key: 'disney', label: 'Disney Plus', short: 'Disney+', bg: '#113CCF', color: '#fff' },
    { id: '350', key: 'appletvplus', label: 'Apple TV+', short: 'tv+', bg: '#000', color: '#fff' },
    { id: '2', key: 'appletv', label: 'Apple TV', short: 'tv', bg: '#000', color: '#fff' },
    { id: '15', key: 'hulu', label: 'Hulu', short: 'hulu', bg: '#1CE783', color: '#000' },
    { id: '1899', key: 'hbomax', label: 'HBO Max', short: 'MAX', bg: '#000', color: '#fff' },
    { id: '2303', key: 'paramount', label: 'Paramount Plus', short: 'P+', bg: '#0064FF', color: '#fff' },
    { id: '386', key: 'peacock', label: 'Peacock Premium', short: 'peacock', bg: '#000', color: '#fff' },
    { id: '283', key: 'crunchy', label: 'Crunchyroll', short: 'CR', bg: '#F47521', color: '#fff' },
    { id: '43', key: 'starz', label: 'Starz', short: 'STARZ', bg: '#000', color: '#fff' },
    { id: '526', key: 'amc', label: 'AMC+', short: 'AMC+', bg: '#0E1E3A', color: '#fff' },
    { id: '34', key: 'mgm', label: 'MGM Plus', short: 'MGM+', bg: '#fff', color: '#000' },
    { id: '188', key: 'ytpremium', label: 'YouTube Premium', short: 'YT', bg: '#FF0000', color: '#fff' },
    { id: '192', key: 'youtube', label: 'YouTube', short: 'YT', bg: '#fff', color: '#FF0000' },
    { id: '300', key: 'pluto', label: 'Pluto TV', short: 'pluto', bg: '#000', color: '#FFE600' },
    { id: '73', key: 'tubi', label: 'Tubi TV', short: 'tubi', bg: '#6A00F5', color: '#FFE600' },
];

let activeProvider = null;
let providerLogoMap = {
    '8': '/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg',
    '9': '/pvske1MyAoymrs5bguRfVqYiM9a.jpg',
    '337': '/97yvRBw1GzX7fXprcF80er19ot.jpg',
    '350': '/mcbz1LgtErU9p4UdbZ0rG6RTWHX.jpg',
    '2': '/SPnB1qiCkYfirS2it3hZORwGVn.jpg',
    '15': '/bxBlRPEPpMVDc4jMhSrTf2339DW.jpg',
    '1899': '/jbe4gVSfRlbPTdESXhEKpornsfu.jpg',
    '2303': '/fts6X10Jn4QT0X6ac3udKEn2tJA.jpg',
    '386': '/2aGrp1xw3qhwCYvNGAJZPdjfeeX.jpg',
    '283': '/fzN5Jok5Ig1eJ7gyNGoMhnLSCfh.jpg',
    '43': '/yIKwylTLP1u8gl84Is7FItpYLGL.jpg',
    '526': '/ovmu6uot1XVvsemM2dDySXLiX57.jpg',
    '34': '/ctiRpS16dlaTXQBSsiFncMrgWmh.jpg',
    '188': '/rMb93u1tBeErSYLv79zSTR07UdO.jpg',
    '192': '/pTnn5JwWr4p3pG8H6VrpiQo7Vs0.jpg',
    '300': '/dB8G41Q6tSL5NBisrIeqByfepBc.jpg',
    '73': '/zLYr7OPvpskMA4S79E3vlCi71iC.jpg'
};

async function fetchProviderLogos() {
    try {
        await tmdbEnsureConfig();
        const data = await tmdbJson('/watch/providers/movie?watch_region=US');
        const results = data.results || [];
        results.forEach(r => {
            providerLogoMap[String(r.provider_id)] = r.logo_path;
        });
        // also fetch tv providers to fill gaps
        try {
            const tvData = await tmdbJson('/watch/providers/tv?watch_region=US');
            (tvData.results||[]).forEach(r=>{
                if (!providerLogoMap[String(r.provider_id)]) providerLogoMap[String(r.provider_id)] = r.logo_path;
            });
        } catch {}
    } catch(e) { /* use fallback */ }
}

async function renderProviders() {
    const slider = document.getElementById('providerSlider');
    if (!slider) return;
    if (!Object.keys(providerLogoMap).length) {
        try { await fetchProviderLogos(); } catch {}
    }
    slider.innerHTML = PROVIDERS.map(p => {
        const logo = providerLogoMap[p.id];
        const img = logo ? `<img src="https://image.tmdb.org/t/p/w92${logo}" alt="${p.label}" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">` : '';
        const fallback = `<span class="provider-fallback" style="${logo?'display:none':''};font-weight:900;font-size:18px;width:100%;height:100%;align-items:center;justify-content:center;background:${p.bg};color:${p.color}">${p.short.charAt(0).toUpperCase()}</span>`;
        return `
        <div class="provider-item ${activeProvider===p.id?'active':''}" data-provider="${p.id}" title="${p.label}">
            <div class="provider-icon" style="background:${p.bg}">${img}${fallback}</div>
            <span class="provider-label">${p.label}</span>
        </div>`;
    }).join('');
    const labels = { prime: 'Amazon Prime<br>Video', peacock: 'Peacock<br>Premium', ytpremium: 'YouTube<br>Premium' };
    slider.querySelectorAll('.provider-item').forEach(el => {
        const prov = PROVIDERS.find(x=>x.id===el.dataset.provider);
        if (prov && labels[prov.key]) el.querySelector('.provider-label').innerHTML = labels[prov.key];
    });
}

async function browseProvider(providerId) {
    const prov = PROVIDERS.find(p=>p.id===providerId);
    if (!prov) return;
    if (activeProvider===providerId) {
        activeProvider=null;
        renderProviders();
        toast(`Cleared ${prov.label} filter — back to Home`);
        const hint = document.querySelector('#streamingSection .live-hint');
        if (hint) hint.textContent = 'Live from TMDB · movies & shows on streaming services';
        if (currentSection==='streaming') {
            liveState.streaming.items = [];
            liveState.streaming.page = 1;
            delete liveFed['streaming'];
        }
        const homeLink = document.querySelector('.nav-link[data-section="home"]');
        if (homeLink) handleNavClick(homeLink);
        else {
            document.getElementById('streamingSection').style.display='none';
            document.getElementById('trendingSection').style.display='none';
        }
        return;
    }
    activeProvider=providerId;
    renderProviders();
    toast(`Browsing ${prov.label}...`);
    // switch to streaming tab WITHOUT triggering the default fetch race
    (() => {
        document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-link').forEach(l=>l.classList.remove('active'));
        const link = document.querySelector('.nav-link[data-section="streaming"]');
        if (link) link.classList.add('active');
        currentSection='streaming';
        document.body.classList.remove('movies-active','tvshows-active','anime-active','mylist-active','trending-active','streaming-active','theaters-active','manga-active');
        document.body.classList.add('streaming-active');
        const show=(id,v)=>{const el=document.getElementById(id); if(el) el.style.display=v?'':'none';};
        show('moviesSection',false); show('tvShowsSection',false); show('myListSection',false); show('homeGenres',false); show('trendingSection',false); show('streamingSection',true); show('theatersSection',false); show('mangaSection',false); show('providerSection',true);
        const hero=document.getElementById('heroSection'); if(hero) hero.style.display='';
        // block the default streaming fetch that handleNavClick would have done
        liveFed['streaming']=1;
    })();
    // fetch provider-filtered streaming content
    try {
        await tmdbEnsureConfig();
        const grid = document.getElementById('streamingGrid');
        const pager = document.getElementById('streamingPager');
        if (grid) grid.innerHTML = '<div class="live-loading">Loading ' + prov.label + '…</div>';
        if (pager) pager.style.display = 'none';
        const paths = [
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=1`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=2`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=3`,
            `/discover/movie?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=4`,
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=1`,
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=2`,
            `/discover/tv?with_watch_providers=${providerId}&watch_region=US&sort_by=popularity.desc&page=3`,
        ];
        const pages = await fetchBatched(paths, 5);
        const items = liveItemsFromPages(pages, 'mixed');
        liveState.streaming.items = items;
        liveState.streaming.page = 1;
        const hint = document.querySelector('#streamingSection .live-hint');
        if (hint) hint.textContent = `Live from TMDB · ${prov.label} · ${items.length} titles`;
        liveFed['streaming']=0; delete liveFed['streaming'];
        if (!items.length) {
            const grid2 = document.getElementById('streamingGrid');
            if (grid2) grid2.innerHTML = '<div class="live-error">No titles found for ' + prov.label + ' in this region.</div>';
        } else {
            renderLiveGrid('streaming');
            enrichLiveLogos('streaming');
            if (currentSection==='streaming') showLiveHero('streaming');
        }
    } catch(e) {
        delete liveFed['streaming'];
        toast('Could not load ' + prov.label);
        const grid2 = document.getElementById('streamingGrid');
        if (grid2) grid2.innerHTML = '<div class="live-error">Could not load ' + prov.label + '. Check connection.</div>';
    }
}

/* ===== Collections (Home bottom) ===== */
const COLLECTION_DEFS = [
    { label: 'Star Wars', keys: ['star wars'] },
    { label: 'Harry Potter', keys: ['harry potter'] },
    { label: 'Middle-earth', keys: ['lord of the rings', 'hobbit'] },
    { label: 'Marvel', keys: ['marvel', 'avengers', 'iron man', 'captain america', 'thor', 'spider-man', 'spider man', 'hulk', 'black panther', 'doctor strange', 'guardians of the galaxy'] },
    { label: 'DC', keys: ['batman', 'superman', 'wonder woman', 'justice league', 'aquaman', 'joker'] },
    { label: 'Fast & Furious', keys: ['fast', 'furious'] },
    { label: 'Jurassic', keys: ['jurassic'] },
    { label: 'Toy Story', keys: ['toy story'] },
    { label: 'Mission: Impossible', keys: ['mission impossible'] },
    { label: 'Transformers', keys: ['transformers'] },
    { label: 'Pirates of the Caribbean', keys: ['pirates of the caribbean'] },
    { label: 'James Bond', keys: ['james bond', '007'] },
    { label: 'Avatar', keys: ['avatar'] },
    { label: 'Star Trek', keys: ['star trek'] },
    { label: 'Indiana Jones', keys: ['indiana jones'] },
    { label: 'Rocky', keys: ['rocky'] },
    { label: 'The Matrix', keys: ['matrix'] },
    { label: 'Alien', keys: ['alien'] },
    { label: 'Terminator', keys: ['terminator'] },
    { label: 'Scream', keys: ['scream'] },
    { label: 'The Conjuring', keys: ['conjuring'] },
    { label: 'Despicable Me', keys: ['despicable me', 'minions'] },
    { label: 'Frozen', keys: ['frozen'] },
    { label: 'The Lion King', keys: ['lion king'] },
    { label: 'Pokémon', keys: ['pokemon', 'pikachu', 'pokémon'] },
];
let customCollections = (()=>{ try { return JSON.parse(localStorage.getItem('milkbox_custom_collections')||'[]'); } catch { return []; } })();
function saveCustomCollections(){ try { localStorage.setItem('milkbox_custom_collections', JSON.stringify(customCollections)); } catch {} }
function collectionForTitle(title) {
    const t = String(title || '').toLowerCase();
    for (const def of COLLECTION_DEFS) {
        if (def.keys.some(k => t.includes(k))) return def.label;
    }
    // check custom keyword-based collections (stored as def-like)
    for (const c of customCollections) {
        if (c.keys && c.keys.some(k=> t.includes(String(k).toLowerCase()))) return c.label;
    }
    return null;
}
async function enrichCollectionsWithTMDB(buckets) {
    try {
        await tmdbEnsureConfig();
        // batch 4 at a time to keep main thread and TMDB rate-limit smooth
        for (let i = 0; i < COLLECTION_DEFS.length; i += 4) {
            const chunk = COLLECTION_DEFS.slice(i, i + 4);
            await Promise.all(chunk.map(async def => {
                const label = def.label;
                if (!buckets.has(label)) buckets.set(label, []);
                const q = def.keys[0];
                try {
                    const pages = await Promise.all([
                        tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=1`),
                        tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=2`)
                    ]);
                    const allResults = pages.flatMap(d => d.results || []);
                    const results = allResults.slice(0, 20).map(r => {
                        const type = r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : (r.first_air_date ? 'tv' : 'movie');
                        return liveItemToItem(r, type);
                    }).filter(it => it.title && it.poster && it.backdrop && collectionForTitle(it.title) === label);
                    const existing = new Set(buckets.get(label).map(i => i.tmdbId || i.id));
                    results.forEach(it => {
                        const key = it.tmdbId || it.id;
                        if (!existing.has(key)) { buckets.get(label).push(it); existing.add(key); }
                    });
                } catch {}
            }));
            // small yield to keep UI responsive
            await new Promise(r => setTimeout(r, 60));
        }
    } catch {}
}
function renderCollections() {
    const sec = document.getElementById('collectionsSection');
    const grid = document.getElementById('collectionsGrid');
    if (!sec || !grid) return;
    if (currentSection !== 'home' && currentSection !== 'trending') { sec.style.display='none'; return; }
    const pool = [...movies, ...tvShows].filter(completeItem);
    const allPool = [...movies, ...tvShows];
    const buckets = new Map();
    pool.forEach(item => {
        const col = collectionForTitle(item.title);
        if (!col) return;
        if (!buckets.has(col)) buckets.set(col, []);
        buckets.get(col).push(item);
    });
    // custom collections with explicit picks (e.g. Pokémon or user-made)
    customCollections.forEach(c => {
        if (!c.itemIds || !c.itemIds.length) return;
        const items = allPool.filter(it => c.itemIds.includes(it.id));
        if (!items.length) return;
        const label = c.label;
        if (!buckets.has(label)) buckets.set(label, []);
        const seen = new Set(buckets.get(label).map(x=> x.id));
        items.forEach(it=> { if(!seen.has(it.id)){ buckets.get(label).push(it); seen.add(it.id); }});
    });
    const doRender = (cols) => {
        if (!cols.length) { sec.style.display='none'; grid.innerHTML=''; return; }
        sec.style.display='';
        grid.innerHTML = cols.map(([label, items]) => {
            const count = items.length;
            const cover = items.find(i=>i.backdrop)?.backdrop || items.find(i=>i.poster)?.poster || items[0]?.backdrop || items[0]?.poster || '';
            const safeLabel = escapeHtml(label);
            return `<div class="collection-card" data-collection="${safeLabel}" title="${safeLabel} — click to view">
                ${cover ? `<img class="collection-backdrop" src="${escapeHtml(cover)}" alt="${safeLabel}" loading="lazy">` : `<div class="collection-cover-fallback">📦</div>`}
                <div class="collection-overlay">
                    <div class="collection-title">${safeLabel} Collection</div>
                    <div class="collection-meta">${count} movie${count===1?'':'s'}</div>
                </div>
            </div>`;
        }).join('');
    };
    let cols = Array.from(buckets.entries()).filter(([,arr])=>arr.length>=1).sort((a,b)=>b[1].length-a[1].length);
    // initial render with local pool so UI shows instantly
    doRender(cols);
    // enrich with TMDB scan for each collection (adds titles like Star Wars from TMDB)
    (async () => {
        const before = new Map(Array.from(buckets.entries()).map(([k,v])=>[k,v.length]));
        await enrichCollectionsWithTMDB(buckets);
        let grew = false;
        for (const [k,v] of buckets) if ((before.get(k)||0) !== v.length) { grew = true; break; }
        if (grew) {
            const newCols = Array.from(buckets.entries()).filter(([,arr])=>arr.length>=1).sort((a,b)=>b[1].length-a[1].length);
            doRender(newCols);
        }
    })();
    // return cols for immediate use (click handler will re-scan if needed)
    return cols;
}
function openCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    const list = document.getElementById('customCollectionList');
    const search = document.getElementById('customCollectionSearch');
    const nameIn = document.getElementById('customCollectionName');
    if (nameIn) nameIn.value = '';
    if (search) search.value = '';
    if (!list) return;
    const pool = [...movies, ...tvShows];
    const renderList = (filter='') => {
        const q = filter.toLowerCase().trim();
        const items = q ? pool.filter(it=> String(it.title||'').toLowerCase().includes(q)) : pool;
        list.innerHTML = items.map(it => {
            const safeTitle = escapeHtml(it.title);
            const sub = it.type === 'tv' ? 'TV Show' : 'Movie';
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer"><input type="checkbox" value="${escapeHtml(it.id)}" style="accent-color:#e50914"> <span style="flex:1;font-size:13px;color:#e5e5e5">${safeTitle} <span style="color:#888;font-size:11px">(${sub})</span></span></label>`;
        }).join('') || '<div style="padding:12px;color:#777;font-size:13px">No titles found</div>';
    };
    renderList();
    if (search) search.oninput = () => renderList(search.value);
    if (modal) modal.classList.add('active');
}
function closeCreateCollectionModal() {
    const modal = document.getElementById('createCollectionModal');
    if (modal) modal.classList.remove('active');
}
document.getElementById('createCollectionBtn')?.addEventListener('click', openCreateCollectionModal);
document.getElementById('closeCreateCollection')?.addEventListener('click', closeCreateCollectionModal);
document.getElementById('cancelCustomCollectionBtn')?.addEventListener('click', closeCreateCollectionModal);
document.getElementById('saveCustomCollectionBtn')?.addEventListener('click', () => {
    const nameIn = document.getElementById('customCollectionName');
    const label = (nameIn?.value || '').trim();
    if (!label) { toast('Enter a collection name', 'error'); return; }
    if (COLLECTION_DEFS.some(d=> d.label.toLowerCase()===label.toLowerCase()) || customCollections.some(c=> c.label.toLowerCase()===label.toLowerCase())) { toast('A collection with that name already exists', 'error'); return; }
    const list = document.getElementById('customCollectionList');
    const checked = Array.from(list.querySelectorAll('input[type=\"checkbox\"]:checked')).map(cb=> cb.value);
    if (!checked.length) { toast('Pick at least one title', 'error'); return; }
    customCollections.push({ label, itemIds: checked });
    saveCustomCollections();
    closeCreateCollectionModal();
    toast(`Created "${label}" with ${checked.length} title${checked.length===1?'':'s'}`, 'success');
    try { renderCollections(); } catch {}
});
document.getElementById('createCollectionModal')?.addEventListener('click', (e) => { if (e.target.id === 'createCollectionModal') closeCreateCollectionModal(); });

const animeGenrePage = {};
const ANIME_GENRE_PER_PAGE = 14;
function renderGenreRows() {
    const container = document.getElementById('homeGenres');
    if (!container) return;
    if (container.style.display === 'none') return;
    let pool, suffix, skip = null;
    if (currentSection === 'movies') { pool = movies.filter(completeItem); suffix = ' Movies'; }
    else if (currentSection === 'tvshows') { pool = tvShows.filter(completeItem); suffix = ' Shows'; }
    else if (currentSection === 'anime') {
        if (!localAnimeExists() && animeLive.fed) pool = [...animeLive.movies, ...animeLive.tv].filter(baseComplete);
        else pool = animeHeroItems().filter(completeItem);
        suffix = ''; skip = 'anime';
    }
    else if (currentSection === 'mylist') { pool = myList; suffix = ''; }
    else { pool = [...movies, ...tvShows].filter(m => completeItem(m) && !isAnime(m)); suffix = ''; }
    let html = '';
    const toRender = [];
    // Single pass over the pool: bucket items by genre instead of re-filtering per genre.
    const genreIndex = new Map();
    for (let i = 0; i < pool.length; i++) {
        const gs = genArr(pool[i].genre);
        for (let g = 0; g < gs.length; g++) {
            const k = gs[g];
            if (!genreIndex.has(k)) genreIndex.set(k, []);
            genreIndex.get(k).push(pool[i]);
        }
    }
    const labelMap = {};
    GENRE_ROWS.forEach(({ key, label }) => { labelMap[key] = label; });
    const known = [];
    const other = [];
    GENRE_ROWS.forEach(({ key }) => { if (key !== skip && genreIndex.has(key) && genreIndex.get(key).length) known.push(key); });
    [...genreIndex.keys()].forEach((k) => {
        if (k === skip || known.includes(k)) return;
        if (genreIndex.get(k).length) other.push(k);
    });
    other.sort((a, b) => genreIndex.get(b).length - genreIndex.get(a).length);
    const isAnimeTab = currentSection === 'anime';
    if (isAnimeTab) {
        function pagerHtml(key, page, total) {
            const WIN = 5;
            let s = Math.max(1, page - 2);
            let e = Math.min(total, s + WIN - 1);
            s = Math.max(1, e - WIN + 1);
            let h = `<button class="pager-btn pager-nav" data-animegenre="${key}" data-page="${page-1}" ${page===1?'disabled':''}>&#10094; Prev</button>`;
            for (let i=s;i<=e;i++) h += `<button class="pager-btn ${i===page?'current':''}" data-animegenre="${key}" data-page="${i}">${i}</button>`;
            h += `<button class="pager-btn pager-nav" data-animegenre="${key}" data-page="${page+1}" ${page===total?'disabled':''}>Next &#10095;</button>`;
            return h;
        }
        const animeKeys = [...known, ...other];
        animeKeys.forEach((key) => {
            const items = genreIndex.get(key);
            const total = Math.ceil(items.length / ANIME_GENRE_PER_PAGE) || 1;
            const page = Math.min(Math.max(1, animeGenrePage[key] || 1), total);
            animeGenrePage[key] = page;
            const start = (page - 1) * ANIME_GENRE_PER_PAGE;
            const slice = items.slice(start, start + ANIME_GENRE_PER_PAGE);
            const label = labelMap[key] || (key.charAt(0).toUpperCase() + key.slice(1));
            html += `<section class="content-section" id="genreSection-${key}"><h3 class="section-title">${label}${suffix}</h3><div class="content-grid" id="animeGenreGrid-${key}"></div><div class="pagination" id="animeGenrePager-${key}" style="${total<=1?'display:none':''}">${pagerHtml(key, page, total)}</div></section>`;
            toRender.push({ key, items: slice, anime: true });
        });
        container.innerHTML = html;
        toRender.forEach(({ key, items: slice }) => {
            const grid = document.getElementById(`animeGenreGrid-${key}`);
            if (!grid) return;
            grid.innerHTML = '';
            slice.forEach(it => {
                const type = it.type === 'tv' ? 'tv' : 'movie';
                grid.appendChild(createCard(it, type));
            });
        });
        return;
    }
    [...known, ...other].forEach((key) => {
        const items = genreIndex.get(key);
        toRender.push({ key, items });
        const label = labelMap[key] || (key.charAt(0).toUpperCase() + key.slice(1));
        html += `<section class="content-section" id="genreSection-${key}"><h3 class="section-title">${label}${suffix}</h3><div class="slider-container"><button class="slider-btn slider-left" data-slider="genreSlider-${key}"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M560-280 360-480l200-200v400Z"/></svg></button><div class="slider" id="genreSlider-${key}"></div><button class="slider-btn slider-right" data-slider="genreSlider-${key}"><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="M400-280v-400l200 200-200 200Z"/></svg></button></div></section>`;
    });
    container.innerHTML = html;
    toRender.forEach(({ key, items }) => renderSlider('genreSlider-' + key, items, 'mixed'));
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-animegenre]');
    if (!btn) return;
    const key = btn.dataset.animegenre;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page) || !key) return;
    animeGenrePage[key] = page;
    renderGenreRows();
    const sec = document.getElementById(`genreSection-${key}`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function genreMatchesAnime(genreList) {
    return genArr(genreList).some((g) => {
        const value = String(g || '').trim().toLowerCase();
        return value === 'anime';
    });
}

function isAnime(item) {
    return item && genreMatchesAnime(item.genre);
}

// Detect anime from raw TMDB fields: animation genre + Japan origin, or Japanese language + animation genre,
// or Japanese language + no poster (common for smaller anime series).
function isTmdbAnime(genreIds, originCountry, originalLanguage) {
    const hasAnimation = (genreIds || []).includes(16);
    const fromJapan = (originCountry || []).includes('JP');
    const isJapanese = (originalLanguage || '') === 'ja';
    return (hasAnimation && fromJapan) || (hasAnimation && isJapanese) || (isJapanese && hasAnimation);
}

function animeHeroItems() {
    return [...movies, ...tvShows].filter(isAnime);
}

// Hero banner for the Anime tab - only cycles through anime items.
function showAnimeHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    const items = animeHeroItems().filter(completeItem);
    if (items.length) {
        heroQueue = items;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'Anime';
        document.getElementById('heroDesc').textContent = 'No anime content yet. Add movies/show with the "anime" genre via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Re-render the current view, preserving the Anime filter and hero when on the Anime tab.
function refreshCurrent() {
    if (currentSection === 'anime') {
        renderAnime();
        showAnimeHero();
        loadAnimeLive();
    } else if (currentSection === 'mylist') {
        renderMyList();
        showMyListHero();
        renderGenreRows();
    } else if (currentSection === 'tvshows') {
        renderCatalogGrid('tvshows');
        showTvHero();
        renderGenreRows();
    } else if (currentSection === 'movies') {
        renderCatalogGrid('movies');
        showMovieHero();
        renderGenreRows();
    } else if (currentSection === 'trending') {
        renderLiveTab('trending');
        showLiveHero('trending');
    } else if (currentSection === 'streaming') {
        renderLiveTab('streaming');
        showLiveHero('streaming');
    } else if (currentSection === 'theaters') {
        renderLiveTab('theaters');
        showLiveHero('theaters');
    } else {
        renderAll();
    }
}

// Hero banner for the My List tab - only cycles through items in My List.
function showMyListHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (myList.length) {
        heroQueue = myList;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'My List';
        document.getElementById('heroDesc').textContent = 'Your saved favorites will show up here. Click "+" on any movie or TV show to add it to your list.';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Hero banner for the TV Shows tab - only cycles through TV shows.
function showTvHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (tvShows.some(completeItem)) {
        heroQueue = tvShows.filter(completeItem);
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'TV Shows';
        document.getElementById('heroDesc').textContent = 'No TV shows yet. Add one via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Hero banner for the Movies tab - only cycles through movies.
function showMovieHero() {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    if (movies.some(completeItem)) {
        heroQueue = movies.filter(completeItem);
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = 'Movies';
        document.getElementById('heroDesc').textContent = 'No movies yet. Add one via "+ Add Content".';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

let heroTimer = null;
let heroQueue = [];
let heroIndex = 0;

function renderHeroItem() {
    const queue = heroQueue;
    if (!queue.length) return;
    const featured = queue[heroIndex % queue.length];
    const heroLogo = document.getElementById('heroLogo');
    const heroTitle = document.getElementById('heroTitle');
    heroTitle.textContent = featured.title;
    const g = genArr(featured.genre);
    document.getElementById('heroDesc').textContent = featured.description || `A ${g.length ? g.join(', ') : 'great'} ${featured.type || 'title'}. Rating: ${featured.rating || 'N/A'}/10`;
    const bgUrl = hiRes(featured.backdrop || featured.poster);
    if (bgUrl) {
        document.getElementById('heroSection').style.backgroundImage = `url("${escapeHtml(bgUrl)}")`;
        document.getElementById('heroSection').style.backgroundSize = 'cover';
        document.getElementById('heroSection').style.backgroundPosition = 'center top';
    } else {
        document.getElementById('heroSection').style.backgroundImage = '';
    }
    document.getElementById('heroPlayBtn').onclick = () => playItem(featured, featured.type || 'movie');
    document.getElementById('heroInfoBtn').onclick = () => showInfo(featured, featured.type || 'movie');
    // Show the featured movie's own logo (if set) on the hero's large image; keep title text at the bottom
    if (featured.logo) {
        heroLogo.onerror = () => { heroLogo.onerror = null; applyHeroLogo(); };
        heroLogo.src = hiRes(featured.logo);
        heroLogo.style.display = 'block';
        heroTitle.style.display = '';
    } else {
        heroLogo.onerror = () => { heroLogo.style.display = 'none'; };
        heroLogo.removeAttribute('src');
        heroLogo.style.display = 'none';
        applyHeroLogo();
        // Auto-fetch a TMDB brand logo for this title (non-blocking) so banners
        // show a logo even if it wasn't loaded with the library.
        if (featured.tmdbId && !featured.logo) fetchItemLogo(featured).then(() => {
            const hl = document.getElementById('heroLogo');
            if (featured.logo && featureQueueContains(featured)) {
                hl.onerror = () => { hl.onerror = null; applyHeroLogo(); };
                hl.src = hiRes(featured.logo);
                hl.style.display = 'block';
            }
        }).catch(() => {});
    }
    // Subtle fade/slide transition, Netflix-style
    const sec = document.getElementById('heroSection');
    if (sec) {
        sec.classList.remove('hero-swap');
        requestAnimationFrame(() => sec.classList.add('hero-swap'));
    }
}

function updateHero() {
    // Interleave movies and tvShows so TV banners show regularly instead of
    // only after every movie has cycled. Anime stays on the Anime tab only.
    const inter = [];
    const homeMovies = movies.filter(m => !isAnime(m) && completeItem(m));
    const homeTv = tvShows.filter(m => !isAnime(m) && completeItem(m));
    const n = Math.max(homeMovies.length, homeTv.length);
    for (let i = 0; i < n; i++) {
        if (i < homeMovies.length) inter.push(homeMovies[i]);
        if (i < homeTv.length) inter.push(homeTv[i]);
    }
    if (inter.length > 0) {
        heroQueue = inter;
        if (!heroTimer) {
            heroIndex = Math.floor(Math.random() * heroQueue.length);
            heroTimer = setInterval(() => {
                if (heroQueue.length > 0) {
                    heroIndex = (heroIndex + 1) % heroQueue.length;
                    renderHeroItem();
                }
            }, 8000);
        } else {
            heroIndex = ((heroIndex % heroQueue.length) + heroQueue.length) % heroQueue.length;
        }
        renderHeroItem();
    } else {
        if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
        heroQueue = [];
        heroIndex = 0;
        const heroLogo = document.getElementById('heroLogo');
        const heroTitle = document.getElementById('heroTitle');
        heroTitle.textContent = 'Welcome to MILKBOX';
        heroTitle.style.display = '';
        document.getElementById('heroDesc').textContent = 'Your personal streaming platform. Add movies via Google Drive or upload TV shows.';
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        applyHeroLogo();
    }
}

// ==================== MY LIST ====================
function toggleMyList(item, type) {
    const idx = myList.findIndex(m => m.id === item.id);
    if (idx > -1) {
        myList.splice(idx, 1);
        toast(`Removed "${item.title}" from My List`);
    } else {
        myList.push({ ...item, type });
        toast(`Added "${item.title}" to My List`, 'success');
    }
    saveData();
    refreshCurrent();
}

// ==================== PLAY ====================
// TMDB-powered iframe for movie or TV playback.
function tmdbIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
}

// Phantom — an aggregator with 40+ sources, built-in source picker.
function phantomIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidphantom.com/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidphantom.com/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// Vidsrc — TMDB-powered embed for movie / TV playback. vidsrc.pm returns the full player
// (vidsrc.pm is the verified 2026 domain; vidsrc.to now only serves a thin redirect shell).
function vidsrcIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// VidCore — https://www.vidcore.org free ad-free TMDB embed (4K, HLS, 99.9% uptime).
function vidcoreIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidcore.org/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidcore.org/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// Videasy — https://www.videasy.to player (player.videasy.to) - supports movies, TV, anime.
function videasyIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://player.videasy.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?nextEpisode=true&autoplayNextEpisode=true&episodeSelector=true&overlay=true&color=e50914`;
    } else {
        url = `https://player.videasy.to/movie/${encodeURIComponent(tmdbId)}?color=e50914&overlay=true`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// SuperEmbed fallback — multiembed.mov currently returns 403, so use the working Vidsrc endpoint.
function superembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.pm/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.pm/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// MoviesAPI — https://moviesapi.to (replaces dead 2embed.cc/family).
function twoembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://moviesapi.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://moviesapi.to/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// AniDB — https://anidb.app — anime ONLY, supports sub/dub via lang param
let currentAnimeLang = localStorage.getItem('milkbox_anime_lang') || 'sub';
let currentAnidbId = null;
function normalizeTitle(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').trim(); }
async function fetchAnidbId(title, altTitles=[], year='') {
    const queries = [title, ...altTitles].filter(Boolean).slice(0,4);
    for (const qRaw of queries) {
        const q = encodeURIComponent(qRaw);
        const tries = [
            `https://anidb.app/search/suggestions?q=${q}`,
            `https://corsproxy.io/?${encodeURIComponent(`https://anidb.app/search/suggestions?q=${qRaw}`)}`
        ];
        for (const url of tries) {
            try {
                const res = await fetch(url);
                if (!res.ok) continue;
                const html = await res.text();
                const tmp = document.createElement('div');
                tmp.innerHTML = html;
                const links = Array.from(tmp.querySelectorAll('[data-search-item][href*="/anime/"], a[href*="/anime/"]'));
                let best = null, bestScore = -1;
                const normQ = normalizeTitle(qRaw);
                for (const link of links) {
                    const href = link.getAttribute('href') || '';
                    const txt = (link.textContent || link.getAttribute('title') || '').trim();
                    const normTxt = normalizeTitle(txt || href);
                    let score = 0;
                    if (normTxt === normQ) score = 100;
                    else if (normTxt.includes(normQ) || normQ.includes(normTxt)) score = 90;
                    else if (txt.toLowerCase().includes(qRaw.toLowerCase())) score = 70;
                    // boost if year matches (extract from nearby text)
                    if (year && link.closest('[data-year]')?.dataset?.year === String(year)) score += 10;
                    if (score > bestScore) { bestScore = score; best = href; }
                }
                const href = best || (links[0] && links[0].getAttribute('href')) || '';
                if (!href) continue;
                const m = href.match(/\/anime\/[a-z0-9-]*-(\d+)/i) || href.match(/\/anime\/(\d+)/);
                if (m) return m[1];
                const m2 = href.match(/(\d+)(?:\D*$)/);
                if (m2) return m2[1];
            } catch {}
        }
    }
    return null;
}
function anidbIframe(anidbId, type, season, episode, lang) {
    // anidb player — uses anime id + episode, lang=sub/dub — cache-busted so switching actually reloads
    const ep = episode || 1;
    const l = lang === 'dub' ? 'dub' : 'sub';
    const url = `https://anidb.app/anime/${encodeURIComponent(anidbId)}?episode=${encodeURIComponent(ep)}&lang=${l}&t=${Date.now()}#player`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}
function animekaiIframe(source, id, type, episode, lang) {
    // megavid.buzz anime player — source is 'mal' or 'ani', id is the numeric MAL/AniList id.
    // Anime movies have NO episode segment; tv shows include it. Append ?color & autoplay like the docs.
    const isMovie = type === 'movie';
    const ep = episode || 1;
    const l = lang === 'dub' ? 'dub' : 'sub';
    const src = source === 'ani' ? 'ani' : 'mal';
    const base = `https://megavid.buzz/${src}/${encodeURIComponent(id)}`;
    const path = isMovie ? `${base}/${l}` : `${base}/${encodeURIComponent(ep)}/${l}`;
    return `<iframe src="${escapeHtml(path + '?color=2ad4b8&autoplay=true')}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media" referrerpolicy="origin-when-cross-origin"></iframe>`;
}
let currentAnimekaiMalId = null;
let currentAnimekaiSlug = null;
let currentKissKhId = null;
// Per-item KissKH episode IDs so each anime plays ITS OWN episode id (not the same one every time)
const currentKissKhIds = {};
// Resolved MAL/AniList id per item so the same anime isn't re-scanned every time it's played.
const storedAnimeIds = {};
// Whether each resolved id is a MAL id ('mal') or an AniList id ('ani') — they are different id spaces.
const storedAnimeSrc = {};
// Scan TMDB's "movie database" external_ids for the item's IMDb id (used to disambiguate the right anime).
async function fetchImdbIdFromTmdb(tmdbId, type) {
    if (!tmdbId) return null;
    const path = type === 'tv' ? `/tv/${encodeURIComponent(tmdbId)}/external_ids` : `/movie/${encodeURIComponent(tmdbId)}/external_ids`;
    try {
        const d = await tmdbJson(path);
        return (d && d.imdb_id) ? String(d.imdb_id) : null;
    } catch { return null; }
}
async function fetchAnimekaiMalId(title, altTitles=[], year='', type='', imdbId='') {
    // Use Mal ID directly if already known on the item, otherwise search Jikan/Anilist and pick
    // the closest year-matched hit. Resolves both a MAL id (for /mal/) and an AniList id (for /ani/).
    // Returns { id, src } where src is 'mal' or 'ani'.
    const queries = [title, ...altTitles].filter(Boolean).slice(0,4);
    let anilistId = null, anilistMal = null;
    // A confirming IMDb id votes +100 so the RIGHT show wins over same-named titles.
    const imdbNorm = imdbId ? normalizeTitle(String(imdbId).trim()) : '';
    for (const qRaw of queries) {
        // Try AniList FIRST — its search is the most accurate for anime titles, and it can
        // match the exact localization/romaji used by TMDB. Also returns idMal for /mal/.
        try {
            const r2 = await fetch(`https://graphql.anilist.co`, { method:'POST', headers:{'Content-Type':'application/json', Accept:'application/json'}, body: JSON.stringify({ query: `query($q:String,$type:MediaType){Media(search:$q,type:$type){id idMal siteUrl title{romaji english native} startDate{year} } }`, variables:{q:qRaw, type: type==='movie' ? 'ANIME' : 'ANIME'}})});
            if (r2.ok) {
                const j2 = await r2.json();
                const m = j2?.data?.Media;
                if (m) {
                    const ay = String(m.startDate?.year || '');
                    const yOk = !year || !ay || String(ay) === String(year);
                    const titleMatch = normalizeTitle(m.title?.romaji || '') === normalizeTitle(qRaw);
                    // accept when the well-known id matches OR title exact matches with year
                    if (titleMatch && (yOk || !year)) {
                        anilistId = String(m.id);
                        anilistMal = m.idMal ? String(m.idMal) : anilistId;
                        return m.idMal ? { id: String(m.idMal), src: 'mal' } : { id: anilistId, src: 'ani' };
                    }
                    // stash the first reasonable hit to use as a lower-confidence fallback
                    if (!anilistId && (yOk || !year)) { anilistId = String(m.id); anilistMal = m.idMal ? String(m.idMal) : null; }
                }
            }
        } catch {}
        // try MAL (Jikan) next
        try {
            const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(qRaw)}&limit=8&order_by=popularity&sort=desc&sfw=true${type==='movie'?'&type=movie':''}`);
            if (r.ok) {
                const j = await r.json();
                const normQ = normalizeTitle(qRaw);
                let best = null, bestScore = -1;
                for (const a of (j.data||[])) {
                    const cand = [a.title, a.title_english, a.title_japanese, ...(a.title_synonyms||[])].filter(Boolean).join(' ');
                    const normCand = normalizeTitle(cand);
                    let score = 0;
                    if (normalizeTitle(a.title) === normQ) score = 100;
                    else if (normCand.includes(normQ) || normQ.includes(normalizeTitle(a.title||''))) score = 85;
                    else if (String(a.title||'').toLowerCase().includes(qRaw.toLowerCase())) score = 65;
                    // year bonus — crucial for distinguishing sequels/movies
                    const y = String(a.year||a.aired?.prop?.from?.year||'');
                    if (year && y && String(y)===String(year)) score += 15;
                    if (type && a.type && String(a.type).toLowerCase()===String(type).toLowerCase()) score += 10;
                    // IMDb id confirmation — the strongest signal that this is the exact entry
                    if (imdbNorm && a.images && (a.images.jpg?.large_image_url||'').toLowerCase().includes(imdbNorm)) score += 20;
                    if (score > bestScore) { bestScore = score; best = a; }
                }
                if (bestScore >= 70 && best && best.mal_id) return { id: String(best.mal_id), src: 'mal' };
                const fallback = j.data?.find(a=> String(a.title||'').toLowerCase().includes(qRaw.toLowerCase().slice(0,6)));
                if (fallback && fallback.mal_id) return { id: String(fallback.mal_id), src: 'mal' };
            }
        } catch {}
    }
    // Last resort: a previously-seen reasonable AniList hit (idMal or the AniList id for /ani/)
    if (anilistMal) return { id: String(anilistMal), src: 'mal' };
    if (anilistId) return { id: String(anilistId), src: 'ani' };
    return null;
}
async function fetchKissKhId(title, year='', rawUrl='') {
    // KissKH episode IDs live in the source URL path: /Drama/.../Episode-25?id=6158&ep=129692
    // There is NO public megavid search API — the only way to get a kisskh id is to parse it
    // from a pasted source URL, or use a value already stored on the item.
    const q = String(title||'').trim();
    // 1) parse ep= from any pasted URL
    if (rawUrl) {
        const m = String(rawUrl).match(/[?&]ep=(\d+)/);
        if (m) return m[1];
    }
    // 2) exact kisskh-style slug like "Hidden-Love--2023-" with year gives a hint, but no id without ep param
    if (!q) return null;
    // 3) fall back to parsing ep= out of any URL string that might be embedded in the title field
    const tM = q.match(/[?&]ep=(\d+)/);
    if (tM) return tM[1];
    return null;
}

document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.lang-btn');
    if (!btn || !btn.dataset.lang) return;
    const lang = btn.dataset.lang === 'dub' ? 'dub' : 'sub';
    currentAnimeLang = lang;
    try { localStorage.setItem('milkbox_anime_lang', lang); } catch {}
    document.querySelectorAll('.lang-btn').forEach(b => {
        const isActive = b.dataset.lang === lang;
        b.classList.toggle('active', isActive);
        if (isActive) { b.style.background = '#ffb6d8'; b.style.color = '#000'; b.style.border = 'none'; }
        else { b.style.background = 'rgba(255,255,255,0.08)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,0.12)'; }
    });
    if (playContext && isAnime(playContext.item)) {
        const item = playContext.item;
        const itemKey = String(item.id);
        const hasMal = currentAnimekaiMalId || item.malId || item.mal_id || item.anilistId || item.anilist_id || storedAnimeIds[itemKey];
        if (!hasMal && !itemKey.startsWith('ak_')) {
            try {
                const ttype = item.type || playContext.type || '';
                let imdbId = item.imdbId || item.imdb_id || '';
                if (item.tmdbId && !imdbId) imdbId = (await fetchImdbIdFromTmdb(item.tmdbId, ttype)) || '';
                const altTitles = [item.title_english, item.title_japanese, ...(item.title_synonyms||[])].filter(Boolean);
                let tmdbTitle = item.title;
                if (item.tmdbId) { try { const td = await tmdbJson(`/${ttype}/${encodeURIComponent(item.tmdbId)}`); if (td) { tmdbTitle = td.title || td.name || tmdbTitle; if (td.original_title || td.original_name) altTitles.push(td.original_title || td.original_name); } } catch {} }
                const res = await fetchAnimekaiMalId(tmdbTitle, altTitles, item.year || '', ttype, imdbId);
                if (res && playContext && String(playContext.item.id) === itemKey) {
                    currentAnimekaiMalId = res.id;
                    storedAnimeIds[itemKey] = res.id;
                    storedAnimeSrc[itemKey] = res.src || 'mal';
                    if (imdbId) item.imdbId = imdbId;
                }
            } catch {}
        }
        if (!currentAnidbId) {
            try {
                const id = await fetchAnidbId(item.title);
                if (id) currentAnidbId = id;
            } catch {}
        }
        const frame = document.getElementById('playerFrame');
        if (frame) frame.innerHTML = '<div class="live-loading">Switching to ' + (lang === 'dub' ? 'Dubbed (English)' : 'Subbed (Japanese + English subs)') + '…</div>';
        try { toast('Switched to ' + (lang === 'dub' ? 'Dubbed — English audio' : 'Subbed — Japanese with English subtitles'), 'success'); } catch {}
        renderPlay();
    }
});

// AutoEmbed — https://autoembed.co (autoembed.cc domain is dead)
function autoembedIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://autoembed.co/tv/tmdb/${encodeURIComponent(tmdbId)}-${encodeURIComponent(season || 1)}-${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://autoembed.co/movie/tmdb/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// YapGrid — https://yapgrid.com (replaces dead player.smashy.stream)
function smashystreamIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://yapgrid.com/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://yapgrid.com/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// EmbedFlix — https://embedflix.net (replaces dead vidfast.pro)
function vidfastIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://embedflix.net/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://embedflix.net/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// VidLink — https://vidlink.pro
function vidlinkIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidlink.pro/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?primaryColor=e50914&secondaryColor=a8a8a8&iconColor=e50914&icons=default&player=default&title=true&poster=true&autoplay=true&nextbutton=true`;
    } else {
        url = `https://vidlink.pro/movie/${encodeURIComponent(tmdbId)}?primaryColor=e50914&secondaryColor=a8a8a8&iconColor=e50914&icons=default&player=default&title=true&poster=true&autoplay=false`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// Vidsrc (alt) — vidsrc.to (replaces dead embed.su; .to still serves the player page)
function embedsuIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.to/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.to/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// SuperEmbed (alt domain) — https://superembed.stream (replaces dead nontongo.win)
function nontongoIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://superembed.stream/?video_id=${encodeURIComponent(tmdbId)}&tmdb=1&s=${encodeURIComponent(season || 1)}&e=${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://superembed.stream/?video_id=${encodeURIComponent(tmdbId)}&tmdb=1`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}
function kisskhIframe(episodeId, color, autoplay, epNum) {
    // megavid docs: /kisskh/{episode-id} with optional ?color=%232ad4b8&autoplay=true — drama/K-show/anime
    let url = `https://megavid.buzz/kisskh/${encodeURIComponent(episodeId)}`;
    const qs = [];
    if (color) qs.push(`color=${encodeURIComponent(String(color).replace('#',''))}`);
    if (autoplay) qs.push(`autoplay=true`);
    if (epNum) qs.push(`ep=${encodeURIComponent(epNum)}`);
    if (qs.length) url += `?${qs.join('&')}`;
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// Current play context + selected server for the player.
let playContext = null;
let playerServer = settings.playerServer || 'auto';

function serverBtnActive() {
    const sel = document.getElementById('serverSelect');
    if (sel) sel.value = playerServer;
}

function effectiveServerFor(item, type) {
    if (playerServer === 'drive') return 'drive';
    if (['tmdb','phantom','vidsrc','vidcore','videasy','superembed','twoembed','autoembed','smashystream','vidfast','vidlink','embedsu','nontongo','animekai','kisskh'].includes(playerServer)) return playerServer;
    // Auto: movies use Vidsrc; anime and TV retain their existing fallback behavior.
    if (type === 'movie' && item.tmdbId) return 'vidsrc';
    if (isAnime(item) && currentAnimekaiMalId) return 'animekai';
    // Auto: TV prefers the Vidsrc TMDB player when an ID exists, otherwise falls back to Drive.
    return item.tmdbId ? 'vidsrc' : 'drive';
}

// Ordered list used for automatic server fallback (TMDB-based sources only).
const SERVER_ORDER = ['vidsrc', 'tmdb', 'phantom', 'vidcore', 'videasy', 'superembed', 'twoembed', 'autoembed', 'smashystream', 'vidfast', 'vidlink', 'embedsu', 'nontongo', 'animekai', 'kisskh'];
let fallbackStart = null;
let fallbackTimer = null;
let fallbackLoaded = false;

// Clears any in-flight auto-fallback watchdog (called on server switch / new item).
function clearAutoFallback() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    fallbackStart = null;
    fallbackLoaded = false;
}

// Attach load/error detection to the just-created iframe for a TMDB server so a
// truly broken source advances to the next server in SERVER_ORDER, WITHOUT ever
// interrupting playback that is already going (which used to freeze videos
// mid-way at 25s). Safety net: only rescue an embed that never loads.
function armAutoFallback(frame, server) {
    const ifr = frame && frame.querySelector('iframe');
    if (!ifr || !playContext) return;
    if (!fallbackStart) fallbackStart = server;
    fallbackLoaded = false;
    const onLoad = () => {
        fallbackLoaded = true;
        // Once the embed's page is up, playback is in control — cancel the timer
        // so smooth video is never knocked out by a watchdog.
        if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    };
    ifr.removeEventListener('load', onLoad);
    ifr.addEventListener('load', onLoad);
    // Fires only when the iframe fails to load its document (a dead source).
    ifr.addEventListener('error', () => { if (!fallbackLoaded) tryAutoFallback(server); });
    if (fallbackTimer) clearTimeout(fallbackTimer);
    // Generous dead-embed rescue: only trips if the source never loaded at all.
    fallbackTimer = setTimeout(() => {
        if (fallbackStart && !fallbackLoaded) tryAutoFallback(server);
    }, 45000);
}

// Advance to the next TMDB server in the order. Stops once we've come full circle.
function tryAutoFallback(server) {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    if (!fallbackStart || !playContext) return;
    const idx = SERVER_ORDER.indexOf(server);
    if (idx === -1) return;
    const next = SERVER_ORDER[(idx + 1) % SERVER_ORDER.length];
    if (next === fallbackStart) { fallbackStart = null; fallbackLoaded = false; return; }
    toast(`"${server}" didn't load — trying ${next}...`);
    renderTmdbPlay(next);
}

// Map of server key -> iframe builder (movie/tv, season, episode).
const SERVER_IFRAME = {
    tmdb: tmdbIframe,
    phantom: phantomIframe,
    vidsrc: vidsrcIframe,
    vidcore: vidcoreIframe,
    videasy: videasyIframe,
    superembed: superembedIframe,
    twoembed: twoembedIframe,
    autoembed: (tmdbId, type, season, episode) => {
        const pc = playContext?.item;
        if (pc && isAnime(pc)) {
            const itemKey = String(pc.id);
            const lang = currentAnimeLang === 'dub' ? 'dub' : 'sub';
            const src = storedAnimeSrc[itemKey] || (pc.anilistId || pc.anilist_id ? 'ani' : 'mal');
            const mid = currentAnimekaiMalId || pc.malId || pc.mal_id || pc.anilistId || pc.anilist_id || null;
            if (mid && /^\d+$/.test(String(mid))) return animekaiIframe(src, mid, type, episode || 1, lang);
            if (currentAnidbId) return anidbIframe(currentAnidbId, type, season, episode || 1, lang);
        }
        return autoembedIframe(tmdbId, type, season, episode);
    },
    smashystream: smashystreamIframe,
    vidfast: vidfastIframe,
    vidlink: vidlinkIframe,
    embedsu: embedsuIframe,
    nontongo: nontongoIframe,
    animekai: (tmdbId, type, season, episode) => {
        // megavid anime — uses the per-item MAL/AniList id; movies drop the episode segment
        const itemKey = playContext?.item ? String(playContext.item.id) : '';
        const src = storedAnimeSrc[itemKey] || (playContext?.item?.anilistId || playContext?.item?.anilist_id ? 'ani' : 'mal');
        const mid = currentAnimekaiMalId || (playContext?.item?.malId) || (playContext?.item?.anilistId) || tmdbId;
        return animekaiIframe(src, mid, type, episode || 1, currentAnimeLang);
    },
    kisskh: (tmdbId, type, season, episode) => {
        // for KissKH we need a numeric episode id — try to extract from pasted URL or use example 129692
        const epId = (playContext?.item?.kisskhId || playContext?.episodeId || '129692');
        return kisskhIframe(epId, '#2ad4b8', false);
    }
};

// Renders the correct TMDB-based iframe for the current play context on `server`.
function renderTmdbPlay(server) {
    const frame = document.getElementById('playerFrame');
    if (!frame || !playContext) return;
    const { item, type, episode, season } = playContext;
    if (!item.tmdbId) return;
    const builder = SERVER_IFRAME[server] || tmdbIframe;
    if (type === 'movie') {
        frame.innerHTML = builder(item.tmdbId, 'movie');
        armAutoFallback(frame, server);
    } else {
        const se = season || item.season || 1;
        const ep = episode || 1;
        frame.innerHTML = builder(item.tmdbId, 'tv', se, ep);
        armAutoFallback(frame, server);
    }
}

function renderPlay() {
    const frame = document.getElementById('playerFrame');
    const subtitle = document.getElementById('playerSubtitle');
    const epSelector = document.getElementById('episodeSelector');
    if (!playContext) return;
    const { item, type } = playContext;
    const staleNextButton = document.getElementById('playNextEpisode');
    if (type === 'movie' && staleNextButton) staleNextButton.remove();
    // Anime + drama via megavid.buzz. Anime (ALL genres — action, romance, mecha, isekai, etc.)
    // plays through /mal/{mal-id}/{ep}/{sub|dub} or /ani/{anilist-id}/{ep}/{sub|dub} using the
    // per-item resolved id (so each show plays ITS OWN title, not the same one). Items that carry a
    // kisskh episode id (dramas) use /kisskh/{episode-id}.
    const isAnimeTitle = isAnime(item);
    if (isAnimeTitle) {
        const langSel = document.getElementById('animeLangSelector');
        if (langSel) langSel.style.display = 'flex';
        const ep = (type === 'tv' ? (playContext.episode || item.episode || 1) : 1);
        const season = playContext.season || item.season || 1;
        const itemKey = String(item.id);
        const kissId = item.kisskhId || item.kisskh_ep || item.episodeId || currentKissKhIds[itemKey] || null;
        const malId = item.malId || item.mal_id || item.anilistId || item.anilist_id || currentAnimekaiMalId || null;
        const langCheck = currentAnimeLang === 'dub' ? 'dub' : 'sub';
        // 1) megavid anime — pick /ani/ vs /mal/ from the resolved source (they're different id spaces).
        //    Uses the per-item cached source so each show's OWN correct id is used.
        //    When AutoEmbed is selected, route through its builder so sub/dub toggle works on that server.
        if (!kissId && malId && /^\d+$/.test(String(malId))) {
            const srv = effectiveServerFor(item, type);
            const src = storedAnimeSrc[itemKey] || (item.anilistId || item.anilist_id ? 'ani' : 'mal');
            const base = src === 'ani' ? 'ani' : 'mal';
            if (srv === 'autoembed') {
                frame.innerHTML = SERVER_IFRAME.autoembed(item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AutoEmbed ${base.toUpperCase()} (${malId})`;
            } else {
                // megavid /mal/ and /ani/ endpoints — anime movies have NO episode segment
                frame.innerHTML = animekaiIframe(base, malId, type, ep, langCheck);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • megavid ${base.toUpperCase()} (${malId})`;
            }
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
        // 2) KissKH episode id (dramas / Kshows) — the /kisskh/{id} endpoint
        if (kissId) {
            frame.innerHTML = kisskhIframe(kissId, '2ad4b8', true, type === 'tv' ? ep : null);
            subtitle.textContent = `${item.year || ''} • KissKH (${kissId})`;
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
        if (currentAnidbId) {
            const srv2 = effectiveServerFor(item, type);
            if (srv2 === 'autoembed') {
                frame.innerHTML = SERVER_IFRAME.autoembed(item.tmdbId, type, season, ep);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AutoEmbed AniDB (${currentAnidbId})`;
            } else {
                frame.innerHTML = anidbIframe(currentAnidbId, type, season, ep, langCheck);
                subtitle.textContent = `${item.year || ''} • ${currentAnimeLang === 'dub' ? 'Dubbed' : 'Subbed'} • AniDB`;
            }
            epSelector.style.display = type === 'tv' ? 'block' : 'none';
            if (type === 'tv' && item.tmdbId) renderTmdbEpisodes(item, 'tmdb');
            return;
        }
    }
    const langSel2 = document.getElementById('animeLangSelector');
    if (langSel2) langSel2.style.display = isAnimeTitle ? 'flex' : 'none';
    const server = effectiveServerFor(item, type);
    frame.innerHTML = '';
    serverBtnActive();

    const isTmdbServer = !!SERVER_IFRAME[server];
    if (type === 'movie') {
        subtitle.textContent = (item.year ? item.year + '  ' : '') + (genArr(item.genre).join(', ') || '');
        epSelector.style.display = 'none';
        if (isTmdbServer && item.tmdbId) {
            renderTmdbPlay(server);
        } else if (server === 'drive' || (server === 'auto' && !item.tmdbId)) {
            const driveLink = convertDriveLink(item.driveLink);
            if (driveLink) {
                frame.innerHTML = `<iframe src="${escapeHtml(driveLink)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
            } else {
                frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No Google Drive link on this server</div>`;
            }
        } else {
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source on this server</div>`;
        }
    } else if (type === 'tv') {
        subtitle.textContent = `Season ${item.season || 1}`;
        if (isTmdbServer && item.tmdbId) {
            epSelector.style.display = 'block';
            renderTmdbEpisodes(item, server);
            playTmdbEpisode(item, item.season || 1, 1, server);
        } else if (server === 'drive' && item.episodes && item.episodes.length > 0) {
            epSelector.style.display = 'block';
            renderEpisodePlaylist(item);
            playEpisode(item, item.episodes[0], 0);
        } else {
            epSelector.style.display = 'none';
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">${server === 'drive' ? 'No uploaded episodes on Drive for this show' : 'No episodes available on this server'}</div>`;
        }
    }
}

function playItem(item, type) {
    const modal = document.getElementById('playerModal');
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const epSelector = document.getElementById('episodeSelector');
    if (epSelector) epSelector.classList.remove('collapsed');
    clearAutoFallback();
    title.textContent = item.title;
    frame.innerHTML = '';
    playContext = { item, type };
    // anime only: show sub/dub toggle and resolve anidb + animekai ids
    const langSel = document.getElementById('animeLangSelector');
    const animekaiOpt = document.getElementById('serverOptAnimekai');
    if (isAnime(item)) {
        if (langSel) {
            langSel.style.display = 'flex';
            document.querySelectorAll('.lang-btn').forEach(b => {
                const isActive = b.dataset.lang === currentAnimeLang;
                b.classList.toggle('active', isActive);
                if (isActive) { b.style.background = '#ffb6d8'; b.style.color = '#000'; b.style.border = 'none'; }
                else { b.style.background = 'rgba(255,255,255,0.08)'; b.style.color = '#fff'; b.style.border = '1px solid rgba(255,255,255,0.12)'; }
            });
        }
        if (animekaiOpt) animekaiOpt.style.display = '';
        currentAnidbId = null;
        currentAnimekaiMalId = null;
        currentAnimekaiSlug = item.animekaiSlug || item.slug || null;
        const altTitles = [item.title_english, item.title_japanese, ...(item.title_synonyms||[])].filter(Boolean);
        const itemKey = String(item.id);
        const year = item.year || '';
        const ttype = item.type || type || '';
        // 1) each anime resolves to its OWN MAL / AniList id (keyed per item) so the /mal/ & /ani/
        //    endpoints play the RIGHT show, not the same one every time. If the item already carries
        //    an id (from Tenrai/Jikan/AniList), use it directly — no search needed.
        const preAni = item.anilistId || item.anilist_id || null;
        const preMal = item.malId || item.mal_id || storedAnimeIds[itemKey] || null;
        if (preAni) {
            currentAnimekaiMalId = String(preAni);
            storedAnimeSrc[itemKey] = 'ani';
        } else if (preMal) {
            currentAnimekaiMalId = String(preMal);
            storedAnimeSrc[itemKey] = 'mal';
        } else if (!itemKey.startsWith('ak_')) {
            // Scan TMDB (the movie database) for the item's IMDb id, then use it to disambiguate
            // the correct MAL/AniList entry in Jikan/Anilist so the RIGHT file plays.
            (async () => {
                let imdbId = item.imdbId || item.imdb_id || '';
                const useTmdb = item.tmdbId && !imdbId;
                if (useTmdb) imdbId = (await fetchImdbIdFromTmdb(item.tmdbId, ttype)) || '';
                // extra search term from TMDB's own database for more precise title matching
                let tmdbTitle = item.title;
                if (useTmdb) { try { const td = await tmdbJson(`/${ttype}/${encodeURIComponent(item.tmdbId)}`); if (td) { tmdbTitle = td.title || td.name || tmdbTitle; if (td.original_title || td.original_name) altTitles.push(td.original_title || td.original_name); } } catch {} }
                const res = await fetchAnimekaiMalId(tmdbTitle, altTitles, year, ttype, imdbId);
                // only accept an id that was actually resolved for THIS item (prevents cross-show mixups)
                if (res && playContext && playContext.item && String(playContext.item.id) === itemKey) {
                    currentAnimekaiMalId = res.id;
                    storedAnimeIds[itemKey] = res.id;
                    storedAnimeSrc[itemKey] = res.src || 'mal';
                    if (imdbId) item.imdbId = imdbId;
                    renderPlay();
                }
            })();
        } else {
            currentAnimekaiMalId = String(item.id);
        }
        // 2) kisskh drama path: use a known/pasted episode id (keyed per item) — the kisskh endpoint
        //    only takes a numeric episode id, and there is no public megavid search, so we parse from
        //    any source URL the user provides (item.kisskhUrl / item.Url / title fields).
        if (item.kisskhId || item.kisskh_ep || item.episodeId) {
            currentKissKhIds[itemKey] = String(item.kisskhId || item.kisskh_ep || item.episodeId);
        } else {
            fetchKissKhId(item.title, year, item.kisskhUrl || item.url || item.Url).then(id => {
                if (id) {
                    currentKissKhIds[itemKey] = String(id);
                    if (playContext && playContext.item && String(playContext.item.id) === itemKey) renderPlay();
                }
            });
        }
    } else {
        if (langSel) langSel.style.display = 'none';
        if (animekaiOpt) animekaiOpt.style.display = 'none';
        if (playerServer === 'animekai') { playerServer = 'tmdb'; settings.playerServer = playerServer; try { saveData(); } catch {} }
        currentAnidbId = null;
        currentAnimekaiMalId = null;
    }
    renderPlay();
    modal.classList.add('active');
}

// Server switcher in the player modal (change event on dropdown).
document.addEventListener('change', (e) => {
    const sel = e.target.closest('#serverSelect');
    if (!sel || !playContext) return;
    clearAutoFallback();
    playerServer = sel.value;
    settings.playerServer = playerServer;
    saveData();
    renderPlay();
});
// Mark the given episode as the active one in the episode sidebar.
function setActiveEpisode(season, episode, list) {
    list.querySelectorAll('.ep-play-item').forEach(el =>
        el.classList.toggle('active', String(el.dataset.season) === String(season) && String(el.dataset.episode) === String(episode)));
}

// TMDB-powered TV episode layout: Season dropdown, episode search, and wide preview cards.
async function renderTmdbEpisodes(tvItem, server) {
    const list = document.getElementById('episodePlaylist');
    const loading = document.getElementById('episodeLoading');
    const errEl = document.getElementById('episodeError');
    const dropdown = document.getElementById('seasonDropdown');
    const searchInput = document.getElementById('episodeSearchInput');

    if (loading) loading.style.display = '';
    if (errEl) errEl.style.display = 'none';
    if (list) list.innerHTML = '';

    const tmdbId = tvItem && tvItem.tmdbId;
    if (!tmdbId) {
        if (loading) loading.style.display = 'none';
        if (errEl) { errEl.textContent = 'No TMDB ID available for this show.'; errEl.style.display = ''; }
        return;
    }

    try {
        await tmdbEnsureConfig();
        const detail = await tmdbJson(`/tv/${encodeURIComponent(tmdbId)}`);
        const seasons = (detail.seasons || [])
            .filter(s => s && s.season_number >= 0 && s.episode_count > 0)
            .map(s => s.season_number);

        if (!seasons.length) { if (loading) loading.style.display = 'none'; return; }

        // Fetch all seasons in parallel.
        const seasonInfos = await Promise.all(seasons.map(async sn => ({
            sn,
            eps: (await tmdbJson(`/tv/${encodeURIComponent(tmdbId)}/season/${sn}`)).episodes || []
        })));

        // Populate Season Dropdown
        if (dropdown) {
            dropdown.innerHTML = seasonInfos.map(({ sn }) => {
                const label = sn === 0 ? 'Specials' : `Season ${sn}`;
                return `<option value="${sn}">${label}</option>`;
            }).join('');
        }

        let currentSelectedSeason = seasons[0];
        if (playContext && playContext.season !== undefined) {
            currentSelectedSeason = playContext.season;
            if (dropdown) dropdown.value = currentSelectedSeason;
        }

        const renderCurrentSeasonEpisodes = (filterText = '') => {
            if (!list) return;
            list.innerHTML = '';
            const found = seasonInfos.find(s => String(s.sn) === String(currentSelectedSeason)) || seasonInfos[0];
            if (!found) return;

            const filteredEps = found.eps.filter(ep => {
                if (!filterText) return true;
                const q = filterText.toLowerCase();
                const nameMatch = (ep.name || '').toLowerCase().includes(q);
                const numMatch = String(ep.episode_number).includes(q);
                const overviewMatch = (ep.overview || '').toLowerCase().includes(q);
                return nameMatch || numMatch || overviewMatch;
            });

            if (!filteredEps.length) {
                list.innerHTML = `<div style="text-align:center;color:#888;padding:30px;font-size:14px;">No episodes found</div>`;
                return;
            }

            const fragment = document.createDocumentFragment();
            filteredEps.forEach(ep => {
                const card = document.createElement('div');
                card.className = 'cineby-ep-card';
                card.dataset.season = found.sn;
                card.dataset.episode = ep.episode_number;

                const stillPath = ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : (tvItem.backdrop || tvItem.poster || '');
                const epTitle = ep.name || `Episode ${ep.episode_number}`;
                const runtime = ep.runtime ? `${ep.runtime} min` : '';
                const overview = ep.overview ? ep.overview : 'No description available for this episode.';

                card.innerHTML = `
                    <div class="cineby-ep-thumb-wrapper">
                        <img class="cineby-ep-img" src="${escapeHtml(stillPath)}" alt="${escapeHtml(epTitle)}" loading="lazy">
                        <span class="cineby-ep-number">E${ep.episode_number}</span>
                        <div class="cineby-ep-play-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="white"><path d="M480-320q75 0 127.5-52.5T660-500t-52.5-127.5T480-680t-127.5 52.5T300-500t52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500t31.5-76.5T480-608t76.5 31.5T588-500t-31.5 76.5T480-392Zm0-80Z"/></svg>
                        </div>
                    </div>
                    <div class="cineby-ep-info">
                        <h4 class="cineby-ep-title">${escapeHtml(epTitle)}</h4>
                        <p class="cineby-ep-desc">${escapeHtml(overview)}</p>
                        <span class="cineby-show-more">Show more</span>
                    </div>
                `;

                if (playContext && String(playContext.season) === String(found.sn) && String(playContext.episode) === String(ep.episode_number)) {
                    card.classList.add('active');
                }

                card.onclick = () => {
                    list.querySelectorAll('.cineby-ep-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    playTmdbEpisode(tvItem, found.sn, ep.episode_number, server);
                };

                fragment.appendChild(card);
            });
            list.appendChild(fragment);
            setupTmdbNextButton(tvItem, found.sn, server);
        };

        renderCurrentSeasonEpisodes();

        if (dropdown) {
            dropdown.onchange = (e) => {
                currentSelectedSeason = e.target.value;
                if (searchInput) searchInput.value = '';
                renderCurrentSeasonEpisodes();
            };
        }

        if (searchInput) {
            searchInput.oninput = (e) => {
                renderCurrentSeasonEpisodes(e.target.value);
            };
        }

    } catch (e) {
        if (errEl) { errEl.textContent = 'Could not load episodes: ' + (e.message || e); errEl.style.display = ''; }
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

// Play a specific season + episode on the given TMDB server.
function playTmdbEpisode(tvItem, season, episode, server) {
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    clearAutoFallback();
    title.textContent = tvItem.title;
    subtitle.textContent = `Season ${season || 1} • Episode ${episode}`;
    playContext = { item: tvItem, type: 'tv', season: season || 1, episode };
    setupTmdbNextButton(tvItem, season || 1, server);
    renderTmdbPlay(server);
}

function setupTmdbNextButton(tvItem, season, server) {
    const playerContainer = document.getElementById('playerContainer');
    const list = document.getElementById('episodePlaylist');
    if (!playerContainer || !list) return;
    const oldButton = document.getElementById('playNextEpisode');
    if (oldButton) oldButton.remove();
    const currentEpisode = Number(playContext?.episode || 0);
    const nextCard = Array.from(list.querySelectorAll('.cineby-ep-card')).find(card =>
        Number(card.dataset.episode) === currentEpisode + 1 && String(card.dataset.season) === String(season));
    if (!nextCard) return;
    const nextButton = document.createElement('button');
    nextButton.id = 'playNextEpisode';
    nextButton.className = 'play-next-button';
    nextButton.type = 'button';
    nextButton.textContent = 'Play next';
    nextButton.title = 'Play next episode';
    nextButton.onclick = () => nextCard.click();
    playerContainer.appendChild(nextButton);
}

function renderEpisodePlaylist(tvItem) {
    const list = document.getElementById('episodePlaylist');
    list.innerHTML = '';
    tvItem.episodes.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'ep-play-item' + (i === 0 ? ' active' : '');
        div.innerHTML = `
            <div class="ep-num">${i + 1}</div>
            <div class="ep-info">
                <div class="ep-title">${escapeHtml(ep.name)}</div>
                <div class="ep-size">${ep.size ? formatSize(ep.size) : (ep.driveLink ? 'Google Drive' : '')}</div>
            </div>
        `;
        div.onclick = () => {
            list.querySelectorAll('.ep-play-item').forEach(el => el.classList.remove('active'));
            div.classList.add('active');
            playEpisode(tvItem, ep, i);
        };
        list.appendChild(div);
    });
}

function playEpisode(tvItem, episode, index) {
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    const playerContainer = document.getElementById('playerContainer');
    title.textContent = tvItem.title;
    subtitle.textContent = `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`;
    playContext = { item: tvItem, type: 'tv', season: tvItem.season || 1, episode: index + 1 };
    frame.innerHTML = '';

    const playNext = (automatic = false) => {
        if (automatic && settings.autoPlayNext === false) return;
        const nextIndex = index + 1;
        if (nextIndex >= tvItem.episodes.length) return;
        const currentNextButton = document.getElementById('playNextEpisode');
        if (currentNextButton) currentNextButton.hidden = true;
        const nextEpisode = tvItem.episodes[nextIndex];
        document.querySelectorAll('#episodePlaylist .ep-play-item').forEach((el, i) =>
            el.classList.toggle('active', i === nextIndex));
        try { toast(`Playing next: Episode ${nextIndex + 1}`, 'success'); } catch {}
        playEpisode(tvItem, nextEpisode, nextIndex);
    };

    const oldNextButton = document.getElementById('playNextEpisode');
    if (oldNextButton) oldNextButton.remove();
    if (playerContainer && index + 1 < tvItem.episodes.length) {
        const nextButton = document.createElement('button');
        nextButton.id = 'playNextEpisode';
        nextButton.className = 'play-next-button';
        nextButton.type = 'button';
        nextButton.textContent = 'Play next';
        nextButton.hidden = true;
        nextButton.onclick = playNext;
        playerContainer.appendChild(nextButton);
    }

    if (episode.blobUrl) {
        frame.innerHTML = `<video id="driveVideoEl" controls autoplay style="width:100%;height:100%;background:#000;"><source src="${escapeHtml(episode.blobUrl)}" type="${escapeHtml(episode.type || 'video/mp4')}"></video>`;
        const video = document.getElementById('driveVideoEl');
        if (video) video.addEventListener('ended', () => {
            const nextButton = document.getElementById('playNextEpisode');
            if (nextButton) {
                nextButton.hidden = false;
                nextButton.classList.add('episode-ended');
            }
            if (settings.autoPlayNext !== false) {
                setTimeout(() => {
                    if (nextButton && !nextButton.hidden) playNext(true);
                }, 5000);
            }
        });
    } else if (episode.driveLink) {
        const driveLink = convertDriveLink(episode.driveLink);
        frame.innerHTML = `<iframe src="${escapeHtml(driveLink)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else if (episode.url) {
        frame.innerHTML = `<iframe src="${escapeHtml(episode.url)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else {
        frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source</div>`;
    }

    setTimeout(() => setActiveEpisode(tvItem.season || 1, index + 1, document.getElementById('episodePlaylist')), 80);
}

// ==================== INFO MODAL ====================
function showInfo(item, type) {
    type = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const sourceItem = resolveSourceItem(item, type);
    currentInfoItem = sourceItem;
    currentInfoType = type;
    const modal = document.getElementById('infoModal');
    const backdrop = document.getElementById('infoBackdrop');
    const inList = myList.some(m => m.id === item.id);
    const bgUrl = hiRes(item.backdrop || item.poster);
    const gArr = genArr(item.genre);
    if (bgUrl) {
        backdrop.style.backgroundImage = `url("${escapeHtml(bgUrl)}")`;
        backdrop.innerHTML = '';
    } else {
        backdrop.style.backgroundImage = 'none';
        backdrop.textContent = defaultPosters[gArr[0]] || '🎬';
    }
    const infoTitleEl = document.getElementById('infoTitle');
    const infoLogo = document.getElementById('infoLogo');
    if (item.logo) {
        infoLogo.src = item.logo;
        infoLogo.style.display = 'block';
        infoTitleEl.textContent = item.title;
        infoTitleEl.classList.remove('show');
    } else {
        infoLogo.removeAttribute('src');
        infoLogo.style.display = 'none';
        infoTitleEl.textContent = item.title;
        infoTitleEl.classList.add('show');
    }
    document.getElementById('infoYear').textContent = item.year || '';
    // runtime - use stored runtime or fallback 1h 43m like reference
    const rtRaw = item.runtime ?? item.duration ?? item.runtimeMinutes ?? null;
    let rtDisplay = '1h 43m';
    let rtMinutes = 103;
    const parseRt = (v) => {
        if (v == null || v === '') return null;
        if (typeof v === 'number' && !isNaN(v)) return v;
        const s = String(v).toLowerCase().trim();
        if (/^\d+$/.test(s)) return parseInt(s, 10);
        let m = 0;
        const h = s.match(/(\d+)\s*h/);
        const mm = s.match(/(\d+)\s*m/);
        if (h) m += parseInt(h[1], 10) * 60;
        if (mm) m += parseInt(mm[1], 10);
        if (m) return m;
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
    };
    const fmtMin = (mins) => {
        if (mins == null || isNaN(mins)) return null;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        if (h && m) return `${h}h ${m}m`;
        if (h) return `${h}h`;
        return `${m}m`;
    };
    if (rtRaw != null && String(rtRaw).trim() !== '') {
        const parsed = parseRt(rtRaw);
        if (parsed != null) {
            rtMinutes = parsed;
            rtDisplay = fmtMin(parsed) || String(rtRaw);
        } else {
            rtDisplay = String(rtRaw);
            rtMinutes = parseRt(rtDisplay) ?? 103;
        }
    }
    const rtEl = document.getElementById('infoRuntime');
    const rt2El = document.getElementById('infoRuntime2');
    if (rtEl) rtEl.textContent = rtDisplay;
    if (rt2El) {
        try {
            const end = new Date();
            end.setMinutes(end.getMinutes() + rtMinutes);
            const endsAt = end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
            rt2El.textContent = `${rtDisplay} · Ends ${endsAt}`;
        } catch { rt2El.textContent = rtDisplay; }
    }
    document.getElementById('infoRating').innerHTML = item.rating ? `<svg style="display: inline-block; vertical-align: -0.15em; margin-right: 3px;" xmlns="http://www.w3.org/2000/svg" height="14px" viewBox="0 -960 960 960" width="14px" fill="#000000"><path d="m384-334 96-74 96 74-36-122 90-64H518l-38-124-38 124H330l90 64-36 122ZM233-120l93-304L80-600h304l96-320 96 320h304L634-424l93 304-247-188-247 188Zm247-369Z"/></svg>` + item.rating : '';
    const infoCertEl = document.getElementById('infoCert');
    if (infoCertEl) { infoCertEl.textContent = item.certification || 'PG'; infoCertEl.style.display = 'inline-flex'; }
    // genres as dot separated • like reference
    const genreEl = document.getElementById('infoGenre');
    if (genreEl) {
        genreEl.innerHTML = gArr.length ? gArr.map(g => `<span>${g.charAt(0).toUpperCase()+g.slice(1)}</span>`).join(' <span style="opacity:0.5">•</span> ') : '';
    }
    // director
    const dirEl = document.getElementById('infoDirector');
    if (dirEl) {
        const dir = item.director || item.creator || '';
        if (dir) { dirEl.innerHTML = `Director: <span>${escapeHtml(dir)}</span>`; dirEl.style.display = ''; } else { dirEl.style.display = 'none'; }
    }
    // status card
    const statusEl = document.getElementById('infoStatus');
    if (statusEl) {
        const yr = parseInt(item.year) || 0;
        statusEl.textContent = (yr && yr > new Date().getFullYear()) ? 'Upcoming' : 'Released';
    }
    const langEl = document.getElementById('infoLanguage');
    if (langEl) langEl.textContent = (item.language || 'EN').toUpperCase().slice(0,2);
    const relEl = document.getElementById('infoReleased');
    if (relEl) {
        if (item.releaseDate) relEl.textContent = item.releaseDate;
        else if (item.year) relEl.textContent = `Aug 28, ${item.year}`;
        else relEl.textContent = 'Aug 28, 2026';
    }
    // external ratings - derive from item.rating
    const imdbEl = document.getElementById('infoImdb');
    if (imdbEl) imdbEl.textContent = item.rating ? (Number(item.rating).toFixed(1) + '/10') : '7.7/10';
    const rt1El = document.getElementById('infoRt1');
    if (rt1El) rt1El.textContent = item.rating ? Math.round(Number(item.rating)*10+2) + '%' : '96%';
    const rt2El2 = document.getElementById('infoRt2');
    if (rt2El2) rt2El2.textContent = item.rating ? Math.round(Number(item.rating)*10) + '%' : '94%';
    document.getElementById('infoDesc').textContent = item.description || 'No description available.';
    document.getElementById('infoPlayBtn').onclick = () => { modal.classList.remove('active'); playItem(sourceItem, type); };
    document.getElementById('infoListBtn').innerHTML = inList ? '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>' : '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z"/></svg>';
    document.getElementById('infoListBtn').title = inList ? 'Remove from My List' : 'Add to My List';
    document.getElementById('infoListBtn').onclick = () => { toggleMyList(sourceItem, type); showInfo(sourceItem, type); };
    document.getElementById('infoEditBtn').onclick = () => { modal.classList.remove('active'); openEdit(sourceItem, type); };
    const dlBtn = document.getElementById('infoDownloadBtn');
    if (dlBtn) dlBtn.onclick = () => {
        const url = sourceItem.driveLink ? convertDriveLink(sourceItem.driveLink) : (sourceItem.poster || sourceItem.backdrop || '');
        if (!url) { toast('No download available for this title', 'error'); return; }
        if (sourceItem.driveLink) {
            window.open(url, '_blank');
            toast('Opening download...', 'success');
        } else {
            const a = document.createElement('a');
            a.href = url;
            a.download = (sourceItem.title || 'download').replace(/[^a-z0-9]/gi,'_') + '.jpg';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast('Downloading poster...', 'success');
        }
    };
    document.getElementById('infoDeleteBtn').onclick = () => {
        if (confirm(`Remove "${item.title}" from your library?`)) {
            if (type === 'movie') movies = movies.filter(m => m.id !== item.id);
            else tvShows = tvShows.filter(m => m.id !== item.id);
            myList = myList.filter(m => m.id !== item.id);
            saveData(); refreshCurrent(); modal.classList.remove('active');
            toast(`Removed "${item.title}"`);
        }
    };
    modal.classList.add('active');
}

// ==================== EDIT CONTENT ====================
let editTarget = null;
let editType = null;

function openEdit(item, type) {
    editTarget = item;
    editType = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const ctn = document.getElementById('editFormContainer');
    const isMovie = editType === 'movie';
    document.getElementById('editModalTitle').textContent = isMovie ? 'Edit Movie' : 'Edit TV Show';

    const g = genArr(item.genre);
    let episodesHTML = '';
    if (!isMovie && item.episodes && item.episodes.length) {
        episodesHTML = item.episodes.map((ep, i) => `
            <div class="edit-ep-row">
                <input type="text" class="edit-ep-name" value="${escapeHtml(ep.name)}" data-i="${i}" placeholder="Episode name">
                <input type="url" class="edit-ep-src" value="${escapeHtml(ep.driveLink || ep.url || '')}" data-i="${i}" placeholder="Drive link or URL">
            </div>`).join('');
    }

    ctn.innerHTML = `
        <form id="editForm">
            <div class="form-group">
                <label>Title</label>
                <input type="text" id="editTitle" value="${escapeHtml(item.title)}" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="editDesc" rows="3">${escapeHtml(item.description || '')}</textarea>
            </div>
            <div class="form-group">
                <label>Genres</label>
                <div class="genre-options" id="editGenreOptions"></div>
            </div>
            <div class="form-group">
                <label>Year</label>
                <input type="number" id="editYear" min="1900" max="2030" value="${item.year || ''}">
            </div>
            <div class="form-group">
                <label>Rating (1-10)</label>
                <input type="number" id="editRating" min="1" max="10" step="0.1" value="${item.rating || ''}">
            </div>
            <div class="form-group">
                <label for="editPoster">Poster URL</label>
                <input type="url" id="editPoster" value="${escapeHtml(item.poster || '')}">
            </div>
            <div class="form-group">
                <label for="editBackdrop">Backdrop URL</label>
                <input type="url" id="editBackdrop" value="${escapeHtml(item.backdrop || '')}">
            </div>
            <input type="hidden" id="editCertification" value="${escapeHtml(item.certification || '')}">
            ${isMovie ? `
            <div class="form-group">
                <label for="editLogo">Movie Logo URL</label>
                <input type="url" id="editLogo" placeholder="https://example.com/logo.png" value="${escapeHtml(item.logo || '')}">
                <small class="help-text">Logo image shown on top of the movie title in the info modal.</small>
            </div>
            <div class="form-group">
                <label for="editTmdbId">TMDB ID (optional)</label>
                <input type="text" id="editTmdbId" placeholder="27205" value="${escapeHtml(item.tmdbId || '')}">
                <button type="button" class="btn-tmdb" id="editFetchTmdb">Load from TMDB</button>
                <small class="help-text">Playback via a TMDB-powered player. If filled, Play uses this; otherwise it uses the Drive link below.</small>
            </div>
            <div class="form-group">
                <label for="editDriveLink">Google Drive Link</label>
                <input type="url" id="editDriveLink" value="${escapeHtml(item.driveLink || '')}">
            </div>` : `
            <div class="form-group">
                <label>Season Number</label>
                <input type="number" id="editSeason" min="1" value="${item.season || 1}">
            </div>
            <div class="form-group">
                <label for="editTmdbId">TMDB ID (optional)</label>
                <input type="text" id="editTmdbId" placeholder="1396" value="${escapeHtml(item.tmdbId || '')}">
                <button type="button" class="btn-tmdb" id="editFetchTmdb">Load from TMDB</button>
                <small class="help-text">Playback via a TMDB-powered player. If filled, Play uses this; otherwise it uses the episode sources below.</small>
            </div>
            <div class="form-group">
                <label for="editLogo">Logo URL</label>
                <input type="url" id="editLogo" placeholder="https://example.com/logo.png" value="${escapeHtml(item.logo || '')}">
                <small class="help-text">Logo image shown on top of the TV show title in the info modal and hero banner.</small>
            </div>
            ${episodesHTML ? `<div class="form-group"><label>Episodes (Google Drive links or URLs)</label>${episodesHTML}</div>` : ''}
            `}
            <button type="submit" class="btn-submit">Save Changes</button>
        </form>
    `;

    // Build genre chips
    GENRES.forEach(genre => {
        const label = document.createElement('label');
        label.className = 'genre-chip';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = genre;
        cb.checked = g.includes(genre);
        const span = document.createElement('span');
        span.textContent = genre.charAt(0).toUpperCase() + genre.slice(1);
        label.appendChild(cb);
        label.appendChild(span);
        document.getElementById('editGenreOptions').appendChild(label);
    });

    document.getElementById('editForm').addEventListener('submit', saveEdit);
    const editFetchBtn = document.getElementById('editFetchTmdb');
    if (editFetchBtn) editFetchBtn.onclick = () => loadTmdbInto(editFetchBtn, isMovie ? 'editMovie' : 'editTv');
    document.getElementById('editModal').classList.add('active');
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Upgrade a TMDB image URL to its highest available resolution so banners and
// hero images stay crisp instead of looking blurry when stretched full-width.
function hiRes(url) {
    if (!url) return url;
    return String(url)
        .replace(/\/t\/p\/w45\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w92\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w154\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w185\//i, '/t/p/w500/')
        .replace(/\/t\/p\/w342\//i, '/t/p/w780/')
        .replace(/\/t\/p\/w500\//i, '/t/p/w1280/')
        .replace(/\/t\/p\/w780\//i, '/t/p/w1280/')
        .replace(/\/t\/p\/w1280\//i, '/t/p/original/')
        .replace(/\/t\/p\/original\//i, '/t/p/original/');
}

function resolveSourceItem(item, type) {
    const t = (type === 'movie' || type === 'tv') ? type : (item.type || 'movie');
    const arr = t === 'movie' ? movies : tvShows;
    return arr.find(x => x.id === item.id) || item;
}

function saveEdit(e) {
    e.preventDefault();
    if (!editTarget) return;
    const target = resolveSourceItem(editTarget, editType);
    const g = Array.from(document.querySelectorAll('#editGenreOptions input[type=checkbox]:checked')).map(cb => cb.value);

    target.title = document.getElementById('editTitle').value.trim();
    target.description = document.getElementById('editDesc').value.trim();
    target.genre = g;
    target.year = document.getElementById('editYear').value;
    target.rating = document.getElementById('editRating').value;
    target.poster = document.getElementById('editPoster').value.trim();
    target.backdrop = document.getElementById('editBackdrop').value.trim();
    target.certification = document.getElementById('editCertification').value.trim();

    if (editType === 'movie') {
        const editLogoEl = document.getElementById('editLogo');
        target.logo = editLogoEl ? editLogoEl.value.trim() : '';
        const tmdbEl = document.getElementById('editTmdbId');
        target.tmdbId = tmdbEl ? tmdbEl.value.trim() : '';
        target.driveLink = document.getElementById('editDriveLink').value.trim();
    } else {
        const editLogoEl = document.getElementById('editLogo');
        target.logo = editLogoEl ? editLogoEl.value.trim() : '';
        const tmdbEl = document.getElementById('editTmdbId');
        target.tmdbId = tmdbEl ? tmdbEl.value.trim() : '';
        target.season = document.getElementById('editSeason').value || 1;
        const rows = document.querySelectorAll('.edit-ep-row');
        if (rows.length && target.episodes) {
            rows.forEach(row => {
                const i = row.querySelector('.edit-ep-name').dataset.i;
                const name = row.querySelector('.edit-ep-name').value.trim();
                const src = row.querySelector('.edit-ep-src').value.trim();
                if (target.episodes[i]) {
                    target.episodes[i].name = name;
                    target.episodes[i].driveLink = src;
                    target.episodes[i].url = '';
                }
            });
        }
    }

    editTarget = target;
    saveData();
    refreshCurrent();
    document.getElementById('editModal').classList.remove('active');
    toast('Changes saved!', 'success');
}

// ==================== TMDB AUTO-FILL ====================
const TMDB_AUTH = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5NDc2MWZmMmViNWRiYTM4MDJlZDJlNGJkOTE0ZGZlOCIsIm5iZiI6MTc3NzU2MDc0My45NzMsInN1YiI6IjY5ZjM2Y2E3ZDZhZjA3Yjg2Zjg0MzA3MSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.pNYedccUMayuOtMmH_vMWVVYjfAal3r2V1WWv433u4g';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/';

// Uses the user-saved TMDB key if set, otherwise the built-in default. Handles
// both raw api_key tokens and full "Bearer ..." strings.
function effectiveTmdbAuth() {
    const saved = (settings && settings.tmdbAuth || '').trim();
    if (!saved) return TMDB_AUTH;
    return /^Bearer\s/i.test(saved) ? saved : `Bearer ${saved}`;
}

let tmdbImageBase = TMDB_IMG;
let tmdbConfigLoaded = false;

async function tmdbEnsureConfig() {
    if (tmdbConfigLoaded) return;
    try {
        const d = await tmdbJson('/configuration');
        if (d.images && d.images.secure_base_url) tmdbImageBase = d.images.secure_base_url;
    } catch (e) { /* keep the default base on failure */ }
    tmdbConfigLoaded = true;
}

const TMDB_GENRE_MAP = {
    'action': 'action',
    'adventure': 'adventure',
    'animation': 'animation',
    'comedy': 'comedy',
    'crime': 'crime',
    'documentary': 'documentary',
    'drama': 'drama',
    'family': 'family',
    'fantasy': 'fantasy',
    'history': 'history',
    'horror': 'horror',
    'music': 'musical',
    'mystery': 'mystery',
    'romance': 'romance',
    'science fiction': 'scifi',
    'sci-fi': 'scifi',
    'thriller': 'thriller',
    'war': 'war',
    'western': 'western'
};

async function tmdbJson(path) {
    const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}language=en-US`;
    const res = await fetch(url, {
        headers: {
            'accept': 'application/json',
            'Authorization': effectiveTmdbAuth()
        }
    });
    if (!res.ok) {
        if (res.status === 401) throw new Error('TMDB API key invalid or expired. Add a valid Bearer token in Settings.');
        if (res.status === 403) throw new Error('TMDB API access denied. Check the API key in Settings.');
        throw new Error(res.status === 404 ? '404 - Not found (check the ID, or type a title to search)' : `HTTP ${res.status}`);
    }
    return res.json();
}

// Content certification (age rating) for a title, US first then UK fallback.
async function tmdbCertification(type, id) {
    try {
        if (type === 'tv') {
            const d = await tmdbJson(`/tv/${encodeURIComponent(id)}/content_ratings`);
            const r = (d.results || []).find(x => x.iso_3166_1 === 'US') || (d.results || []).find(x => x.iso_3166_1 === 'GB');
            return (r && (r.rating || '').trim()) || '';
        }
        const d = await tmdbJson(`/movie/${encodeURIComponent(id)}/release_dates`);
        const pick = (cc) => {
            const entry = (d.results || []).find(x => x.iso_3166_1 === cc);
            if (!entry) return '';
            const rd = (entry.release_dates || []).find(x => x.certification && x.certification.trim());
            return rd ? rd.certification.trim() : '';
        };
        return pick('US') || pick('GB') || '';
    } catch (e) {
        return '';
    }
}

function tmdbGenreKeys(tmdbGenres) {
    const keys = [];
    (tmdbGenres || []).forEach(g => {
        const slug = (g.name || '').trim().toLowerCase();
        const key = TMDB_GENRE_MAP[slug];
        if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
}

function tmdbLogoUrl(d) {
    const logos = (d.images && d.images.logos) || [];
    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
    return logo && logo.file_path ? `${tmdbImageBase}w780${logo.file_path}` : '';
}

function tmdbFillForm(d, ids) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    setVal(ids.title, d.title || d.name || '');
    setVal(ids.desc, d.overview || '');
    setVal(ids.year, (d.release_date || d.first_air_date || '').slice(0, 4));
    setVal(ids.rating, d.vote_average ? (+d.vote_average).toFixed(1) : '');
    setVal(ids.poster, d.poster_path ? `${tmdbImageBase}w500${d.poster_path}` : '');
    setVal(ids.backdrop, d.backdrop_path ? `${tmdbImageBase}w1920${d.backdrop_path}` : '');
    setVal(ids.logo, tmdbLogoUrl(d));
    const container = document.getElementById(ids.genres);
    if (container) {
        const keys = tmdbGenreKeys(d.genres);
        container.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = keys.includes(cb.value); });
    }
}

function parseTmdbInput(raw) {
    const s = String(raw || '').trim();
    if (/^\d+$/.test(s)) return { id: s, type: '' };
    const m = s.match(/themoviedb\.org\/(movie|tv)\/(\d+)/i);
    if (m) return { id: m[2], type: m[1].toLowerCase() };
    return null;
}
function parseImdbInput(raw) {
    const s = String(raw || '').trim();
    const m = s.match(/(tt\d{5,})/i);
    return m ? m[1].toLowerCase() : null;
}
async function imdbFetchAndFill(imdbId, type, isEdit) {
    // TMDB find by IMDb ID — returns movie_results / tv_results with the TMDB id
    const data = await tmdbJson(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`);
    const movieRes = (data.movie_results && data.movie_results[0]) || null;
    const tvRes = (data.tv_results && data.tv_results[0]) || null;
    let target = null;
    if (type === 'movie' && movieRes) target = { id: movieRes.id, type: 'movie' };
    else if (type === 'tv' && tvRes) target = { id: tvRes.id, type: 'tv' };
    else if (type === 'movie' && tvRes && !movieRes) target = { id: tvRes.id, type: 'tv' };
    else if (type === 'tv' && movieRes && !tvRes) target = { id: movieRes.id, type: 'movie' };
    else target = movieRes ? { id: movieRes.id, type: 'movie' } : tvRes ? { id: tvRes.id, type: 'tv' } : null;
    if (!target) throw new Error('No TMDB match for that IMDb ID');
    // also fill the TMDB ID field so Play uses it
    const tmdbField = document.getElementById((isEdit ? 'edit' : type) + 'TmdbId');
    if (tmdbField) tmdbField.value = String(target.id);
    return tmdbFetchAndFill(String(target.id), target.type, isEdit);
}

function tmdbTargetIds(type, isEdit) {
    const p = isEdit ? 'edit' : (type === 'movie' ? 'movie' : 'tv');
    return {
        title: `${p}Title`,
        desc: `${p}Desc`,
        year: `${p}Year`,
        rating: `${p}Rating`,
        poster: `${p}Poster`,
        backdrop: `${p}Backdrop`,
        logo: `${p}${isEdit ? 'Logo' : 'LogoUrl'}`,
        genres: `${p}GenreOptions`
    };
}

async function tmdbFetchAndFill(id, type, isEdit) {
    const d = await tmdbJson(`/${type}/${encodeURIComponent(id)}?append_to_response=images`);
    tmdbFillForm(d, tmdbTargetIds(type, isEdit));
    const certEl = document.getElementById((isEdit ? 'edit' : type) + 'Certification');
    if (certEl) certEl.value = await tmdbCertification(type, id);
}

async function tmdbBestSearchResult(type, query) {
    const d = await tmdbJson(`/search/${type}?query=${encodeURIComponent(query)}`);
    return (d.results || [])[0] || null;
}

function tmdbDefaultKind(kind) {
    return kind === 'movie' || kind === 'editMovie' ? 'movie' : 'tv';
}

async function loadTmdbInto(btn, kind) {
    if (!btn || btn.dataset.busy) return;
    const idEl = document.getElementById(kind === 'movie' ? 'movieTmdbId' : kind === 'tv' ? 'tvTmdbId' : 'editTmdbId');
    const raw = (idEl ? idEl.value : '').trim();
    if (!raw) { toast('Enter a TMDB ID or title to search.', 'error'); return; }
    const isEdit = kind === 'editMovie' || kind === 'editTv';
    const defaultType = tmdbDefaultKind(kind);
    btn.dataset.busy = '1';
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Loading...';
    try {
        await tmdbEnsureConfig();
        let type = defaultType;
        let id = '';
        const parsed = parseTmdbInput(raw);
        if (parsed) {
            id = parsed.id;
            if (parsed.type === 'movie' || parsed.type === 'tv') type = parsed.type;
        } else {
            const found = await tmdbBestSearchResult(type, raw);
            if (!found) throw new Error('No results found for that title');
            id = found.id;
        }
        await tmdbFetchAndFill(id, type, isEdit);
        toast('Filled from TMDB!', 'success');
    } catch (err) {
        toast(`TMDB error: ${err.message || err}`, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = original;
        delete btn.dataset.busy;
    }
}

const movieFetchBtn = document.getElementById('movieFetchTmdb');
if (movieFetchBtn) movieFetchBtn.onclick = () => loadTmdbInto(movieFetchBtn, 'movie');
const tvFetchBtn = document.getElementById('tvFetchTmdb');
if (tvFetchBtn) tvFetchBtn.onclick = () => loadTmdbInto(tvFetchBtn, 'tv');
let imdbScanTimer = null;
async function manualImdbScan(kind) {
    const idEl = document.getElementById(kind === 'movie' ? 'movieImdbId' : 'tvImdbId');
    if (!idEl) return;
    const raw = idEl.value.trim();
    const imdbId = parseImdbInput(raw);
    if (!imdbId) return;
    if (idEl.dataset.lastScanned === imdbId) return;
    idEl.dataset.lastScanned = imdbId;
    const isEdit = false;
    const hint = idEl.nextElementSibling;
    if (hint) hint.textContent = 'Scanning IMDb...';
    try {
        await tmdbEnsureConfig();
        await imdbFetchAndFill(imdbId, kind === 'movie' ? 'movie' : 'tv', isEdit);
        toast('Scanned from IMDb via TMDB!', 'success');
        if (hint) hint.textContent = 'Auto-filled from IMDb ✔';
    } catch (err) {
        delete idEl.dataset.lastScanned;
        if (hint) hint.textContent = `IMDb error: ${err.message || err}`;
        toast(`IMDb error: ${err.message || err}`, 'error');
    }
}
['movieImdbId','tvImdbId'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const kind = id === 'movieImdbId' ? 'movie' : 'tv';
    el.addEventListener('paste', () => setTimeout(()=> manualImdbScan(kind), 80));
    el.addEventListener('input', () => {
        clearTimeout(imdbScanTimer);
        const v = el.value.trim();
        if (!parseImdbInput(v)) { delete el.dataset.lastScanned; return; }
        imdbScanTimer = setTimeout(()=> manualImdbScan(kind), 600);
    });
    el.addEventListener('change', () => manualImdbScan(kind));
});

// ==================== LOAD POPULAR (TMDB) ====================
const TMDB_GENRE_ID_MAP = {
    28: 'action', 12: 'adventure', 16: 'animation', 35: 'comedy', 80: 'crime',
    99: 'documentary', 18: 'drama', 10751: 'family', 14: 'fantasy', 36: 'history',
    27: 'horror', 10402: 'musical', 9648: 'mystery', 10749: 'romance', 878: 'scifi',
    53: 'thriller', 10752: 'war', 37: 'western', 10759: 'action', 10762: 'family',
    10765: 'scifi', 10768: 'war', 10770: 'drama', 10763: 'documentary',
    10764: 'documentary', 10766: 'drama', 10767: 'comedy'
};

const POPULAR_MOVIE_GENRES = [28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37];
const POPULAR_TV_GENRES = [10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37];
const POPULAR_PAGES = 15;
const STORAGE_BUDGET = 4.5 * 1024 * 1024;

function popularPaths() {
    const paths = [];
    POPULAR_MOVIE_GENRES.forEach(g => {
        for (let p = 1; p <= POPULAR_PAGES; p++) paths.push(`/discover/movie?with_genres=${g}&sort_by=primary_release_date.desc&page=${p}`);
    });
    POPULAR_TV_GENRES.forEach(g => {
        for (let p = 1; p <= POPULAR_PAGES; p++) paths.push(`/discover/tv?with_genres=${g}&sort_by=first_air_date.desc&page=${p}`);
    });
    for (let p = 1; p <= 3; p++) {
        paths.push(`/discover/movie?with_genres=16&with_origin_country=JP&sort_by=primary_release_date.desc&page=${p}`);
        paths.push(`/discover/tv?with_genres=16&with_origin_country=JP&sort_by=first_air_date.desc&page=${p}`);
    }
    return paths;
}

async function fetchBatched(paths, batchSize = 15) {
    const jsons = [];
    for (let i = 0; i < paths.length; i += batchSize) {
        const chunk = paths.slice(i, i + batchSize);
        jsons.push(...(await Promise.all(chunk.map(p => tmdbJson(p)))));
    }
    return jsons;
}

// Fetches each added title's logo + content rating from TMDB (detail request, appended
// with images and the rating source), batched to stay under TMDB rate limits.
async function enrichTmdbDetails(items, btn, quiet) {
    const targets = items.filter(m => m.tmdbId);
    let done = 0;
    const total = targets.length;
    if (!total) return;
    for (let i = 0; i < total; i += 10) {
        const chunk = targets.slice(i, i + 10);
        await Promise.all(chunk.map(async (m) => {
            try {
                const kind = m.type === 'tv' ? 'tv' : 'movie';
                const append = kind === 'tv' ? 'images,content_ratings' : 'images,release_dates';
                const d = await tmdbJson(`/${kind}/${encodeURIComponent(m.tmdbId)}?append_to_response=${append}`);
                if (d.images && d.images.logos) {
                    const logos = d.images.logos;
                    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
                    if (logo && logo.file_path && !m.logo) m.logo = `${tmdbImageBase}w780${logo.file_path}`;
                }
                if (!m.certification) {
                    if (kind === 'tv' && d.content_ratings) {
                        const rr = (d.content_ratings.results || []).find(x => x.iso_3166_1 === 'US') || (d.content_ratings.results || []).find(x => x.iso_3166_1 === 'GB');
                        if (rr && rr.rating) m.certification = rr.rating;
                    } else if (kind === 'movie' && d.release_dates) {
                        const pick = (cc) => {
                            const entry = (d.release_dates.results || []).find(x => x.iso_3166_1 === cc);
                            if (!entry) return '';
                            const rd = (entry.release_dates || []).find(x => x.certification && x.certification.trim());
                            return rd ? rd.certification.trim() : '';
                        };
                        m.certification = pick('US') || pick('GB') || '';
                    }
                }
            } catch (e) { /* skip titles with missing/blocked fields */ }
        }));
        done = Math.min(i + 10, total);
        if (btn) btn.textContent = `Fetching logos & ratings... ${done}/${total}`;
        if (done % 100 === 0) { saveData(); refreshCurrent(); }
        await sleep(350);
    }
    saveData();
    refreshCurrent();
    if (!quiet) toast('Hero logos & content ratings loaded!', 'success');
}

// Auto-add hero logos (and ratings) for any stored movie/show/anime that has a
// TMDB id but no logo yet. Runs in the background on init so existing content
// gradually gets brand logos without blocking the page.
async function enrichMissingLogos() {
    const needLogo = [...movies, ...tvShows].filter(m => m && m.tmdbId && !m.logo);
    if (!needLogo.length) return;
    await enrichTmdbDetails(needLogo, null, true);
}

// Auto-fetch the brand logo for a single just-added item (by its TMDB id).
async function enrichNewItemLogo(tmdbId, type) {
    if (!tmdbId) return;
    const pool = type === 'tv' ? tvShows : movies;
    const item = pool.find(m => m && String(m.tmdbId) === String(tmdbId) && !m.logo);
    if (!item) return;
    await fetchItemLogo(item);
    if (item.logo) { saveData(); refreshCurrent(); }
}

// Auto-add logos to a live tab's items (Trending/Streaming/Theaters) and refresh
// the banner once they arrive, so banners always show a brand logo.
async function enrichLiveLogos(key) {
    const st = liveState[key];
    if (!st || !st.items || !st.items.length) return;
    const before = st.items.filter(m => m && m.logo).length;
    const needLogo = st.items.filter(m => m && m.tmdbId && !m.logo);
    if (!needLogo.length) return;
    await enrichTmdbDetails(needLogo, null, true);
    const after = st.items.filter(m => m && m.logo).length;
    if (after > before && currentSection === key) showLiveHero(key);
}

// Fetch and assign a TMDB brand logo to a single item (non-blocking).
async function fetchItemLogo(item) {
    if (!item || !item.tmdbId || item.logo) return item;
    const kind = item.type === 'tv' ? 'tv' : 'movie';
    await tmdbEnsureConfig();
    const d = await tmdbJson(`/${kind}/${encodeURIComponent(item.tmdbId)}?append_to_response=images`);
    const logos = (d.images && d.images.logos) || [];
    const logo = logos.find(l => (l.iso_639_1 || '') === 'en') || logos[0];
    if (logo && logo.file_path) item.logo = `${tmdbImageBase}w780${logo.file_path}`;
    return item;
}

// Whether the given item is still the one currently shown in the hero banner.
function featureQueueContains(item) {
    if (!heroQueue.length) return false;
    const cur = heroQueue[heroIndex % heroQueue.length];
    return !!(cur && cur.id === item.id);
}

function tmdbGenreKeysFromIds(ids) {
    const keys = [];
    (ids || []).forEach(gid => {
        const key = TMDB_GENRE_ID_MAP[gid];
        if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
}

function tmdbListItemToItem(r, type, anime) {
    const genre = tmdbGenreKeysFromIds(r.genre_ids || r.genreIds);
    if ((anime || isTmdbAnime(r.genre_ids, r.origin_country, r.original_language)) && !genre.includes('anime')) genre.unshift('anime');
    if (!genre.length) genre.push(type === 'movie' ? 'action' : 'drama');
    return {
        id: generateId(),
        title: r.title || r.name || 'Untitled',
        description: r.overview || '',
        genre,
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
        poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
        backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
        logo: '',
        tmdbId: String(r.id),
        driveLink: '',
        certification: '',
        quality: type === 'tv' ? 'HD' : qualityFor(r.id),
        type
    };
}

async function loadPopularContent(auto) {
    const btn = document.getElementById('loadPopularBtn');
    if (btn && btn.dataset.busy) return;
    const existing = movies.length + tvShows.length;
    if (!auto && existing > 0 && !confirm(`Load a big TMDB library (every genre, movies + shows + anime, newest first) into MilkBox? Your existing ${existing} item(s) are kept and duplicates are skipped.`)) return;
    if (btn) { btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = 'Loading library...'; }
    try {
        await tmdbEnsureConfig();
        const seenMovie = new Set(movies.map(m => m.tmdbId));
        const seenTv = new Set(tvShows.map(t => t.tmdbId));
        let addedMovies = 0;
        let addedTv = 0;
        const newMovieItems = [];
        const newTvItems = [];
        const addMovie = (r, anime) => {
            if (!r || seenMovie.has(String(r.id))) return;
            seenMovie.add(String(r.id));
            const it = tmdbListItemToItem(r, 'movie', anime);
            movies.push(it);
            newMovieItems.push(it);
            addedMovies++;
        };
        const addTv = (r, anime) => {
            if (!r || seenTv.has(String(r.id))) return;
            seenTv.add(String(r.id));
            const it = tmdbListItemToItem(r, 'tv', anime);
            tvShows.push(it);
            newTvItems.push(it);
            addedTv++;
        };
        const paths = popularPaths();
        const jsons = await fetchBatched(paths, 15);
        let halted = false;
        let countSinceCheck = 0;
        const nearLimit = () => (countSinceCheck++ > 40) ? (countSinceCheck = 0, libraryBytes() > STORAGE_BUDGET) : halted;
        jsons.forEach((d, idx) => {
            if (!d || !d.results || halted) return;
            const path = paths[idx];
            const isTv = path.includes('/discover/tv');
            const anime = path.includes('with_origin_country=JP');
            for (const r of d.results) {
                if (nearLimit()) { halted = true; return; }
                if (isTv) addTv(r, anime); else addMovie(r, anime);
            }
        });
        if (halted && !auto) toast('Reached the storage limit — the biggest library was loaded. Remove items to load more.', 'error');
        if (addedMovies + addedTv) {
            saveData();
            refreshCurrent();
            if (!auto) toast(`${addedMovies} movies and ${addedTv} shows added from TMDB!`, 'success');
            await enrichTmdbDetails(newMovieItems.concat(newTvItems), auto ? null : btn);
        } else {
            if (!auto) toast('Nothing new to add — your library already has these.', 'error');
        }
    } catch (err) {
        if (!auto) toast(`TMDB error: ${err.message || err}`, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Load Library'; delete btn.dataset.busy; }
    }
}

const loadPopularBtn = document.getElementById('loadPopularBtn');
if (loadPopularBtn) loadPopularBtn.onclick = loadPopularContent;

// ==================== ADD MOVIE ====================
document.getElementById('movieForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('movieTitle').value.trim();
    const desc = document.getElementById('movieDesc').value.trim();
    const genre = getSelectedGenres('movieGenreOptions');
    const year = document.getElementById('movieYear').value;
    const rating = document.getElementById('movieRating').value;
    const poster = document.getElementById('moviePoster').value.trim();
    const backdrop = document.getElementById('movieBackdrop').value.trim();
    const movieLogoEl = document.getElementById('movieLogoUrl');
    const logo = movieLogoEl ? movieLogoEl.value.trim() : '';
    const tmdbId = document.getElementById('movieTmdbId').value.trim();
    const driveLink = document.getElementById('movieDriveLink').value.trim();
    const certEl = document.getElementById('movieCertification');
    const certification = certEl ? certEl.value.trim() : '';
    if (!title || (!driveLink && !tmdbId)) { toast('Please fill in the title and a Google Drive link or TMDB ID.', 'error'); return; }
    movies.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, logo, tmdbId, driveLink, certification, type: 'movie', quality: qualityFor(tmdbId || generateId()) });
    saveData();
    refreshCurrent();
    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');
    enrichNewItemLogo(tmdbId, 'movie');
    try { e.target.reset(); } catch(_) {}
});

// ==================== TV SHOW EPISODE MANAGEMENT ====================

// --- Drive Episodes ---
document.getElementById('addDriveEpBtn').addEventListener('click', () => {
    const row = document.querySelector('.drive-ep-row');
    const nameInput = row.querySelector('.ep-name-input');
    const driveInput = row.querySelector('.ep-drive-input');
    const name = nameInput.value.trim();
    const link = driveInput.value.trim();
    if (!link) { toast('Please enter a Google Drive link.', 'error'); return; }
    uploadedDriveEps.push({ name: name || `Episode ${uploadedDriveEps.length + 1}`, driveLink: link, order: uploadedDriveEps.length });
    nameInput.value = '';
    driveInput.value = '';
    renderDriveEpisodeList();
    toast('Episode added!', 'success');
});

function renderDriveEpisodeList() {
    const list = document.getElementById('driveEpisodeList');
    const container = document.getElementById('driveEpisodeListContainer');
    list.innerHTML = '';
    if (uploadedDriveEps.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    uploadedDriveEps.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'episode-item';
        div.draggable = true;
        div.dataset.index = i;
        div.innerHTML = `
            <span class="ep-number">${i + 1}</span>
            <span class="ep-name" title="${escapeHtml(ep.name)}">${escapeHtml(ep.name)}</span>
            <span class="ep-type-badge drive">Drive</span>
            <button class="ep-remove" data-index="${i}">&times;</button>
        `;
        list.appendChild(div);
    });
    setupDragDrop(list, uploadedDriveEps, renderDriveEpisodeList);
}

// --- File Episodes ---
document.getElementById('tvEpisodes').addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    files.forEach((file) => {
        uploadedFileEps.push({
            name: file.name.replace(/\.[^/.]+$/, ''),
            file, size: file.size, type: file.type,
            blobUrl: URL.createObjectURL(file),
            order: uploadedFileEps.length
        });
    });
    renderFileEpisodeList();
});

function renderFileEpisodeList() {
    const list = document.getElementById('fileEpisodeList');
    const container = document.getElementById('fileEpisodeListContainer');
    list.innerHTML = '';
    if (uploadedFileEps.length === 0) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    uploadedFileEps.forEach((ep, i) => {
        const div = document.createElement('div');
        div.className = 'episode-item';
        div.draggable = true;
        div.dataset.index = i;
        div.innerHTML = `
            <span class="ep-number">${i + 1}</span>
            <span class="ep-name" title="${escapeHtml(ep.name)}">${escapeHtml(ep.name)}</span>
            <span style="color:#888;font-size:11px;">${formatSize(ep.size)}</span>
            <span class="ep-type-badge file">File</span>
            <button class="ep-remove" data-index="${i}">&times;</button>
        `;
        list.appendChild(div);
    });
    setupDragDrop(list, uploadedFileEps, renderFileEpisodeList);
}

function setupDragDrop(list, dataArray, renderFn) {
    let draggedItem = null;
    list.querySelectorAll('.episode-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            draggedItem = null;
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedItem && draggedItem !== item) {
                const allItems = [...list.querySelectorAll('.episode-item')];
                const fromIdx = allItems.indexOf(draggedItem);
                const toIdx = allItems.indexOf(item);
                const fromData = dataArray.splice(fromIdx, 1)[0];
                dataArray.splice(toIdx, 0, fromData);
                renderFn();
            }
        });
        const removeBtn = item.querySelector('.ep-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(removeBtn.dataset.index);
                dataArray.splice(idx, 1);
                renderFn();
            });
        }
    });
}

// --- Episode Source Toggle ---
document.querySelectorAll('.toggle-btn[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn[data-source]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const source = btn.dataset.source;
        document.getElementById('epDriveSection').style.display = source === 'drive' ? '' : 'none';
        document.getElementById('epFileSection').style.display = source === 'file' ? '' : 'none';
    });
});

// --- Submit TV Show ---
document.getElementById('tvShowForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('tvTitle').value.trim();
    const desc = document.getElementById('tvDesc').value.trim();
    const genre = getSelectedGenres('tvGenreOptions');
    const year = document.getElementById('tvYear').value;
    const rating = document.getElementById('tvRating').value;
    const poster = document.getElementById('tvPoster').value.trim();
    const backdrop = document.getElementById('tvBackdrop').value.trim();
    const logoEl = document.getElementById('tvLogoUrl');
    const logo = logoEl ? logoEl.value.trim() : '';
    const tmdbId = document.getElementById('tvTmdbId').value.trim();
    const season = document.getElementById('tvSeason').value;
    const certEl = document.getElementById('tvCertification');
    const certification = certEl ? certEl.value.trim() : '';
    const isDrive = document.querySelector('#tvTab .toggle-btn[data-source].active')?.dataset.source === 'drive';
    if (!title) { toast('Please enter a TV show title.', 'error'); return; }

    let episodes = [];
    if (isDrive) {
        episodes = uploadedDriveEps.map((ep, i) => ({
            name: ep.name, driveLink: ep.driveLink, size: 0, order: i
        }));
    } else {
        episodes = uploadedFileEps.map((ep, i) => ({
            name: ep.name, url: '', blobUrl: ep.blobUrl, size: ep.size, type: ep.type, order: i
        }));
    }

    tvShows.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, logo, tmdbId, season: season || 1, episodes, certification, type: 'tv' });
    saveData();
    refreshCurrent();

    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');
    enrichNewItemLogo(tmdbId, 'tv');

    uploadedDriveEps = [];
    uploadedFileEps = [];

    try { e.target.reset(); } catch(_) {}

    document.getElementById('driveEpisodeList').innerHTML = '';
    document.getElementById('driveEpisodeListContainer').style.display = 'none';
    document.getElementById('fileEpisodeList').innerHTML = '';
    document.getElementById('fileEpisodeListContainer').style.display = 'none';

    document.querySelectorAll('#tvTab .toggle-btn[data-source]').forEach(b => b.classList.remove('active'));
    const driveBtn = document.getElementById('epSourceDrive');
    if (driveBtn) driveBtn.classList.add('active');
    document.getElementById('epDriveSection').style.display = '';
    document.getElementById('epFileSection').style.display = 'none';
});

// ==================== SEARCH ====================
let searchTimer = null;
let searchQuery = '';
let searchPage = 1;
let searchTotalPages = 1;

function showSearchResults() {
    ['moviesSection','tvShowsSection','myListSection','homeGenres','trendingSection','streamingSection','theatersSection','mangaSection','heroSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.getElementById('searchResultsSection').style.display = '';
}
function hideSearchResults() {
    document.getElementById('searchResultsSection').style.display = 'none';
    refreshCurrent();
}

async function fetchSearchResults(query, page) {
    await tmdbEnsureConfig();
    const d = await tmdbJson(`/search/multi?query=${encodeURIComponent(query)}&page=${page}`);
    const items = [];
    (d.results || []).forEach(r => {
        if (r.media_type === 'person') return;
        const type = r.media_type === 'tv' ? 'tv' : 'movie';
        const genreIds = r.genre_ids || [];
        const genre = tmdbGenreKeysFromIds(genreIds);
        const animeFlag = isTmdbAnime(genreIds, r.origin_country, r.original_language);
        if (animeFlag && !genre.includes('anime')) genre.unshift('anime');
        if (!genre.length) genre.push(type === 'movie' ? 'action' : 'drama');
        items.push({
            id: 'tmdb_' + r.id,
            title: r.title || r.name || 'Untitled',
            description: r.overview || '',
            genre,
            year: (r.release_date || r.first_air_date || '').slice(0, 4),
            rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
            poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
            backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
            logo: '',
            tmdbId: String(r.id),
            driveLink: '',
            certification: '',
            type
        });
    });
    searchTotalPages = d.total_pages || 1;
    return items;
}

function renderSearchPager() {
    const pager = document.getElementById('searchResultsPager');
    if (!pager) return;
    if (searchTotalPages <= 1) { pager.style.display = 'none'; return; }
    pager.style.display = '';
    let html = `<button class="pager-btn pager-nav" data-searchpage="1" data-page="${searchPage - 1}" ${searchPage === 1 ? 'disabled' : ''}>&#10094; Prev</button>`;
    const WIN = 5;
    let s = Math.max(1, searchPage - 2);
    let e = Math.min(searchTotalPages, s + WIN - 1);
    s = Math.max(1, e - WIN + 1);
    for (let i = s; i <= e; i++) {
        html += `<button class="pager-btn ${i === searchPage ? 'current' : ''}" data-searchpage="1" data-page="${i}">${i}</button>`;
    }
    html += `<button class="pager-btn pager-nav" data-searchpage="1" data-page="${searchPage + 1}" ${searchPage === searchTotalPages ? 'disabled' : ''}>Next &#10095;</button>`;
    pager.innerHTML = html;
}

function renderSearchResults(items) {
    const grid = document.getElementById('searchResultsGrid');
    grid.innerHTML = '';
    if (!items.length) {
        grid.innerHTML = '<p style="color:#999;padding:40px 0;text-align:center;width:100%">No results found.</p>';
        return;
    }
    items.forEach(item => grid.appendChild(createCard(item, item.type)));
}

document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimer);
    if (!query) {
        searchQuery = '';
        hideSearchResults();
        return;
    }
    searchQuery = query;
    searchPage = 1;
    searchTimer = setTimeout(async () => {
        showSearchResults();
        document.getElementById('searchResultsTitle').textContent = `Results for "${searchQuery}"`;
        const items = await fetchSearchResults(searchQuery, searchPage);
        renderSearchResults(items);
        renderSearchPager();
    }, 350);
});
document.getElementById('searchBtn').addEventListener('click', () => document.getElementById('searchInput').focus());

// Search results pager clicks.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-searchpage]');
    if (!btn) return;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page) || page < 1 || page > searchTotalPages) return;
    searchPage = page;
    (async () => {
        showSearchResults();
        const items = await fetchSearchResults(searchQuery, searchPage);
        renderSearchResults(items);
        renderSearchPager();
    })();
});

// ==================== ABOUT:BLANK OPENER ====================
function openAboutBlankPlayer() {
    const cloakTitle = settings.cloakTitle || 'MILKBOX';
    const cloakFavicon = settings.cloakFavicon || '';
    const bgColor = settings.bgColor || '#000';
    const bgImage = settings.bgImage || '';
    const bgOpacity = (settings.bgOpacity || 30) / 100;
    const bgBlur = settings.bgBlur || 0;

    const faviconTag = cloakFavicon ? `<link rel="icon" type="image/x-icon" href="${cloakFavicon}">` : '';
    const bgStyle = bgImage
        ? `background-color:${bgColor};background-image:url('${bgImage}');background-size:cover;background-position:center;`
        : `background-color:${bgColor};`;

    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
        newWindow.document.write(`<!DOCTYPE html>
<html><head>
<title>${cloakTitle}</title>
${faviconTag}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{${bgStyle}color:#fff;font-family:'Segoe UI',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden}
.bg-layer{position:fixed;top:0;left:0;right:0;bottom:0;${bgImage ? `background-image:url('${bgImage}');background-size:cover;background-position:center;opacity:${bgOpacity};filter:blur(${bgBlur}px);` : 'display:none'}z-index:0;pointer-events:none}
.content{position:relative;z-index:1;text-align:center;width:90%;max-width:800px}
h1{color:#e50914;font-family:'Arial Black',sans-serif;font-size:36px;margin-bottom:20px;letter-spacing:3px}
p{color:#888;margin-bottom:30px;font-size:15px}
.input-group{display:flex;gap:10px;width:100%;margin-bottom:15px}
input[type=text]{flex:1;padding:14px 18px;background:#1a1a1a;border:2px solid #333;border-radius:8px;color:#fff;font-size:16px;outline:none}
input[type=text]:focus{border-color:#e50914}
input[type=text]::placeholder{color:#666}
button{padding:14px 28px;background:#e50914;color:#fff;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;transition:background 0.2s}
button:hover{background:#f40612}
#player{width:100%;aspect-ratio:16/9;margin-top:20px;display:none;border-radius:12px;overflow:hidden}
#player iframe,#player video{width:100%;height:100%;border:none}
.btn-group{display:flex;gap:10px;margin-top:15px;justify-content:center}
.btn-secondary{background:#333}
.btn-secondary:hover{background:#444}
.drive-input{display:none;margin-bottom:15px}
.drive-input.active{display:flex}
.or-divider{color:#555;margin-bottom:15px;font-size:13px}
</style></head><body>
<div class="bg-layer"></div>
<div class="content">
<h1>${settings.cloakLogoText || cloakTitle}</h1>
<p>Paste a Google Drive link or direct video URL to play</p>
<div class="input-group">
<input type="text" id="videoUrl" placeholder="Paste video URL here...">
<button onclick="loadVideo()">Play</button>
</div>
<div class="or-divider">— or paste a Google Drive link —</div>
<div class="input-group drive-input active">
<input type="text" id="driveUrl" placeholder="Google Drive share link...">
<button onclick="loadDriveVideo()">Play Drive</button>
</div>
<div class="btn-group">
<button class="btn-secondary" onclick="stopVideo()">Stop</button>
<button class="btn-secondary" onclick="window.close()">Close Tab</button>
</div>
<div id="player"><iframe id="videoFrame"></iframe></div>
</div>
<script>
function loadVideo(){
var u=document.getElementById('videoUrl').value.trim();
if(!u)return;
var m=u.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
if(m)u='https://drive.google.com/file/d/'+m[1]+'/preview';
else if(u.includes('drive.google.com'))u=u.replace('/view','/preview').replace('/edit','/preview');
document.getElementById('videoFrame').src=u;
document.getElementById('player').style.display='block';
}
function loadDriveVideo(){
var u=document.getElementById('driveUrl').value.trim();
if(!u)return;
var m=u.match(/\\/file\\/d\\/([a-zA-Z0-9_-]+)/);
if(m)u='https://drive.google.com/file/d/'+m[1]+'/preview';
else if(u.includes('drive.google.com'))u=u.replace('/view','/preview').replace('/edit','/preview');
document.getElementById('videoFrame').src=u;
document.getElementById('player').style.display='block';
}
function stopVideo(){
document.getElementById('videoFrame').src='';
document.getElementById('player').style.display='none';
}
document.getElementById('videoUrl').addEventListener('keydown',function(e){if(e.key==='Enter')loadVideo()});
document.getElementById('driveUrl').addEventListener('keydown',function(e){if(e.key==='Enter')loadDriveVideo()});
</script></body></html>`);
        newWindow.document.close();
        toast('Opened about:blank player tab', 'success');
    } else {
        toast('Popup blocked. Allow popups for this site.', 'error');
    }
}

// Opens the whole site inside an about:blank tab. Uses a <base> tag pointing
// at the current directory so the copy loads the same styles.css / app.js,
// which works from a plain file:// page (no fetch required).
function openAboutBlankSite() {
    const cloakTitle = settings.cloakTitle || 'MILKBOX';
    const cloakFavicon = settings.cloakFavicon || '';
    let base = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    // Base URL = current page's directory (dropping the trailing filename).
    const dirUrl = window.location.href.replace(/[^/\\]*$/, '');
    base = base.replace(/<head[^>]*>/, (m) => m + `<base href="${dirUrl}">`);
    // Refresh cloak title/favicon inside the copy.
    base = base.replace(/<title[^>]*>[\s\S]*?<\/title>/, `<title>${cloakTitle}</title>`);
    const faviconTag = cloakFavicon ? `<link rel="icon" type="image/x-icon" href="${cloakFavicon}">` : '<link rel="icon" type="image/x-icon" href="data:,">';
    base = base.replace(/<link rel="icon" type="image\/x-icon"[^>]*>/, () => faviconTag);

    const newWindow = window.open('about:blank', '_blank');
    if (newWindow) {
        newWindow.document.open();
        newWindow.document.write(base);
        newWindow.document.close();
        toast('Opened whole site in about:blank tab', 'success');
    } else {
        toast('Popup blocked. Allow popups for this site.', 'error');
    }
}

const aboutBlankMenu = document.getElementById('aboutBlankMenu');
const closeAboutBlankMenu = () => aboutBlankMenu.classList.remove('show');
document.getElementById('aboutBlankBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    aboutBlankMenu.classList.toggle('show');
});
aboutBlankMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const target = e.target.closest('button[data-about]');
    if (!target) return;
    closeAboutBlankMenu();
    if (target.dataset.about === 'site') openAboutBlankSite();
    else openAboutBlankPlayer();
});
document.addEventListener('click', closeAboutBlankMenu);


// ==================== SETTINGS ====================
document.getElementById('settingsBtn').addEventListener('click', () => {
    const tmdbInput = document.getElementById('tmdbApiKey');
    if (tmdbInput) tmdbInput.value = settings.tmdbAuth || '';
    document.getElementById('settingsModal').classList.add('active');
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.dataset.theme === settings.activeTheme);
    });
    document.querySelectorAll('.preset-color').forEach(c => {
        c.classList.toggle('active', c.dataset.color === settings.bgColor);
    });
});

document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.settingsTab;
        document.querySelectorAll('.settings-tab').forEach(item => item.classList.toggle('active', item === tab));
        document.querySelectorAll('.settings-page').forEach(page => page.classList.toggle('active', page.dataset.settingsPage === target));
    });
});

document.getElementById('applyCloakBtn').addEventListener('click', () => {
    const tmdbInput = document.getElementById('tmdbApiKey');
    settings.tmdbAuth = tmdbInput ? tmdbInput.value.trim() : settings.tmdbAuth;
    settings.cloakTitle = document.getElementById('cloakTitle').value.trim();
    settings.cloakFavicon = document.getElementById('cloakFavicon').value.trim();
    settings.cloakLogoText = document.getElementById('cloakLogoText').value.trim();
    settings.cloakLogoImage = document.getElementById('cloakLogoImage').value.trim();
    saveData();
    applyCloak();
    toast('Cloak settings applied!', 'success');
});

document.getElementById('applyBgBtn').addEventListener('click', () => {
    settings.bgColor = document.getElementById('bgColor').value;
    settings.bgImage = document.getElementById('bgImage').value.trim();
    settings.bgOpacity = parseInt(document.getElementById('bgOpacity').value);
    settings.bgBlur = parseInt(document.getElementById('bgBlur').value);
    settings.activeTheme = '';
    saveData();
    applyBackground();
    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
    toast('Background applied!', 'success');
});

document.getElementById('resetBgBtn').addEventListener('click', () => {
    settings.bgColor = '#141414';
    settings.bgImage = '';
    settings.bgOpacity = 30;
    settings.bgBlur = 0;
    settings.activeTheme = 'default';
    saveData();
    applyBackground();
    applyTheme('default');
    toast('Reset to default', 'success');
});

// Hero Logo controls
document.getElementById('applyHeroLogoBtn').addEventListener('click', () => {
    const url = document.getElementById('heroLogoUrl').value.trim();
    if (url) {
        settings.heroLogo = url;
        settings.heroLogoData = '';
        saveData();
        applyHeroLogo();
        toast('Hero logo applied!', 'success');
    } else {
        toast('Enter a logo image URL first.', 'error');
    }
});

document.getElementById('removeHeroLogoBtn').addEventListener('click', () => {
    settings.heroLogo = '';
    settings.heroLogoData = '';
    document.getElementById('heroLogoUrl').value = '';
    const upload = document.getElementById('heroLogoUpload');
    if (upload) upload.value = '';
    saveData();
    applyHeroLogo();
    toast('Hero logo removed', 'success');
});

document.getElementById('heroLogoUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image too large. Max 5MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        settings.heroLogoData = ev.target.result;
        settings.heroLogo = '';
        document.getElementById('heroLogoUrl').value = '';
        saveData();
        applyHeroLogo();
        toast('Hero logo uploaded!', 'success');
    };
    reader.readAsDataURL(file);
});



// Navbar icon upload — no URL needed, never blocked
document.getElementById('cloakLogoUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { toast('Image too large. Max 3MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        settings.cloakLogoData = ev.target.result;
        saveData();
        applyCloak();
        const preview = document.getElementById('logoPreview');
        if (preview) {
            let img = preview.querySelector('img');
            if (!img) { img = document.createElement('img'); img.style.maxHeight = '32px'; img.style.borderRadius = '6px'; preview.innerHTML = ''; preview.appendChild(img); }
            img.src = ev.target.result;
            const txt = document.getElementById('logoPreviewText');
            if (txt) txt.style.display = 'none';
        }
        toast('Icon uploaded — now shows next to MILKBOX and never gets blocked!', 'success');
    };
    reader.readAsDataURL(file);
});

// MangaDex auth — paste the access_token/refresh_token from your Python POST so the book reader can load chapters
function getMangadexTokens() { try { return JSON.parse(localStorage.getItem('mangadex_token')||'{}'); } catch { return {}; } }
function saveMangadexTokens(d) { localStorage.setItem('mangadex_token', JSON.stringify(d)); try { localStorage.setItem('mangadex_access_token', d.access_token||''); } catch {} }
function mangadexHeaders() {
    const t = getMangadexTokens().access_token || localStorage.getItem('mangadex_access_token') || '';
    const h = { 'Accept': 'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}
function updateMangadexAuthUI() {
    const s = getMangadexTokens();
    const at = document.getElementById('mangadexAccessToken');
    const rt = document.getElementById('mangadexRefreshToken');
    const st = document.getElementById('mangadexAuthStatus');
    const clr = document.getElementById('clearMangadexTokenBtn');
    if (at && s.access_token) at.value = s.access_token.slice(0,22)+'…';
    if (rt && s.refresh_token) rt.value = s.refresh_token.slice(0,22)+'…';
    if (s.access_token) {
        if (st) { st.style.display='block'; st.style.background='rgba(34,197,94,0.12)'; st.style.border='1px solid rgba(34,197,94,0.3)'; st.style.color='#22c55e'; st.textContent='Authorized — chapter pages will load with your token.'; }
        if (clr) clr.style.display='';
    } else {
        if (st) st.style.display='none';
        if (clr) clr.style.display='none';
    }
}
document.getElementById('saveMangadexTokenBtn')?.addEventListener('click', () => {
    const at = document.getElementById('mangadexAccessToken')?.value.trim();
    const rt = document.getElementById('mangadexRefreshToken')?.value.trim();
    if (!at || at.includes('…')) { // if masked, keep existing
        const cur = getMangadexTokens();
        if (cur.access_token && !at.includes('eyJ')) { toast('Token already saved', 'success'); updateMangadexAuthUI(); return; }
        if (!at || at.length < 20) { toast('Paste the full access_token from your Python print', 'error'); return; }
    }
    // allow pasting full JSON as well
    let access = at, refresh = rt;
    try { if (at && at.trim().startsWith('{')) { const j=JSON.parse(at); access=j.access_token||j.accessToken||at; refresh=j.refresh_token||refresh; } } catch {}
    saveMangadexTokens({ access_token: access, refresh_token: refresh, saved_at: Date.now() });
    try { localStorage.setItem('mangadex_access_token', access); } catch {}
    updateMangadexAuthUI();
    toast('MangaDex authorized — you can now read books!', 'success');
});
document.getElementById('clearMangadexTokenBtn')?.addEventListener('click', () => {
    localStorage.removeItem('mangadex_token'); localStorage.removeItem('mangadex_access_token');
    const at=document.getElementById('mangadexAccessToken'); if(at) at.value='';
    const rt=document.getElementById('mangadexRefreshToken'); if(rt) rt.value='';
    updateMangadexAuthUI(); toast('MangaDex token cleared');
});
try { updateMangadexAuthUI(); } catch {}
const mangadexMangaCache = new Map();
async function resolveMangadexMangaId(title) {
    const key = String(title||'').toLowerCase().trim();
    if (!key) return null;
    const knownIds = {
        'one piece': 'a1c7c817-4e59-43b7-9365-09675a149a6f'
    };
    if (knownIds[key]) return knownIds[key];
    if (mangadexMangaCache.has(key)) return mangadexMangaCache.get(key);
    try {
        const res = await fetch(`/api/manga/search?title=${encodeURIComponent(title)}`, { headers: mangadexHeaders(), cache: 'no-store' });
        if (!res.ok) throw new Error('search failed');
        const j = await res.json();
        const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const wanted = normalize(title);
        const exact = (j.data || []).find(manga =>
            Object.values(manga.attributes?.title || {}).some(candidate => normalize(candidate) === wanted)
        ) || (j.data || []).find(manga => {
            const aliases = (manga.attributes?.altTitles || []).flatMap(alt => Object.values(alt || {}));
            return aliases.some(candidate => normalize(candidate) === wanted);
        }) || (j.data || []).find(manga => {
            const titles = Object.values(manga.attributes?.title || {});
            return titles.some(candidate => normalize(candidate).includes(wanted) || wanted.includes(normalize(candidate)));
        }) || j.data?.[0];
        const id = exact?.id || null;
        if (id) mangadexMangaCache.set(key, id);
        return id || null;
    } catch { return null; }
}

// Color picker sync
document.getElementById('bgColor').addEventListener('input', (e) => {
    document.getElementById('bgColorText').value = e.target.value;
    settings.bgColor = e.target.value;
    updateBgPreview();
});
document.getElementById('bgColorText').addEventListener('input', (e) => {
    const val = e.target.value;
    if (/^#[0-9a-f]{6}$/i.test(val)) {
        document.getElementById('bgColor').value = val;
        settings.bgColor = val;
        updateBgPreview();
    }
});

document.getElementById('bgImage').addEventListener('input', () => { settings.bgImage = document.getElementById('bgImage').value.trim(); updateBgPreview(); });
document.getElementById('bgOpacity').addEventListener('input', (e) => { document.getElementById('bgOpacityVal').textContent = e.target.value + '%'; settings.bgOpacity = parseInt(e.target.value); updateBgPreview(); });
document.getElementById('bgBlur').addEventListener('input', (e) => { document.getElementById('bgBlurVal').textContent = e.target.value + 'px'; settings.bgBlur = parseInt(e.target.value); updateBgPreview(); });

// Preset colors
document.querySelectorAll('.preset-color').forEach(btn => {
    btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        settings.bgColor = color;
        document.getElementById('bgColor').value = color;
        document.getElementById('bgColorText').value = color;
        document.querySelectorAll('.preset-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        updateBgPreview();
    });
});

// Theme cards
document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => applyTheme(card.dataset.theme));
});

// Background upload
document.getElementById('bgUpload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast('Image too large. Max 5MB.', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
        settings.bgImage = ev.target.result;
        document.getElementById('bgImage').value = ev.target.result.substring(0, 50) + '... (uploaded)';
        updateBgPreview();
        toast('Background image loaded!', 'success');
    };
    reader.readAsDataURL(file);
});

// Logo text live preview
document.getElementById('cloakLogoText')?.addEventListener('input', (e) => {
    settings.cloakLogoText = e.target.value;
    updateLogoPreview();
});
document.getElementById('cloakLogoImage')?.addEventListener('input', (e) => {
    settings.cloakLogoImage = e.target.value.trim();
    updateLogoPreview();
});

// ==================== LIVE FEEDS (Trending / Streaming / In Theaters) ====================
const LIVE_PAGES = 10;         // TMDB pages fetched per feed
const LIVE_PER_PAGE = 14;     // titles shown per grid page
const liveState = {
    trending: { items: [], page: 1 },
    streaming: { items: [], page: 1 },
    theaters: { items: [], page: 1 },
    manga: { items: [], page: 1, totalPages: 1, type: 'topview', search: '' }
};
const liveFed = {};   // prevent multiple concurrent fetches per feed

function liveItemToItem(r, type) {
    let t = type;
    if (t === 'all' || !t) {
        t = (r.media_type === 'tv') ? 'tv'
            : (r.media_type === 'movie') ? 'movie'
            : (r.first_air_date && !r.release_date ? 'tv' : 'movie');
    }
    const genre = tmdbGenreKeysFromIds(r.genre_ids || r.genreIds || []);
    if (isTmdbAnime(r.genre_ids, r.origin_country, r.original_language) && !genre.includes('anime')) genre.unshift('anime');
    if (!genre.length) genre.push(t === 'tv' ? 'drama' : 'action');
    return {
        id: generateId(),
        title: r.title || r.name || 'Untitled',
        description: r.overview || '',
        genre,
        year: (r.release_date || r.first_air_date || '').slice(0, 4),
        rating: r.vote_average ? (+r.vote_average).toFixed(1) : '',
        poster: r.poster_path ? `${tmdbImageBase}w500${r.poster_path}` : '',
        backdrop: r.backdrop_path ? `${tmdbImageBase}w1920${r.backdrop_path}` : '',
        logo: '',
        tmdbId: String(r.id),
        driveLink: '',
        certification: '',
        quality: t === 'tv' ? 'HD' : qualityFor(r.id),
        type: t
    };
}

function liveItemsFromPages(arr, type) {
    const seen = new Set();
    const out = [];
    (arr || []).forEach(page => (page.results || []).forEach(r => {
        const key = String(r.id);
        if (!r.title && !r.name) return;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(liveItemToItem(r, type));
    }));
    return out;
}

async function fetchLive(paths, type, key) {
    if (liveFed[key]) return;
    liveFed[key] = 1;
const gridId = { trending: 'trendingGrid', streaming: 'streamingGrid', theaters: 'theatersGrid', manga: 'mangaGrid' }[key];
const pagerId = { trending: 'trendingPager', streaming: 'streamingPager', theaters: 'theatersPager', manga: 'mangaPager' }[key];
    const grid = gridId && document.getElementById(gridId);
    const pager = pagerId && document.getElementById(pagerId);
    try {
        await tmdbEnsureConfig();
        const pages = await fetchBatched(paths, 5);
        const items = liveItemsFromPages(pages, type);
        liveState[key].items = items;
        liveState[key].page = 1;
        enrichLiveLogos(key);
    } catch (e) {
        if (grid && (grid.textContent.trim() === 'Loading…' || grid.innerHTML.includes('live-loading'))) {
            grid.innerHTML = `<div class="live-error">Couldn't load live titles. Check your internet connection and try again.</div>`;
        }
    } finally {
        delete liveFed[key];
        renderLiveGrid(key, grid, pager);
        if (currentSection === key) showLiveHero(key);
    }
}

function renderLiveGrid(key, grid, pager) {
    if (!grid) grid = document.getElementById({ trending: 'trendingGrid', streaming: 'streamingGrid', theaters: 'theatersGrid' }[key]);
    if (!pager) pager = document.getElementById({ trending: 'trendingPager', streaming: 'streamingPager', theaters: 'theatersPager' }[key]);
    if (!grid) return;
    const st = liveState[key];
    if (!st.items.length) return;
    const total = Math.ceil(st.items.length / LIVE_PER_PAGE);
    const page = Math.min(Math.max(1, st.page), total);
    st.page = page;
    const start = (page - 1) * LIVE_PER_PAGE;
    const slice = st.items.slice(start, start + LIVE_PER_PAGE);
    grid.innerHTML = '';
    slice.forEach(item => grid.appendChild(createCard(item, item.type === 'tv' ? 'tv' : 'mixed')));
    if (pager) {
        pager.style.display = '';
        let html = `<button class="pager-btn pager-nav" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}><svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 56-56-64-64h168v-80H472l64-64-56-56-160 160 160 160Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg> Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, page - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) {
            html += `<button class="pager-btn ${i === page ? 'current' : ''}" data-page="${i}">${i}</button>`;
        }
        html += `<button class="pager-btn pager-nav" data-page="${page + 1}" ${page === total ? 'disabled' : ''}>Next <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#e3e3e3"><path d="m480-320 160-160-160-160-56 56 64 64H320v80h168l-64 64 56 56Zm0 240q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg></button>`;
        pager.innerHTML = html;
    }
}

function renderLiveTab(section) {
    if (section === 'trending') {
        const st = liveState.trending;
        if (st.items.length) renderLiveGrid('trending');
        else if (!liveFed.trending) fetchLive(Array.from({ length: LIVE_PAGES }, (_, i) => `/trending/all/week?page=${i + 1}`), 'all', 'trending');
    } else if (section === 'streaming') {
        const st = liveState.streaming;
        if (st.items.length) renderLiveGrid('streaming');
        else if (!liveFed.streaming) {
            const base = '/discover/movie?with_watch_monetization_types=flatrate|free|ads&watch_region=US&sort_by=popularity.desc';
            const mov = Array.from({ length: LIVE_PAGES }, (_, i) => `${base}&page=${i + 1}`);
            const baseTv = '/discover/tv?with_watch_monetization_types=flatrate|free|ads&watch_region=US&sort_by=popularity.desc';
            const tv = Array.from({ length: LIVE_PAGES }, (_, i) => `${baseTv}&page=${i + 1}`);
            // fetch combined movies + TV pages and merge into one grid
            (async () => {
                liveFed['streaming'] = 1;
                try {
                    await tmdbEnsureConfig();
                    const [mp, tp] = await Promise.all([fetchBatched(mov, 5), fetchBatched(tv, 5)]);
                    const items = [...liveItemsFromPages(mp, 'movie'), ...liveItemsFromPages(tp, 'tv')];
                    liveState.streaming.items = items;
                    liveState.streaming.page = 1;
                    enrichLiveLogos('streaming');
                } catch (e) {
                    const grid = document.getElementById('streamingGrid');
                    if (grid && (grid.textContent.trim() === 'Loading…' || grid.innerHTML.includes('live-loading'))) {
                        grid.innerHTML = `<div class="live-error">Couldn't load live titles. Check your internet connection and try again.</div>`;
                    }
                } finally {
                    delete liveFed['streaming'];
                    renderLiveGrid('streaming');
                    if (currentSection === 'streaming') showLiveHero('streaming');
                }
            })();
        }
    } else if (section === 'theaters') {
        const st = liveState.theaters;
        if (st.items.length) renderLiveGrid('theaters');
        else if (!liveFed.theaters) fetchLive(Array.from({ length: LIVE_PAGES }, (_, i) => `/movie/now_playing?page=${i + 1}`), 'movie', 'theaters');
    } else if (section === 'manga') {
        const st = liveState.manga;
        if (st.items.length) renderMangaGrid(st.page);
        else if (!liveFed.manga) fetchMangaList(1, 'topview');
    }
}

// ==================== MANGA (Tenrai/Jikan-compatible REST API) ====================
const MANGA_API_BASE = 'https://api.tenrai.org/v1';
const JIKAN_MANGA_API_BASE = 'https://api.jikan.moe/v4';
const MANGA_PER_PAGE = 24;
const MANGA_TYPE_OPTIONS = [
    { id: 'manga', label: 'Manga' },
    { id: 'novel', label: 'Novel' },
    { id: 'lightnovel', label: 'Light Novel' },
    { id: 'oneshot', label: 'Oneshot' },
    { id: 'doujin', label: 'Doujin' },
    { id: 'manhwa', label: 'Manhwa' },
    { id: 'manhua', label: 'Manhua' }
];
const MANGA_STATUS_OPTIONS = [
    { id: 'publishing', label: 'Publishing' },
    { id: 'complete', label: 'Complete' },
    { id: 'hiatus', label: 'Hiatus' },
    { id: 'discontinued', label: 'Discontinued' },
    { id: 'upcoming', label: 'Upcoming' }
];
const MANGA_CATEGORY_OPTIONS = [
    { id: '1', label: 'Action' },
    { id: '2', label: 'Adventure' },
    { id: '4', label: 'Comedy' },
    { id: '7', label: 'Drama' },
    { id: '10', label: 'Fantasy' },
    { id: '11', label: 'Food' },
    { id: '12', label: 'Horror' },
    { id: '14', label: 'Mystery' },
    { id: '22', label: 'Romance' },
    { id: '24', label: 'Sci-Fi' },
    { id: '27', label: 'Shounen' },
    { id: '31', label: 'Supernatural' }
];

function makeSvgCover(title, subtitle = 'Manga') {
    const label = (title || 'Manga').replace(/[<>&]/g, '').slice(0, 22);
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#1c1c2b" />
                    <stop offset="100%" stop-color="#6d1a2e" />
                </linearGradient>
            </defs>
            <rect width="800" height="1200" fill="url(#g)"/>
            <rect x="60" y="60" width="680" height="1080" rx="38" fill="rgba(0,0,0,0.18)" stroke="rgba(255,255,255,0.18)"/>
            <circle cx="400" cy="360" r="200" fill="rgba(255,255,255,0.08)"/>
            <text x="400" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="72" fill="#f9f1f3" font-weight="700">${escapeHtml(label)}</text>
            <text x="400" y="610" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="34" fill="#e7d7db" letter-spacing="4">${escapeHtml(subtitle.toUpperCase())}</text>
            <text x="400" y="980" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f0dfe5" opacity="0.8">MILKBOX</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const fallbackMangaLibrary = [
    { mal_id: 1, title: 'Monster', poster: 'https://cdn.myanimelist.net/images/manga/3/258224l.jpg', description: 'Kenzou Tenma, a renowned Japanese neurosurgeon working in post-war Germany, faces a difficult choice: to operate on Johan Liebert, an orphan boy on the verge of death, or on the mayor of Düsseldorf. In the end, Tenma decides to gamble his reputation by saving Johan...', genre: ['award winning', 'drama', 'mystery', 'adult cast', 'psychological', 'seinen'], year: '1994', score: '9.16', chapters: '162', members: '290591' },
    { title: 'One Piece', poster: makeSvgCover('One Piece', 'Adventure'), description: 'A pirate adventure spanning oceans, rival crews, and a legendary treasure.', genre: ['adventure', 'action', 'fantasy'], year: '1997', score: '9.1', chapters: '1100+', members: '2500000' },
    { title: 'Attack on Titan', poster: makeSvgCover('Attack on Titan', 'Action'), description: 'Humanity fights for survival as colossal monsters threaten the walls.', genre: ['action', 'drama', 'mystery'], year: '2009', score: '9.0', chapters: '87', members: '1900000' },
    { title: 'Fullmetal Alchemist', poster: makeSvgCover('Fullmetal Alchemist', 'Fantasy'), description: 'Two brothers venture through a world of alchemy and sacrifice.', genre: ['adventure', 'fantasy', 'drama'], year: '2001', score: '9.1', chapters: '116', members: '1600000' },
    { title: 'Death Note', poster: makeSvgCover('Death Note', 'Mystery'), description: 'A notebook with deadly power draws two brilliant minds into a cat-and-mouse game.', genre: ['mystery', 'thriller', 'psychological'], year: '2003', score: '8.7', chapters: '37', members: '1750000' },
    { title: 'Jujutsu Kaisen', poster: makeSvgCover('Jujutsu Kaisen', 'Fantasy'), description: 'A young sorcerer battles cursed spirits in a high-stakes supernatural showdown.', genre: ['action', 'supernatural', 'fantasy'], year: '2018', score: '8.7', chapters: '200+', members: '2100000' },
    { title: 'Chainsaw Man', poster: makeSvgCover('Chainsaw Man', 'Horror'), description: 'A devout, broke teenager joins a dangerous world of devils and power.', genre: ['action', 'horror', 'fantasy'], year: '2018', score: '8.6', chapters: '100+', members: '1500000' },
    { title: 'Spy x Family', poster: makeSvgCover('Spy x Family', 'Comedy'), description: 'A family of spies, assassins, and psychics hide in plain sight.', genre: ['comedy', 'action', 'romance'], year: '2019', score: '8.5', chapters: '136', members: '1400000' },
    { title: 'Bleach', poster: makeSvgCover('Bleach', 'Adventure'), description: 'A soul reaper’s journey unfolds through arcs of conflict and redemption.', genre: ['action', 'adventure', 'supernatural'], year: '2001', score: '8.4', chapters: '366', members: '1700000' }
];

function mangaFallbackItems() {
    return fallbackMangaLibrary.map((m, index) => ({
        mal_id: m.mal_id || (1000 + index),
        title: m.title,
        title_english: m.title,
        synopsis: m.description,
        images: { jpg: { large_image_url: m.poster, image_url: m.poster } },
        score: Number(m.score),
        chapters: Number.isFinite(Number(m.chapters)) ? Number(m.chapters) : 0,
        members: Number(m.members.replace(/,/g, '')) || 0,
        genres: (m.genre || []).map(name => ({ name })),
        status: 'Finished',
        type: 'Manga'
    }));
}

function mangaItemToItem(m) {
    if (m?.data) m = m.data;
    const images = m?.images || {};
    const mainImage = images.jpg?.large_image_url || images.jpg?.image_url || images.webp?.large_image_url || images.webp?.image_url || '';
    const fallbackPoster = makeSvgCover(m?.title || m?.title_english || 'Manga', 'Manga');
    const published = m?.published || {};
    const isoDate = published.from ? new Date(published.from) : null;
    const year = isoDate && !Number.isNaN(isoDate.getTime()) ? String(isoDate.getFullYear()) : (m?.year ? String(m.year) : '');
    const allGenres = [
        ...(Array.isArray(m?.genres) ? m.genres.map(g => String(g?.name || '').toLowerCase()).filter(Boolean) : []),
        ...(Array.isArray(m?.themes) ? m.themes.map(g => String(g?.name || '').toLowerCase()).filter(Boolean) : []),
        ...(Array.isArray(m?.demographics) ? m.demographics.map(g => String(g?.name || '').toLowerCase()).filter(Boolean) : [])
    ];
    const genre = allGenres.length ? allGenres : ['manga'];
    const chapterTotal = Number.isFinite(m?.chapters) && m.chapters > 0 ? `Ch. ${m.chapters}` : (m?.chapters ? `Ch. ${m.chapters}` : '');
    return {
        id: String(m?.mal_id ?? m?.id ?? ('manga_' + Math.random().toString(36).slice(2, 8))),
        title: m?.title || m?.title_english || 'Untitled Manga',
        description: m?.synopsis || m?.background || '',
        genre: genre.length ? genre : ['manga'],
        year,
        rating: m?.score ? Number(m.score).toFixed(1) : '',
        poster: mainImage || fallbackPoster,
        backdrop: mainImage || fallbackPoster,
        logo: '',
        tmdbId: '',
        driveLink: '',
        certification: '',
        quality: 'HD',
        type: 'manga',
        mangaChapter: chapterTotal,
        mangaView: m?.members ? `${Number(m.members).toLocaleString()} members` : ''
    };
}

function getMangaRequestUrl(page, type) {
    const st = liveState.manga;
    if (st.search && st.search.trim()) {
        const params = new URLSearchParams({
            q: st.search.trim(),
            page: String(page || 1),
            limit: String(MANGA_PER_PAGE),
            order_by: 'popularity',
            sort: 'desc',
            sfw: 'true'
        });
        return `${MANGA_API_BASE}/manga?${params.toString()}`;
    }
    const params = new URLSearchParams({
        page: String(page || 1),
        limit: String(MANGA_PER_PAGE)
    });
    const t = type || liveState.manga.type || '';
    if (t && t !== 'topview') params.set('type', t);
    if (liveState.manga.state) params.set('status', liveState.manga.state);
    if (liveState.manga.category) params.set('genres', liveState.manga.category);
    return `${MANGA_API_BASE}/top/manga?${params.toString()}`;
}

async function fetchJikanJson(url, retries = 2) {
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { cache: 'no-store' });
            if (res.status === 429 && attempt < retries) {
                lastErr = new Error('Jikan rate limited');
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
            }
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (error) {
            lastErr = error;
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }
    throw lastErr || new Error('Jikan request failed');
}

async function fetchMangaList(page, type) {
    if (liveFed.manga) return;
    const grid = document.getElementById('mangaGrid');
    const pager = document.getElementById('mangaPager');
    const st = liveState.manga;
    const now = Date.now();
    if (st.lastRequestAt && (now - st.lastRequestAt) < 1500) {
        return;
    }
    liveFed.manga = 1;
    st.lastRequestAt = now;
    try {
        const queryType = type || st.type || '';
        const tenraiUrl = getMangaRequestUrl(page || 1, queryType);
        let data;
        try {
            data = await fetchJikanJson(tenraiUrl, 1);
        } catch (tenraiError) {
            // Tenrai and Jikan expose the same response shape; keep Jikan as a real fallback.
            const jikanUrl = `${JIKAN_MANGA_API_BASE}${tenraiUrl.slice(MANGA_API_BASE.length)}`;
            data = await fetchJikanJson(jikanUrl, 1);
        }
        const entries = Array.isArray(data?.data) ? data.data : [];
        if (!entries.length) {
            throw new Error('No manga entries returned');
        }
        liveState.manga.items = entries.map((entry, index) => {
            try { return mangaItemToItem(entry); }
            catch (error) {
                console.error('Manga item error', index, error);
                return null;
            }
        }).filter(Boolean);
        if (!liveState.manga.items.length) throw new Error('Manga entries could not be rendered');
        liveState.manga.page = page || 1;
        liveState.manga.type = queryType;
        liveState.manga.totalPages = Math.max(1, data?.pagination?.last_visible_page || 1);
        mangaPopulateFilters();
        const hint = document.querySelector('#mangaSection .live-hint');
        if (hint) {
            if (st.search && st.search.trim()) {
                const tot = data?.pagination?.items?.total ?? entries.length;
                hint.textContent = `Search: "${st.search.trim()}" · ${tot} results · page ${liveState.manga.page} of ${liveState.manga.totalPages}`;
            } else {
                hint.textContent = 'Popular Manga & Comic series';
            }
        }
        if (pager) pager.style.display = liveState.manga.totalPages > 1 ? '' : 'none';
        // enrich covers with Tenrai pictures (fire-and-forget, updates cards in place)
        try { enrichMangaCovers(liveState.manga.items); } catch {}
    } catch (e) {
        console.error('Manga feed error', e);
        const fallbackItems = mangaFallbackItems();
        liveState.manga.items = fallbackItems.map(mangaItemToItem);
        liveState.manga.page = 1;
        liveState.manga.type = type || st.type || '';
        liveState.manga.totalPages = 1;
        if (grid) grid.innerHTML = '';
        if (pager) {
            pager.style.display = 'none';
        }
        if (grid) renderMangaGrid(1);
    } finally {
        delete liveFed.manga;
        renderMangaGrid(liveState.manga.page || 1);
    }
}

function mangaPopulateFilters() {
    const sRow = document.getElementById('mangaSearchRow');
    if (sRow) {
        sRow.style.display = '';
        const inp = document.getElementById('mangaSearchInput');
        const clr = document.getElementById('mangaSearchClear');
        if (inp) inp.value = liveState.manga.search || '';
        if (clr) clr.style.display = liveState.manga.search ? '' : 'none';
    }
    const row = document.getElementById('mangaFilterRow');
    if (!row) return;
    const typeSel = document.getElementById('mangaTypeFilter');
    if (typeSel) {
        typeSel.innerHTML = '<option value="">Type: All</option>' + MANGA_TYPE_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.type || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        typeSel.value = liveState.manga.type || '';
    }
    const stateSel = document.getElementById('mangaStateFilter');
    if (stateSel) {
        stateSel.innerHTML = '<option value="">State: All</option>' + MANGA_STATUS_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.state || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        stateSel.value = liveState.manga.state || '';
    }
    const catSel = document.getElementById('mangaCategoryFilter');
    if (catSel) {
        catSel.innerHTML = '<option value="">Category: All</option>' + MANGA_CATEGORY_OPTIONS.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.category || '') ? ' selected' : ''}>${escapeHtml(t.label)}</option>`).join('');
        catSel.value = liveState.manga.category || '';
    }
    row.style.display = '';
}

document.addEventListener('change', (e) => {
    const f = e.target.closest('.manga-filter');
    if (!f) return;
    const st = liveState.manga;
    if (f.id === 'mangaTypeFilter') st.type = f.value || '';
    else if (f.id === 'mangaStateFilter') st.state = f.value || '';
    else if (f.id === 'mangaCategoryFilter') st.category = f.value || '';
    st.items = [];
    st.page = 1;
    const grid = document.getElementById('mangaGrid');
    if (grid) grid.innerHTML = '<div class="live-loading">Loading Manga…</div>';
    fetchMangaList(1, st.type || 'topview');
});

function triggerMangaSearch() {
    const inp = document.getElementById('mangaSearchInput');
    const q = (inp && inp.value || '').trim();
    liveState.manga.search = q;
    liveState.manga.page = 1;
    liveState.manga.items = [];
    const grid = document.getElementById('mangaGrid');
    if (grid) grid.innerHTML = '<div class="live-loading">Searching Manga…</div>';
    const clr = document.getElementById('mangaSearchClear');
    if (clr) clr.style.display = q ? '' : 'none';
    // bypass throttle for search
    liveState.manga.lastRequestAt = 0;
    liveFed.manga = 0;
    fetchMangaList(1, liveState.manga.type || 'topview');
}
document.addEventListener('click', (e) => {
    if (e.target.closest('#mangaSearchBtn')) triggerMangaSearch();
    if (e.target.closest('#mangaSearchClear')) {
        const inp = document.getElementById('mangaSearchInput');
        if (inp) inp.value = '';
        liveState.manga.search = '';
        liveState.manga.page = 1;
        liveState.manga.items = [];
        const grid = document.getElementById('mangaGrid');
        if (grid) grid.innerHTML = '<div class="live-loading">Loading Manga…</div>';
        const clr = document.getElementById('mangaSearchClear');
        if (clr) clr.style.display = 'none';
        liveState.manga.lastRequestAt = 0;
        liveFed.manga = 0;
        fetchMangaList(1, liveState.manga.type || 'topview');
    }
});
document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'mangaSearchInput' && e.key === 'Enter') {
        e.preventDefault();
        triggerMangaSearch();
    }
});

const TENRAI_BASE = 'https://api.tenrai.org/v1';
const mangaPictureCache = new Map();
async function fetchMangaPictures(malId) {
    if (!malId) return null;
    const key = String(malId);
    if (key.startsWith('manga_') || key.startsWith('1000')) return null;
    if (mangaPictureCache.has(key)) return mangaPictureCache.get(key);
    try {
        const res = await fetch(`${TENRAI_BASE}/manga/${encodeURIComponent(key)}/pictures`, { cache: 'no-store' });
        if (!res.ok) throw new Error('no pics');
        const json = await res.json();
        const pics = (json?.data || []).map(p => p.jpg?.large_image_url || p.jpg?.image_url || p.webp?.large_image_url).filter(Boolean);
        mangaPictureCache.set(key, pics);
        return pics;
    } catch { return null; }
}
async function enrichMangaCovers(items) {
    const batch = items.slice(0, 12);
    await Promise.all(batch.map(async (it) => {
        const malId = it.id;
        const pics = await fetchMangaPictures(malId);
        if (pics && pics.length) {
            it.mangaPictures = pics;
            // if poster is SVG fallback, upgrade to first real cover
            if (it.poster && it.poster.startsWith('data:image/svg')) {
                it.poster = pics[0];
                it.backdrop = pics[0];
                const card = document.querySelector(`.manga-card[data-mid="${it.id}"]`);
                if (card) {
                    const imgEl = card.querySelector('.manga-img');
                    const ph = card.querySelector('.manga-thumb-placeholder');
                    if (imgEl) { imgEl.src = pics[0]; imgEl.style.display = ''; if (ph) ph.style.display = 'none'; }
                }
            }
        }
    }));
}

function createMangaCard(m) {
    const card = document.createElement('div');
    card.className = 'manga-card';
    card.dataset.mid = m.id;
    const title = escapeHtml(m.title);
    const img = escapeHtml(m.poster || '');
    const chapter = m.mangaChapter ? `<span class="manga-chapter">${escapeHtml(m.mangaChapter)}</span>` : '';
    const views = m.mangaView ? `<span class="manga-views">👁 ${escapeHtml(m.mangaView)}</span>` : '';
    card.innerHTML = `
        <div class="manga-thumb">
            ${img ? `<img class="manga-img" src="${img}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
            <div class="manga-thumb-placeholder" style="${img ? 'display:none' : ''}">📖</div>
            <div class="manga-overlay"><span>Read</span></div>
        </div>
        <div class="manga-info">
            <div class="manga-title">${title}</div>
            <div class="manga-meta">${chapter}${views}</div>
        </div>
    `;
    card.addEventListener('click', () => showMangaReader(m));
    return card;
}

function renderMangaGrid(page) {
    const grid = document.getElementById('mangaGrid');
    const pager = document.getElementById('mangaPager');
    if (!grid) return;
    const st = liveState.manga;
    if (!st.items || !st.items.length) return;
    const total = st.totalPages || 1;
    const p = Math.min(Math.max(1, page || 1), total);
    st.page = p;
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();
    st.items.forEach(m => frag.appendChild(createMangaCard(m)));
    grid.appendChild(frag);
    if (pager) {
        pager.style.display = (total <= 1) ? 'none' : '';
        let html = `<button class="pager-btn pager-nav" data-page="${p - 1}" ${p === 1 ? 'disabled' : ''}>&#10094; Prev</button>`;
        const WIN = 5;
        let s = Math.max(1, p - 2);
        let e = Math.min(total, s + WIN - 1);
        s = Math.max(1, e - WIN + 1);
        for (let i = s; i <= e; i++) html += `<button class="pager-btn ${i === p ? 'current' : ''}" data-page="${i}">${i}</button>`;
        html += `<button class="pager-btn pager-nav" data-page="${p + 1}" ${p === total ? 'disabled' : ''}>Next &#10095;</button>`;
        pager.innerHTML = html;
    }
}

// ==================== MANGA READER ====================
let mangaReader = { mangaId: '', info: null, chapters: [], currentId: null, images: [] };

function mrEl(id) { return document.getElementById(id); }

function showMangaReader(m) {
    mangaReader.mangaId = m.id || '';
    mangaReader.info = null;
    mangaReader.chapters = [];
    mangaReader.currentId = null;
    mangaReader.images = [];
    mrEl('mangaReadName').textContent = m.title;
    mrEl('mangaReadMeta').textContent = '';
    mrEl('mangaReadGenres').innerHTML = '';
    mrEl('mangaReadChapterLabel').textContent = '';
    mrEl('mangaReadPages').innerHTML = '<div class="live-loading">Loading manga details…</div>';
    mrEl('mangaReadPrev').disabled = true;
    mrEl('mangaReadNext').disabled = true;
    mrEl('mangaModal').classList.add('active');
    (async () => {
        try {
            const detailRes = await fetch(`${MANGA_API_BASE}/manga/${encodeURIComponent(mangaReader.mangaId)}/full`);
            if (!detailRes.ok) throw new Error('HTTP ' + detailRes.status);
            const detailData = await detailRes.json();
            const detail = detailData?.data || {};
            // GET /api/chapters/<mangaId> — per user request, try MangaDex (if authorized), then Tenrai/Jikan/local
            let chapterData = { data: [] };
            // try MangaDex first if we can resolve a MangaDex ID for this title (authorized token helps)
            try {
                const mdTitle = detail?.title || m.title || '';
                const mdId = await resolveMangadexMangaId(mdTitle);
                if (mdId) {
                    const feedUrls = [`/api/manga/${encodeURIComponent(mdId)}/feed`];
                    for (const feedUrl of feedUrls) {
                        for (let attempt = 0; attempt < 3; attempt++) {
                            try {
                                const r = await fetch(feedUrl, { cache: 'no-store' });
                                if (r.status === 429) { await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1))); continue; }
                                if (!r.ok) break;
                                const j = await r.json();
                                if (Array.isArray(j.data) && j.data.length) {
                                    chapterData = { data: j.data.map(c => ({ mal_id: c.id, chapter: c.attributes.chapter, title: c.attributes.title ? `${c.attributes.chapter ? 'Ch. '+c.attributes.chapter+' — ' : ''}${c.attributes.title}` : `Chapter ${c.attributes.chapter || ''}`.trim() })) };
                                    break;
                                }
                                break;
                            }
                            catch (feedError) { if (attempt === 2) console.warn('MangaDex feed error', feedError); }
                        }
                        if (chapterData.data.length) break;
                    }
                }
            } catch {}
            if (!chapterData.data.length) {
                const chapterUrls = [
                    `/api/chapters/${encodeURIComponent(mangaReader.mangaId)}`,
                    `${MANGA_API_BASE}/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters?limit=50&page=1`,
                    `https://api.tenrai.org/v1/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters?limit=50&page=1`,
                    `https://api.jikan.moe/v4/manga/${encodeURIComponent(mangaReader.mangaId)}/chapters`
                ];
                for (const u of chapterUrls) {
                    try {
                        const r = await fetch(u, { cache: 'no-store' });
                        if (r.ok) { chapterData = await r.json(); if (Array.isArray(chapterData.data) && chapterData.data.length) break; }
                    } catch {}
                }
            }
            mangaReader.info = detail;
            mangaReader.chapters = Array.isArray(chapterData.data) ? chapterData.data.map((c, index) => ({
                id: String(c?.mal_id ?? c?.chapter ?? c?.id ?? index + 1),
                name: c?.title || c?.name || `Chapter ${c?.chapter ?? index + 1}`
            })) : [];
            renderReaderDetail(detail);
            if (mangaReader.chapters.length) {
                // Whole book mode: load all chapters as one continuous scroll
                mrEl('mangaReadPages').innerHTML = '<div class="live-loading">Loading whole book…</div>';
                mrEl('mangaReadChapterLabel').textContent = `Whole Book — ${mangaReader.chapters.length} chapters`;
                const book = [];
                // Build the reader from real MangaDex chapter pages.
                for (let cIdx = 0; cIdx < mangaReader.chapters.length; cIdx++) {
                    const ch = mangaReader.chapters[cIdx];
                    book.push({ image: '', title: ch.name, isHeader: true, chapterId: ch.id });
                    let pages = [];
                    // try real MangaDx pages if this chapter is a real UUID
                    if (String(ch.id).includes('-') && String(ch.id).length >= 32) {
                        try {
                            const r = await fetch(`/api/chapter/${encodeURIComponent(ch.id)}`, { cache: 'no-store' });
                            if (r.ok) {
                                const j = await r.json();
                                const base = j.baseUrl || j.base_url;
                                const hash = j.chapter?.hash;
                                const files = j.chapter?.data || j.chapter?.dataSaver;
                                if (base && hash && files && files.length) pages = files.map(f => `${base}/data/${hash}/${f}`);
                            }
                        } catch {}
                    }
                    pages.forEach((url, idx) => book.push({ image: url, title: `${ch.name} — Page ${idx+1}`, chapterId: ch.id }));
                    // update progress in whole-book loading
                    if (cIdx % 5 === 0) mrEl('mangaReadPages').innerHTML = `<div class="live-loading">Loading whole book… ${cIdx+1}/${mangaReader.chapters.length} chapters</div>`;
                }
                mangaReader.images = book;
                if (!mangaReader.images.some(page => page.image)) {
                    mrEl('mangaReadPages').innerHTML = '<div class="live-error">No readable chapter pages are available for this manga.</div>';
                    return;
                }
                mangaReader.currentId = mangaReader.chapters[0].id;
                renderChapterPages();
                updateReaderNav();
                renderChapterDrawer();
            } else {
                mrEl('mangaReadPages').innerHTML = '<div class="live-error">No readable chapters are available for this manga.</div>';
                mrEl('mangaReadChapterLabel').textContent = 'No chapters';
            }
        } catch (e) {
            mrEl('mangaReadPages').innerHTML = '<div class="live-error">Could not load readable manga chapters.</div>';
            mrEl('mangaReadChapterLabel').textContent = 'Unavailable';
            updateReaderNav();
        }
    })();
}

function renderReaderDetail(info) {
    if (info?.title) mrEl('mangaReadName').textContent = info.title;
    const meta = [];
    if (info?.authors && info.authors.length) meta.push('✍ ' + info.authors.map(a => a.name).join(', '));
    if (info?.status) meta.push(info.status);
    if (info?.score) meta.push('⭐ ' + Number(info.score).toFixed(1));
    if (info?.chapters) meta.push('Ch. ' + info.chapters);
    if (info?.volumes) meta.push('Vol. ' + info.volumes);
    mrEl('mangaReadMeta').textContent = meta.join('  ·  ');
    const genresEl = mrEl('mangaReadGenres');
    genresEl.innerHTML = (Array.isArray(info?.genres) ? info.genres : []).map(g => `<span class="manga-genre-chip">${escapeHtml(g.name || g)}</span>`).join('');
}

async function openChapter(chId) {
    if (!chId || !mangaReader.mangaId) return;
    const ch = mangaReader.chapters.find(c => String(c.id) === String(chId));
    mangaReader.currentId = String(chId);
    const pagesEl = mrEl('mangaReadPages');
    pagesEl.innerHTML = '<div class="live-loading">Loading manga pages…</div>';
    // If this is a MangaDex chapter (UUID), try the authorized at-home server first so real pages load
    if (String(chId).includes('-') && String(chId).length >= 32) {
        try {
            const r = await fetch(`/api/chapter/${encodeURIComponent(chId)}`, { cache: 'no-store' });
            if (r.ok) {
                const j = await r.json();
                const base = j.baseUrl || j.base_url;
                const hash = j.chapter?.hash;
                const files = j.chapter?.data || j.chapter?.dataSaver;
                if (base && hash && files && files.length) {
                    mangaReader.images = files.map(f => ({ image: `${base}/data/${hash}/${f}`, title: ch?.name || '' }));
                    mrEl('mangaReadChapterLabel').textContent = ch?.name || chId;
                    renderChapterPages();
                    updateReaderNav();
                    renderChapterDrawer();
                    const body = mrEl('mangaReadBody');
                    if (body) body.scrollTop = 0;
                    return;
                }
            }
        } catch {}
    }
    pagesEl.innerHTML = '<div class="live-error">This chapter has no readable pages.</div>';
}

function renderChapterPages() {
    const pagesEl = mrEl('mangaReadPages');
    pagesEl.innerHTML = '';
    if (!mangaReader.images.length) {
        pagesEl.innerHTML = '<div class="live-error">No page images were returned for this chapter.</div>';
        return;
    }
    const frag = document.createDocumentFragment();
    mangaReader.images.forEach(p => {
        if (p.isHeader) {
            const h = document.createElement('div');
            h.className = 'manga-chapter-header';
            h.dataset.ch = p.chapterId || '';
            h.textContent = p.title || '';
            h.style.cssText = 'width:100%;padding:18px 0 8px;font-weight:800;font-size:18px;color:#ffb6d8;border-bottom:1px solid rgba(255,182,216,0.18);margin:10px 0;text-align:center;';
            frag.appendChild(h);
            return;
        }
        const img = document.createElement('img');
        img.src = p.image || '';
        img.alt = p.title || '';
        img.loading = 'lazy';
        img.onerror = () => { img.style.display = 'none'; };
        frag.appendChild(img);
    });
    pagesEl.appendChild(frag);
}

function chapterIndex() {
    return mangaReader.chapters.findIndex(c => String(c.id) === String(mangaReader.currentId));
}

function updateReaderNav() {
    const idx = chapterIndex();
    mrEl('mangaReadPrev').disabled = idx < 1;
    mrEl('mangaReadNext').disabled = idx < 0 || idx >= mangaReader.chapters.length - 1;
}

function renderChapterDrawer() {
    const list = mrEl('mangaChapterList');
    if (!mangaReader.chapters.length || !list) { if (list) list.innerHTML = ''; return; }
    list.innerHTML = mangaReader.chapters.map(c => {
        const active = String(c.id) === String(mangaReader.currentId) ? ' active' : '';
        return `<button class="manga-drawer-item${active}" data-ch="${escapeHtml(String(c.id))}">${escapeHtml(c.name || c.id)}</button>`;
    }).join('');
}

// Hero banners for live tabs - cycle through the live items.
function showLiveHero(section) {
    const heroSection = document.getElementById('heroSection');
    heroSection.style.display = '';
    let items, title, emptyDesc;
    if (section === 'trending') { items = liveState.trending.items; title = 'Trending Now'; emptyDesc = 'Trending titles will appear here. Click "Trending" to load them.'; }
    else if (section === 'streaming') { items = liveState.streaming.items; title = 'Streaming Now'; emptyDesc = 'Live streaming titles will appear here.'; }
    else if (section === 'theaters') { items = liveState.theaters.items; title = 'In Theaters'; emptyDesc = 'Now-playing titles will appear here.'; }
    else { items = liveState.manga.items; title = 'Manga'; emptyDesc = 'Popular manga titles will appear here.'; }
    if (items.length) {
        heroQueue = items;
        heroIndex = Math.max(0, heroIndex % heroQueue.length);
        renderHeroItem();
    } else {
        heroQueue = [];
        document.getElementById('heroTitle').textContent = title;
        document.getElementById('heroDesc').textContent = emptyDesc;
        document.getElementById('heroSection').style.backgroundImage = '';
        document.getElementById('heroPlayBtn').onclick = null;
        document.getElementById('heroInfoBtn').onclick = null;
        const hl = document.getElementById('heroLogo');
        hl.style.display = 'none';
        hl.removeAttribute('src');
    }
}

// Pagination clicks (event delegation for the live grids).
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn');
    if (!btn || !btn.dataset.page) return;
    const type = btn.closest('.live-section')?.id;
    const key = type === 'trendingSection' ? 'trending' : type === 'streamingSection' ? 'streaming' : type === 'theatersSection' ? 'theaters' : type === 'mangaSection' ? 'manga' : null;
    if (!key) return;
    const page = parseInt(btn.dataset.page, 10);
    if (isNaN(page)) return;
    liveState[key].page = page;
    if (key === 'manga') fetchMangaList(page, liveState.manga.type || 'topview');
    else renderLiveGrid(key);
});

// ==================== NAVIGATION ====================
let currentSection = 'home';
let homeFilter = 'movies'; // home toggle: movies | tvshows
// prevent one unhandled error from blanking the whole site
window.addEventListener('error', e => { console.error('MILKBOX error', e.message); e.preventDefault(); });
window.addEventListener('unhandledrejection', e => { console.error('MILKBOX rejection', e.reason); e.preventDefault(); });

// Live anime catalog (auto-loaded from TMDB when the local library has no anime,
// so the Anime tab is never empty).
const animeLive = { movies: [], tv: [], loading: false, fed: false };

function localAnimeExists() {
    return movies.some(m => isAnime(m) && completeItem(m)) || tvShows.some(m => isAnime(m) && completeItem(m));
}

async function loadAnimeLive() {
    if (animeLive.loading) return;
    // always load the live TMDB anime feed (never bail just because some local anime exist);
    // merges with local titles so the anime tab is always full and playback works via megavid.
    if (animeLive.fed && currentSection === 'anime') {
        renderAnime();
        showAnimeHero();
        renderGenreRows();
        return;
    }
    if (animeLive.fed) return;
    animeLive.loading = true;
    try {
        await tmdbEnsureConfig();
        const movPaths = Array.from({ length: 15 }, (_, i) => `/discover/movie?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
        const tvPaths = Array.from({ length: 15 }, (_, i) => `/discover/tv?with_genres=16&with_origin_country=JP&sort_by=popularity.desc&page=${i + 1}`);
        const [mp, tp] = await Promise.all([fetchBatched(movPaths, 5), fetchBatched(tvPaths, 5)]);
        animeLive.movies = liveItemsFromPages(mp, 'movie');
        animeLive.tv = liveItemsFromPages(tp, 'tv');
        animeLive.fed = true;
        if (currentSection === 'anime') {
            renderAnime();
            showAnimeHero();
            renderGenreRows();
        }
    } catch (e) {
        const sl = document.getElementById('moviesSlider');
        if (sl && !sl.children.length) {
            sl.innerHTML = `<div class="live-error">Couldn't load anime. Check your internet connection and try again.</div>`;
        }
    } finally {
        animeLive.loading = false;
    }
}

function renderAnime() {
    renderCatalogGrid('animeMovie');
    renderCatalogGrid('animeTv');
}
function handleNavClick(link, e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        try {
            window.history.pushState(null, '', window.location.pathname);
        } catch (_) {}
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const section = link.dataset.section;
        currentSection = section;
        document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'theaters-active', 'manga-active', 'home-active');
        if (['home', 'movies', 'tvshows', 'anime', 'mylist', 'trending', 'streaming', 'theaters', 'manga'].includes(section)) {
            document.body.classList.add(section + '-active');
        }
        const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v ? '' : 'none'; };
        show('providerSection', section==='home' || section==='streaming');
        show('collectionsSection', section==='home' || section==='trending');
        if (section === 'anime') {
            document.querySelector('#moviesSection .section-title').textContent = 'Anime Movies';
            document.querySelector('#tvShowsSection .section-title').textContent = 'Anime Shows';
            show('moviesSection', true);
            show('tvShowsSection', true);
            show('myListSection', false);
            show('homeGenres', true);
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            renderAnime();
            showAnimeHero();
            loadAnimeLive();
            renderGenreRows();
        } else if (section === 'mylist') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', true);
            show('homeGenres', true);
            renderMyList();
            showMyListHero();
            renderGenreRows();
        } else if (section === 'trending') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', true);
            show('streamingSection', false);
            show('theatersSection', false);
            renderLiveTab('trending');
            showLiveHero('trending');
            show('collectionsSection', true);
            renderCollections();
        } else if (section === 'streaming') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', true);
            show('theatersSection', false);
            renderLiveTab('streaming');
            showLiveHero('streaming');
        } else if (section === 'theaters') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', true);
            show('mangaSection', false);
            renderLiveTab('theaters');
            showLiveHero('theaters');
        } else if (section === 'manga') {
            show('moviesSection', false);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            show('mangaSection', true);
            renderLiveTab('manga');
            document.getElementById('heroSection').style.display = 'none';
        } else if (section === 'tvshows') {
            show('moviesSection', false);
            show('tvShowsSection', true);
            show('myListSection', false);
            show('homeGenres', true);
            document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
            document.getElementById('tvShowsSection').classList.add('catalog-grid');
            document.getElementById('moviesSection').classList.remove('catalog-grid');
            renderCatalogGrid('tvshows');
            showTvHero();
            renderGenreRows();
        } else if (section === 'movies') {
            show('moviesSection', true);
            show('tvShowsSection', false);
            show('myListSection', false);
            show('homeGenres', false);
            document.querySelector('#moviesSection .section-title').textContent = 'Movies';
            document.getElementById('moviesSection').classList.add('catalog-grid');
            document.getElementById('tvShowsSection').classList.remove('catalog-grid');
            renderCatalogGrid('movies');
            showMovieHero();
        }         else {
            document.querySelector('#moviesSection .section-title').textContent = 'Movies';
            document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
            if (section === 'home') {
                applyHomeFilter();
                document.getElementById('heroSection').style.display = '';
                show('myListSection', false);
                show('trendingSection', false);
                show('streamingSection', false);
                show('theatersSection', false);
                try { renderCollections(); } catch {}
            } else {
                show('moviesSection', section === 'movies');
                show('tvShowsSection', section === 'tvshows');
                show('myListSection', false);
                show('homeGenres', false);
                show('trendingSection', false);
                show('streamingSection', false);
                show('theatersSection', false);
                document.getElementById('heroSection').style.display = 'none';
            }
            updateHero();
            renderMovies();
            renderTvShows();
            renderGenreRows();
        }
        const mpanel = document.getElementById('mobileNavPanel');
        if (mpanel) mpanel.classList.remove('open');
}

function applyHomeFilter() {
    try {
        const show = (id, v) => { const el=document.getElementById(id); if(el) el.style.display = v ? '' : 'none'; };
        const isMovies = homeFilter === 'movies';
        show('moviesSection', isMovies);
        show('tvShowsSection', !isMovies);
        show('homeGenres', true);
        // toggle catalog-grid class for visible section
        const ms = document.getElementById('moviesSection');
        const tv = document.getElementById('tvShowsSection');
        if (ms) ms.classList.toggle('catalog-grid', isMovies);
        if (tv) tv.classList.toggle('catalog-grid', !isMovies);
        if (isMovies) {
            try { renderCatalogGrid('movies', 'home'); } catch(e){ console.error(e); }
            const t = document.querySelector('#moviesSection .section-title'); if (t) t.textContent = 'Movies';
        } else {
            try { renderCatalogGrid('tvshows', 'home'); } catch(e){ console.error(e); }
            const t2 = document.querySelector('#tvShowsSection .section-title'); if (t2) t2.textContent = 'TV Shows';
        }
        try { renderGenreRows(); } catch(e){ console.error(e); }
        const pillsEl = document.getElementById('homeFilterPills');
        if (pillsEl) pillsEl.style.display = 'flex';
    } catch(e){ console.error('applyHomeFilter', e); }
    try { renderCollections(); } catch {}
    document.querySelectorAll('.home-pill').forEach(b=> b.classList.toggle('active', b.dataset.filter===homeFilter));
}
document.addEventListener('click', (e)=>{
    const pill = e.target.closest('.home-pill');
    if (!pill) return;
    homeFilter = pill.dataset.filter;
    document.querySelectorAll('.home-pill').forEach(b=> b.classList.toggle('active', b===pill));
    if (currentSection !== 'home') {
        const homeLink = document.querySelector('.nav-link[data-section="home"]');
        if (homeLink) handleNavClick(homeLink);
    } else {
        applyHomeFilter();
        updateHero();
    }
});

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});
document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
if (mobileMenuBtn) {
    const mobileNavPanel = document.getElementById('mobileNavPanel');
    let menuCloseTimer;
    const positionMenu = () => {
        const buttonRect = mobileMenuBtn.getBoundingClientRect();
        mobileNavPanel.style.left = `${buttonRect.left}px`;
        mobileNavPanel.style.right = 'auto';
        mobileNavPanel.style.top = `${buttonRect.bottom + 6}px`;
    };
    const openMenu = () => { clearTimeout(menuCloseTimer); positionMenu(); mobileNavPanel.classList.add('open'); };
    const closeMenuSoon = () => { menuCloseTimer = setTimeout(() => mobileNavPanel.classList.remove('open'), 180); };
    mobileMenuBtn.addEventListener('click', () => mobileNavPanel.classList.toggle('open'));
    mobileMenuBtn.addEventListener('mouseenter', openMenu);
    mobileMenuBtn.addEventListener('mouseleave', closeMenuSoon);
    mobileNavPanel.addEventListener('mouseenter', openMenu);
    mobileNavPanel.addEventListener('mouseleave', closeMenuSoon);
}

// ==================== MODALS ====================
document.getElementById('addContentBtn').addEventListener('click', () => document.getElementById('addContentModal').classList.add('active'));
document.getElementById('closeModal').addEventListener('click', () => document.getElementById('addContentModal').classList.remove('active'));
document.getElementById('closePlayer').addEventListener('click', () => { document.getElementById('playerModal').classList.remove('active'); document.getElementById('playerFrame').innerHTML = ''; });
const epToggle = document.getElementById('episodeToggleBtn');
if (epToggle) {
    epToggle.addEventListener('click', () => { document.getElementById('episodeSelector').classList.toggle('collapsed'); });
}
document.getElementById('closeInfo').addEventListener('click', () => document.getElementById('infoModal').classList.remove('active'));
document.getElementById('closeEdit').addEventListener('click', () => document.getElementById('editModal').classList.remove('active'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));
document.getElementById('closeMangaModal').addEventListener('click', () => document.getElementById('mangaModal').classList.remove('active'));
document.getElementById('mangaDrawerClose')?.addEventListener('click', () => document.getElementById('mangaDrawer').classList.remove('active'));
document.getElementById('mangaReadPrev')?.addEventListener('click', () => {
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    const idx = chapterIndex();
    if (idx > 0) {
        if (isWhole) {
            const chId = String(mangaReader.chapters[idx - 1].id);
            const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
            mangaReader.currentId = chId;
            mrEl('mangaReadChapterLabel').textContent = mangaReader.chapters[idx - 1]?.name || chId;
            updateReaderNav(); renderChapterDrawer();
            if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        } else openChapter(mangaReader.chapters[idx - 1].id);
    }
});
document.getElementById('mangaReadNext')?.addEventListener('click', () => {
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    const idx = chapterIndex();
    if (idx >= 0 && idx < mangaReader.chapters.length - 1) {
        if (isWhole) {
            const chId = String(mangaReader.chapters[idx + 1].id);
            const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
            mangaReader.currentId = chId;
            mrEl('mangaReadChapterLabel').textContent = mangaReader.chapters[idx + 1]?.name || chId;
            updateReaderNav(); renderChapterDrawer();
            if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        } else openChapter(mangaReader.chapters[idx + 1].id);
    }
});
document.getElementById('mangaReadList')?.addEventListener('click', () => {
    renderChapterDrawer();
    document.getElementById('mangaDrawer').classList.add('active');
});
document.getElementById('mangaChapterList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.manga-drawer-item');
    if (!btn) return;
    const isWhole = mangaReader.images.some(p=>p.isHeader);
    if (isWhole) {
        const chId = String(btn.dataset.ch);
        const header = document.querySelector(`.manga-chapter-header[data-ch="${chId}"]`);
        mangaReader.currentId = chId;
        const ch = mangaReader.chapters.find(c=>String(c.id)===chId);
        mrEl('mangaReadChapterLabel').textContent = ch?.name || chId;
        updateReaderNav();
        renderChapterDrawer();
        if (header) header.scrollIntoView({ behavior:'smooth', block:'start' });
        else {
            const idx = mangaReader.chapters.findIndex(c=>String(c.id)===chId);
            const allH = document.querySelectorAll('.manga-chapter-header');
            if (allH[idx]) allH[idx].scrollIntoView({ behavior:'smooth', block:'start' });
        }
        document.getElementById('mangaDrawer').classList.remove('active');
        return;
    }
    openChapter(btn.dataset.ch);
    document.getElementById('mangaDrawer').classList.remove('active');
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
            if (modal.id === 'playerModal') document.getElementById('playerFrame').innerHTML = '';
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        document.getElementById('playerFrame').innerHTML = '';
    }
});

// Tab switching in add content modal
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// ==================== SLIDER BUTTONS ====================
// Slider arrows work for both static and dynamically-rendered (genre) sliders via delegation.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.slider-btn');
    if (!btn || !btn.dataset.slider) return;
    const slider = document.getElementById(btn.dataset.slider);
    if (slider) slider.scrollBy({ left: btn.classList.contains('slider-left') ? -600 : 600, behavior: 'smooth' });
});

// ==================== SCROLL NAVBAR ====================
window.addEventListener('scroll', () => {
    document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ==================== FOOTER LINKS ====================
document.getElementById('footerHelp').addEventListener('click', (e) => { e.preventDefault(); toast('Help: Add movies with Google Drive links, upload TV episodes, and click Play to watch!'); });
document.getElementById('footerTerms').addEventListener('click', (e) => { e.preventDefault(); toast('For personal use only. MILKBOX is a personal media organizer.'); });
document.getElementById('footerPrivacy').addEventListener('click', (e) => { e.preventDefault(); toast('All data is stored locally in your browser. Nothing is sent to any server.'); });

// ==================== LOGO CLICK ====================
document.getElementById('logoWrap').addEventListener('click', (e) => {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link[data-section="home"]').classList.add('active');
    currentSection = 'home';
    document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'theaters-active', 'manga-active', 'home-active');
    document.body.classList.add('home-active');
    document.querySelector('#moviesSection .section-title').textContent = 'Movies';
    document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
    ['myListSection', 'heroSection', 'providerSection'].forEach(id => { const el=document.getElementById(id); if(el) el.style.display=''; });
    ['trendingSection', 'theatersSection', 'mangaSection'].forEach(id => document.getElementById(id).style.display = 'none');
    applyHomeFilter();
    updateHero();
});

// ==================== INIT ====================
function initAll() {
    try { initGenreOptions(); } catch (e) { console.error('initGenreOptions error:', e); }
    try { applyCloak(); } catch (e) { console.error('applyCloak error:', e); }
    try { applyBackground(); } catch (e) { console.error('applyBackground error:', e); }
    try { scanMovieQualities(true); } catch (e) { console.error('scanMovieQualities error:', e); }
    try {
        const hg = document.getElementById('homeGenres');
        if (hg && currentSection === 'home') hg.style.display = 'none';
        renderAll();
        if (currentSection === 'home') {
            document.body.classList.add('home-active');
            try { applyHomeFilter(); } catch {}
        }
    } catch (e) { console.error('renderAll error:', e); }
    try { renderProviders(); } catch (e) { console.error('renderProviders error:', e); }
    try { if (!localAnimeExists()) loadAnimeLive(); } catch (e) { console.error('preload anime error:', e); }
    try { autoLoadHostedLibrary(); } catch (e) { console.error('autoLoadHostedLibrary error:', e); }
    try { enrichMissingLogos(); } catch (e) { console.error('enrichMissingLogos error:', e); }
}
initAll();

// provider click delegation
document.addEventListener('click', (e) => {
    const item = e.target.closest('.provider-item');
    if (!item) return;
    browseProvider(item.dataset.provider);
});
let currentCollection = null;
let currentCollectionItems = [];
let currentCollectionPage = 1;
const COLLECTION_PER_PAGE = 14;
function renderCollectionPage() {
    const sec = document.getElementById('searchResultsSection');
    const grid = document.getElementById('searchResultsGrid');
    const pager = document.getElementById('searchResultsPager');
    const titleEl = document.getElementById('searchResultsTitle');
    const closeBtn = document.getElementById('closeSearchResults');
    if (!sec || !grid || !currentCollection) return;
    const total = Math.ceil(currentCollectionItems.length / COLLECTION_PER_PAGE) || 1;
    const page = Math.min(Math.max(1, currentCollectionPage), total);
    currentCollectionPage = page;
    const start = (page - 1) * COLLECTION_PER_PAGE;
    const slice = currentCollectionItems.slice(start, start + COLLECTION_PER_PAGE);
    titleEl.textContent = `${currentCollection} Collection · ${currentCollectionItems.length} title${currentCollectionItems.length===1?'':'s'} — Page ${page} of ${total}`;
    grid.innerHTML = '';
    slice.forEach(it => grid.appendChild(createCard(it, it.type || 'movie')));
    sec.style.display = '';
    if (closeBtn) closeBtn.style.display = '';
    if (pager) {
        if (total <= 1) pager.style.display = 'none';
        else {
            pager.style.display = '';
            let html = `<button class="pager-btn pager-nav" data-collection-page="${page - 1}" ${page===1?'disabled':''}>&#10094; Prev</button>`;
            const WIN = 5; let s = Math.max(1, page - 2); let e = Math.min(total, s + WIN - 1); s = Math.max(1, e - WIN + 1);
            for (let i = s; i <= e; i++) html += `<button class="pager-btn ${i===page?'current':''}" data-collection-page="${i}">${i}</button>`;
            html += `<button class="pager-btn pager-nav" data-collection-page="${page + 1}" ${page===total?'disabled':''}>Next &#10095;</button>`;
            pager.innerHTML = html;
        }
    }
    document.getElementById('moviesSection').style.display='none';
    document.getElementById('tvShowsSection').style.display='none';
    document.getElementById('homeGenres').style.display='none';
    document.getElementById('collectionsSection').style.display='none';
    document.getElementById('providerSection').style.display='none';
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeCollectionView() {
    currentCollection = null;
    currentCollectionItems = [];
    currentCollectionPage = 1;
    const sec = document.getElementById('searchResultsSection');
    const grid = document.getElementById('searchResultsGrid');
    const pager = document.getElementById('searchResultsPager');
    const closeBtn = document.getElementById('closeSearchResults');
    if (sec) sec.style.display = 'none';
    if (grid) grid.innerHTML = '';
    if (pager) pager.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';
    if (currentSection === 'home') {
        applyHomeFilter();
        const hero = document.getElementById('heroSection');
        if (hero) hero.style.display = '';
        const prov = document.getElementById('providerSection');
        if (prov) prov.style.display = '';
        try { renderCollections(); } catch {}
    }
}
// collections click — show all titles in that collection with pages (scans TMDB for more)
document.addEventListener('click', async (e) => {
    const card = e.target.closest('.collection-card');
    if (!card) return;
    const label = card.dataset.collection;
    const pool = [...movies, ...tvShows].filter(completeItem);
    let items = pool.filter(it => collectionForTitle(it.title) === label);
    // include explicit custom picks (e.g. your own Pokémon selections)
    const custom = customCollections.find(c=> c.label===label);
    if (custom && custom.itemIds && custom.itemIds.length) {
        const allPool = [...movies, ...tvShows];
        const extra = allPool.filter(it=> custom.itemIds.includes(it.id));
        const seen = new Set(items.map(x=> x.id));
        extra.forEach(it=> { if(!seen.has(it.id)){ items.push(it); seen.add(it.id); }});
    }
    // scan TMDB for additional titles in this collection
    try {
        await tmdbEnsureConfig();
        const def = COLLECTION_DEFS.find(d=>d.label===label);
        if (def) {
            const q = def.keys[0];
            const data = await tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=1`);
            const tmdbItems = (data.results || []).map(r => {
                const type = r.media_type === 'tv' ? 'tv' : r.media_type === 'movie' ? 'movie' : (r.first_air_date ? 'tv' : 'movie');
                return liveItemToItem(r, type);
            }).filter(it => it.title && it.poster && it.backdrop && collectionForTitle(it.title) === label);
            const existing = new Set(items.map(i=>i.tmdbId||i.id));
            tmdbItems.forEach(it=>{ const k=it.tmdbId||it.id; if(!existing.has(k)){ items.push(it); existing.add(k); } });
            // second page for richer collections like Star Wars/Marvel
            if (tmdbItems.length >= 8) {
                try {
                    const data2 = await tmdbJson(`/search/multi?query=${encodeURIComponent(q)}&page=2`);
                    const more = (data2.results || []).map(r => {
                        const type = r.media_type === 'tv' ? 'tv' : 'movie';
                        return liveItemToItem(r, type);
                    }).filter(it => collectionForTitle(it.title) === label);
                    more.forEach(it=>{ const k=it.tmdbId||it.id; if(!existing.has(k)){ items.push(it); existing.add(k); } });
                } catch {}
            }
        }
    } catch {}
    if (!items.length) return;
    currentCollection = label;
    currentCollectionItems = items;
    currentCollectionPage = 1;
    toast(`${label} — ${items.length} title${items.length===1?'':'s'}`);
    renderCollectionPage();
});
document.getElementById('closeSearchResults')?.addEventListener('click', closeCollectionView);
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.pager-btn[data-collection-page]');
    if (!btn || btn.disabled) return;
    const p = parseInt(btn.dataset.collectionPage, 10);
    if (isNaN(p)) return;
    currentCollectionPage = p;
    renderCollectionPage();
});
