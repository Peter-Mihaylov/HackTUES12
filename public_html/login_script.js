/* ═══════════════════════════════════════
   DEMO ACCOUNTS (edit freely)
═══════════════════════════════════════ */
const DEMO_ACCOUNTS = [
  {
    name:  'Maria Georgieva',
    email: 'maria.georgieva@gmail.com',
    initials: 'MG',
    color: 'linear-gradient(135deg,#4285F4,#1a6cd4)'
  },
  {
    name:  'Alex Petrov',
    email: 'alex.petrov@gmail.com',
    initials: 'AP',
    color: 'linear-gradient(135deg,#EA4335,#c0281c)'
  },
  {
    name:  'Hacker Noon',
    email: 'hackathon.team@googlemail.com',
    initials: 'HN',
    color: 'linear-gradient(135deg,#34A853,#1e7a34)'
  }
];

/* ═══════════════════════════════════════
   POPUP OPEN / CLOSE
═══════════════════════════════════════ */
function openGooglePopup() {
  renderAccounts();
  document.getElementById('oauthBackdrop').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeGooglePopup() {
  const backdrop = document.getElementById('oauthBackdrop');
  backdrop.classList.remove('open');
  document.body.style.overflow = '';
  // Reset signing-in overlay
  setTimeout(() => {
    document.getElementById('signingInOverlay').classList.remove('visible');
    // re-enable rows
    document.querySelectorAll('.oauth-account-row').forEach(r => r.classList.remove('loading'));
  }, 300);
}

function handleBackdropClick(e) {
  if (e.target === document.getElementById('oauthBackdrop')) {
    closeGooglePopup();
  }
}

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeGooglePopup();
});

/* ═══════════════════════════════════════
   RENDER ACCOUNTS
═══════════════════════════════════════ */
function renderAccounts() {
  const list = document.getElementById('oauthAccountList');
  list.innerHTML = '';
  DEMO_ACCOUNTS.forEach((acc, i) => {
    const row = document.createElement('div');
    row.className = 'oauth-account-row';
    row.setAttribute('data-index', i);
    row.innerHTML = `
      <div class="oauth-avatar" style="background:${acc.color}">${acc.initials}</div>
      <div class="oauth-account-info">
        <div class="oauth-account-name">${acc.name}</div>
        <div class="oauth-account-email">${acc.email}</div>
      </div>
      <div class="oauth-spinner"></div>
      <div class="oauth-account-arrow">›</div>
    `;
    row.addEventListener('click', () => selectAccount(acc, row));
    list.appendChild(row);
  });
}

/* ═══════════════════════════════════════
   SELECT ACCOUNT → SIGN IN FLOW
═══════════════════════════════════════ */
function selectAccount(acc, row) {
  // Show spinner on the row
  row.classList.add('loading');

  // After a short "verifying" delay, show the full-panel signing-in state
  setTimeout(() => {
    const overlay = document.getElementById('signingInOverlay');
    document.getElementById('signingInText').textContent = `Signing in as ${acc.name.split(' ')[0]}…`;
    overlay.classList.add('visible');
  }, 600);

  // After auth "completes", redirect
  setTimeout(() => {
    closeGooglePopup();
    showToast(`Welcome, ${acc.name.split(' ')[0]}!`);
    // Fill the email field for a nice touch
    document.getElementById('inp-email').value = acc.email;
    valEmail(true);
    // Redirect to main app
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1600);
  }, 2200);
}

/* ═══════════════════════════════════════
   ADD ACCOUNT
═══════════════════════════════════════ */
function addAccount() {
  showToast('📧  Enter your Google account details below');
  closeGooglePopup();
  // Focus the email field as a hint
  setTimeout(() => document.getElementById('inp-email').focus(), 400);
}

/* ═══════════════════════════════════════
   ORIGINAL FORM LOGIC (unchanged)
═══════════════════════════════════════ */
let mode   = 'in';
let pwShow = false;

function switchTab(m) {
  mode = m;
  document.getElementById('tab-in').classList.toggle('active', m === 'in');
  document.getElementById('tab-up').classList.toggle('active', m === 'up');
  document.getElementById('wrap-name').classList.toggle('hidden', m === 'in');
  document.getElementById('form-subtitle').textContent =
    m === 'in' ? 'Sign in to continue your journey' : 'Join thousands of travelers';
  document.getElementById('cta-label').textContent =
    m === 'in' ? 'Continue your journey' : 'Join RouteRoots';
  document.getElementById('forgot-lnk').style.visibility =
    m === 'in' ? 'visible' : 'hidden';
  document.getElementById('inp-pw').setAttribute('autocomplete',
    m === 'in' ? 'current-password' : 'new-password');
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
  ['hint-name','hint-email','hint-pw'].forEach(clearHint);
  ['inp-name','inp-email','inp-pw'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-valid','is-error');
  });
  resetPwBars();
}

