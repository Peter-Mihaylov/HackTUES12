import { findPointsOfInterestWithinDistance } from './routeDistance.js';
import { addPOIData, loadPOIData, getAllPOIs, addReviewToPOI, getPOIById } from './reviewsData.js';
import { getAccessToken, logout } from './auth.js';

let map;
let startMarker = null;
let destMarker = null;
let currentRouteLayer = null;
let activePinMode = null;
let pendingClickCoords = null;
let allPOIs = [];

// Default coords
let startCoords = { lat: 42.6977, lng: 23.3219 };
let destCoords  = { lat: 42.1354, lng: 24.7453 };

// Waypoint list: each entry { poiId, coords: {lat,lng}, name }
let routeWaypoints = [];
const MAX_ROUTE_WAYPOINTS = 10;

// Label strings kept in JS variables so they are always current,
// regardless of whether the DOM inputs have been populated yet.
let startLabel = 'Sofia (default)';
let destLabel  = 'Plovdiv (default)';

// Restore persisted state immediately on load
const _savedRoute = (() => {
    try { return JSON.parse(sessionStorage.getItem('routeState')); } catch (e) { return null; }
})();

if (_savedRoute) {
    if (_savedRoute.startCoords) startCoords    = _savedRoute.startCoords;
    if (_savedRoute.destCoords)  destCoords     = _savedRoute.destCoords;
    if (_savedRoute.waypoints)   routeWaypoints = _savedRoute.waypoints;
    if (_savedRoute.startLabel)  startLabel     = _savedRoute.startLabel;
    if (_savedRoute.destLabel)   destLabel      = _savedRoute.destLabel;
}

function saveRouteState() {
    try {
        sessionStorage.setItem('routeState', JSON.stringify({
            startCoords,
            destCoords,
            startLabel,
            destLabel,
            waypoints: routeWaypoints
        }));
    } catch (e) { /* storage full or unavailable */ }
}

// Always save before the page unloads (back button, tab close, any navigation)
window.addEventListener('beforeunload', saveRouteState);

