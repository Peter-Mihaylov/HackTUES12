import { findPointsOfInterestWithinDistance } from './routeDistance.js';
import { addPOIData, loadPOIData, getAllPOIs, addReviewToPOI, getPOIById } from './reviewsData.js';

let map;
let startMarker = null;
let destMarker = null;
let currentRouteLayer = null;
let activePinMode = null;
let pendingClickCoords = null;
let allPOIs = [];
let startCoords = { lat: 42.6977, lng: 23.3219 };
let destCoords = { lat: 42.1354, lng: 24.7453 };

loadPOIData();

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
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.background = isSuccess ? '#2c7da0' : '#d00000';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '40px';
    toast.style.fontSize = '0.9rem';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '3000';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '8px';
    toast.innerHTML = isSuccess ? `<i class="fas fa-check-circle"></i> ${msg}` : `<i class="fas fa-times-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.openReviewPage = function(poiId) {
    window.location.href = `review.html?id=${poiId}`;
};

window.addToRoute = async function(poiId) {
    const poi = getPOIById(poiId);
    if (!poi) {
        showToast('POI not found', false);
        return;
    }
    
    const poiCoords = { lat: poi.lat, lng: poi.lng };
    
    if (destCoords) {
        showToast(`📍 Adding "${poi.name}" to your route - recalculating...`, true);
        await fetchRouteWithWaypoint(startCoords, poiCoords, destCoords);
    } else {
        updateDest(poiCoords, poi.name);
        showToast(`📍 Route set to: ${poi.name}`, true);
    }
};

async function fetchRouteWithWaypoint(start, waypoint, end) {
    const coordString = `${start.lng},${start.lat};${waypoint.lng},${waypoint.lat};${end.lng},${end.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false&alternatives=false`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Routing failed');
        const data = await response.json();
        
        if (!data.routes || data.routes.length === 0) {
            showToast('Could not find a route through this point', false);
            return;
        }
        
        const route = data.routes[0];
        const distanceKm = route.distance / 1000;
        const durationSeconds = route.duration;
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        let timeText = '';
        if (hours > 0) timeText = `${hours}h ${minutes}min`;
        else timeText = `${minutes} min`;
        
        const geojson = route.geometry;
        const latLngs = geojson.coordinates.map(coord => L.latLng(coord[1], coord[0]));
        
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        currentRouteLayer = L.polyline(latLngs, { color: '#2c7da0', weight: 5, opacity: 0.9 }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });
        
        document.getElementById('distanceKm').innerText = distanceKm.toFixed(1) + ' km';
        document.getElementById('travelTime').innerText = timeText;
        
        const currentSliderValue = parseFloat(document.getElementById('distanceSlider').value);
        updatePOIVisibility(currentSliderValue);
        
        showToast(`✅ New route: ${distanceKm.toFixed(1)} km via waypoint`, true);
    } catch (err) {
        console.error(err);
        showToast('Failed to calculate route. Please try another POI.', false);
    }
}

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
            subText: item.display_name.split(',').slice(1).join(',').trim()
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
        if (query.length < 2) {
            suggestionsDiv.classList.remove('show');
            suggestionsDiv.innerHTML = '';
            return;
        }
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
                    if (isStart) {
                        document.getElementById('startPinStatus').innerHTML = `✅ ${result.displayName.substring(0, 50)}`;
                    } else {
                        document.getElementById('destPinStatus').innerHTML = `✅ ${result.displayName.substring(0, 50)}`;
                    }
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
                const best = results[0];
                const coords = { lat: best.lat, lng: best.lng };
                onSelect(coords, best.displayName);
                inputElement.value = best.displayName;
                suggestionsDiv.classList.remove('show');
                if (isStart) {
                    document.getElementById('startPinStatus').innerHTML = `✅ ${best.displayName.substring(0, 50)}`;
                } else {
                    document.getElementById('destPinStatus').innerHTML = `✅ ${best.displayName.substring(0, 50)}`;
                }
                map.setView([best.lat, best.lng], 13);
            } else {
                alert('No address found in Bulgaria. Please try a different search.');
            }
        }
    });
}

async function fetchRouteAndMetrics(startLatLng, destLatLng) {
    const coordString = `${startLatLng.lng},${startLatLng.lat};${destLatLng.lng},${destLatLng.lat}`;
    const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson&steps=false`;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Routing failed');
        const data = await response.json();
        if (!data.routes || data.routes.length === 0) throw new Error('No route');
        const route = data.routes[0];
        const distanceKm = route.distance / 1000;
        const durationSeconds = route.duration;
        const hours = Math.floor(durationSeconds / 3600);
        const minutes = Math.floor((durationSeconds % 3600) / 60);
        let timeText = '';
        if (hours > 0) timeText = `${hours}h ${minutes}min`;
        else timeText = `${minutes} min`;
        
        const geojson = route.geometry;
        const latLngs = geojson.coordinates.map(coord => L.latLng(coord[1], coord[0]));
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        currentRouteLayer = L.polyline(latLngs, { color: '#2c7da0', weight: 5, opacity: 0.9 }).addTo(map);
        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });
        
        document.getElementById('distanceKm').innerText = distanceKm.toFixed(1) + ' km';
        document.getElementById('travelTime').innerText = timeText;
        
        const currentSliderValue = parseFloat(document.getElementById('distanceSlider').value);
        updatePOIVisibility(currentSliderValue);
    } catch (err) {
        console.error(err);
        document.getElementById('distanceKm').innerText = '⚠️ error';
        document.getElementById('travelTime').innerText = '—';
    }
}

