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

// Auto-loads the shared library for first-time visitors (empty library): first tries the
// hosted JSON, then auto-runs the TMDB genre loader so movies/shows/anime appear with no clicks.
async function autoLoadHostedLibrary() {
    const alreadyHasData = (movies.length || tvShows.length) || localStorage.getItem('sf_movies') || localStorage.getItem('sf_tvshows');
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
                    movies = m;
                    tvShows = t;
                    saveData();
                    refreshCurrent();
                    loaded = true;
                    // Scan the freshly-loaded library and auto-add any missing
                    // brand logos for movies, TV shows and anime (by TMDB id).
                    enrichMissingLogos().catch(() => {});
                }
            }
        } catch (e) { /* fall through to TMDB auto-load */ }
    }
    if (!loaded) {
        const before = movies.length + tvShows.length;
        try { await loadPopularContent(true); } catch (e) { /* no auto-load if TMDB fails */ }
        if (movies.length + tvShows.length > before && typeof toast === 'function') toast('Library loaded!');
    }
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
function applyCloak() {
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
        imgHTML = `<img class="card-img" src="${safePoster}" alt="${safeTitle}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
    }
    imgHTML += `<div class="card-placeholder" style="${item.poster ? 'display:none' : ''}">${defaultPosters[genre] || '🎬'}</div>`;
    // TV shows (and anime shows) are always HD. Movies use their saved quality
    // (assigned by scanMovieQualities), falling back to a hash-based tier.
    const mcBadge = effType === 'tv' || item.type === 'tv'
        ? 'HD'
        : (item.quality === 'CAM' || item.quality === 'HDCAM' || item.quality === 'HD' ? item.quality : qualityFor(item.tmdbId || item.id));
    const badgeCls = mcBadge === 'CAM' ? 'cam' : mcBadge === 'HDCAM' ? 'hdcam' : 'hd';
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
                ${item.certification ? `<span class="card-cert">${escapeHtml(item.certification)}</span>` : ''}
                <span class="card-rating">${item.rating ? '★ ' + item.rating : ''}</span>
                <span>${item.year || ''}</span>
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

// Any slider scroll near the right edge triggers loading the next batch.
document.addEventListener('scroll', (e) => {
    const el = e.target;
    if (!el || !el.classList || !el.classList.contains('slider')) return;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 400) sliderLoadMore(el);
}, true);

function renderMovies() {
    const sec = document.getElementById('moviesSection');
    if (sec) sec.classList.add('catalog-grid');
    renderCatalogGrid('movies');
}
function renderTvShows() {
    const sec = document.getElementById('tvShowsSection');
    if (sec) sec.classList.add('catalog-grid');
    renderCatalogGrid('tvshows');
}
function renderMyList() { renderSlider('myListSlider', myList, 'mixed'); }

// ---- Paginated catalog grids (Movies / TV / Anime tab views) ----
const CATALOG_PER_PAGE = 12;
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

function renderCatalogGrid(section) {
    const cfg = {
        movies: { items: movies.filter(m => inYearRange(m, 1000, 2026) && hasMovieInfo(m)), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'movies' },
        tvshows: { items: tvShows, type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'tvshows' },
        animeMovie: { items: movies.filter(isAnime), type: 'movie', slider: 'moviesSlider', pager: 'moviesPager', pkey: 'animeMovie' },
        animeTv: { items: tvShows.filter(isAnime), type: 'tv', slider: 'tvShowsSlider', pager: 'tvPager', pkey: 'animeTv' }
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

function renderGenreRows() {
    const container = document.getElementById('homeGenres');
    if (!container) return;
    if (container.style.display === 'none') return;
    let pool, suffix, skip = null;
    if (currentSection === 'movies') { pool = movies; suffix = ' Movies'; }
    else if (currentSection === 'tvshows') { pool = tvShows; suffix = ' Shows'; }
    else if (currentSection === 'anime') { pool = animeHeroItems(); suffix = ''; skip = 'anime'; }
    else if (currentSection === 'mylist') { pool = myList; suffix = ''; }
    else { pool = [...movies, ...tvShows]; suffix = ''; }
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
    GENRE_ROWS.forEach(({ key, label }) => {
        if (key === skip) return;
        const items = genreIndex.get(key);
        if (!items || items.length < 3) return;
        toRender.push({ key, items });
        html += `<section class="content-section" id="genreSection-${key}"><h3 class="section-title">${label}${suffix}</h3><div class="slider-container"><button class="slider-btn slider-left" data-slider="genreSlider-${key}">❮</button><div class="slider" id="genreSlider-${key}"></div><button class="slider-btn slider-right" data-slider="genreSlider-${key}">❯</button></div></section>`;
    });
    container.innerHTML = html;
    toRender.forEach(({ key, items }) => renderSlider('genreSlider-' + key, items, 'mixed'));
}

function isAnime(item) {
    return genArr(item.genre).some(g => g.toLowerCase() === 'anime');
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
    const items = animeHeroItems();
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
        renderGenreRows();
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
    if (tvShows.length) {
        heroQueue = tvShows;
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
    if (movies.length) {
        heroQueue = movies;
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
    // only after every movie has cycled.
    const inter = [];
    const n = Math.max(movies.length, tvShows.length);
    for (let i = 0; i < n; i++) {
        if (i < movies.length) inter.push(movies[i]);
        if (i < tvShows.length) inter.push(tvShows[i]);
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
// Build a Vidking (TMDB-powered) iframe for movie or TV playback.
function vidkingIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://www.vidking.net/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}?autoPlay=true&nextEpisode=true&episodeSelector=true`;
    } else {
        url = `https://www.vidking.net/embed/movie/${encodeURIComponent(tmdbId)}?color=e50914&autoPlay=false`;
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

// Vidsrc — TMDB-powered embed for movie / TV playback.
function vidsrcIframe(tmdbId, type, season, episode) {
    let url;
    if (type === 'tv') {
        url = `https://vidsrc.to/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season || 1)}/${encodeURIComponent(episode || 1)}`;
    } else {
        url = `https://vidsrc.to/embed/movie/${encodeURIComponent(tmdbId)}`;
    }
    return `<iframe src="${escapeHtml(url)}" width="100%" height="100%" style="border:0" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>`;
}

// Current play context + selected server for the player.
let playContext = null;
let playerServer = settings.playerServer || 'auto';

function serverBtnActive() {
    document.querySelectorAll('.server-btn').forEach(b => b.classList.toggle('active', b.dataset.server === playerServer));
}

function effectiveServerFor(item, type) {
    if (playerServer === 'drive') return 'drive';
    if (playerServer === 'tmdb') return 'tmdb';
    if (playerServer === 'phantom') return 'phantom';
    if (playerServer === 'vidsrc') return 'vidsrc';
    // Auto: prefer TMDB (Vidking) when an ID exists, otherwise fall back to Drive.
    return item.tmdbId ? 'tmdb' : 'drive';
}

// Ordered list used for automatic server fallback (TMDB-based sources only).
const SERVER_ORDER = ['tmdb', 'phantom', 'vidsrc'];
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

// Renders the correct TMDB-based iframe for the current play context on `server`.
function renderTmdbPlay(server) {
    const frame = document.getElementById('playerFrame');
    if (!frame || !playContext) return;
    const { item, type, episode, season } = playContext;
    if (!item.tmdbId) return;
    if (type === 'movie') {
        frame.innerHTML = server === 'tmdb' ? vidkingIframe(item.tmdbId, 'movie')
            : server === 'phantom' ? phantomIframe(item.tmdbId, 'movie')
            : vidsrcIframe(item.tmdbId, 'movie');
        armAutoFallback(frame, server);
    } else {
        const se = season || item.season || 1;
        const ep = episode || 1;
        frame.innerHTML = server === 'tmdb' ? vidkingIframe(item.tmdbId, 'tv', se, ep)
            : server === 'phantom' ? phantomIframe(item.tmdbId, 'tv', se, ep)
            : vidsrcIframe(item.tmdbId, 'tv', se, ep);
        armAutoFallback(frame, server);
    }
}

function renderPlay() {
    const frame = document.getElementById('playerFrame');
    const subtitle = document.getElementById('playerSubtitle');
    const epSelector = document.getElementById('episodeSelector');
    if (!playContext) return;
    const { item, type } = playContext;
    const server = effectiveServerFor(item, type);
    frame.innerHTML = '';
    serverBtnActive();

    if (type === 'movie') {
        subtitle.textContent = (item.year ? item.year + '  ' : '') + (genArr(item.genre).join(', ') || '');
        epSelector.style.display = 'none';
        if ((server === 'tmdb' || server === 'phantom' || server === 'vidsrc') && item.tmdbId) {
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
        if ((server === 'tmdb' || server === 'phantom' || server === 'vidsrc') && item.tmdbId) {
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
    renderPlay();
    modal.classList.add('active');
}

// Server switcher in the player modal (event delegation).
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.server-btn');
    if (!btn || !playContext) return;
    clearAutoFallback();
    playerServer = btn.dataset.server;
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
                        <div class="cineby-ep-play-overlay">
                            <svg xmlns="http://www.w3.org/2000/svg" height="28px" viewBox="0 -960 960 960" width="28px" fill="#FFFFFF"><path d="M320-200v-560l440 280-440 280Zm80-280Zm0 134 210-134-210-134v268Z"/></svg>
                        </div>
                    </div>
                    <div class="cineby-ep-info">
                        <div class="cineby-ep-title-row">
                            <span class="cineby-ep-number">${ep.episode_number}.</span>
                            <h4 class="cineby-ep-title">${escapeHtml(epTitle)}</h4>
                        </div>
                        <div class="cineby-ep-meta">${runtime}</div>
                        <p class="cineby-ep-desc">${escapeHtml(overview)}</p>
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
    renderTmdbPlay(server);
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
    title.textContent = tvItem.title;
    subtitle.textContent = `Season ${tvItem.season || 1} • Episode ${index + 1} - ${episode.name}`;
    frame.innerHTML = '';

    if (episode.blobUrl) {
        frame.innerHTML = `<video controls autoplay style="width:100%;height:100%;background:#000;"><source src="${escapeHtml(episode.blobUrl)}" type="${escapeHtml(episode.type || 'video/mp4')}"></video>`;
    } else if (episode.driveLink) {
        const driveLink = convertDriveLink(episode.driveLink);
        frame.innerHTML = `<iframe src="${escapeHtml(driveLink)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else if (episode.url) {
        const driveLink = convertDriveLink(episode.url);
        frame.innerHTML = `<iframe src="${escapeHtml(driveLink)}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else {
        frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source</div>`;
    }
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
    document.getElementById('infoTitle').textContent = item.title;
    document.getElementById('infoYear').textContent = item.year || '';
    document.getElementById('infoRating').textContent = item.rating ? '★ ' + item.rating : '';
    const infoCertEl = document.getElementById('infoCert');
    if (infoCertEl) { infoCertEl.textContent = item.certification || ''; infoCertEl.style.display = item.certification ? '' : 'none'; }
    document.getElementById('infoGenre').textContent = gArr.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ');
    document.getElementById('infoDesc').textContent = item.description || 'No description available.';
    const infoLogo = document.getElementById('infoLogo');
    if (infoLogo) {
        if (item.logo) {
            infoLogo.src = item.logo;
            infoLogo.style.display = 'block';
        } else {
            infoLogo.removeAttribute('src');
            infoLogo.style.display = 'none';
        }
    }
    document.getElementById('infoPlayBtn').onclick = () => { modal.classList.remove('active'); playItem(sourceItem, type); };
    document.getElementById('infoListBtn').innerHTML = inList ? '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg> In My List' : '+ My List';
    document.getElementById('infoListBtn').onclick = () => { toggleMyList(sourceItem, type); showInfo(sourceItem, type); };
    document.getElementById('infoEditBtn').onclick = () => { modal.classList.remove('active'); openEdit(sourceItem, type); };
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
    if (!res.ok) throw new Error(res.status === 404 ? '404 - Not found (check the ID, or type a title to search)' : `HTTP ${res.status}`);
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
const POPULAR_PAGES = 8;
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
const LIVE_PAGES = 3;         // TMDB pages fetched per feed
const LIVE_PER_PAGE = 12;     // titles shown per grid page
const liveState = {
    trending: { items: [], page: 1 },
    streaming: { items: [], page: 1 },
    theaters: { items: [], page: 1 },
    manga: { items: [], page: 1, totalPages: 1, type: 'topview' }
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

// ==================== MANGA (Manga Hook API) ====================
// The Manga Hook API is self-hosted: run `server` from
// https://github.com/kiraaziz/mangahook-api and it listens on port 3000.
// Set MANGA_API_BASE to your deployed instance if you host it elsewhere.
const MANGA_API_BASE = 'http://localhost:3000';
const MANGA_PER_PAGE = 24;

function mangaItemToItem(m) {
    return {
        id: m.id || ('manga_' + Math.random().toString(36).slice(2, 8)),
        title: m.title || 'Untitled Manga',
        description: m.description || '',
        genre: ['manga'],
        year: '',
        rating: '',
        poster: m.image || '',
        backdrop: m.image || '',
        logo: '',
        tmdbId: '',
        driveLink: '',
        certification: '',
        quality: 'HD',
        type: 'manga',
        mangaChapter: m.chapter || '',
        mangaView: m.view || ''
    };
}

async function fetchMangaList(page, type) {
    if (liveFed.manga) return;
    liveFed.manga = 1;
    const grid = document.getElementById('mangaGrid');
    const pager = document.getElementById('mangaPager');
    const st = liveState.manga;
    try {
        const qs = new URLSearchParams();
        qs.set('page', String(page || 1));
        const t = type || st.type || '';
        if (t) qs.set('type', t);
        if (st.state) qs.set('state', st.state);
        if (st.category) qs.set('category', st.category);
        const res = await fetch(`${MANGA_API_BASE}/api/mangaList?${qs.toString()}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const items = (data.mangaList || []).map(mangaItemToItem);
        liveState.manga.items = items;
        liveState.manga.page = page || 1;
        liveState.manga.type = t;
        liveState.manga.totalPages = Math.max(1, (data.metaData && data.metaData.totalPages) || 1);
        mangaPopulateFilters(data.metaData);
    } catch (e) {
        if (grid && (grid.innerHTML.includes('live-loading') || grid.textContent.trim() === 'Loading Manga…')) {
            grid.innerHTML = `<div class="live-error">Couldn't load manga. Make sure the Manga Hook server is running at ${escapeHtml(MANGA_API_BASE)}.</div>`;
        }
    } finally {
        delete liveFed.manga;
        renderMangaGrid(liveState.manga.page || 1);
    }
}

function mangaPopulateFilters(meta) {
    const row = document.getElementById('mangaFilterRow');
    if (!row || row.dataset.done) return;
    if (!meta) return;
    row.dataset.done = '1';
    if (Array.isArray(meta.type)) {
        const sel = document.getElementById('mangaTypeFilter');
        sel.innerHTML = '<option value="">Type: All</option>' + meta.type.map(t => `<option value="${escapeHtml(t.id)}"${t.id === (liveState.manga.type || 'topview') ? ' selected' : ''}>${escapeHtml(t.type)}</option>`).join('');
    }
    if (Array.isArray(meta.state)) {
        const sel = document.getElementById('mangaStateFilter');
        sel.innerHTML = '<option value="">State: All</option>' + meta.state.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.type)}</option>`).join('');
    }
    if (Array.isArray(meta.category)) {
        const sel = document.getElementById('mangaCategoryFilter');
        sel.innerHTML = '<option value="">Category: All</option>' + meta.category.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.type)}</option>`).join('');
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

function createMangaCard(m) {
    const card = document.createElement('div');
    card.className = 'manga-card';
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
            const res = await fetch(`${MANGA_API_BASE}/api/manga/${encodeURIComponent(mangaReader.mangaId)}`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const info = await res.json();
            mangaReader.info = info;
            mangaReader.chapters = Array.isArray(info.chapterList) ? info.chapterList : [];
            renderReaderDetail(info);
            if (mangaReader.chapters.length) {
                openChapter(mangaReader.chapters[0].id);
            } else {
                mrEl('mangaReadPages').innerHTML = '<div class="live-error">No chapters found for this manga.</div>';
            }
        } catch (e) {
            mrEl('mangaReadPages').innerHTML = `<div class="live-error">Couldn't load manga details. Make sure the Manga Hook server is running at ${escapeHtml(MANGA_API_BASE)}.</div>`;
        }
    })();
}

