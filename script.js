'use strict';
/* =====================================================
   CampusShelf — Library Management System
   Plain HTML + CSS + JavaScript (data saved in localStorage)
   Features: two roles (Librarian / Student), login & register,
   book CRUD, issue & return, late fines, reservation waitlist,
   printable issue slip, CSV export, dark/light theme.
   ===================================================== */

const DB_KEY = 'campusshelf_db_v1';
const USER_KEY = 'campusshelf_user';
const THEME_KEY = 'campusshelf_theme';
const FINE_PER_DAY = 2;   // ₹ per day after due date
const LOAN_DAYS = 14;     // loan period
const MAX_LOANS = 3;      // max books a student can hold at once
const DEPTS = ['CSE', 'AIML', 'ECE', 'Maths', 'General'];
const DEPT_COLORS = {
  CSE: ['#0f766e', '#115e59'],
  AIML: ['#6d28d9', '#4c1d95'],
  ECE: ['#b45309', '#92400e'],
  Maths: ['#be123c', '#9f1239'],
  General: ['#1d4ed8', '#1e3a8a']
};

let db = null;          // whole database object
let user = null;        // logged-in member
let view = '';          // current page
let ui = { tab: 'login', q: '', dept: 'All', sem: 'All', modal: null };

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (p) => p + Math.random().toString(36).slice(2, 8).toUpperCase();
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISO(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d); };
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
const fmtDate = (iso) => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const rupees = (n) => '₹' + n;

let toastTimer;
function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 2600);
}

/* ---------- data layer ---------- */
function seed() {
  const t = today();
  const B = (n, title, author, dept, sem, copies) => ({ id: 'B' + pad(n), title, author, dept, sem, copies });
  const books = [
    B(1, 'Introduction to Algorithms', 'Thomas H. Cormen', 'CSE', 4, 3),
    B(2, 'Operating System Concepts', 'Abraham Silberschatz', 'CSE', 4, 2),
    B(3, 'Computer Networks', 'Andrew S. Tanenbaum', 'CSE', 5, 2),
    B(4, 'Database System Concepts', 'Henry F. Korth', 'CSE', 4, 3),
    B(5, 'Clean Code', 'Robert C. Martin', 'CSE', 3, 2),
    B(6, 'Artificial Intelligence: A Modern Approach', 'Stuart Russell & Peter Norvig', 'AIML', 5, 2),
    B(7, 'Pattern Recognition and Machine Learning', 'Christopher M. Bishop', 'AIML', 6, 1),
    B(8, 'Deep Learning', 'Ian Goodfellow', 'AIML', 6, 1),
    B(9, 'Hands-On Machine Learning', 'Aurélien Géron', 'AIML', 5, 3),
    B(10, 'Digital Design', 'M. Morris Mano', 'ECE', 3, 3),
    B(11, 'Signals and Systems', 'Alan V. Oppenheim', 'ECE', 3, 2),
    B(12, 'Higher Engineering Mathematics', 'B. S. Grewal', 'Maths', 1, 4),
    B(13, 'Discrete Mathematics and Its Applications', 'Kenneth H. Rosen', 'Maths', 2, 3),
    B(14, 'Wings of Fire', 'A. P. J. Abdul Kalam', 'General', 1, 3),
    B(15, 'Atomic Habits', 'James Clear', 'General', 1, 2),
    B(16, 'The Pragmatic Programmer', 'Andrew Hunt & David Thomas', 'CSE', 6, 2)
  ];
  const members = [
    { id: 'M001', name: 'Head Librarian', roll: '—', username: 'librarian', password: 'lib123', role: 'librarian' },
    { id: 'M002', name: 'Demo Student', roll: '101', username: 'student', password: 'stud123', role: 'student' },
    { id: 'M003', name: 'Riya Sen', roll: '102', username: 'riya', password: 'riya123', role: 'student' },
    { id: 'M004', name: 'Aman Verma', roll: '103', username: 'aman', password: 'aman123', role: 'student' }
  ];
  const issues = [
    { id: 'I001', bookId: 'B02', memberId: 'M002', issued: addDays(t, -20), due: addDays(t, -6), returned: null, fine: 0, paid: false },
    { id: 'I002', bookId: 'B09', memberId: 'M002', issued: addDays(t, -3), due: addDays(t, 11), returned: null, fine: 0, paid: false },
    { id: 'I003', bookId: 'B08', memberId: 'M003', issued: addDays(t, -5), due: addDays(t, 9), returned: null, fine: 0, paid: false },
    { id: 'I004', bookId: 'B01', memberId: 'M004', issued: addDays(t, -30), due: addDays(t, -16), returned: addDays(t, -10), fine: 12, paid: true }
  ];
  const waitlist = [{ id: 'W001', bookId: 'B08', memberId: 'M004', ready: false, date: addDays(t, -1) }];
  return { books, members, issues, waitlist };
}

function load() {
  try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { db = null; }
  if (!db || !db.books) { db = seed(); save(); }
  const sid = localStorage.getItem(USER_KEY);
  user = sid ? db.members.find((m) => m.id === sid) || null : null;
}
function save() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

