// ==================== DATA STORE ====================
let movies = JSON.parse(localStorage.getItem('sf_movies')) || [];
let tvShows = JSON.parse(localStorage.getItem('sf_tvshows')) || [];
let myList = JSON.parse(localStorage.getItem('sf_mylist')) || [];
let settings = JSON.parse(localStorage.getItem('sf_settings')) || {
    cloakTitle: '',
    cloakFavicon: '',
    cloakLogoText: 'STREAMFLIX',
    cloakLogoImage: '',
    bgColor: '#141414',
    bgImage: '',
    bgOpacity: 30,
    bgBlur: 0,
    activeTheme: ''
};
let uploadedDriveEps = [];
let uploadedFileEps = [];
let currentInfoItem = null;
let currentInfoType = null;

// ==================== UTILITY ====================
function saveData() {
    localStorage.setItem('sf_movies', JSON.stringify(movies));
    localStorage.setItem('sf_tvshows', JSON.stringify(tvShows));
    localStorage.setItem('sf_mylist', JSON.stringify(myList));
    localStorage.setItem('sf_settings', JSON.stringify(settings));
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

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
    'action', 'adventure', 'animation', 'biography', 'comedy', 'crime',
    'documentary', 'drama', 'family', 'fantasy', 'history', 'horror',
    'mystery', 'musical', 'romance', 'scifi', 'sport', 'thriller',
    'war', 'western'
];

