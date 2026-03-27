let mode = 'in';
let pwShow = false;
const AUTH_TOKEN_URL = 'http://localhost:8000/auth/token';
const AUTH_REGISTER_URL = 'http://localhost:8000/auth/register';

function switchTab(m) {
  mode = m;
  document.getElementById('tab-in').classList.toggle('active', m === 'in');
  document.getElementById('tab-up').classList.toggle('active', m === 'up');
  document.getElementById('wrap-name').classList.toggle('hidden', m === 'in');
  document.getElementById('form-subtitle').textContent =
    m === 'in' ? 'Sign in to continue your journey' : 'Join thousands of travelers';
  document.getElementById('cta-label').textContent =
    m === 'in' ? 'Continue your journey' : 'Sign up';

  const forgotLink = document.getElementById('forgot-lnk');
  if (forgotLink) {
    forgotLink.style.visibility = m === 'in' ? 'visible' : 'hidden';
  }

  document.getElementById('inp-pw').setAttribute(
    'autocomplete',
    m === 'in' ? 'current-password' : 'new-password'
  );
  clearHints();
}

function togglePw() {
  pwShow = !pwShow;
  document.getElementById('inp-pw').type = pwShow ? 'text' : 'password';
  document.getElementById('pw-eye').textContent = pwShow ? '🙈' : '👁️';
}

function setHint(id, msg, ok) {
  const el = document.getElementById(id);
  el.className = 'field-hint ' + (ok ? 'hint-ok' : 'hint-err');
  el.textContent = msg;
}

function clearHint(id) {
  const el = document.getElementById(id);
  el.className = 'field-hint';
  el.textContent = '';
}

function clearHints() {
  ['hint-name', 'hint-email', 'hint-pw'].forEach(clearHint);
  ['inp-name', 'inp-email', 'inp-pw'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('is-valid', 'is-error');
    }
  });
  resetPwBars();
}

function validateName() {
  const v = document.getElementById('inp-name').value.trim();
  const inp = document.getElementById('inp-name');
  if (!v) {
    clearHint('hint-name');
    inp.classList.remove('is-valid', 'is-error');
    return true;
  }
  if (v.length < 2) {
    setHint('hint-name', '✕  At least 2 characters', false);
    inp.classList.add('is-error');
    inp.classList.remove('is-valid');
    return false;
  }
  setHint('hint-name', '✓  Hello, ' + v.split(' ')[0] + '!', true);
  inp.classList.add('is-valid');
  inp.classList.remove('is-error');
  return true;
}

function validateEmail(blur = false) {
  const v = document.getElementById('inp-email').value.trim();
  const inp = document.getElementById('inp-email');
  const ok = document.getElementById('email-ok');
  if (!v) {
    clearHint('hint-email');
    inp.classList.remove('is-valid', 'is-error');
    ok.textContent = '';
    return false;
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  if (!valid) {
    if (blur || v.length > 6) {
      setHint('hint-email', '✕  Enter a valid email address', false);
      inp.classList.add('is-error');
      inp.classList.remove('is-valid');
      ok.textContent = '';
    }
    return false;
  }
  setHint('hint-email', '✓  Looks good', true);
  inp.classList.add('is-valid');
  inp.classList.remove('is-error');
  ok.textContent = '✓';
  ok.style.color = 'var(--leaf)';
  return true;
}

function getStrength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (s <= 1) return { n: 1, cls: 's-weak', lbl: 'Weak' };
  if (s === 2) return { n: 2, cls: 's-fair', lbl: 'Fair' };
  if (s === 3) return { n: 3, cls: 's-good', lbl: 'Good' };
  return { n: 4, cls: 's-strong', lbl: 'Strong' };
}

function resetPwBars() {
  ['pb1', 'pb2', 'pb3', 'pb4'].forEach(id => {
    document.getElementById(id).className = 'pw-bar';
  });
  const lbl = document.getElementById('pw-lbl');
  lbl.textContent = '';
  lbl.className = 'pw-str-txt';
}

function validatePw(blur = false) {
  const v = document.getElementById('inp-pw').value;
  const inp = document.getElementById('inp-pw');
  if (!v) {
    clearHint('hint-pw');
    inp.classList.remove('is-valid', 'is-error');
    resetPwBars();
    return false;
  }
  const str = getStrength(v);
  ['pb1', 'pb2', 'pb3', 'pb4'].forEach((id, i) => {
    document.getElementById(id).className = 'pw-bar ' + (i < str.n ? str.cls : '');
  });
  const lbl = document.getElementById('pw-lbl');
  lbl.textContent = str.lbl;
  lbl.className = 'pw-str-txt ' + str.cls;
  if (v.length < 8) {
    if (blur || v.length > 4) {
      setHint('hint-pw', '✕  Minimum 8 characters', false);
      inp.classList.add('is-error');
      inp.classList.remove('is-valid');
    }
    return false;
  }
  clearHint('hint-pw');
  inp.classList.add('is-valid');
  inp.classList.remove('is-error');
  return true;
}

async function doAuth() {
  const emailOk = validateEmail(true);
  const pwOk = validatePw(true);
  let nameOk = true;
  if (mode === 'up') nameOk = validateName();

  if (!emailOk || !pwOk || (mode === 'up' && !nameOk)) {
    showToast('Please enter your email address and password');
    return;
  }

  const email = document.getElementById('inp-email').value.trim();
  const password = document.getElementById('inp-pw').value;
  const cta = document.querySelector('.btn-cta');

  cta.disabled = true;
  cta.classList.add('is-loading');

  try {
    let res;
    if (mode === 'up') {
      const name = document.getElementById('inp-name').value.trim();
      res = await fetch(AUTH_REGISTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, first_name: name })
      });
    } else {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      res = await fetch(AUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
    }

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : 'Invalid credentials';
      showToast(detail);
      return;
    }

    if (!data.access_token) {
      showToast('Login succeeded but no token was returned');
      return;
    }

    localStorage.setItem('routeplanner_access_token', data.access_token);
    localStorage.setItem('routeplanner_token_type', data.token_type || 'bearer');
    localStorage.setItem('routeplanner_auth_response', JSON.stringify(data));

    showToast('Welcome to RouteRoots!');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  } catch (_err) {
    showToast('Could not reach auth server. Is API running on localhost:8000?');
  } finally {
    cta.disabled = false;
    cta.classList.remove('is-loading');
  }
}

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function animateCount(el, target, decimals = 0, suffix = '') {
  const duration = 1600;
  const start = performance.now();

  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    el.textContent = (target * ease).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

window.valName = validateName;
window.valEmail = validateEmail;

window.addEventListener('load', () => {
  setTimeout(() => {
    const nums = document.querySelectorAll('.proof-num');
    const targets = [
      { val: 2400, dec: 0, suffix: '+' },
      { val: 18, dec: 0, suffix: 'k km' },
      { val: 4.2, dec: 1, suffix: ' t' },
      { val: 4.92, dec: 2, suffix: '' }
    ];
    nums.forEach((el, i) => {
      const { val, dec, suffix } = targets[i];
      animateCount(el, val, dec, suffix);
    });
  }, 700);
});