function updateStart(coords, addressLabel = '') {
    startCoords = coords;
    if (startMarker) map.removeLayer(startMarker);
    const greenFlagIcon = L.divIcon({
        html: '<div style="background-color:#2b9348; width: 28px; height: 28px; border-radius: 50% 50% 2px 50%; background:#2b9348; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-flag" style="color:white; font-size:12px;"></i></div>',
        iconSize: [28, 28],
        className: 'start-flag-icon'
    });
    startMarker = L.marker([coords.lat, coords.lng], { icon: greenFlagIcon, draggable: true }).addTo(map);
    startMarker.bindTooltip(`Start: ${addressLabel || '📍 Pin'}`, { permanent: false });
    startMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        startCoords = { lat: pos.lat, lng: pos.lng };
        updateStart(startCoords, 'Dragged pin');
        if (destCoords) fetchRouteAndMetrics(startCoords, destCoords);
    });
    if (destCoords) fetchRouteAndMetrics(startCoords, destCoords);
}

function updateDest(coords, addressLabel = '') {
    destCoords = coords;
    if (destMarker) map.removeLayer(destMarker);
    const redFlagIcon = L.divIcon({
        html: '<div style="background-color:#d00000; width: 28px; height: 28px; border-radius: 50% 50% 2px 50%; background:#d00000; border:2px solid white; display:flex; align-items:center; justify-content:center;"><i class="fas fa-flag-checkered" style="color:white; font-size:12px;"></i></div>',
        iconSize: [28, 28],
        className: 'dest-flag-icon'
    });
    destMarker = L.marker([coords.lat, coords.lng], { icon: redFlagIcon, draggable: true }).addTo(map);
    destMarker.bindTooltip(`Dest: ${addressLabel || '🏁 Pin'}`, { permanent: false });
    destMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        destCoords = { lat: pos.lat, lng: pos.lng };
        updateDest(destCoords, 'Dragged destination');
        fetchRouteAndMetrics(startCoords, destCoords);
    });
    fetchRouteAndMetrics(startCoords, destCoords);
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
    
    allPOIs.forEach(marker => {
        if (marker._map) marker._map.removeLayer(marker);
    });
    
    visiblePOIs.forEach(marker => {
        if (!marker._map && map) marker.addTo(map);
    });
    
    const countSpan = document.getElementById('poiCountDisplay');
    if (countSpan) {
        countSpan.innerHTML = `📍 ${visiblePOIs.length} POI${visiblePOIs.length !== 1 ? 's' : ''} visible`;
    }
}

