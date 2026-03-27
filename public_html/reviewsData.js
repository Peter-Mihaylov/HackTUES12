// reviewsData.js - Shared storage for POIs and their reviews

let allPOIsData = [];
const VENDORS_API_URL = 'http://localhost:8000/vendors/';

// Track which users have reviewed which POIs (using browser fingerprint)
// For demo purposes, we'll use localStorage to track reviewed POIs per device
let userReviewedPOIs = new Set();

function normalizeVendorToPOI(vendor) {
    return {
        id: String(vendor.id),
        name: vendor.name,
        type: 'other',
        description: vendor.description || '',
        lat: vendor.latitude,
        lng: vendor.longitude,
        emoji: vendor.cover_image || null,
        rating: typeof vendor.rating === 'number' ? vendor.rating : 0,
        reviews: []
    };
}

export async function loadPOIData() {
    // Load user's reviewed POIs
    const reviewed = localStorage.getItem('userReviewedPOIs');
    if (reviewed) {
        userReviewedPOIs = new Set(JSON.parse(reviewed));
    }

    try {
        const response = await fetch(VENDORS_API_URL);
        if (!response.ok) {
            throw new Error(`Failed to load vendors: ${response.status}`);
        }

        const vendors = await response.json();
        console.log(vendors);
        allPOIsData = Array.isArray(vendors)
            ? vendors.map(normalizeVendorToPOI)
            : [];
    } catch (err) {
        console.warn('Could not load POIs from API.', err);
        allPOIsData = [];
    }
    
    return allPOIsData;
}

export function savePOIData() {
    // Save user's reviewed POIs
    localStorage.setItem('userReviewedPOIs', JSON.stringify([...userReviewedPOIs]));
}

export function getPOIById(id) {
    return allPOIsData.find(poi => poi.id === id);
}

export function getPOIByCoords(lat, lng) {
    return allPOIsData.find(poi => Math.abs(poi.lat - lat) < 0.0001 && Math.abs(poi.lng - lng) < 0.0001);
}

export function addPOIData(poi) {
    const newId = poi.id || (Date.now().toString() + Math.random().toString(36).substr(2, 6));
    const newPOI = {
        ...poi,
        id: newId,
        reviews: poi.reviews || []
    };
    allPOIsData.push(newPOI);
    savePOIData();
    return newPOI;
}

export function hasUserReviewed(poiId) {
    return userReviewedPOIs.has(poiId);
}

export function addReviewToPOI(poiId, review) {
    const poi = getPOIById(poiId);
    if (poi) {
        // Check if user already reviewed this POI
        if (hasUserReviewed(poiId)) {
            return false;
        }
        
        const newReview = {
            id: Date.now().toString(),
            text: review.text,
            rating: review.rating,
            author: review.author || 'Traveler',
            date: new Date().toLocaleString()
        };
        poi.reviews.push(newReview);
        
        // Mark this POI as reviewed by this user
        userReviewedPOIs.add(poiId);
        
        // Update average rating
        const totalRating = poi.reviews.reduce((sum, r) => sum + r.rating, 0);
        poi.rating = totalRating / poi.reviews.length;
        
        savePOIData();
        return true;
    }
    return false;
}

export function getAllPOIs() {
    return allPOIsData;
}