const defaultPosters = {
    action: '🎬', adventure: '🧭', animation: '✨', biography: '📖',
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

// ==================== TAB CLOAK ====================
function applyCloak() {
    const title = settings.cloakTitle || 'StreamFlix';
    const favicon = settings.cloakFavicon;
    const logoText = settings.cloakLogoText || 'STREAMFLIX';
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
    const logoText = settings.cloakLogoText || 'STREAMFLIX';

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
    body.style.setProperty('--bg-shadow', color + '66');

    overlay.classList.remove('has-image', 'solid-color');

    if (image) {
        overlay.style.backgroundImage = `url(${image})`;
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
        box.style.backgroundImage = `url(${image})`;
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
    updateHero();
}

function createCard(item, type) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const inList = myList.some(m => m.id === item.id);
    const genre = genArr(item.genre)[0] || 'action';
    let imgHTML = '';
    if (item.poster) {
        imgHTML = `<img class="card-img" src="${item.poster}" alt="${item.title}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`;
    }
    imgHTML += `<div class="card-placeholder" style="${item.poster ? 'display:none' : ''}">${defaultPosters[genre] || '🎬'}</div>`;
    card.innerHTML = `
        <div class="card-badge">${type === 'tv' ? 'TV Show' : 'Movie'}</div>
        ${imgHTML}
        <div class="card-actions">
            <button class="card-action-btn play-btn" data-action="play" title="Play">▶</button>
            <button class="card-action-btn" data-action="list" title="${inList ? 'Remove from My List' : 'Add to My List'}">${inList ? '✓' : '+'}</button>
            <button class="card-action-btn" data-action="info" title="More Info">ℹ</button>
        </div>
        <div class="card-info">
            <div class="card-title">${item.title}</div>
            <div class="card-meta">
                <span class="card-rating">${item.rating ? '★ ' + item.rating : ''}</span>
                <span>${item.year || ''}</span>
            </div>
        </div>
    `;
    card.addEventListener('click', (e) => {
        const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
        if (action === 'play') playItem(item, type);
        else if (action === 'list') toggleMyList(item, type);
        else if (action === 'info') showInfo(item, type);
        else if (!action) showInfo(item, type);
    });
    return card;
}

function renderSlider(containerId, items, type) {
    const slider = document.getElementById(containerId);
    slider.innerHTML = '';
    if (items.length === 0) {
        slider.innerHTML = `<div class="empty-state"><div class="empty-state-icon">${type === 'movie' ? '🎬' : '📺'}</div><p>No ${type === 'movie' ? 'movies' : 'TV shows'} yet.<br>Click "+ Add Content" to get started!</p></div>`;
        return;
    }
    items.forEach(item => slider.appendChild(createCard(item, type)));
}

function renderMovies() { renderSlider('moviesSlider', movies, 'movie'); }
function renderTvShows() { renderSlider('tvShowsSlider', tvShows, 'tv'); }
function renderMyList() { renderSlider('myListSlider', myList, 'mixed'); }

function updateHero() {
    const all = [...movies, ...tvShows];
    if (all.length > 0) {
        const featured = all[Math.floor(Math.random() * all.length)];
        document.getElementById('heroTitle').textContent = featured.title;
        const g = genArr(featured.genre);
        document.getElementById('heroDesc').textContent = featured.description || `A ${g.length ? g.join(', ') : 'great'} ${featured.type || 'title'}. Rating: ${featured.rating || 'N/A'}/10`;
        const bgUrl = featured.backdrop || featured.poster;
        if (bgUrl) {
            document.getElementById('heroSection').style.backgroundImage = `url(${bgUrl})`;
            document.getElementById('heroSection').style.backgroundSize = 'cover';
            document.getElementById('heroSection').style.backgroundPosition = 'center top';
        } else {
            document.getElementById('heroSection').style.backgroundImage = '';
        }
        document.getElementById('heroPlayBtn').onclick = () => playItem(featured, featured.type || 'movie');
        document.getElementById('heroInfoBtn').onclick = () => showInfo(featured, featured.type || 'movie');
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
    renderAll();
}

// ==================== PLAY ====================
function playItem(item, type) {
    const modal = document.getElementById('playerModal');
    const frame = document.getElementById('playerFrame');
    const title = document.getElementById('playerTitle');
    const subtitle = document.getElementById('playerSubtitle');
    const epSelector = document.getElementById('episodeSelector');
    title.textContent = item.title;
    frame.innerHTML = '';

    if (type === 'movie') {
        subtitle.textContent = `${item.year || ''} • ${genArr(item.genre).join(', ') || ''}`;
        const driveLink = convertDriveLink(item.driveLink);
        if (driveLink) {
            frame.innerHTML = `<iframe src="${driveLink}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
        } else {
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source available</div>`;
        }
        epSelector.style.display = 'none';
    } else if (type === 'tv') {
        subtitle.textContent = `Season ${item.season || 1}`;
        if (item.episodes && item.episodes.length > 0) {
            epSelector.style.display = 'block';
            renderEpisodePlaylist(item);
            playEpisode(item, item.episodes[0], 0);
        } else {
            epSelector.style.display = 'none';
            frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No episodes uploaded</div>`;
        }
    }
    modal.classList.add('active');
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
                <div class="ep-title">${ep.name}</div>
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
        frame.innerHTML = `<video controls autoplay style="width:100%;height:100%;background:#000;"><source src="${episode.blobUrl}" type="${episode.type || 'video/mp4'}"></video>`;
    } else if (episode.driveLink) {
        const driveLink = convertDriveLink(episode.driveLink);
        frame.innerHTML = `<iframe src="${driveLink}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else if (episode.url) {
        const driveLink = convertDriveLink(episode.url);
        frame.innerHTML = `<iframe src="${driveLink}" allowfullscreen allow="autoplay; encrypted-media"></iframe>`;
    } else {
        frame.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#888;font-size:18px;">No video source</div>`;
    }
}

// ==================== INFO MODAL ====================
function showInfo(item, type) {
    currentInfoItem = item;
    currentInfoType = type;
    const modal = document.getElementById('infoModal');
    const backdrop = document.getElementById('infoBackdrop');
    const inList = myList.some(m => m.id === item.id);
    const bgUrl = item.backdrop || item.poster;
    const gArr = genArr(item.genre);
    if (bgUrl) {
        backdrop.style.backgroundImage = `url(${bgUrl})`;
        backdrop.innerHTML = '';
    } else {
        backdrop.style.backgroundImage = 'none';
        backdrop.textContent = defaultPosters[gArr[0]] || '🎬';
    }
    document.getElementById('infoTitle').textContent = item.title;
    document.getElementById('infoYear').textContent = item.year || '';
    document.getElementById('infoRating').textContent = item.rating ? '★ ' + item.rating : '';
    document.getElementById('infoGenre').textContent = gArr.map(g => g.charAt(0).toUpperCase() + g.slice(1)).join(', ');
    document.getElementById('infoDesc').textContent = item.description || 'No description available.';
    document.getElementById('infoPlayBtn').onclick = () => { modal.classList.remove('active'); playItem(item, type); };
    document.getElementById('infoListBtn').textContent = inList ? '✓ In My List' : '+ My List';
    document.getElementById('infoListBtn').onclick = () => { toggleMyList(item, type); showInfo(item, type); };
    document.getElementById('infoEditBtn').onclick = () => { modal.classList.remove('active'); openEdit(item, type); };
    document.getElementById('infoDeleteBtn').onclick = () => {
        if (confirm(`Remove "${item.title}" from your library?`)) {
            if (type === 'movie') movies = movies.filter(m => m.id !== item.id);
            else tvShows = tvShows.filter(m => m.id !== item.id);
            myList = myList.filter(m => m.id !== item.id);
            saveData(); renderAll(); modal.classList.remove('active');
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
    editType = type;
    const ctn = document.getElementById('editFormContainer');
    const isMovie = type === 'movie';
    document.getElementById('editModalTitle').textContent = isMovie ? 'Edit Movie' : 'Edit TV Show';

    const g = genArr(item.genre);
    let episodesHTML = '';
    if (!isMovie && item.episodes && item.episodes.length) {
        episodesHTML = item.episodes.map((ep, i) => `
            <div class="edit-ep-row">
                <input type="text" class="edit-ep-name" value="${ep.name || ''}" data-i="${i}" placeholder="Episode name">
                <input type="url" class="edit-ep-src" value="${ep.driveLink || ep.url || ''}" data-i="${i}" placeholder="Drive link or URL">
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
            ${isMovie ? `
            <div class="form-group">
                <label for="editDriveLink">Google Drive Link</label>
                <input type="url" id="editDriveLink" value="${escapeHtml(item.driveLink || '')}">
            </div>` : `
            <div class="form-group">
                <label>Season Number</label>
                <input type="number" id="editSeason" min="1" value="${item.season || 1}">
            </div>
            ${episodesHTML ? `<div class="form-group"><label>Episodes (Google Drive links or URLs)</label>${episodesHTML}</div>` : ''}
            `}
            <button type="submit" class="btn-submit">Save Changes</button>
        </form>
    `;

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
    document.getElementById('editModal').classList.add('active');
}

function escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function saveEdit(e) {
    e.preventDefault();
    if (!editTarget) return;
    const g = Array.from(document.querySelectorAll('#editGenreOptions input[type=checkbox]:checked')).map(cb => cb.value);

    editTarget.title = document.getElementById('editTitle').value.trim();
    editTarget.description = document.getElementById('editDesc').value.trim();
    editTarget.genre = g;
    editTarget.year = document.getElementById('editYear').value;
    editTarget.rating = document.getElementById('editRating').value;
    editTarget.poster = document.getElementById('editPoster').value.trim();
    editTarget.backdrop = document.getElementById('editBackdrop').value.trim();

    if (editType === 'movie') {
        editTarget.driveLink = document.getElementById('editDriveLink').value.trim();
    } else {
        editTarget.season = document.getElementById('editSeason').value || 1;
        const rows = document.querySelectorAll('.edit-ep-row');
        if (rows.length) {
            rows.forEach(row => {
                const i = row.querySelector('.edit-ep-name').dataset.i;
                const name = row.querySelector('.edit-ep-name').value.trim();
                const src = row.querySelector('.edit-ep-src').value.trim();
                if (editTarget.episodes && editTarget.episodes[i]) {
                    editTarget.episodes[i].name = name;
                    editTarget.episodes[i].driveLink = src;
                    editTarget.episodes[i].url = '';
                }
            });
        }
    }

    saveData();
    renderAll();
    document.getElementById('editModal').classList.remove('active');
    toast('Changes saved!', 'success');
}

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
    const driveLink = document.getElementById('movieDriveLink').value.trim();
    if (!title || !driveLink) { toast('Please fill in the title and Google Drive link.', 'error'); return; }
    movies.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, driveLink, type: 'movie' });
    saveData();
    renderAll();
    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');
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
            <span class="ep-name" title="${ep.name}">${ep.name}</span>
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
            <span class="ep-name" title="${ep.name}">${ep.name}</span>
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
    const season = document.getElementById('tvSeason').value;
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

    tvShows.push({ id: generateId(), title, description: desc, genre, year, rating, poster, backdrop, season: season || 1, episodes, type: 'tv' });
    saveData();
    renderAll();

    document.getElementById('addContentModal').classList.remove('active');
    toast(`"${title}" added successfully!`, 'success');

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
document.getElementById('searchInput').addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    if (!query) { renderAll(); return; }
    const matches = (m) => m.title.toLowerCase().includes(query) || (m.description || '').toLowerCase().includes(query) || genArr(m.genre).join(' ').toLowerCase().includes(query);
    const filteredMovies = movies.filter(matches);
    const filteredTv = tvShows.filter(matches);
    renderSlider('moviesSlider', filteredMovies, 'movie');
    renderSlider('tvShowsSlider', filteredTv, 'tv');
});
document.getElementById('searchBtn').addEventListener('click', () => document.getElementById('searchInput').focus());

// ==================== ABOUT:BLANK OPENER ====================
document.getElementById('aboutBlankBtn').addEventListener('click', () => {
    const cloakTitle = settings.cloakTitle || 'StreamFlix';
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
var m=u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
if(m)u='https://drive.google.com/file/d/'+m[1]+'/preview';
else if(u.includes('drive.google.com'))u=u.replace('/view','/preview').replace('/edit','/preview');
document.getElementById('videoFrame').src=u;
document.getElementById('player').style.display='block';
}
function loadDriveVideo(){
var u=document.getElementById('driveUrl').value.trim();
if(!u)return;
var m=u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
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
});

// ==================== SETTINGS ====================
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('active');
    document.querySelectorAll('.theme-card').forEach(c => {
        c.classList.toggle('active', c.dataset.theme === settings.activeTheme);
    });
    document.querySelectorAll('.preset-color').forEach(c => {
        c.classList.toggle('active', c.dataset.color === settings.bgColor);
    });
});

document.getElementById('applyCloakBtn').addEventListener('click', () => {
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

// ==================== NAVIGATION ====================
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const section = link.dataset.section;
        const show = (id, v) => document.getElementById(id).style.display = v ? '' : 'none';
        show('moviesSection', section === 'home' || section === 'movies');
        show('tvShowsSection', section === 'home' || section === 'tvshows');
        show('myListSection', section === 'home' || section === 'mylist');
        document.getElementById('heroSection').style.display = section === 'mylist' ? 'none' : '';
    });
});

