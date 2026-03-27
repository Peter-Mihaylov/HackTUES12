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
let startCoords = { lat: 42.6977, lng: 23.3219 };
let destCoords = { lat: 42.1354, lng: 24.7453 };

// ─── Waypoint accumulation ───────────────────────────────────────────────────
// Ordered list of POI waypoints added to the current route.
// Each entry: { poiId, coords: { lat, lng }, name }
let routeWaypoints = [];
const MAX_ROUTE_WAYPOINTS = 10;
// ────────────────────────────────────────────────────────────────────────────

// ─── Route state persistence (sessionStorage) ────────────────────────────────
const _savedRoute = (() => {
    try { return JSON.parse(sessionStorage.getItem('routeState')); } catch { return null; }
})();

if (_savedRoute) {
    startCoords    = _savedRoute.startCoords ?? startCoords;
    destCoords     = _savedRoute.destCoords  ?? destCoords;
    routeWaypoints = _savedRoute.waypoints   ?? [];
}

function saveRouteState() {
    sessionStorage.setItem('routeState', JSON.stringify({
        startCoords,
        destCoords,
        startLabel: document.getElementById('startSearchInput')?.value || '',
        destLabel:  document.getElementById('destSearchInput')?.value  || '',
        waypoints:  routeWaypoints
    }));
}
// ────────────────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function showToast(msg, isSuccess = true) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
        background:${isSuccess ? '#2c7da0' : '#d00000'}; color:white;
        padding:12px 24px; border-radius:40px; font-size:0.9rem; font-weight:500;
        z-index:3000; box-shadow:0 4px 12px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px;
        max-width: 90vw; text-align:center;
    `;
    toast.innerHTML = isSuccess
        ? `<i class="fas fa-check-circle"></i> ${msg}`
        : `<i class="fas fa-times-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function syncAuthButtonState() {
    const btn = document.getElementById('loginBtnHeader');
    if (!btn) return;
    if (getAccessToken()) {
        btn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Log out';
    } else {
        btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Log in';
    }
}