/* ---------- lookups & rules ---------- */
const bookById = (id) => db.books.find((b) => b.id === id);
const memberById = (id) => db.members.find((m) => m.id === id);
const activeIssues = () => db.issues.filter((i) => !i.returned);
const activeFor = (bookId) => activeIssues().filter((i) => i.bookId === bookId);
const available = (b) => b.copies - activeFor(b.id).length;
const readyHolds = (bookId) => db.waitlist.filter((w) => w.bookId === bookId && w.ready).length;
const freeCopies = (b) => available(b) - readyHolds(b.id);
const loansOf = (mid) => activeIssues().filter((i) => i.memberId === mid);
const isOverdue = (i) => !i.returned && i.due < today();
const currentFine = (i) => i.returned ? i.fine : Math.max(0, diffDays(i.due, today())) * FINE_PER_DAY;
const queueOf = (bookId) => db.waitlist.filter((w) => w.bookId === bookId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
const pendingFine = (mid) => db.issues.filter((i) => i.memberId === mid && !i.paid).reduce((s, i) => s + currentFine(i), 0);

function promoteWaitlist(bookId) {
  const b = bookById(bookId);
  if (!b) return;
  for (const w of queueOf(bookId)) {
    if (freeCopies(b) <= 0) break;
    if (!w.ready) w.ready = true;
  }
}

function issueBook(bookId, memberId) {
  const b = bookById(bookId), m = memberById(memberId);
  if (!b || !m) return { ok: false, msg: 'Select a book and a member.' };
  if (activeFor(bookId).some((i) => i.memberId === memberId)) return { ok: false, msg: `${m.name} already has this book.` };
  if (loansOf(memberId).length >= MAX_LOANS) return { ok: false, msg: `${m.name} has reached the ${MAX_LOANS}-book limit.` };
  const mine = db.waitlist.find((w) => w.bookId === bookId && w.memberId === memberId && w.ready);
  if (freeCopies(b) <= 0 && !mine) return { ok: false, msg: 'No free copy right now. Join the waitlist instead.' };
  if (mine) db.waitlist = db.waitlist.filter((w) => w.id !== mine.id);
  else db.waitlist = db.waitlist.filter((w) => !(w.bookId === bookId && w.memberId === memberId));
  const rec = { id: uid('I'), bookId, memberId, issued: today(), due: addDays(today(), LOAN_DAYS), returned: null, fine: 0, paid: false };
  db.issues.push(rec);
  save();
  return { ok: true, msg: `Issued “${b.title}” to ${m.name}. Due ${fmtDate(rec.due)}.`, rec };
}

function returnBook(issueId) {
  const i = db.issues.find((x) => x.id === issueId);
  if (!i || i.returned) return { ok: false, msg: 'Already returned.' };
  i.returned = today();
  i.fine = Math.max(0, diffDays(i.due, i.returned)) * FINE_PER_DAY;
  i.paid = i.fine === 0;
  promoteWaitlist(i.bookId);
  save();
  return { ok: true, msg: i.fine ? `Returned. Late fine: ${rupees(i.fine)}.` : 'Returned on time. Thank you!' };
}

function reserve(bookId, memberId) {
  const b = bookById(bookId);
  if (activeFor(bookId).some((i) => i.memberId === memberId)) return { ok: false, msg: 'You already have this book.' };
  if (db.waitlist.some((w) => w.bookId === bookId && w.memberId === memberId)) return { ok: false, msg: 'You are already on the waitlist.' };
  db.waitlist.push({ id: uid('W'), bookId, memberId, ready: false, date: today() });
  promoteWaitlist(bookId);
  save();
  return { ok: true, msg: `You joined the waitlist for “${b.title}”.` };
}

/* ---------- rendering: shell ---------- */
function render() {
  const active = document.activeElement;
  const aid = active && active.id, pos = active && active.selectionStart;
  document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'light');
  $('root').innerHTML = user ? appHTML() : authHTML();
  $('modal').innerHTML = ui.modal ? modalHTML() : '';
  if (aid && $(aid) && $(aid).tagName === 'INPUT') {
    const el = $(aid); el.focus();
    try { el.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  }
}

function authHTML() {
  const login = ui.tab === 'login';
  return `
  <div class="auth-wrap">
    <section class="auth-hero">
      <div class="brand"><div class="brand-logo">C</div><div class="brand-name" style="color:#fff">CampusShelf<small style="color:#a7d3cd">Library Management System</small></div></div>
      <h1>Every book,<br>every semester,<br><em>one shelf.</em></h1>
      <p>A library system with separate Librarian and Student sides, late fines, a reservation waitlist and printable issue slips.</p>
      <ul class="hero-list">
        <li>📚 Browse by department &amp; semester</li>
        <li>⏳ Join a waitlist when all copies are out</li>
        <li>💸 Automatic ₹${FINE_PER_DAY}/day late-fine calculator</li>
        <li>🧾 Print an issue slip with a scan code</li>
      </ul>
    </section>
    <section class="auth-card-side">
      <div class="auth-card">
        <h2>${login ? 'Welcome back' : 'Create student account'}</h2>
        <p class="muted" style="font-size:.9rem">${login ? 'Sign in as Librarian or Student.' : 'New students can register here.'}</p>
        <div class="tabs">
          <button class="${login ? 'on' : ''}" data-act="tab" data-v="login">Sign in</button>
          <button class="${!login ? 'on' : ''}" data-act="tab" data-v="register">Register</button>
        </div>
        ${login ? `
        <form data-form="login">
          <label for="lu">Username</label><input id="lu" name="username" autocomplete="username" required>
          <label for="lp">Password</label><input id="lp" name="password" type="password" autocomplete="current-password" required>
          <button class="btn" style="width:100%;margin-top:18px">Sign in</button>
        </form>
        <div class="demo-box">
          Demo accounts:<br>
          <b>Librarian</b> — librarian / lib123 <button data-act="fill" data-u="librarian" data-p="lib123">use</button><br>
          <b>Student</b> — student / stud123 <button data-act="fill" data-u="student" data-p="stud123">use</button>
        </div>` : `
        <form data-form="register">
          <label for="rn">Full name</label><input id="rn" name="name" required>
          <div class="form-row">
            <div><label for="rr">Roll no.</label><input id="rr" name="roll" required></div>
            <div><label for="ru">Username</label><input id="ru" name="username" required></div>
          </div>
          <label for="rp">Password (min 4 chars)</label><input id="rp" name="password" type="password" minlength="4" required>
          <button class="btn" style="width:100%;margin-top:18px">Create account</button>
        </form>`}
      </div>
    </section>
  </div>`;
}

function navItems() {
  if (user.role === 'librarian') {
    const ready = db.waitlist.length;
    return [
      ['dashboard', '📊', 'Dashboard'], ['books', '📚', 'Books'], ['circulation', '🔁', 'Issue / Return'],
      ['waitlist', '⏳', 'Waitlist', ready], ['fines', '💸', 'Fines'], ['members', '👥', 'Members']
    ];
  }
  const myReady = db.waitlist.filter((w) => w.memberId === user.id && w.ready).length;
  return [['browse', '🔎', 'Browse books'], ['mybooks', '📖', 'My books', loansOf(user.id).length], ['reservations', '⏳', 'My waitlist', myReady], ['myfines', '💸', 'My fines']];
}

function appHTML() {
  const nav = navItems();
  if (!view || !nav.some((n) => n[0] === view)) view = nav[0][0];
  const dark = (localStorage.getItem(THEME_KEY) || 'light') === 'dark';
  return `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-logo">C</div><div class="brand-name">CampusShelf<small>Library Management</small></div></div>
      ${nav.map((n) => `<button class="nav-btn ${view === n[0] ? 'on' : ''}" data-act="nav" data-v="${n[0]}"><span>${n[1]}</span>${n[2]}${n[3] ? `<span class="nav-count">${n[3]}</span>` : ''}</button>`).join('')}
      <div class="side-spacer"></div>
      <div class="side-foot">
        <div class="who"><div class="avatar">${esc(user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</div><div><b>${esc(user.name)}</b><span>${user.role === 'librarian' ? 'Librarian' : 'Student · Roll ' + esc(user.roll)}</span></div></div>
        <button class="btn ghost small" data-act="theme">${dark ? '☀️ Light mode' : '🌙 Dark mode'}</button>
        ${user.role === 'librarian' ? '<button class="btn ghost small" data-act="reset">↺ Reset demo data</button>' : ''}
        <button class="btn small" data-act="logout">Log out</button>
      </div>
    </aside>
    <main class="main">${pageHTML()}</main>
  </div>`;
}

function pageHTML() {
  const pages = {
    dashboard: pDashboard, books: pBooks, circulation: pCirculation, waitlist: pWaitlist, fines: pFines, members: pMembers,
    browse: pBrowse, mybooks: pMyBooks, reservations: pReservations, myfines: pMyFines
  };
  return (pages[view] || pDashboard)();
}

const head = (title, sub, actions) => `<div class="page-head"><div><div class="eyebrow">${user && user.role === 'librarian' ? 'Librarian desk' : 'Your reading space'}</div><h1>${title}</h1><p>${sub || ''}</p></div><div class="head-actions">${actions || ''}</div></div>`;
const table = (cols, rows, emptyMsg) => rows.length
  ? `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  : `<div class="card empty">${emptyMsg}</div>`;

/* ---------- hero banner ---------- */
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
function heroHTML() {
  const first = esc(user.name.split(' ')[0]);
  const lib = user.role === 'librarian';
  const overdue = activeIssues().filter(isOverdue).length;
  const chips = lib
    ? `<span class="chip">⏰ ${overdue} overdue</span><span class="chip">⏳ ${db.waitlist.length} on waitlist</span><span class="chip">📚 ${db.books.length} titles</span>`
    : `<span class="chip">📖 ${loansOf(user.id).length}/${MAX_LOANS} borrowed</span><span class="chip">💸 ${rupees(pendingFine(user.id))} fines</span>`;
  const actions = lib
    ? '<button class="btn light" data-act="addBook">＋ Add a book</button><button class="btn glass" data-act="nav" data-v="circulation">Issue / Return</button>'
    : '<button class="btn light" data-act="nav" data-v="mybooks">My books</button><button class="btn glass" data-act="nav" data-v="reservations">My waitlist</button>';
  return `<section class="hero">
    <div class="hero-text">
      <div class="eyebrow">${greet()}, ${first}</div>
      <h1>${lib ? 'Keep the shelves <em>alive</em> and readers <em>happy</em>.' : 'Your next <em>great read</em> is one tap away.'}</h1>
      <p>${lib ? 'Issue, return and track every book across departments and semesters.' : 'Browse by department and semester, borrow instantly, or join the waitlist.'}</p>
      <div class="hero-actions">${actions}</div>
      <div class="chips">${chips}</div>
    </div>
    <div class="hero-art" aria-hidden="true"><i class="spine s1"></i><i class="spine s2"></i><i class="spine s3"></i><i class="spine s4"></i><i class="spine s5"></i></div>
  </section>`;
}

/* ---------- librarian pages ---------- */
function pDashboard() {
  const act = activeIssues();
  const totalCopies = db.books.reduce((s, b) => s + b.copies, 0);
  const overdue = act.filter(isOverdue).length;
  const pend = db.members.reduce((s, m) => s + pendingFine(m.id), 0);
  const byDept = DEPTS.map((d) => ({ d, n: db.books.filter((b) => b.dept === d).reduce((s, b) => s + b.copies, 0) }));
  const maxD = Math.max(1, ...byDept.map((x) => x.n));
  const counts = {};
  db.issues.forEach((i) => { counts[i.bookId] = (counts[i.bookId] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = [...db.issues].sort((a, b) => (b.returned || b.issued).localeCompare(a.returned || a.issued)).slice(0, 6);
  return `
  ${heroHTML()}
  <div class="grid stats">
    <div class="stat"><div class="ico">📚</div><small>Titles</small><div class="num">${db.books.length}</div></div>
    <div class="stat"><div class="ico">🗂️</div><small>Total copies</small><div class="num">${totalCopies}</div></div>
    <div class="stat"><div class="ico">✅</div><small>Available</small><div class="num">${totalCopies - act.length}</div></div>
    <div class="stat warn"><div class="ico">📤</div><small>Issued</small><div class="num">${act.length}</div></div>
    <div class="stat bad"><div class="ico">⏰</div><small>Overdue</small><div class="num">${overdue}</div></div>
    <div class="stat bad"><div class="ico">💸</div><small>Fines pending</small><div class="num">${rupees(pend)}</div></div>
  </div>
  <div class="grid two-col">
    <div class="card"><h3>Copies by department</h3>
      ${byDept.map((x) => `<div class="bar-row"><span>${x.d}</span><div class="bar-track"><div class="bar-fill" style="width:${(x.n / maxD) * 100}%"></div></div><b>${x.n}</b></div>`).join('')}
    </div>
    <div class="card"><h3>Most borrowed</h3>
      ${top.length ? `<ul class="feed">${top.map(([id, n]) => `<li><span class="dot"></span><span style="flex:1">${esc(bookById(id)?.title || id)}</span><span class="badge info">${n}×</span></li>`).join('')}</ul>` : '<div class="empty">No activity yet.</div>'}
    </div>
    <div class="card" style="grid-column:1/-1"><h3>Recent activity</h3>
      <ul class="feed">${recent.map((i) => `<li><span class="dot ${i.returned ? 'ret' : ''}"></span><span style="flex:1"><b>${esc(memberById(i.memberId)?.name)}</b> ${i.returned ? 'returned' : 'borrowed'} “${esc(bookById(i.bookId)?.title)}”</span><span class="muted">${fmtDate(i.returned || i.issued)}</span></li>`).join('')}</ul>
    </div>
  </div>`;
}

function filteredBooks() {
  const q = ui.q.trim().toLowerCase();
  return db.books.filter((b) =>
    (ui.dept === 'All' || b.dept === ui.dept) &&
    (ui.sem === 'All' || String(b.sem) === ui.sem) &&
    (!q || (b.title + ' ' + b.author + ' ' + b.id).toLowerCase().includes(q)));
}
const deptOptions = () => ['All', ...DEPTS].map((d) => `<option value="${d}" ${ui.dept === d ? 'selected' : ''}>${d === 'All' ? 'All departments' : d}</option>`).join('');
const semOptions = () => ['All', 1, 2, 3, 4, 5, 6, 7, 8].map((s) => `<option value="${s}" ${ui.sem === String(s) ? 'selected' : ''}>${s === 'All' ? 'All semesters' : 'Semester ' + s}</option>`).join('');

function pBooks() {
  const rows = filteredBooks().map((b) => {
    const free = available(b);
    return `<tr><td>${b.id}</td><td><b>${esc(b.title)}</b><br><span class="muted">${esc(b.author)}</span></td><td><span class="badge info">${b.dept}</span></td><td>${b.sem}</td><td>${b.copies}</td>
      <td>${free > 0 ? `<span class="badge ok">${free} available</span>` : '<span class="badge bad">All issued</span>'}</td>
      <td><div class="row-actions"><button class="btn ghost small" data-act="editBook" data-id="${b.id}">Edit</button><button class="btn danger small" data-act="delBook" data-id="${b.id}">Delete</button></div></td></tr>`;
  });
  return `
  ${head('Books', 'Manage the catalogue', '<button class="btn" data-act="addBook">＋ Add book</button>')}
  <div class="toolbar">
    <input class="grow" id="q" data-filter="q" placeholder="Search title, author or ID…" value="${esc(ui.q)}">
    <select data-filter="dept">${deptOptions()}</select><select data-filter="sem">${semOptions()}</select>
  </div>
  ${table(['ID', 'Book', 'Dept', 'Sem', 'Copies', 'Status', 'Actions'], rows, 'No books match your search.')}`;
}

function pCirculation() {
  const students = db.members.filter((m) => m.role === 'student');
  const rows = [...activeIssues()].sort((a, b) => a.due.localeCompare(b.due)).map((i) => {
    const od = isOverdue(i);
    return `<tr class="${od ? 'overdue' : ''}"><td>${i.id}</td><td>${esc(bookById(i.bookId)?.title)}</td><td>${esc(memberById(i.memberId)?.name)}</td><td>${fmtDate(i.issued)}</td><td>${fmtDate(i.due)}</td>
      <td>${od ? `<span class="badge bad">${diffDays(i.due, today())}d late · ${rupees(currentFine(i))}</span>` : '<span class="badge ok">On time</span>'}</td>
      <td><div class="row-actions"><button class="btn small" data-act="return" data-id="${i.id}">Return</button><button class="btn ghost small" data-act="slip" data-id="${i.id}">Slip</button></div></td></tr>`;
  });
  return `
  ${head('Issue / Return', `Loan period ${LOAN_DAYS} days · late fine ${rupees(FINE_PER_DAY)}/day · max ${MAX_LOANS} books per student`, '<button class="btn ghost" data-act="csv">⬇ Export CSV</button>')}
  <div class="grid split">
    <div class="card"><h3>Issue a book</h3>
      <form data-form="issue">
        <label for="ib">Book</label>
        <select id="ib" name="book" required><option value="">Select a book…</option>${db.books.map((b) => `<option value="${b.id}">${esc(b.title)} (${freeCopies(b)} free${readyHolds(b.id) ? ', ' + readyHolds(b.id) + ' on hold' : ''})</option>`).join('')}</select>
        <label for="im">Student</label>
        <select id="im" name="member" required><option value="">Select a student…</option>${students.map((m) => `<option value="${m.id}">${esc(m.name)} · Roll ${esc(m.roll)}</option>`).join('')}</select>
        <button class="btn" style="width:100%;margin-top:18px">Issue book</button>
      </form>
    </div>
    <div><h3 style="margin-bottom:10px;font-family:Georgia,serif">Currently issued (${rows.length})</h3>
      ${table(['ID', 'Book', 'Student', 'Issued', 'Due', 'Status', 'Actions'], rows, 'Nothing is issued right now.')}
    </div>
  </div>`;
}

function pWaitlist() {
  const rows = [];
  db.books.forEach((b) => queueOf(b.id).forEach((w, idx) => {
    rows.push(`<tr><td>${esc(b.title)}</td><td>${esc(memberById(w.memberId)?.name)}</td><td>#${idx + 1}</td><td>${fmtDate(w.date)}</td>
      <td>${w.ready ? '<span class="badge ok">Copy ready — held</span>' : '<span class="badge warn">Waiting</span>'}</td>
      <td><button class="btn ghost small" data-act="cancelWait" data-id="${w.id}">Remove</button></td></tr>`);
  }));
  return `${head('Waitlist', 'When a copy is returned, the first student in line gets it held automatically.')}
  ${table(['Book', 'Student', 'Position', 'Joined', 'Status', ''], rows, 'Nobody is waiting for a book.')}`;
}

function pFines() {
  const list = db.issues.filter((i) => currentFine(i) > 0).sort((a, b) => b.issued.localeCompare(a.issued));
  const rows = list.map((i) => `<tr><td>${esc(memberById(i.memberId)?.name)}</td><td>${esc(bookById(i.bookId)?.title)}</td><td>${fmtDate(i.due)}</td><td>${i.returned ? fmtDate(i.returned) : '<span class="badge warn">Not returned</span>'}</td>
    <td><b>${rupees(currentFine(i))}</b></td>
    <td>${i.paid ? '<span class="badge ok">Paid</span>' : i.returned ? '<span class="badge bad">Unpaid</span>' : '<span class="badge warn">Accruing</span>'}</td>
    <td>${!i.paid && i.returned ? `<button class="btn small" data-act="pay" data-id="${i.id}">Mark paid</button>` : ''}</td></tr>`);
  const pend = db.members.reduce((s, m) => s + pendingFine(m.id), 0);
  return `${head('Fines', `Total pending: <b>${rupees(pend)}</b> (${rupees(FINE_PER_DAY)} per day late)`)}
  ${table(['Student', 'Book', 'Due', 'Returned', 'Fine', 'Status', ''], rows, 'No fines — everyone is on time 🎉')}`;
}

function pMembers() {
  const rows = db.members.map((m) => `<tr><td>${m.id}</td><td><b>${esc(m.name)}</b></td><td>${esc(m.roll)}</td><td>${esc(m.username)}</td>
    <td><span class="badge ${m.role === 'librarian' ? 'warn' : 'info'}">${m.role}</span></td><td>${m.role === 'student' ? loansOf(m.id).length + ' / ' + MAX_LOANS : '—'}</td>
    <td>${m.role === 'student' ? rupees(pendingFine(m.id)) : '—'}</td></tr>`);
  return `${head('Members', 'Everyone with an account')}${table(['ID', 'Name', 'Roll', 'Username', 'Role', 'Books held', 'Fines due'], rows, 'No members.')}`;
}

/* ---------- student pages ---------- */
function coverHTML(b) {
  const [c1, c2] = DEPT_COLORS[b.dept] || DEPT_COLORS.General;
  const initials = b.title.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return `<div class="cover" style="background:linear-gradient(145deg,${c1},${c2})"><span class="initials">${initials}</span><span class="dept-tag">${b.dept} · Sem ${b.sem}</span></div>`;
}

function pBrowse() {
  const cards = filteredBooks().map((b) => {
    const mine = activeFor(b.id).some((i) => i.memberId === user.id);
    const ready = db.waitlist.find((w) => w.bookId === b.id && w.memberId === user.id && w.ready);
    const queued = db.waitlist.find((w) => w.bookId === b.id && w.memberId === user.id && !w.ready);
    const free = freeCopies(b);
    let btn;
    if (mine) btn = '<span class="badge info">You have it</span>';
    else if (ready) btn = `<button class="btn warn small" data-act="borrow" data-id="${b.id}">Collect now</button>`;
    else if (queued) btn = `<span class="badge warn">Waitlist #${queueOf(b.id).findIndex((w) => w.id === queued.id) + 1}</span>`;
    else if (free > 0) btn = `<button class="btn small" data-act="borrow" data-id="${b.id}">Borrow</button>`;
    else btn = `<button class="btn ghost small" data-act="reserve" data-id="${b.id}">Join waitlist</button>`;
    return `<article class="book-card">${coverHTML(b)}<div class="book-body"><h4>${esc(b.title)}</h4><span class="author">${esc(b.author)}</span>
      <div class="book-foot">${free > 0 ? `<span class="badge ok">${free} free</span>` : '<span class="badge bad">Out</span>'}${btn}</div></div></article>`;
  });
  return `${heroHTML()}
  <div class="toolbar">
    <input class="grow" id="q" data-filter="q" placeholder="Search title or author…" value="${esc(ui.q)}">
    <select data-filter="dept">${deptOptions()}</select><select data-filter="sem">${semOptions()}</select>
  </div>
  ${cards.length ? `<div class="book-grid">${cards.join('')}</div>` : '<div class="card empty">No books match your search.</div>'}`;
}