function getIconForType(type) {
    let iconHtml = '';
    switch(type) {
        case 'food':
            iconHtml = '<div style="background:#f59e0b; width: 32px; height: 32px; border-radius: 50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-carrot" style="color:white; font-size:16px;"></i></div>';
            break;
        case 'clothing':
            iconHtml = '<div style="background:#3b82f6; width: 32px; height: 32px; border-radius: 50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-tshirt" style="color:white; font-size:16px;"></i></div>';
            break;
        case 'entertainment':
            iconHtml = '<div style="background:#8b5cf6; width: 32px; height: 32px; border-radius: 50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-film" style="color:white; font-size:16px;"></i></div>';
            break;
        default:
            iconHtml = '<div style="background:#6b7280; width: 32px; height: 32px; border-radius: 50%; display:flex; align-items:center; justify-content:center; border:2px solid white; box-shadow:0 2px 4px rgba(0,0,0,0.2);"><i class="fas fa-map-pin" style="color:white; font-size:16px;"></i></div>';
    }
    return L.divIcon({
        html: iconHtml,
        iconSize: [32, 32],
        className: 'poi-icon',
        popupAnchor: [0, -16]
    });
}

function addPOI(lat, lng, name, type, description, rating = 0, pendingReview = null) {
    const icon = getIconForType(type);
    const marker = L.marker([lat, lng], { icon: icon }).addTo(map);
    
    const typeLabels = {
        food: '🍕 Food',
        clothing: '👕 Clothing',
        entertainment: '🎬 Entertainment',
        other: '📍 Other'
    };
    
    const poiId = Date.now().toString() + Math.random().toString(36).substr(2, 6);
    marker.poiId = poiId;
    
    const starsDisplay = rating > 0 ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)) : 'No rating';
    
    const popupContent = `
        <div style="min-width: 200px;">
            <strong style="font-size: 1rem;">${escapeHtml(name)}</strong><br>
            <span style="color: #2c7da0; font-size: 0.8rem;">${typeLabels[type] || type}</span><br>
            ${description ? `<p style="margin: 6px 0; font-size: 0.8rem;">${escapeHtml(description)}</p>` : ''}
            <div style="color: #fbbf24; font-size: 0.9rem;">${starsDisplay}</div>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
                <button onclick="window.openReviewPage('${poiId}')" style="background: #2c7da0; color: white; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">
                    <i class="fas fa-star"></i> Reviews
                </button>
                <button onclick="window.addToRoute('${poiId}')" style="background: #10b981; color: white; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">
                    <i class="fas fa-route"></i> Add to Route
                </button>
            </div>
        </div>
    `;
    marker.bindPopup(popupContent);
    
    addPOIData({
        id: poiId,
        name: name,
        type: type,
        description: description,
        rating: rating,
        lat: lat,
        lng: lng,
        reviews: []
    });
    
    if (pendingReview) {
        addReviewToPOI(poiId, pendingReview);
    }
    
    return marker;
}

function loadExistingPOIs() {
    const savedPOIs = getAllPOIs();
    savedPOIs.forEach(poiData => {
        const icon = getIconForType(poiData.type);
        const marker = L.marker([poiData.lat, poiData.lng], { icon: icon }).addTo(map);
        marker.poiId = poiData.id;
        
        const typeLabels = {
            food: '🍕 Food',
            clothing: '👕 Clothing',
            entertainment: '🎬 Entertainment',
            other: '📍 Other'
        };
        
        const starsDisplay = poiData.rating > 0 ? '★'.repeat(Math.round(poiData.rating)) + '☆'.repeat(5 - Math.round(poiData.rating)) : 'No rating';
        
        const popupContent = `
            <div style="min-width: 200px;">
                <strong style="font-size: 1rem;">${escapeHtml(poiData.name)}</strong><br>
                <span style="color: #2c7da0; font-size: 0.8rem;">${typeLabels[poiData.type] || poiData.type}</span><br>
                ${poiData.description ? `<p style="margin: 6px 0; font-size: 0.8rem;">${escapeHtml(poiData.description)}</p>` : ''}
                <div style="color: #fbbf24; font-size: 0.9rem;">${starsDisplay}</div>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button onclick="window.openReviewPage('${poiData.id}')" style="background: #2c7da0; color: white; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">
                        <i class="fas fa-star"></i> Reviews (${poiData.reviews?.length || 0})
                    </button>
                    <button onclick="window.addToRoute('${poiData.id}')" style="background: #10b981; color: white; border: none; padding: 4px 12px; border-radius: 20px; cursor: pointer; font-size: 0.7rem;">
                        <i class="fas fa-route"></i> Add to Route
                    </button>
                </div>
            </div>
        `;
        marker.bindPopup(popupContent);
        allPOIs.push(marker);
    });
}

