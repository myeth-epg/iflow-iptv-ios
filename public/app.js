// iFlow IPTV Universal Apple Player Engine (iPadOS & macOS)
// Implements Category Engine Routing Table, EPG matching, and speedometer

let allChannels = [];
let groupedChannels = {};
let currentCategory = 'ALL';
let activeChannel = null;
let hlsInstance = null;
let shakaPlayer = null;
let epgDatabase = {}; // channelId -> array of programs

const videoElement = document.getElementById('video-player');
const drawerPanel = document.getElementById('drawer-panel');
const qsPanel = document.getElementById('qs-panel');
const backdrop = document.getElementById('backdrop');
const groupList = document.getElementById('group-list');
const channelList = document.getElementById('channel-list');
const channelSearch = document.getElementById('channel-search');
const speedVal = document.getElementById('speed-val');
const labelChannelCurrent = document.getElementById('label-channel-current');
const epgOsd = document.getElementById('epg-osd');
const aspectVal = document.getElementById('aspect-val');

// Aspect Ratios: Default -> Stretch -> 16:9 -> 4:3
const aspectRatios = ['Default', 'Stretch', '16:9', '4:3'];
let aspectIndex = 0;

// Initialize Shaka Player polyfills
shaka.polyfill.installAll();

async function init() {
    setupUIEvents();
    startDownloadSpeedometer();
    await loadConfigAndPlaylist();
}

function setupUIEvents() {
    // Open / Close Drawer
    document.getElementById('btn-open-menu').addEventListener('click', () => {
        drawerPanel.classList.add('open');
        backdrop.classList.add('active');
    });

    // Open / Close Quick Settings
    document.getElementById('btn-open-qs').addEventListener('click', () => {
        qsPanel.classList.add('open');
        backdrop.classList.add('active');
    });

    document.getElementById('btn-close-qs').addEventListener('click', () => {
        qsPanel.classList.remove('open');
        backdrop.classList.remove('active');
    });

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const inputPlaylist = document.getElementById('input-playlist-url');
    const inputEpg = document.getElementById('input-epg-url');

    document.getElementById('btn-settings').addEventListener('click', () => {
        inputPlaylist.value = localStorage.getItem('iflow_playlist_url') || '';
        inputEpg.value = localStorage.getItem('iflow_epg_url') || '';
        settingsModal.style.display = 'flex';
        qsPanel.classList.remove('open');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
        settingsModal.style.display = 'none';
        backdrop.classList.remove('active');
    });

    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const pUrl = inputPlaylist.value.trim();
        const eUrl = inputEpg.value.trim();
        localStorage.setItem('iflow_playlist_url', pUrl);
        localStorage.setItem('iflow_epg_url', eUrl);
        
        // Also sync to server if running via backend
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlistUrl: pUrl, epgUrl: eUrl })
            });
        } catch (e) {}

        settingsModal.style.display = 'none';
        backdrop.classList.remove('active');
        await loadConfigAndPlaylist();
    });

    // Backdrop Click
    backdrop.addEventListener('click', () => {
        drawerPanel.classList.remove('open');
        qsPanel.classList.remove('open');
        settingsModal.style.display = 'none';
        backdrop.classList.remove('active');
    });

    // Channel Search
    channelSearch.addEventListener('input', (e) => {
        filterChannels(e.target.value);
    });

    // Aspect Ratio Toggle
    document.getElementById('btn-aspect').addEventListener('click', () => {
        aspectIndex = (aspectIndex + 1) % aspectRatios.length;
        const currentMode = aspectRatios[aspectIndex];
        aspectVal.textContent = currentMode;
        applyAspectRatio(currentMode);
    });

    // Picture-in-Picture
    document.getElementById('btn-pip').addEventListener('click', async () => {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else if (videoElement.webkitSupportsPresentationMode && typeof videoElement.webkitSetPresentationMode === 'function') {
            // Safari iOS / iPadOS native PiP
            videoElement.webkitSetPresentationMode('picture-in-picture');
        } else if (document.pictureInPictureEnabled) {
            await videoElement.requestPictureInPicture();
        }
    });

    // AirPlay
    document.getElementById('btn-airplay').addEventListener('click', () => {
        if (window.WebKitPlaybackTargetAvailabilityEvent) {
            videoElement.webkitShowPlaybackTargetPicker();
        } else {
            alert('AirPlay is available directly via iOS Control Center.');
        }
    });

    // Reload Playlist
    document.getElementById('btn-reload').addEventListener('click', () => {
        loadConfigAndPlaylist();
        qsPanel.classList.remove('open');
        backdrop.classList.remove('active');
    });

    // Video Tap triggers EPG OSD
    videoElement.addEventListener('click', () => {
        showEpgOsdTemporarily();
    });
}