// ─── Waypoint badge UI ───────────────────────────────────────────────────────
function renderWaypointBadges() {
    let container = document.getElementById('waypointBadgesContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'waypointBadgesContainer';
        container.style.cssText = 'display:flex; flex-direction:column; gap:6px; padding:0 2px;';
        const infoCard = document.querySelector('.info-card');
        if (infoCard && infoCard.parentNode) {
            infoCard.parentNode.insertBefore(container, infoCard.nextSibling);
        }
    }

    container.innerHTML = '';
    if (routeWaypoints.length === 0) return;

    const header = document.createElement('div');
    header.style.cssText = `
        font-size:0.75rem; font-weight:600; color:#4b5563;
        text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;
        display:flex; align-items:center; gap:6px;
    `;
    header.innerHTML = `
        <i class="fas fa-route" style="color:#2c7da0"></i>
        Route stops (${routeWaypoints.length}/${MAX_ROUTE_WAYPOINTS})
    `;
    container.appendChild(header);

    routeWaypoints.forEach((wp, idx) => {
        const badge = document.createElement('div');
        badge.style.cssText = `
            background:#eef2ff; border:1px solid #c7d2fe; border-radius:40px;
            padding:5px 10px 5px 8px; display:flex; align-items:center; gap:8px;
            font-size:0.78rem; color:#1e293b;
        `;
        badge.innerHTML = `
            <span style="background:#2c7da0; color:white; border-radius:50%;
                width:18px; height:18px; display:inline-flex; align-items:center;
                justify-content:center; font-size:0.65rem; font-weight:700; flex-shrink:0;">
                ${idx + 1}
            </span>
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escapeHtml(wp.name)}
            </span>
            <button title="Remove stop" data-idx="${idx}" style="
                background:none; border:none; cursor:pointer; color:#9ca3af;
                font-size:0.85rem; padding:0; line-height:1; flex-shrink:0;
            "><i class="fas fa-times-circle"></i></button>
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
// ────────────────────────────────────────────────────────────────────────────

// ─── Core routing ────────────────────────────────────────────────────────────

/**
 * Builds start → [waypoints...] → dest and fetches + draws the route.
 */
async function rebuildRoute() {
    const allCoords = [
        startCoords,
        ...routeWaypoints.map(wp => wp.coords),
        destCoords
    ];

    const coordString = allCoords.map(c => `${c.lng},${c.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}` +
        `?overview=full&geometries=geojson&steps=false&alternatives=false`;

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Routing failed');
        const data = await response.json();

        if (!data.routes || data.routes.length === 0) {
            showToast('Could not find a route through all stops', false);
            return;
        }

        const route      = data.routes[0];
        const distanceKm = route.distance / 1000;
        const totalSecs  = route.duration;
        const hours      = Math.floor(totalSecs / 3600);
        const minutes    = Math.floor((totalSecs % 3600) / 60);
        const timeText   = hours > 0 ? `${hours}h ${minutes}min` : `${minutes} min`;

        const latLngs = route.geometry.coordinates.map(coord => L.latLng(coord[1], coord[0]));
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        currentRouteLayer = L.polyline(latLngs, {
            color: '#2c7da0', weight: 5, opacity: 0.9
        }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });

        document.getElementById('distanceKm').innerText = distanceKm.toFixed(1) + ' km';
        document.getElementById('travelTime').innerText = timeText;

        const sliderValue = parseFloat(document.getElementById('distanceSlider').value);
        updatePOIVisibility(sliderValue);

    } catch (err) {
        console.error(err);
        document.getElementById('distanceKm').innerText = '⚠️ error';
        document.getElementById('travelTime').innerText = '—';
    }
}

window.openReviewPage = function(poiId) {
    window.location.href = `review.html?id=${poiId}`;
};

window.addToRoute = async function(poiId) {
    const poi = getPOIById(poiId);
    if (!poi) { showToast('POI not found', false); return; }

    // ── Enforce the 10-waypoint cap ──────────────────────────────────────
    if (routeWaypoints.length >= MAX_ROUTE_WAYPOINTS) {
        showToast(
            `🚦 Route is full! Maximum ${MAX_ROUTE_WAYPOINTS} stops allowed. ` +
            `Remove a stop first before adding another.`,
            false
        );
        return;
    }

    // ── Prevent duplicates ───────────────────────────────────────────────
    if (routeWaypoints.some(wp => wp.poiId === poiId)) {
        showToast(`"${poi.name}" is already a stop on your route.`, false);
        return;
    }

    routeWaypoints.push({
        poiId,
        coords: { lat: poi.lat, lng: poi.lng },
        name:   poi.name
    });

    saveRouteState();
    renderWaypointBadges();

    const stopWord = routeWaypoints.length === 1 ? 'stop' : 'stops';
    showToast(
        `📍 Added "${poi.name}" — ${routeWaypoints.length} ${stopWord} on route. Recalculating…`,
        true
    );

    await rebuildRoute();
};
// ────────────────────────────────────────────────────────────────────────────

async function searchAddress(query, countryCode = 'bg') {
    if (!query.trim() || query.trim().length < 2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=${countryCode}&limit=6&addressdetails=1&accept-language=bg,en`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data.map(item => ({
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            displayName: item.display_name,
            mainText: item.display_name.split(',')[0],
            subText:  item.display_name.split(',').slice(1).join(',').trim()
        }));
    } catch (err) {
        console.error('Search error:', err);
        return [];
    }
}

function setupAddressSearch(inputElement, suggestionsDiv, onSelect, isStart) {
    let currentTimeout = null;

    inputElement.addEventListener('input', async (e) => {
        const query = e.target.value;
        if (query.length < 2) { suggestionsDiv.classList.remove('show'); suggestionsDiv.innerHTML = ''; return; }
        if (currentTimeout) clearTimeout(currentTimeout);
        currentTimeout = setTimeout(async () => {
            const results = await searchAddress(query, 'bg');
            if (results.length === 0) {
                suggestionsDiv.innerHTML = '<div class="suggestion-item" style="color:#9ca3af;">No results found</div>';
                suggestionsDiv.classList.add('show');
                return;
            }
            suggestionsDiv.innerHTML = '';
            results.forEach(result => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <div class="suggestion-main">${escapeHtml(result.mainText)}</div>
                    <div class="suggestion-sub">${escapeHtml(result.subText || result.displayName.substring(0, 60))}</div>
                `;
                div.addEventListener('click', () => {
                    const coords = { lat: result.lat, lng: result.lng };
                    onSelect(coords, result.displayName);
                    inputElement.value = result.displayName;
                    suggestionsDiv.classList.remove('show');
                    document.getElementById(isStart ? 'startPinStatus' : 'destPinStatus').innerHTML =
                        `✅ ${result.displayName.substring(0, 50)}`;
                    map.setView([result.lat, result.lng], 13);
                });
                suggestionsDiv.appendChild(div);
            });
            suggestionsDiv.classList.add('show');
        }, 400);
    });

    document.addEventListener('click', (e) => {
        if (!inputElement.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.classList.remove('show');
        }
    });

    inputElement.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = inputElement.value;
            if (query.length < 2) return;
            const results = await searchAddress(query, 'bg');
            if (results.length > 0) {
                const best   = results[0];
                const coords = { lat: best.lat, lng: best.lng };
                onSelect(coords, best.displayName);
                inputElement.value = best.displayName;
                suggestionsDiv.classList.remove('show');
                document.getElementById(isStart ? 'startPinStatus' : 'destPinStatus').innerHTML =
                    `✅ ${best.displayName.substring(0, 50)}`;
                map.setView([best.lat, best.lng], 13);
            } else {
                alert('No address found in Bulgaria. Please try a different search.');
            }
        }
    });
}

function updateStart(coords, addressLabel = '') {
    startCoords = coords;
    saveRouteState();
    if (startMarker) map.removeLayer(startMarker);
    const icon = L.divIcon({
        html: '<div style="background:#2b9348; width:28px; height:28px; border-radius:50% 50% 2px 50%; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-flag" style="color:white; font-size:12px;"></i></div>',
        iconSize: [28, 28], className: 'start-flag-icon'
    });
    startMarker = L.marker([coords.lat, coords.lng], { icon, draggable: true }).addTo(map);
    startMarker.bindTooltip(`Start: ${addressLabel || '📍 Pin'}`, { permanent: false });
    startMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        startCoords = { lat: pos.lat, lng: pos.lng };
        saveRouteState();
        rebuildRoute();
    });
    rebuildRoute();
}

function updateDest(coords, addressLabel = '') {
    destCoords = coords;
    saveRouteState();
    if (destMarker) map.removeLayer(destMarker);
    const icon = L.divIcon({
        html: '<div style="background:#d00000; width:28px; height:28px; border-radius:50% 50% 2px 50%; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-flag-checkered" style="color:white; font-size:12px;"></i></div>',
        iconSize: [28, 28], className: 'dest-flag-icon'
    });
    destMarker = L.marker([coords.lat, coords.lng], { icon, draggable: true }).addTo(map);
    destMarker.bindTooltip(`Dest: ${addressLabel || '🏁 Pin'}`, { permanent: false });
    destMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        destCoords = { lat: pos.lat, lng: pos.lng };
        saveRouteState();
        rebuildRoute();
    });
    rebuildRoute();
}

function updatePOIVisibility(distanceKm) {
    if (!currentRouteLayer || allPOIs.length === 0) {
        const countSpan = document.getElementById('poiCountDisplay');
        if (countSpan) countSpan.innerHTML = `📍 0 POIs visible`;
        return;
    }

    const latLngs = currentRouteLayer.getLatLngs();
    const routeCoordinates = latLngs.map(point => [point.lng, point.lat]);
    const maxDistanceMeters = distanceKm * 1000;
    const visiblePOIs = findPointsOfInterestWithinDistance(routeCoordinates, allPOIs, maxDistanceMeters);

    allPOIs.forEach(marker => { if (marker._map) marker._map.removeLayer(marker); });
    visiblePOIs.forEach(marker => { if (!marker._map && map) marker.addTo(map); });

    const countSpan = document.getElementById('poiCountDisplay');
    if (countSpan) {
        countSpan.innerHTML = `📍 ${visiblePOIs.length} POI${visiblePOIs.length !== 1 ? 's' : ''} visible`;
    }
}

function getIconForType(type, emoji = null) {
    if (emoji) {
        const emojiStr = String(emoji).trim();
        const isImage  = /^https?:\/\//i.test(emojiStr);
        const inner    = isImage
            ? `<img src="${escapeHtml(emojiStr)}" alt="POI" style="width:20px; height:20px; object-fit:cover; border-radius:50%;" />`
            : `<span style="font-size:18px; line-height:1;">${escapeHtml(emojiStr)}</span>`;
        return L.divIcon({
            html: `<div style="background:#2563eb; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${inner}</div>`,
            iconSize: [32, 32], className: 'poi-icon', popupAnchor: [0, -16]
        });
    }

    const configs = {
        food:          ['#f59e0b', '<span style="font-size:16px; line-height:1;">🍅</span>'],
        clothing:      ['#3b82f6', '<i class="fas fa-tshirt" style="color:white; font-size:16px;"></i>'],
        drinks:        ['#06b6d4', '<span style="font-size:16px; line-height:1;">🥤</span>'],
        entertainment: ['#8b5cf6', '<i class="fas fa-film" style="color:white; font-size:16px;"></i>'],
        default:       ['#6b7280', '<i class="fas fa-map-pin" style="color:white; font-size:16px;"></i>']
    };
    const [bg, inner] = configs[type] || configs.default;
    return L.divIcon({
        html: `<div style="background:${bg}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);">${inner}</div>`,
        iconSize: [32, 32], className: 'poi-icon', popupAnchor: [0, -16]
    });
}

function getEmojiForType(type) {
    return { food: '🍅', clothing: '👕', drinks: '🥤', other: '📍' }[type] || '📍';
}

function buildPopupContent(poiId, name, type, description, rating, reviewCount = 0) {
    const typeLabels   = { food: '🍅 Food', clothing: '👕 Clothing', drinks: '🥤 Drinks', other: '📍 Other' };
    const starsDisplay = rating > 0
        ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating))
        : 'No rating';
    const isOnRoute    = routeWaypoints.some(wp => wp.poiId === poiId);

    return `
        <div style="min-width:200px;">
            <strong style="font-size:1rem;">${escapeHtml(name)}</strong><br>
            <span style="color:#2c7da0; font-size:0.8rem;">${typeLabels[type] || type}</span><br>
            ${description ? `<p style="margin:6px 0; font-size:0.8rem;">${escapeHtml(description)}</p>` : ''}
            <div style="color:#fbbf24; font-size:0.9rem; margin:4px 0;">${starsDisplay}</div>
            <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
                <button onclick="window.openReviewPage('${poiId}')"
                    style="background:#2c7da0; color:white; border:none; padding:4px 12px;
                    border-radius:20px; cursor:pointer; font-size:0.7rem;">
                    <i class="fas fa-star"></i> Reviews${reviewCount > 0 ? ` (${reviewCount})` : ''}
                </button>
                ${isOnRoute
                    ? `<span style="background:#d1fae5; color:#065f46; border:1px solid #a7f3d0;
                        padding:4px 12px; border-radius:20px; font-size:0.7rem;
                        display:inline-flex; align-items:center; gap:4px;">
                        <i class="fas fa-check"></i> On route
                       </span>`
                    : `<button onclick="window.addToRoute('${poiId}')"
                        style="background:#10b981; color:white; border:none; padding:4px 12px;
                        border-radius:20px; cursor:pointer; font-size:0.7rem;">
                        <i class="fas fa-route"></i> Add to Route
                       </button>`
                }
            </div>
        </div>
    `;
}

function addPOI(lat, lng, name, type, description, rating = 0, pendingReview = null) {
    const emoji  = getEmojiForType(type);
    const icon   = getIconForType(type, emoji);
    const marker = L.marker([lat, lng], { icon }).addTo(map);

    const poiId  = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    marker.poiId = poiId;
    marker.bindPopup(buildPopupContent(poiId, name, type, description, rating));

    addPOIData({ id: poiId, name, type, description, emoji, rating, lat, lng, reviews: [] });
    if (pendingReview) addReviewToPOI(poiId, pendingReview);

    return marker;
}

function loadExistingPOIs() {
    const savedPOIs = getAllPOIs();
    savedPOIs.forEach(poiData => {
        const icon   = getIconForType(poiData.type, poiData.emoji);
        const marker = L.marker([poiData.lat, poiData.lng], { icon }).addTo(map);
        marker.poiId = poiData.id;
        marker.bindPopup(buildPopupContent(
            poiData.id, poiData.name, poiData.type,
            poiData.description, poiData.rating,
            poiData.reviews?.length || 0
        ));
        allPOIs.push(marker);
    });
}

function getCurrentLocation(isStart) {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition((position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (isStart) {
            updateStart(coords, 'My Location');
            document.getElementById('startSearchInput').value =
                `My Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        } else {
            updateDest(coords, 'My Location');
            document.getElementById('destSearchInput').value =
                `My Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        }
        map.setView([coords.lat, coords.lng], 13);
    }, (err) => { alert('Could not get location: ' + err.message); });
}

function activatePinMode(type) {
    activePinMode = type;
    document.getElementById('startPinStatus').innerHTML =
        type === 'start' ? '📍 Click anywhere on map to set START point' : '';
    document.getElementById('destPinStatus').innerHTML =
        type === 'dest'  ? '📍 Click anywhere on map to set DESTINATION point' : '';
    map.getContainer().style.cursor = 'crosshair';
}

function deactivatePinMode() {
    activePinMode = null;
    map.getContainer().style.cursor = '';
    setTimeout(() => {
        if (document.getElementById('startPinStatus').innerHTML.includes('Click'))
            document.getElementById('startPinStatus').innerHTML = '';
        if (document.getElementById('destPinStatus').innerHTML.includes('Click'))
            document.getElementById('destPinStatus').innerHTML = '';
    }, 100);
}

function onMapClick(e) {
    if (activePinMode === 'start') {
        const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
        updateStart(coords, `Pin: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        document.getElementById('startSearchInput').value =
            `Custom pin (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        deactivatePinMode();
        return;
    }
    if (activePinMode === 'dest') {
        const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
        updateDest(coords, `Pin: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        document.getElementById('destSearchInput').value =
            `Custom pin (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
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

async function initMap() {
    map = L.map('map').setView([42.7, 23.3], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    // Restore input labels
    if (_savedRoute?.startLabel)
        document.getElementById('startSearchInput').value = _savedRoute.startLabel;
    if (_savedRoute?.destLabel)
        document.getElementById('destSearchInput').value  = _savedRoute.destLabel;

    updateStart(startCoords, _savedRoute?.startLabel || 'Sofia (default)');
    updateDest(destCoords,   _savedRoute?.destLabel  || 'Plovdiv (default)');

    map.on('click', onMapClick);

    await loadPOIData();
    loadExistingPOIs();

    renderWaypointBadges();
}

// ─── Event listeners ─────────────────────────────────────────────────────────

document.getElementById('useMyLocationStart').addEventListener('click', () => getCurrentLocation(true));
document.getElementById('useMyLocationDest').addEventListener('click',  () => getCurrentLocation(false));
document.getElementById('pinModeStart').addEventListener('click', () => { deactivatePinMode(); activatePinMode('start'); });
document.getElementById('pinModeDest').addEventListener('click',  () => { deactivatePinMode(); activatePinMode('dest');  });

document.getElementById('submitPoiBtn').addEventListener('click', () => {
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
        showToast(
            pendingReview
                ? `✅ POI "${name}" created with your review!`
                : `✅ POI "${name}" created!`,
            true
        );
        const marker = addPOI(
            pendingClickCoords.lat, pendingClickCoords.lng,
            name, type, description, 0, pendingReview
        );
        allPOIs.push(marker);
        document.getElementById('poiModal').classList.remove('active');
        pendingClickCoords = null;

        const sliderValue = parseFloat(document.getElementById('distanceSlider').value);
        updatePOIVisibility(sliderValue);
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

const distanceSlider     = document.getElementById('distanceSlider');
const sliderDistanceText = document.getElementById('sliderDistanceText');
distanceSlider.addEventListener('input', (e) => {
    const value        = parseFloat(e.target.value);
    const displayValue = value === 0 ? '0' : (value % 1 === 0 ? value : value.toFixed(1));
    sliderDistanceText.textContent = displayValue;
    updatePOIVisibility(value);
});

const aboutModal = document.getElementById('aboutModal');
document.getElementById('aboutUsBtn').addEventListener('click',   () => aboutModal.classList.add('active'));
document.getElementById('closeAboutBtn').addEventListener('click', () => aboutModal.classList.remove('active'));
aboutModal.addEventListener('click', (e) => { if (e.target === aboutModal) aboutModal.classList.remove('active'); });

setupAddressSearch(
    document.getElementById('startSearchInput'),
    document.getElementById('startSuggestions'),
    (coords, displayName) => updateStart(coords, displayName),
    true
);
setupAddressSearch(
    document.getElementById('destSearchInput'),
    document.getElementById('destSuggestions'),
    (coords, displayName) => updateDest(coords, displayName),
    false
);

window.addEventListener('DOMContentLoaded', () => {
    syncAuthButtonState();
    initMap();
});