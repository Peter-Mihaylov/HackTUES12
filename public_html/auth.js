const ACCESS_TOKEN_KEY = 'routeplanner_access_token';
const TOKEN_TYPE_KEY = 'routeplanner_token_type';
const AUTH_RESPONSE_KEY = 'routeplanner_auth_response';

export function getAccessToken() {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getTokenType() {
    return (localStorage.getItem(TOKEN_TYPE_KEY) || 'bearer').trim();
}

export function getAuthorizationHeader() {
    const token = getAccessToken();
    if (!token) return null;
    return `${capitalize(getTokenType())} ${token}`;
}

export async function authFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    const authHeader = getAuthorizationHeader();

    if (authHeader && !headers.has('Authorization')) {
        headers.set('Authorization', authHeader);
    }

    const response = await fetch(url, {
        ...options,
        headers
    });

    if (response.status === 401 && getAccessToken()) {
        logout({ redirect: false });
    }

    return response;
}

export function clearAuthStorage() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(TOKEN_TYPE_KEY);
    localStorage.removeItem(AUTH_RESPONSE_KEY);
}

export function logout(options = {}) {
    const redirect = options.redirect ?? true;
    const redirectTo = options.redirectTo ?? 'login_page.html';

    clearAuthStorage();

    syncLoggedOutButtonState();

    if (redirect && redirectTo) {
        window.location.href = redirectTo;
    }
}

function syncLoggedOutButtonState() {
    const btn = document.getElementById('loginBtnHeader');
    if (!btn) return;

    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Log in';
}

function capitalize(value) {
    if (!value) return 'Bearer';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