function valName() {
  const v = document.getElementById('inp-name').value.trim();
  const inp = document.getElementById('inp-name');
  if (!v) { clearHint('hint-name'); inp.classList.remove('is-valid','is-error'); return true; }
  if (v.length < 2) {
    setHint('hint-name','✕  At least 2 characters', false);
    inp.classList.add('is-error'); inp.classList.remove('is-valid');
    return false;
  }
  setHint('hint-name', '✓  Hello, ' + v.split(' ')[0] + '!', true);
  inp.classList.add('is-valid'); inp.classList.remove('is-error');
  return true;
}

function valEmail(blur=false) {
  const v   = document.getElementById('inp-email').value.trim();
  const inp = document.getElementById('inp-email');
  const ok  = document.getElementById('email-ok');
  if (!v) { clearHint('hint-email'); inp.classList.remove('is-valid','is-error'); ok.textContent=''; return false; }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  if (!valid) {
    if (blur || v.length > 6) {
      setHint('hint-email','✕  Enter a valid email address', false);
      inp.classList.add('is-error'); inp.classList.remove('is-valid');
      ok.textContent = '';
    }
    return false;
  }
  setHint('hint-email','✓  Looks good', true);
  inp.classList.add('is-valid'); inp.classList.remove('is-error');
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
  if (s <= 1) return { n:1, cls:'s-weak',   lbl:'Weak'   };
  if (s === 2) return { n:2, cls:'s-fair',   lbl:'Fair'   };
  if (s === 3) return { n:3, cls:'s-good',   lbl:'Good'   };
  return             { n:4, cls:'s-strong', lbl:'Strong' };
}

function resetPwBars() {
  ['pb1','pb2','pb3','pb4'].forEach(id => { document.getElementById(id).className = 'pw-bar'; });
  const lbl = document.getElementById('pw-lbl');
  lbl.textContent = '';
  lbl.className = 'pw-str-txt';
}

function valPw(blur=false) {
  const v   = document.getElementById('inp-pw').value;
  const inp = document.getElementById('inp-pw');
  if (!v) { clearHint('hint-pw'); inp.classList.remove('is-valid','is-error'); resetPwBars(); return false; }
  const str = getStrength(v);
  ['pb1','pb2','pb3','pb4'].forEach((id, i) => {
    document.getElementById(id).className = 'pw-bar ' + (i < str.n ? str.cls : '');
  });
  const lbl = document.getElementById('pw-lbl');
  lbl.textContent = str.lbl;
  lbl.className = 'pw-str-txt ' + str.cls;
  if (v.length < 8) {
    if (blur || v.length > 4) {
      setHint('hint-pw','✕  Minimum 8 characters', false);
      inp.classList.add('is-error'); inp.classList.remove('is-valid');
    }
    return false;
  }
  clearHint('hint-pw');
  inp.classList.add('is-valid'); inp.classList.remove('is-error');
  return true;
}

function doAuth() {
  const emailOk = valEmail(true);
  const pwOk    = valPw(true);
  let nameOk    = true;
  if (mode === 'up') nameOk = valName();
  if (!emailOk || !pwOk || (mode === 'up' && !nameOk)) {
    showToast('⚠️ Please enter your email address and password');
    return;
  }
  showToast('Welcome to RouteRoots!');
  setTimeout(() => { window.location.href = 'index.html'; }, 1500);
}

let toastTimer;
function showToast(msg) {
  clearTimeout(toastTimer);
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

/* Counter animation */
function animateCount(el, target, decimals=0, suffix='') {
  const duration = 1600;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1-t, 3);
    el.textContent = (target * ease).toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    const nums = document.querySelectorAll('.proof-num');
    const targets = [
      { val:2400, dec:0, suffix:'+' },
      { val:18,   dec:0, suffix:'k km' },
      { val:4.2,  dec:1, suffix:' t' },
      { val:4.92, dec:2, suffix:'' },
    ];
    nums.forEach((el, i) => {
      const { val, dec, suffix } = targets[i];
      animateCount(el, val, dec, suffix);
    });
  }, 700);
});