function getCurrentLocation(isStart) {
    if (!navigator.geolocation) { alert("Geolocation not supported"); return; }
    navigator.geolocation.getCurrentPosition((position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (isStart) {
            updateStart(coords, "My Location");
            document.getElementById('startSearchInput').value = `My Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        } else {
            updateDest(coords, "My Location");
            document.getElementById('destSearchInput').value = `My Location (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        }
        map.setView([coords.lat, coords.lng], 13);
    }, (err) => { alert("Could not get location: " + err.message); });
}

function activatePinMode(type) {
    activePinMode = type;
    if (type === 'start') {
        document.getElementById('startPinStatus').innerHTML = '📍 Click anywhere on map to set START point';
        document.getElementById('destPinStatus').innerHTML = '';
    } else {
        document.getElementById('destPinStatus').innerHTML = '📍 Click anywhere on map to set DESTINATION point';
        document.getElementById('startPinStatus').innerHTML = '';
    }
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
        document.getElementById('startSearchInput').value = `Custom pin (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        deactivatePinMode();
    } else if (activePinMode === 'dest') {
        const coords = { lat: e.latlng.lat, lng: e.latlng.lng };
        updateDest(coords, `Pin: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        document.getElementById('destSearchInput').value = `Custom pin (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
        deactivatePinMode();
    } else {
        pendingClickCoords = e.latlng;
        document.getElementById('poiName').value = '';
        document.getElementById('poiDescription').value = '';
        document.getElementById('poiType').value = 'food';
        document.getElementById('poiModal').classList.add('active');
    }
}

function initMap() {
    map = L.map('map').setView([42.7, 23.3], 8);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);
    
    updateStart(startCoords, "Sofia (default)");
    updateDest(destCoords, "Plovdiv (default)");
    
    map.on('click', onMapClick);
    
    loadExistingPOIs();
}

// Event Listeners
document.getElementById('useMyLocationStart').addEventListener('click', () => getCurrentLocation(true));
document.getElementById('useMyLocationDest').addEventListener('click', () => getCurrentLocation(false));
document.getElementById('pinModeStart').addEventListener('click', () => { deactivatePinMode(); activatePinMode('start'); });
document.getElementById('pinModeDest').addEventListener('click', () => { deactivatePinMode(); activatePinMode('dest'); });

document.getElementById('submitPoiBtn').addEventListener('click', () => {
    const name = document.getElementById('poiName').value.trim();
    if (!name) {
        alert('Please enter a name for the point of interest');
        return;
    }
    const type = document.getElementById('poiType').value;
    const description = document.getElementById('poiDescription').value;
    
    if (pendingClickCoords) {
        const pendingReviewStr = sessionStorage.getItem('pendingReview');
        let pendingReview = null;
        
        if (pendingReviewStr) {
            pendingReview = JSON.parse(pendingReviewStr);
            sessionStorage.removeItem('pendingReview');
            showToast(`✅ POI "${name}" created successfully with your review!`, true);
        } else {
            showToast(`✅ POI "${name}" created successfully!`, true);
        }
        
        const marker = addPOI(pendingClickCoords.lat, pendingClickCoords.lng, name, type, description, 0, pendingReview);
        allPOIs.push(marker);
        document.getElementById('poiModal').classList.remove('active');
        pendingClickCoords = null;
        
        const currentSliderValue = parseFloat(document.getElementById('distanceSlider').value);
        updatePOIVisibility(currentSliderValue);
    }
});

document.getElementById('cancelPoiBtn').addEventListener('click', () => {
    document.getElementById('poiModal').classList.remove('active');
    pendingClickCoords = null;
});

document.getElementById('loginBtnHeader').addEventListener('click', () => {
    window.location.href = 'login.html';
});

const distanceSlider = document.getElementById('distanceSlider');
const sliderDistanceText = document.getElementById('sliderDistanceText');

distanceSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    const displayValue = value === 0 ? '0' : (value % 1 === 0 ? value : value.toFixed(1));
    sliderDistanceText.textContent = displayValue;
    updatePOIVisibility(value);
});

const aboutModal = document.getElementById('aboutModal');
document.getElementById('aboutUsBtn').addEventListener('click', () => aboutModal.classList.add('active'));
document.getElementById('closeAboutBtn').addEventListener('click', () => aboutModal.classList.remove('active'));
aboutModal.addEventListener('click', (e) => { if(e.target === aboutModal) aboutModal.classList.remove('active'); });

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

window.addEventListener('DOMContentLoaded', initMap);