function pMyBooks() {
  const mine = db.issues.filter((i) => i.memberId === user.id);
  const cur = mine.filter((i) => !i.returned).map((i) => {
    const od = isOverdue(i), left = diffDays(today(), i.due);
    return `<tr class="${od ? 'overdue' : ''}"><td>${esc(bookById(i.bookId)?.title)}</td><td>${fmtDate(i.issued)}</td><td>${fmtDate(i.due)}</td>
      <td>${od ? `<span class="badge bad">${-left}d late · ${rupees(currentFine(i))}</span>` : `<span class="badge ok">${left} day${left === 1 ? '' : 's'} left</span>`}</td>
      <td><div class="row-actions"><button class="btn small" data-act="return" data-id="${i.id}">Return</button><button class="btn ghost small" data-act="slip" data-id="${i.id}">Slip</button></div></td></tr>`;
  });
  const hist = mine.filter((i) => i.returned).sort((a, b) => b.returned.localeCompare(a.returned)).map((i) =>
    `<tr><td>${esc(bookById(i.bookId)?.title)}</td><td>${fmtDate(i.issued)}</td><td>${fmtDate(i.returned)}</td><td>${i.fine ? rupees(i.fine) : '—'}</td></tr>`);
  return `${head('My books', `You can hold up to ${MAX_LOANS} books · ${loansOf(user.id).length} borrowed now`)}
  ${table(['Book', 'Issued', 'Due', 'Status', ''], cur, 'You have no books right now. Head to Browse!')}
  <h3 style="margin:26px 0 10px;font-family:Georgia,serif">Reading history</h3>
  ${table(['Book', 'Issued', 'Returned', 'Fine'], hist, 'No returned books yet.')}`;
}