// ============================================================
// UTILITIES
// ============================================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function showToast(msg, isSuccess = true) {
    const t = document.createElement('div');
    t.style.cssText = [
        'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
        `background:${isSuccess ? '#2c7da0' : '#d00000'}`, 'color:white',
        'padding:12px 24px', 'border-radius:40px', 'font-size:0.9rem', 'font-weight:500',
        'z-index:3000', 'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
        'display:flex', 'align-items:center', 'gap:8px', 'max-width:90vw'
    ].join(';');
    t.innerHTML = isSuccess
        ? `<i class="fas fa-check-circle"></i> ${msg}`
        : `<i class="fas fa-times-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function syncAuthButtonState() {
    const btn = document.getElementById('loginBtnHeader');
    if (!btn) return;
    btn.innerHTML = getAccessToken()
        ? '<i class="fas fa-sign-out-alt"></i> Log out'
        : '<i class="fas fa-sign-in-alt"></i> Log in';
}

// ============================================================
// WAYPOINT BADGE UI
// ============================================================

function renderWaypointBadges() {
    let container = document.getElementById('waypointBadgesContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'waypointBadgesContainer';
        container.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:0 2px;';
        const infoCard = document.querySelector('.info-card');
        if (infoCard && infoCard.parentNode) {
            infoCard.parentNode.insertBefore(container, infoCard.nextSibling);
        }
    }

    container.innerHTML = '';
    if (routeWaypoints.length === 0) return;

    const header = document.createElement('div');
    header.style.cssText = 'font-size:0.75rem;font-weight:600;color:#4b5563;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;display:flex;align-items:center;gap:6px;';
    header.innerHTML = `<i class="fas fa-route" style="color:#2c7da0"></i> Route stops (${routeWaypoints.length}/${MAX_ROUTE_WAYPOINTS})`;
    container.appendChild(header);

    routeWaypoints.forEach((wp, idx) => {
        const badge = document.createElement('div');
        badge.style.cssText = 'background:#eef2ff;border:1px solid #c7d2fe;border-radius:40px;padding:5px 10px 5px 8px;display:flex;align-items:center;gap:8px;font-size:0.78rem;color:#1e293b;';
        badge.innerHTML = `
            <span style="background:#2c7da0;color:white;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0;">${idx + 1}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(wp.name)}</span>
            <button data-idx="${idx}" title="Remove stop" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:0.85rem;padding:0;line-height:1;flex-shrink:0;"><i class="fas fa-times-circle"></i></button>
        `;
        badge.querySelector('button').addEventListener('click', () => removeWaypoint(idx));
        container.appendChild(badge);
    });
}

async function removeWaypoint(idx) {
    const removed = routeWaypoints.splice(idx, 1)[0];
    saveRouteState();
    renderWaypointBadges();
    showToast(`Removed "${removed.name}" from route`, true);
    await rebuildRoute();
}

// ============================================================
// CORE ROUTING
// ============================================================

async function rebuildRoute() {
    const allCoords = [startCoords, ...routeWaypoints.map(wp => wp.coords), destCoords];
    const coordStr  = allCoords.map(c => `${c.lng},${c.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false&alternatives=false`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Routing failed');
        const data = await res.json();

        if (!data.routes || data.routes.length === 0) {
            showToast('Could not find a route through all stops', false);
            return;
        }

        const route      = data.routes[0];
        const distanceKm = route.distance / 1000;
        const totalSecs  = route.duration;
        const hours      = Math.floor(totalSecs / 3600);
        const mins       = Math.floor((totalSecs % 3600) / 60);
        const timeText   = hours > 0 ? `${hours}h ${mins}min` : `${mins} min`;

        const latLngs = route.geometry.coordinates.map(c => L.latLng(c[1], c[0]));
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        currentRouteLayer = L.polyline(latLngs, { color: '#2c7da0', weight: 5, opacity: 0.9 }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });

        document.getElementById('distanceKm').innerText = distanceKm.toFixed(1) + ' km';
        document.getElementById('travelTime').innerText = timeText;

        updatePOIVisibility(parseFloat(document.getElementById('distanceSlider').value));

    } catch (err) {
        console.error(err);
        document.getElementById('distanceKm').innerText = 'error';
        document.getElementById('travelTime').innerText = '--';
    }
}

// ============================================================
// GLOBAL HANDLERS (called from popup HTML)
// ============================================================

window.openReviewPage = function(poiId) {
    saveRouteState();   // guarantee state is written before navigation
    window.location.href = `review.html?id=${poiId}`;
};

window.addToRoute = async function(poiId) {
    const poi = getPOIById(poiId);
    if (!poi) { showToast('POI not found', false); return; }

    if (routeWaypoints.length >= MAX_ROUTE_WAYPOINTS) {
        showToast(
            `Route is full! Max ${MAX_ROUTE_WAYPOINTS} stops allowed. Remove one first.`,
            false
        );
        return;
    }

    if (routeWaypoints.some(wp => wp.poiId === poiId)) {
        showToast(`"${poi.name}" is already a stop on your route.`, false);
        return;
    }

    routeWaypoints.push({ poiId, coords: { lat: poi.lat, lng: poi.lng }, name: poi.name });
    saveRouteState();
    renderWaypointBadges();

    const stopWord = routeWaypoints.length === 1 ? 'stop' : 'stops';
    showToast(`Added "${poi.name}" — ${routeWaypoints.length} ${stopWord} on route. Recalculating...`, true);

    await rebuildRoute();
};

// ============================================================
// ADDRESS SEARCH
// ============================================================

async function searchAddress(query, countryCode = 'bg') {
    if (!query.trim() || query.trim().length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${countryCode}&limit=6&addressdetails=1&accept-language=bg,en`;
    try {
        const data = await (await fetch(url)).json();
        return data.map(item => ({
            lat: parseFloat(item.lat), lng: parseFloat(item.lon),
            displayName: item.display_name,
            mainText: item.display_name.split(',')[0],
            subText:  item.display_name.split(',').slice(1).join(',').trim()
        }));
    } catch (err) { console.error('Search error:', err); return []; }
}

