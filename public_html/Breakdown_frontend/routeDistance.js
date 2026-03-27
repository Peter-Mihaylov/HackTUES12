// routeDistance.js
// Helper functions to filter POIs within a certain distance from the route

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function projectToMeters(lat, lng, referenceLatRad) {
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);

  return {
    x: EARTH_RADIUS_METERS * lngRad * Math.cos(referenceLatRad),
    y: EARTH_RADIUS_METERS * latRad,
  };
}

function squaredDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function pointToSegmentDistanceMeters(point, segmentStart, segmentEnd) {
  const segmentDx = segmentEnd.x - segmentStart.x;
  const segmentDy = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = segmentDx * segmentDx + segmentDy * segmentDy;

  if (segmentLengthSquared === 0) {
    return Math.sqrt(squaredDistance(point, segmentStart));
  }

  const projectionFactor =
    ((point.x - segmentStart.x) * segmentDx + (point.y - segmentStart.y) * segmentDy) /
    segmentLengthSquared;
  const clampedFactor = Math.max(0, Math.min(1, projectionFactor));

  const closestPoint = {
    x: segmentStart.x + clampedFactor * segmentDx,
    y: segmentStart.y + clampedFactor * segmentDy,
  };

  return Math.sqrt(squaredDistance(point, closestPoint));
}

/**
 * Get POI coordinates from a marker object
 * @param {Object} poi - The POI marker object with lat/lng properties
 * @returns {Array|null} [lat, lng] or null if invalid
 */
function getPoiCoordinatesFromMarker(poi) {
  if (!poi || !poi._latlng) {
    return null;
  }
  const lat = poi._latlng.lat;
  const lng = poi._latlng.lng;
  
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }
  
  return [lat, lng];
}

/**
 * Get route coordinates from the current route polyline
 * @param {Object} routeLayer - Leaflet polyline layer
 * @returns {Array} Array of [lng, lat] coordinates
 */
function getRouteCoordinatesFromLayer(routeLayer) {
  if (!routeLayer || !routeLayer.getLatLngs) {
    return [];
  }
  
  const latLngs = routeLayer.getLatLngs();
  if (!Array.isArray(latLngs) || latLngs.length === 0) {
    return [];
  }
  
  // Convert Leaflet lat/lng to [lng, lat] format expected by the algorithm
  return latLngs.map(point => [point.lng, point.lat]);
}

/**
 * Returns POIs that are within maxDistanceMeters from any route segment
 * @param {Array} routeCoordinates - Array of [lng, lat] coordinates from the route
 * @param {Array} poiMarkers - Array of Leaflet marker objects
 * @param {number} maxDistanceMeters - Maximum distance in meters
 * @returns {Array} Array of POI markers that are within distance
 */
export function findPointsOfInterestWithinDistance(routeCoordinates, poiMarkers, maxDistanceMeters) {
  const maxDistance = Number(maxDistanceMeters);
  
  if (!Array.isArray(poiMarkers) || poiMarkers.length === 0) {
    return [];
  }
  
  if (routeCoordinates.length < 2) {
    return [];
  }
  
  if (!Number.isFinite(maxDistance) || maxDistance < 0) {
    return [];
  }
  
  const filteredPOIs = [];
  
  for (const poi of poiMarkers) {
    const poiCoords = getPoiCoordinatesFromMarker(poi);
    if (!poiCoords) {
      continue;
    }
    
    const poiLat = poiCoords[0];
    const poiLng = poiCoords[1];
    const referenceLatRad = toRadians(poiLat);
    const pointInMeters = projectToMeters(poiLat, poiLng, referenceLatRad);
    
    let isWithinDistance = false;
    
    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const from = routeCoordinates[i];
      const to = routeCoordinates[i + 1];
      
      const segmentStart = projectToMeters(from[1], from[0], referenceLatRad);
      const segmentEnd = projectToMeters(to[1], to[0], referenceLatRad);
      const distance = pointToSegmentDistanceMeters(pointInMeters, segmentStart, segmentEnd);
      
      if (distance <= maxDistance) {
        isWithinDistance = true;
        break;
      }
    }
    
    if (isWithinDistance) {
      filteredPOIs.push(poi);
    }
  }
  
  return filteredPOIs;
}

/**
 * Updates POI visibility based on slider value
 * @param {Object} routeLayer - Leaflet polyline layer
 * @param {Array} allPoiMarkers - Array of all POI markers
 * @param {number} maxDistanceKm - Maximum distance in kilometers
 * @returns {Array} Array of visible POI markers
 */
export function updatePOIVisibilityByDistance(routeLayer, allPoiMarkers, maxDistanceKm) {
  if (!routeLayer || !allPoiMarkers || allPoiMarkers.length === 0) {
    return [];
  }
  
  const routeCoordinates = getRouteCoordinatesFromLayer(routeLayer);
  const maxDistanceMeters = maxDistanceKm * 1000; // Convert km to meters
  
  const visiblePOIs = findPointsOfInterestWithinDistance(routeCoordinates, allPoiMarkers, maxDistanceMeters);
  
  // Hide all POIs first
  allPoiMarkers.forEach(marker => {
    if (marker._map) {
      marker._map.removeLayer(marker);
    }
  });
  
  // Show only the ones within distance
  visiblePOIs.forEach(marker => {
    if (!marker._map && routeLayer._map) {
      marker.addTo(routeLayer._map);
    }
  });
  
  return visiblePOIs;
}