function applyAspectRatio(mode) {
    videoElement.className = '';
    if (mode === 'Stretch') {
        videoElement.classList.add('aspect-stretch');
    } else if (mode === '16:9') {
        videoElement.classList.add('aspect-16-9');
    } else if (mode === '4:3') {
        videoElement.classList.add('aspect-4-3');
    }
}

// Category Engine Routing Table (Standardized from Windows Beta 3.13 & MACOS_IPTV_REFERENCE_OCT2026.md)
function routeEngine(category) {
    const group = (category || '').trim().toUpperCase();
    
    // Explicit Substring Guards (prevent HK-II from matching HK-I, and MY-II from matching MY-I)
    const isHk1 = group.includes('HK-I') && !group.includes('HK-II');
    const isMy1 = group.includes('MY-I') && !group.includes('MY-II');
    const isCa  = group === 'CA' || group.startsWith('CA-') || group.startsWith('CA ') || group.includes('CANADA');
    const isUk  = group === 'UK' || group.startsWith('UK-') || group.startsWith('UK ');
    const isCn  = group === 'CN' || group.startsWith('CN-') || group.startsWith('CN ') || group.includes('CHINA');

    const useWebEngine = isMy1 || isHk1 || isCa || isUk || isCn ||
                         group.includes('TW-III') || group.includes('TW-VI') || 
                         group.includes('NZ-I') || group.includes('CA-II') || 
                         group.includes('MUSIC');

    return useWebEngine ? 'HLS_SHAKA' : 'NATIVE_HLS';
}

// Load Playlist & EPG
async function loadConfigAndPlaylist() {
    try {
        let pUrl = localStorage.getItem('iflow_playlist_url') || '';
        let eUrl = localStorage.getItem('iflow_epg_url') || '';

        // If not in localStorage, check server
        if (!pUrl) {
            try {
                const configRes = await fetch('/api/config');
                const config = await configRes.json();
                pUrl = config.playlistUrl || '';
                eUrl = config.epgUrl || '';
            } catch (e) {}
        }

        if (!pUrl) {
            // Prompt user cleanly
            labelChannelCurrent.textContent = 'Please configure Playlist in Settings ⚙️';
            document.getElementById('settings-modal').style.display = 'flex';
            return;
        }

        // Fetch M3U Playlist (Direct or via proxy fallback)
        let m3uText = '';
        try {
            const playlistProxyUrl = `/proxy?url=${encodeURIComponent(pUrl)}`;
            const m3uRes = await fetch(playlistProxyUrl);
            m3uText = await m3uRes.text();
        } catch (proxyErr) {
            const directRes = await fetch(pUrl);
            m3uText = await directRes.text();
        }

        parseM3U(m3uText);
        renderCategories();

        if (allChannels.length > 0) {
            playChannel(allChannels[0]);
        }

        if (eUrl) {
            fetchEPG(eUrl);
        }
    } catch (err) {
        console.error('Failed to load playlist:', err);
    }
}

// M3U Parser
function parseM3U(content) {
    const lines = content.split('\n');
    allChannels = [];
    groupedChannels = { 'ALL': [] };

    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
            currentItem = {};
            
            // Extract tvg-id
            const idMatch = line.match(/tvg-id="([^"]+)"/i);
            currentItem.tvgId = idMatch ? idMatch[1] : '';

            // Extract tvg-logo
            const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
            currentItem.logo = logoMatch ? logoMatch[1] : '';

            // Extract group-title
            const groupMatch = line.match(/group-title="([^"]+)"/i);
            currentItem.category = groupMatch ? groupMatch[1].trim() : 'Other';

            // Extract Title
            const commaIndex = line.lastIndexOf(',');
            currentItem.title = commaIndex !== -1 ? line.substring(commaIndex + 1).trim() : 'Unknown Channel';
        } else if (line.length > 0 && !line.startsWith('#') && currentItem) {
            currentItem.url = line;
            allChannels.push(currentItem);

            const cat = currentItem.category;
            if (!groupedChannels[cat]) {
                groupedChannels[cat] = [];
            }
            groupedChannels[cat].push(currentItem);
            groupedChannels['ALL'].push(currentItem);

            currentItem = null;
        }
    }
}