function setupAddressSearch(inputEl, suggestionsEl, onSelect, isStart) {
    let timer = null;

    inputEl.addEventListener('input', async e => {
        const q = e.target.value;
        if (q.length < 2) { suggestionsEl.classList.remove('show'); suggestionsEl.innerHTML = ''; return; }
        clearTimeout(timer);
        timer = setTimeout(async () => {
            const results = await searchAddress(q);
            suggestionsEl.innerHTML = '';
            if (!results.length) {
                suggestionsEl.innerHTML = '<div class="suggestion-item" style="color:#9ca3af">No results found</div>';
                suggestionsEl.classList.add('show');
                return;
            }
            results.forEach(r => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `<div class="suggestion-main">${escapeHtml(r.mainText)}</div><div class="suggestion-sub">${escapeHtml(r.subText || r.displayName.substring(0, 60))}</div>`;
                div.addEventListener('click', () => {
                    onSelect({ lat: r.lat, lng: r.lng }, r.displayName);
                    inputEl.value = r.displayName;
                    suggestionsEl.classList.remove('show');
                    document.getElementById(isStart ? 'startPinStatus' : 'destPinStatus').innerHTML = `${r.displayName.substring(0, 50)}`;
                    map.setView([r.lat, r.lng], 13);
                });
                suggestionsEl.appendChild(div);
            });
            suggestionsEl.classList.add('show');
        }, 400);
    });

    document.addEventListener('click', e => {
        if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target))
            suggestionsEl.classList.remove('show');
    });

    inputEl.addEventListener('keypress', async e => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const q = inputEl.value;
        if (q.length < 2) return;
        const results = await searchAddress(q);
        if (results.length) {
            const r = results[0];
            onSelect({ lat: r.lat, lng: r.lng }, r.displayName);
            inputEl.value = r.displayName;
            suggestionsEl.classList.remove('show');
            document.getElementById(isStart ? 'startPinStatus' : 'destPinStatus').innerHTML = `${r.displayName.substring(0, 50)}`;
            map.setView([r.lat, r.lng], 13);
        } else {
            alert('No address found in Bulgaria. Please try a different search.');
        }
    });
}

// ============================================================
// MARKER PLACEMENT
// ============================================================