// ==================== MODALS ====================
document.getElementById('addContentBtn').addEventListener('click', () => document.getElementById('addContentModal').classList.add('active'));
document.getElementById('closeModal').addEventListener('click', () => document.getElementById('addContentModal').classList.remove('active'));
document.getElementById('closePlayer').addEventListener('click', () => { document.getElementById('playerModal').classList.remove('active'); document.getElementById('playerFrame').innerHTML = ''; });
document.getElementById('closeInfo').addEventListener('click', () => document.getElementById('infoModal').classList.remove('active'));
document.getElementById('closeEdit').addEventListener('click', () => document.getElementById('editModal').classList.remove('active'));
document.getElementById('closeSettings').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));

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
document.querySelectorAll('.slider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const slider = document.getElementById(btn.dataset.slider);
        slider.scrollBy({ left: btn.classList.contains('slider-left') ? -600 : 600, behavior: 'smooth' });
    });
});

// ==================== SCROLL NAVBAR ====================
window.addEventListener('scroll', () => {
    document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ==================== FOOTER LINKS ====================
document.getElementById('footerHelp').addEventListener('click', (e) => { e.preventDefault(); toast('Help: Add movies with Google Drive links, upload TV episodes, and click Play to watch!'); });
document.getElementById('footerTerms').addEventListener('click', (e) => { e.preventDefault(); toast('For personal use only. StreamFlix is a personal media organizer.'); });
document.getElementById('footerPrivacy').addEventListener('click', (e) => { e.preventDefault(); toast('All data is stored locally in your browser. Nothing is sent to any server.'); });
document.getElementById('footerContact').addEventListener('click', (e) => { e.preventDefault(); toast('StreamFlix - Built with love for streaming enthusiasts.'); });

// ==================== LOGO CLICK ====================
document.getElementById('logoWrap').addEventListener('click', (e) => {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector('.nav-link[data-section="home"]').classList.add('active');
    ['moviesSection', 'tvShowsSection', 'myListSection', 'heroSection'].forEach(id => document.getElementById(id).style.display = '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ==================== INIT ====================
initGenreOptions();
applyCloak();
applyBackground();
renderAll();