function pReservations() {
  const mine = db.waitlist.filter((w) => w.memberId === user.id);
  const rows = mine.map((w) => {
    const pos = queueOf(w.bookId).findIndex((x) => x.id === w.id) + 1;
    return `<tr><td>${esc(bookById(w.bookId)?.title)}</td><td>${fmtDate(w.date)}</td><td>#${pos}</td>
      <td>${w.ready ? '<span class="badge ok">Ready — collect it!</span>' : '<span class="badge warn">Waiting</span>'}</td>
      <td><div class="row-actions">${w.ready ? `<button class="btn warn small" data-act="borrow" data-id="${w.bookId}">Collect</button>` : ''}<button class="btn ghost small" data-act="cancelWait" data-id="${w.id}">Leave</button></div></td></tr>`;
  });
  return `${head('My waitlist', 'Books you are waiting for')}${table(['Book', 'Joined', 'Position', 'Status', ''], rows, 'You are not on any waitlist.')}`;
}

function pMyFines() {
  const list = db.issues.filter((i) => i.memberId === user.id && currentFine(i) > 0);
  const rows = list.map((i) => `<tr><td>${esc(bookById(i.bookId)?.title)}</td><td>${fmtDate(i.due)}</td><td>${i.returned ? fmtDate(i.returned) : 'Not returned'}</td><td><b>${rupees(currentFine(i))}</b></td>
    <td>${i.paid ? '<span class="badge ok">Paid</span>' : i.returned ? '<span class="badge bad">Pay at counter</span>' : '<span class="badge warn">Accruing</span>'}</td></tr>`);
  return `${head('My fines', `Total pending: <b>${rupees(pendingFine(user.id))}</b> · ${rupees(FINE_PER_DAY)} per day after the due date`)}
  ${table(['Book', 'Due', 'Returned', 'Fine', 'Status'], rows, 'You have no fines. Keep it up! 🎉')}`;
}