// _skipRebuild = true is used during initMap so we fire exactly ONE
// rebuildRoute after both markers are placed.
function updateStart(coords, label, _skipRebuild) {
    startCoords = coords;
    if (label) startLabel = label;
    const inp = document.getElementById('startSearchInput');
    if (inp && label) inp.value = label;
    saveRouteState();

    if (startMarker) map.removeLayer(startMarker);
    startMarker = L.marker([coords.lat, coords.lng], {
        draggable: true,
        icon: L.divIcon({
            html: '<div style="background:#2b9348;width:28px;height:28px;border-radius:50% 50% 2px 50%;border:2px solid white;display:flex;align-items:center;justify-content:center;"><i class="fas fa-flag" style="color:white;font-size:12px;"></i></div>',
            iconSize: [28, 28], className: 'start-flag-icon'
        })
    }).addTo(map);
    startMarker.bindTooltip(`Start: ${label || 'Pin'}`, { permanent: false });
    startMarker.on('dragend', e => {
        const pos = e.target.getLatLng();
        startCoords = { lat: pos.lat, lng: pos.lng };
        startLabel  = `Pin: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
        saveRouteState();
        rebuildRoute();
    });

    if (!_skipRebuild) rebuildRoute();
}

function updateDest(coords, label, _skipRebuild) {
    destCoords = coords;
    if (label) destLabel = label;
    const inp = document.getElementById('destSearchInput');
    if (inp && label) inp.value = label;
    saveRouteState();

    if (destMarker) map.removeLayer(destMarker);
    destMarker = L.marker([coords.lat, coords.lng], {
        draggable: true,
        icon: L.divIcon({
            html: '<div style="background:#d00000;width:28px;height:28px;border-radius:50% 50% 2px 50%;border:2px solid white;display:flex;align-items:center;justify-content:center;"><i class="fas fa-flag-checkered" style="color:white;font-size:12px;"></i></div>',
            iconSize: [28, 28], className: 'dest-flag-icon'
        })
    }).addTo(map);
    destMarker.bindTooltip(`Dest: ${label || 'Pin'}`, { permanent: false });
    destMarker.on('dragend', e => {
        const pos = e.target.getLatLng();
        destCoords = { lat: pos.lat, lng: pos.lng };
        destLabel  = `Pin: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}`;
        saveRouteState();
        rebuildRoute();
    });

    if (!_skipRebuild) rebuildRoute();
}

// ============================================================
// POI VISIBILITY
// ============================================================

function updatePOIVisibility(distanceKm) {
    const countSpan = document.getElementById('poiCountDisplay');
    if (!currentRouteLayer || allPOIs.length === 0) {
        if (countSpan) countSpan.innerHTML = '0 POIs visible';
        return;
    }
    const routeCoords = currentRouteLayer.getLatLngs().map(p => [p.lng, p.lat]);
    const visible     = findPointsOfInterestWithinDistance(routeCoords, allPOIs, distanceKm * 1000);
    allPOIs.forEach(m => { if (m._map) m._map.removeLayer(m); });
    visible.forEach(m => { if (!m._map && map) m.addTo(map); });
    if (countSpan) countSpan.innerHTML = `${visible.length} POI${visible.length !== 1 ? 's' : ''} visible`;
}

// ============================================================
// POI ICONS & POPUPS
// ============================================================

function getIconForType(type, emoji) {
    if (emoji) {
        const s = String(emoji).trim();
        const inner = /^https?:\/\//i.test(s)
            ? `<img src="${escapeHtml(s)}" style="width:20px;height:20px;object-fit:cover;border-radius:50%;" />`
            : `<span style="font-size:18px;line-height:1;">${escapeHtml(s)}</span>`;
        return L.divIcon({ html: `<div style="background:#2563eb;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.2);">${inner}</div>`, iconSize: [32, 32], className: 'poi-icon', popupAnchor: [0, -16] });
    }
    const map2 = {
        food:          ['#f59e0b', '<span style="font-size:16px;line-height:1;">🍅</span>'],
        clothing:      ['#3b82f6', '<i class="fas fa-tshirt" style="color:white;font-size:16px;"></i>'],
        drinks:        ['#06b6d4', '<span style="font-size:16px;line-height:1;">🥤</span>'],
        entertainment: ['#8b5cf6', '<i class="fas fa-film" style="color:white;font-size:16px;"></i>'],
    };
    const [bg, inner] = map2[type] || ['#6b7280', '<i class="fas fa-map-pin" style="color:white;font-size:16px;"></i>'];
    return L.divIcon({ html: `<div style="background:${bg};width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,.2);">${inner}</div>`, iconSize: [32, 32], className: 'poi-icon', popupAnchor: [0, -16] });
}

function getEmojiForType(type) {
    return { food: '🍅', clothing: '👕', drinks: '🥤', other: '📍' }[type] || '📍';
}

function buildPopupContent(poiId, name, type, description, rating, reviewCount) {
    const labels = { food: '🍅 Food', clothing: '👕 Clothing', drinks: '🥤 Drinks', other: '📍 Other' };
    const stars  = rating > 0
        ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
        : 'No rating';
    const onRoute = routeWaypoints.some(wp => wp.poiId === poiId);
    return `<div style="min-width:200px;">
        <strong style="font-size:1rem;">${escapeHtml(name)}</strong><br>
        <span style="color:#2c7da0;font-size:0.8rem;">${labels[type] || type}</span><br>
        ${description ? `<p style="margin:6px 0;font-size:0.8rem;">${escapeHtml(description)}</p>` : ''}
        <div style="color:#fbbf24;font-size:0.9rem;margin:4px 0;">${stars}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
            <button onclick="window.openReviewPage('${poiId}')" style="background:#2c7da0;color:white;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;font-size:0.7rem;">
                <i class="fas fa-star"></i> Reviews${reviewCount > 0 ? ` (${reviewCount})` : ''}
            </button>
            ${onRoute
                ? `<span style="background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;padding:4px 12px;border-radius:20px;font-size:0.7rem;display:inline-flex;align-items:center;gap:4px;"><i class="fas fa-check"></i> On route</span>`
                : `<button onclick="window.addToRoute('${poiId}')" style="background:#10b981;color:white;border:none;padding:4px 12px;border-radius:20px;cursor:pointer;font-size:0.7rem;"><i class="fas fa-route"></i> Add to Route</button>`
            }
        </div>
    </div>`;
}

async function addPOI(lat, lng, name, type, description, rating, pendingReview) {
    const emoji  = getEmojiForType(type);
    const marker = L.marker([lat, lng], { icon: getIconForType(type, emoji) });
    const poiId  = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    marker.poiId = poiId;
    marker.bindPopup(buildPopupContent(poiId, name, type, description, rating || 0, 0));
    const newPOI = await addPOIData({ id: poiId, name, type, description, emoji, rating: rating || 0, lat, lng, reviews: [] });
    // Update marker with the real backend ID
    if (newPOI && newPOI.id !== poiId) {
        marker.poiId = newPOI.id;
        marker.bindPopup(buildPopupContent(newPOI.id, name, type, description, rating || 0, 0));
    }
    if (pendingReview) addReviewToPOI(marker.poiId, pendingReview);
    return marker;
}

function loadExistingPOIs() {
    getAllPOIs().forEach(d => {
        const marker = L.marker([d.lat, d.lng], { icon: getIconForType(d.type, d.emoji) });
        marker.poiId = d.id;
        marker.bindPopup(buildPopupContent(d.id, d.name, d.type, d.description, d.rating, d.reviews?.length || 0));
        allPOIs.push(marker);
    });
}

// ============================================================
// GEOLOCATION
// ============================================================

function getCurrentLocation(isStart) {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const label  = `My Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        if (isStart) {
            updateStart(coords, label);
            document.getElementById('startSearchInput').value = label;
        } else {
            updateDest(coords, label);
            document.getElementById('destSearchInput').value = label;
        }
        map.setView([coords.lat, coords.lng], 13);
    }, err => alert('Could not get location: ' + err.message));
}