// Render Categories in Sidebar
function renderCategories() {
    groupList.innerHTML = '';
    const categories = Object.keys(groupedChannels);

    categories.forEach(cat => {
        const li = document.createElement('li');
        li.className = `group-item ${cat === currentCategory ? 'active' : ''}`;
        li.textContent = `${cat} (${groupedChannels[cat].length})`;
        li.addEventListener('click', () => {
            currentCategory = cat;
            document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            renderChannels(groupedChannels[cat]);
        });
        groupList.appendChild(li);
    });

    renderChannels(groupedChannels[currentCategory] || allChannels);
}

// Render Channel List
function renderChannels(channels) {
    channelList.innerHTML = '';
    channels.forEach(ch => {
        const li = document.createElement('li');
        li.className = `channel-item ${activeChannel === ch ? 'active' : ''}`;
        
        const titleEl = document.createElement('div');
        titleEl.className = 'channel-title';
        titleEl.textContent = ch.title;

        const epgEl = document.createElement('div');
        epgEl.className = 'channel-epg-now';
        epgEl.textContent = getNowPlayingText(ch.tvgId);

        li.appendChild(titleEl);
        li.appendChild(epgEl);

        li.addEventListener('click', () => {
            playChannel(ch);
            drawerPanel.classList.remove('open');
            backdrop.classList.remove('active');
        });

        channelList.appendChild(li);
    });
}

function filterChannels(keyword) {
    const kw = keyword.toLowerCase().trim();
    if (!kw) {
        renderChannels(groupedChannels[currentCategory] || allChannels);
        return;
    }
    const filtered = allChannels.filter(c => c.title.toLowerCase().includes(kw) || (c.category && c.category.toLowerCase().includes(kw)));
    renderChannels(filtered);
}

// Play Channel with Routing Engine
async function playChannel(channel) {
    activeChannel = channel;
    labelChannelCurrent.textContent = channel.title;

    // Destroy existing players
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
    if (shakaPlayer) {
        await shakaPlayer.destroy();
        shakaPlayer = null;
    }

    const engine = routeEngine(channel.category);
    const streamUrl = `/proxy?url=${encodeURIComponent(channel.url)}`;

    // Safari iOS / iPadOS native HLS support
    if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = streamUrl;
        videoElement.play().catch(e => console.log('Autoplay handled:', e));
    } else if (Hls.isSupported()) {
        hlsInstance = new Hls({
            enableWorker: true,
            lowLatencyMode: true
        });
        hlsInstance.loadSource(streamUrl);
        hlsInstance.attachMedia(videoElement);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            videoElement.play().catch(e => console.log('Autoplay handled:', e));
        });
    }

    updateEpgOsd(channel);
    showEpgOsdTemporarily();
}

// EPG Parser & Matcher
async function fetchEPG(url) {
    try {
        const epgProxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
        const res = await fetch(epgProxyUrl);
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const programmes = xmlDoc.getElementsByTagName('programme');
        epgDatabase = {};

        for (let i = 0; i < programmes.length; i++) {
            const p = programmes[i];
            const chId = p.getAttribute('channel');
            const start = p.getAttribute('start');
            const stop = p.getAttribute('stop');
            const titleNode = p.getElementsByTagName('title')[0];
            const title = titleNode ? titleNode.textContent : 'Unknown';

            if (!epgDatabase[chId]) {
                epgDatabase[chId] = [];
            }
            epgDatabase[chId].push({ start, stop, title });
        }
    } catch (e) {
        console.error('EPG load error:', e);
    }
}