/* ---------- modal ---------- */
function qrSvg(text) {
  const N = 21;
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const cells = [];
  const finder = (x, y) => (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
  const finderOn = (x, y) => {
    const fx = x >= N - 7 ? x - (N - 7) : x, fy = y >= N - 7 ? y - (N - 7) : y;
    return fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4);
  };
  let s = h;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const on = finder(x, y) ? finderOn(x, y) : (s >>> 28) % 2 === 0;
    if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  return `<svg viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges" fill="#111">${cells.join('')}</svg>`;
}

function modalHTML() {
  const m = ui.modal;
  if (m.type === 'book') {
    const b = m.id ? bookById(m.id) : { title: '', author: '', dept: 'CSE', sem: 1, copies: 1 };
    return `<div class="modal-backdrop" data-act="closeModal"><div class="modal" onclick="event.stopPropagation()">
      <h3>${m.id ? 'Edit book' : 'Add a book'}</h3>
      <form data-form="book" data-id="${m.id || ''}">
        <label for="bt">Title</label><input id="bt" name="title" value="${esc(b.title)}" required>
        <label for="ba">Author</label><input id="ba" name="author" value="${esc(b.author)}" required>
        <div class="form-row">
          <div><label for="bd">Department</label><select id="bd" name="dept">${DEPTS.map((d) => `<option ${b.dept === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
          <div><label for="bs">Semester</label><select id="bs" name="sem">${[1, 2, 3, 4, 5, 6, 7, 8].map((s) => `<option ${b.sem === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div>
        <label for="bc">Copies</label><input id="bc" name="copies" type="number" min="1" max="99" value="${b.copies}" required>
        <div class="modal-actions"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button class="btn">${m.id ? 'Save changes' : 'Add book'}</button></div>
      </form></div></div>`;
  }
  if (m.type === 'slip') {
    const i = db.issues.find((x) => x.id === m.id);
    const b = bookById(i.bookId), mem = memberById(i.memberId);
    return `<div class="modal-backdrop" data-act="closeModal"><div class="modal" onclick="event.stopPropagation()">
      <h3 class="no-print">Issue slip</h3>
      <div class="slip">
        <div class="slip-head"><b style="font-family:Georgia,serif;font-size:1.1rem">CampusShelf Library</b><span class="muted">${i.id}</span></div>
        <dl><dt>Book</dt><dd>${esc(b.title)}</dd><dt>Author</dt><dd>${esc(b.author)}</dd><dt>Borrower</dt><dd>${esc(mem.name)} (Roll ${esc(mem.roll)})</dd>
        <dt>Issued on</dt><dd>${fmtDate(i.issued)}</dd><dt>Due date</dt><dd>${fmtDate(i.due)}</dd><dt>Late fine</dt><dd>${rupees(FINE_PER_DAY)} per day</dd></dl>
        <div class="slip-qr"><span class="slip-note">Please return on or before the due date.<br>Show this slip at the counter.</span>${qrSvg(i.id + b.id + mem.id + i.issued)}</div>
      </div>
      <div class="modal-actions no-print"><button class="btn ghost" data-act="closeModal">Close</button><button class="btn" data-act="print">🖨 Print slip</button></div>
    </div></div>`;
  }
  return '';
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.classList.contains('modal-backdrop') && e.target !== el) return;
  const act = el.dataset.act, id = el.dataset.id;
  switch (act) {
    case 'tab': ui.tab = el.dataset.v; break;
    case 'fill': ui.tab = 'login'; render(); $('lu').value = el.dataset.u; $('lp').value = el.dataset.p; return;
    case 'nav': view = el.dataset.v; ui.q = ''; ui.dept = 'All'; ui.sem = 'All'; break;
    case 'theme': localStorage.setItem(THEME_KEY, (localStorage.getItem(THEME_KEY) || 'light') === 'dark' ? 'light' : 'dark'); break;
    case 'logout': localStorage.removeItem(USER_KEY); user = null; view = ''; ui.tab = 'login'; break;
    case 'reset':
      if (!confirm('Reset all library data back to the demo data?')) return;
      db = seed(); save(); user = db.members.find((m) => m.id === user.id) || db.members[0]; toast('Demo data restored.'); break;
    case 'addBook': ui.modal = { type: 'book' }; break;
    case 'editBook': ui.modal = { type: 'book', id }; break;
    case 'closeModal': ui.modal = null; break;
    case 'delBook': {
      const b = bookById(id);
      if (activeFor(id).length) { toast('Cannot delete: copies are still issued.', true); return; }
      if (!confirm(`Delete “${b.title}”?`)) return;
      db.books = db.books.filter((x) => x.id !== id); db.waitlist = db.waitlist.filter((w) => w.bookId !== id); save(); toast('Book deleted.'); break;
    }
    case 'borrow': {
      const r = issueBook(id, user.id); toast(r.msg, !r.ok);
      if (r.ok) ui.modal = { type: 'slip', id: r.rec.id };
      break;
    }
    case 'reserve': { const r = reserve(id, user.id); toast(r.msg, !r.ok); break; }
    case 'return': { const r = returnBook(id); toast(r.msg, !r.ok); break; }
    case 'cancelWait': {
      const w = db.waitlist.find((x) => x.id === id);
      db.waitlist = db.waitlist.filter((x) => x.id !== id);
      if (w) promoteWaitlist(w.bookId);
      save(); toast('Removed from waitlist.'); break;
    }
    case 'pay': { const i = db.issues.find((x) => x.id === id); if (i) { i.paid = true; save(); toast('Fine marked as paid.'); } break; }
    case 'slip': ui.modal = { type: 'slip', id }; break;
    case 'print': window.print(); return;
    case 'csv': exportCSV(); return;
    default: return;
  }
  render();
});

document.addEventListener('input', (e) => {
  const f = e.target.dataset && e.target.dataset.filter;
  if (!f) return;
  ui[f] = e.target.value;
  render();
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(form).entries());
  switch (form.dataset.form) {
    case 'login': {
      const m = db.members.find((x) => x.username.toLowerCase() === d.username.trim().toLowerCase() && x.password === d.password);
      if (!m) { toast('Wrong username or password.', true); return; }
      user = m; localStorage.setItem(USER_KEY, m.id); view = ''; toast('Welcome, ' + m.name + '!'); break;
    }
    case 'register': {
      const uname = d.username.trim();
      if (db.members.some((x) => x.username.toLowerCase() === uname.toLowerCase())) { toast('That username is taken.', true); return; }
      const m = { id: 'M' + pad(db.members.length + 1) + uid('').slice(0, 2), name: d.name.trim(), roll: d.roll.trim(), username: uname, password: d.password, role: 'student' };
      db.members.push(m); save(); user = m; localStorage.setItem(USER_KEY, m.id); view = ''; toast('Account created. Welcome!'); break;
    }
    case 'issue': {
      const r = issueBook(d.book, d.member); toast(r.msg, !r.ok);
      if (r.ok) ui.modal = { type: 'slip', id: r.rec.id };
      break;
    }
    case 'book': {
      const copies = Math.max(1, parseInt(d.copies, 10) || 1), sem = parseInt(d.sem, 10);
      if (form.dataset.id) {
        const b = bookById(form.dataset.id);
        if (copies < activeFor(b.id).length) { toast(`Copies cannot be less than the ${activeFor(b.id).length} currently issued.`, true); return; }
        Object.assign(b, { title: d.title.trim(), author: d.author.trim(), dept: d.dept, sem, copies });
        promoteWaitlist(b.id); toast('Book updated.');
      } else {
        const next = db.books.reduce((mx, b) => Math.max(mx, parseInt(b.id.slice(1), 10) || 0), 0) + 1;
        db.books.push({ id: 'B' + pad(next), title: d.title.trim(), author: d.author.trim(), dept: d.dept, sem, copies });
        toast('Book added.');
      }
      save(); ui.modal = null; break;
    }
    default: return;
  }
  render();
});

function exportCSV() {
  const rows = [['Issue ID', 'Book', 'Member', 'Issued', 'Due', 'Returned', 'Fine (INR)', 'Paid']];
  db.issues.forEach((i) => rows.push([i.id, bookById(i.bookId)?.title, memberById(i.memberId)?.name, i.issued, i.due, i.returned || '', currentFine(i), i.paid ? 'yes' : 'no']));
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'campusshelf-issues.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('CSV downloaded.');
}

/* ---------- start ---------- */
load();
render();