// ============================================================
// PIN MODE
// ============================================================

function activatePinMode(type) {
    activePinMode = type;
    document.getElementById('startPinStatus').innerHTML = type === 'start' ? 'Click anywhere on map to set START point' : '';
    document.getElementById('destPinStatus').innerHTML  = type === 'dest'  ? 'Click anywhere on map to set DESTINATION point' : '';
    map.getContainer().style.cursor = 'crosshair';
}

function deactivatePinMode() {
    activePinMode = null;
    map.getContainer().style.cursor = '';
    setTimeout(() => {
        if (document.getElementById('startPinStatus').innerHTML.includes('Click')) document.getElementById('startPinStatus').innerHTML = '';
        if (document.getElementById('destPinStatus').innerHTML.includes('Click'))  document.getElementById('destPinStatus').innerHTML  = '';
    }, 100);
}

function onMapClick(e) {
    if (activePinMode === 'start') {
        const c = { lat: e.latlng.lat, lng: e.latlng.lng };
        const l = `Custom pin (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`;
        updateStart(c, l);
        document.getElementById('startSearchInput').value = l;
        deactivatePinMode();
        return;
    }
    if (activePinMode === 'dest') {
        const c = { lat: e.latlng.lat, lng: e.latlng.lng };
        const l = `Custom pin (${c.lat.toFixed(4)}, ${c.lng.toFixed(4)})`;
        updateDest(c, l);
        document.getElementById('destSearchInput').value = l;
        deactivatePinMode();
        return;
    }
    if (!getAccessToken()) {
        document.getElementById('loginRequiredModal').classList.add('active');
        return;
    }
    pendingClickCoords = e.latlng;
    document.getElementById('poiName').value        = '';
    document.getElementById('poiDescription').value = '';
    document.getElementById('poiType').value        = 'food';
    document.getElementById('poiModal').classList.add('active');
}