function renderReaderDetail(info) {
    if (info.name) mrEl('mangaReadName').textContent = info.name;
    const meta = [];
    if (info.author) meta.push('✍ ' + info.author);
    if (info.status) meta.push(info.status);
    if (info.view) meta.push('👁 ' + info.view);
    if (info.updated) meta.push('Updated: ' + info.updated);
    mrEl('mangaReadMeta').textContent = meta.join('  ·  ');
    const genresEl = mrEl('mangaReadGenres');
    genresEl.innerHTML = (Array.isArray(info.genres) ? info.genres : []).map(g => `<span class="manga-genre-chip">${escapeHtml(g)}</span>`).join('');
}

async function openChapter(chId) {
    if (!chId || !mangaReader.mangaId) return;
    mangaReader.currentId = chId;
    const pagesEl = mrEl('mangaReadPages');
    pagesEl.innerHTML = '<div class="live-loading">Loading pages…</div>';
    try {
        const res = await fetch(`${MANGA_API_BASE}/api/manga/${encodeURIComponent(mangaReader.mangaId)}/${encodeURIComponent(chId)}`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        mangaReader.images = Array.isArray(data.images) ? data.images : [];
        if (Array.isArray(data.chapterListIds) && data.chapterListIds.length) mangaReader.chapters = data.chapterListIds;
        const chName = (mangaReader.chapters.find(c => c.id === chId) || {}).name || '';
        mrEl('mangaReadChapterLabel').textContent = data.currentChapter || chName || chId;
        renderChapterPages();
        updateReaderNav();
        renderChapterDrawer();
        const body = mrEl('mangaReadBody');
        if (body) body.scrollTop = 0;
    } catch (e) {
        pagesEl.innerHTML = `<div class="live-error">Couldn't load chapter. Make sure the Manga Hook server is running at ${escapeHtml(MANGA_API_BASE)}.</div>`;
    }
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
    return mangaReader.chapters.findIndex(c => c.id === mangaReader.currentId);
}

function updateReaderNav() {
    const idx = chapterIndex();
    mrEl('mangaReadPrev').disabled = idx < 1;
    mrEl('mangaReadNext').disabled = idx < 0 || idx >= mangaReader.chapters.length - 1;
}

function renderChapterDrawer() {
    const list = mrEl('mangaChapterList');
    if (!mangaReader.chapters.length) { list.innerHTML = ''; return; }
    list.innerHTML = mangaReader.chapters.map(c => {
        const active = c.id === mangaReader.currentId ? ' active' : '';
        return `<button class="manga-drawer-item${active}" data-ch="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</button>`;
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
function renderAnime() {
    renderCatalogGrid('animeMovie');
    renderCatalogGrid('animeTv');
}
function handleNavClick(link, e) {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.mobile-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const section = link.dataset.section;
        currentSection = section;
        document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'theaters-active', 'manga-active');
        if (['movies', 'tvshows', 'anime', 'mylist', 'trending', 'streaming', 'theaters', 'manga'].includes(section)) {
            document.body.classList.add(section + '-active');
        }
        const show = (id, v) => document.getElementById(id).style.display = v ? '' : 'none';
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
            show('moviesSection', section === 'home' || section === 'movies');
            show('tvShowsSection', section === 'home' || section === 'tvshows');
            show('myListSection', false);
            show('homeGenres', false);
            show('trendingSection', false);
            show('streamingSection', false);
            show('theatersSection', false);
            document.getElementById('heroSection').style.display = (section === 'home') ? '' : 'none';
            updateHero();
            renderMovies();
            renderTvShows();
            renderGenreRows();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const mpanel = document.getElementById('mobileNavPanel');
        if (mpanel) mpanel.classList.remove('open');
}

document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});
document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', (e) => handleNavClick(link, e));
});

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
        document.getElementById('mobileNavPanel').classList.toggle('open');
    });
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
    const idx = chapterIndex();
    if (idx > 0) openChapter(mangaReader.chapters[idx - 1].id);
});
document.getElementById('mangaReadNext')?.addEventListener('click', () => {
    const idx = chapterIndex();
    if (idx >= 0 && idx < mangaReader.chapters.length - 1) openChapter(mangaReader.chapters[idx + 1].id);
});
document.getElementById('mangaReadList')?.addEventListener('click', () => {
    renderChapterDrawer();
    document.getElementById('mangaDrawer').classList.add('active');
});
document.getElementById('mangaChapterList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.manga-drawer-item');
    if (!btn) return;
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
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link[data-section="home"]').classList.add('active');
    currentSection = 'home';
    document.body.classList.remove('movies-active', 'tvshows-active', 'anime-active', 'mylist-active', 'trending-active', 'streaming-active', 'theaters-active', 'manga-active');
    document.querySelector('#moviesSection .section-title').textContent = 'Movies';
    document.querySelector('#tvShowsSection .section-title').textContent = 'TV Shows';
    ['moviesSection', 'tvShowsSection', 'myListSection', 'heroSection'].forEach(id => document.getElementById(id).style.display = '');
    ['trendingSection', 'streamingSection', 'theatersSection', 'mangaSection', 'homeGenres'].forEach(id => document.getElementById(id).style.display = 'none');
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    } catch (e) { console.error('renderAll error:', e); }
    try { autoLoadHostedLibrary(); } catch (e) { console.error('autoLoadHostedLibrary error:', e); }
    try { enrichMissingLogos(); } catch (e) { console.error('enrichMissingLogos error:', e); }
}
initAll();