function getNowPlayingText(tvgId) {
    if (!tvgId || !epgDatabase[tvgId]) return '▶ Live Stream';
    const now = new Date();
    const programs = epgDatabase[tvgId];
    // Find current program
    for (const prog of programs) {
        // epg format YYYYMMDDHHmmss
        const start = parseEpgDate(prog.start);
        const stop = parseEpgDate(prog.stop);
        if (now >= start && now <= stop) {
            return `▶ ${prog.title}`;
        }
    }
    return '▶ Live Broadcast';
}

function parseEpgDate(dStr) {
    if (!dStr) return new Date();
    const clean = dStr.split(' ')[0];
    const y = clean.substring(0, 4);
    const m = clean.substring(4, 6) - 1;
    const d = clean.substring(6, 8);
    const h = clean.substring(8, 10);
    const min = clean.substring(10, 12);
    const s = clean.substring(12, 14);
    return new Date(Date.UTC(y, m, d, h, min, s));
}

function updateEpgOsd(channel) {
    const nowTitle = document.getElementById('osd-now-title');
    const nowTime = document.getElementById('osd-now-time');
    const nextTitle = document.getElementById('osd-next-title');
    const nextTime = document.getElementById('osd-next-time');

    if (!channel.tvgId || !epgDatabase[channel.tvgId]) {
        nowTitle.textContent = channel.title;
        nowTime.textContent = 'Live Broadcast / 直播';
        nextTitle.textContent = 'Scheduled Program';
        nextTime.textContent = '--:-- - --:--';
        return;
    }

    const progs = epgDatabase[channel.tvgId];
    const now = new Date();
    let current = null;
    let next = null;

    for (let i = 0; i < progs.length; i++) {
        const start = parseEpgDate(progs[i].start);
        const stop = parseEpgDate(progs[i].stop);
        if (now >= start && now <= stop) {
            current = progs[i];
            if (i + 1 < progs.length) next = progs[i + 1];
            break;
        }
    }

    if (current) {
        nowTitle.textContent = current.title;
        nowTime.textContent = formatRange(current.start, current.stop);
    } else {
        nowTitle.textContent = channel.title;
        nowTime.textContent = 'Live Broadcast';
    }

    if (next) {
        nextTitle.textContent = next.title;
        nextTime.textContent = formatRange(next.start, next.stop);
    } else {
        nextTitle.textContent = 'Up Next Program';
        nextTime.textContent = '--:--';
    }
}

function formatRange(startStr, stopStr) {
    const s = parseEpgDate(startStr);
    const e = parseEpgDate(stopStr);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(s.getHours())}:${pad(s.getMinutes())} - ${pad(e.getHours())}:${pad(e.getMinutes())}`;
}

let osdTimer = null;
function showEpgOsdTemporarily() {
    epgOsd.classList.add('show');
    if (osdTimer) clearTimeout(osdTimer);
    osdTimer = setTimeout(() => {
        epgOsd.classList.remove('show');
    }, 5000);
}

// Download Speedometer (matching Android Beta 3.20 styling)
let lastBytes = 0;
let lastTime = Date.now();
function startDownloadSpeedometer() {
    setInterval(() => {
        if (!videoElement) return;
        const now = Date.now();
        const deltaSec = (now - lastTime) / 1000;
        
        let currentBytes = 0;
        if (videoElement.webkitAudioDecodedByteCount) {
            currentBytes = (videoElement.webkitAudioDecodedByteCount || 0) + (videoElement.webkitVideoDecodedByteCount || 0);
        } else if (hlsInstance && hlsInstance.stats) {
            currentBytes = hlsInstance.stats.total || 0;
        }

        const deltaBytes = Math.max(0, currentBytes - lastBytes);
        const bps = deltaSec > 0 ? (deltaBytes / deltaSec) : 0;
        const kbps = bps / 1024;

        if (kbps >= 1024) {
            speedVal.textContent = `${(kbps / 1024).toFixed(1)} MB/s`;
        } else {
            speedVal.textContent = `${kbps.toFixed(0)} KB/s`;
        }

        lastBytes = currentBytes;
        lastTime = now;
    }, 1000);
}

// Launch app
window.addEventListener('DOMContentLoaded', init);