// ============================================================
// MAP INIT
// ============================================================

async function initMap() {
    map = L.map('map').setView([42.7, 23.3], 8);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Place both markers with _skipRebuild = true, then fire ONE single
    // rebuildRoute that includes the full waypoint list. This prevents the
    // double-fetch that was corrupting the route on page load.
    updateStart(startCoords, startLabel, true);
    updateDest(destCoords,   destLabel,  true);
    await rebuildRoute();

    map.on('click', onMapClick);

    await loadPOIData();
    loadExistingPOIs();
    updatePOIVisibility(parseFloat(document.getElementById('distanceSlider').value));
    renderWaypointBadges();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.getElementById('useMyLocationStart').addEventListener('click', () => getCurrentLocation(true));
document.getElementById('useMyLocationDest').addEventListener('click',  () => getCurrentLocation(false));
document.getElementById('pinModeStart').addEventListener('click', () => { deactivatePinMode(); activatePinMode('start'); });
document.getElementById('pinModeDest').addEventListener('click',  () => { deactivatePinMode(); activatePinMode('dest');  });

document.getElementById('submitPoiBtn').addEventListener('click', async () => {
    const name = document.getElementById('poiName').value.trim();
    if (!name) { alert('Please enter a name for the point of interest'); return; }
    const type        = document.getElementById('poiType').value;
    const description = document.getElementById('poiDescription').value;

    if (pendingClickCoords) {
        const pendingReviewStr = sessionStorage.getItem('pendingReview');
        let pendingReview = null;
        if (pendingReviewStr) {
            pendingReview = JSON.parse(pendingReviewStr);
            sessionStorage.removeItem('pendingReview');
        }
        showToast(pendingReview ? `POI "${name}" created with your review!` : `POI "${name}" created!`, true);
        const marker = await addPOI(pendingClickCoords.lat, pendingClickCoords.lng, name, type, description, 0, pendingReview);
        allPOIs.push(marker);
        document.getElementById('poiModal').classList.remove('active');
        pendingClickCoords = null;
        updatePOIVisibility(parseFloat(document.getElementById('distanceSlider').value));
    }
});

document.getElementById('cancelPoiBtn').addEventListener('click', () => {
    document.getElementById('poiModal').classList.remove('active');
    pendingClickCoords = null;
});

document.getElementById('cancelLoginRequiredBtn').addEventListener('click', () => {
    document.getElementById('loginRequiredModal').classList.remove('active');
});

document.getElementById('goToLoginBtn').addEventListener('click', () => {
    window.location.href = 'login_page.html';
});

document.getElementById('loginBtnHeader').addEventListener('click', () => {
    if (getAccessToken()) { logout({ redirectTo: 'login_page.html' }); return; }
    window.location.href = 'login_page.html';
});

document.getElementById('distanceSlider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    document.getElementById('sliderDistanceText').textContent = v === 0 ? '0' : (v % 1 === 0 ? v : v.toFixed(1));
    updatePOIVisibility(v);
});

const aboutModal = document.getElementById('aboutModal');
document.getElementById('aboutUsBtn').addEventListener('click',   () => aboutModal.classList.add('active'));
document.getElementById('closeAboutBtn').addEventListener('click', () => aboutModal.classList.remove('active'));
aboutModal.addEventListener('click', e => { if (e.target === aboutModal) aboutModal.classList.remove('active'); });

setupAddressSearch(
    document.getElementById('startSearchInput'),
    document.getElementById('startSuggestions'),
    (coords, label) => updateStart(coords, label),
    true
);
setupAddressSearch(
    document.getElementById('destSearchInput'),
    document.getElementById('destSuggestions'),
    (coords, label) => updateDest(coords, label),
    false
);

window.addEventListener('DOMContentLoaded', () => {
    syncAuthButtonState();
    initMap();
});
