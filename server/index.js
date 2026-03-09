// load .env early
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fetch = require('node-fetch');
// Enhanced ICS parser (extracts more booking details)
function parseIcs(text){
  const events = [];
  const parts = text.split(/BEGIN:VEVENT/).slice(1);
  parts.forEach(p => {
    const block = 'BEGIN:VEVENT' + p;
    const uidMatch = block.match(/UID:(.*)/);
    const summaryMatch = block.match(/SUMMARY:(.*)/);
    const descriptionMatch = block.match(/DESCRIPTION:(.*)/);
    const dtstartMatch = block.match(/DTSTART(?:;[^:]*)?:(.*)/);
    const dtendMatch = block.match(/DTEND(?:;[^:]*)?:(.*)/);
    const dtstampMatch = block.match(/DTSTAMP:(.*)/);
    
    const uid = uidMatch ? uidMatch[1].trim() : null;
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';
    const dtstart = dtstartMatch ? dtstartMatch[1].trim() : null;
    const dtend = dtendMatch ? dtendMatch[1].trim() : null;
    const dtstamp = dtstampMatch ? dtstampMatch[1].trim() : null;
    
    // Extract booking ID from UID (format: 20260308140000-b83455318@beds24.com)
    let bookingId = null;
    const bookingIdMatch = uid ? uid.match(/-b(\d+)@/) : null;
    if(bookingIdMatch) bookingId = bookingIdMatch[1];
    
    // Extract arrival/departure from description (format: "Arriving 08 Mar 2026\nDeparting 10 Mar 2026")
    let arrival = null, departure = null;
    if(description){
      const arriveMatch = description.match(/Arriving\s+(.+)/);
      const deptMatch = description.match(/Departing\s+(.+)/);
      if(arriveMatch) arrival = arriveMatch[1].trim();
      if(deptMatch) departure = deptMatch[1].trim();
    }
    
    function parseDate(s){
      if(!s) return null;
      // date only YYYYMMDD
      if(/^\d{8}$/.test(s)) return new Date(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8));
      // date-time YYYYMMDDTHHMMSS or with Z
      const z = s.endsWith('Z');
      const m = s.match(/(\d{8})T(\d{6})/);
      if(m){
        const iso = `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}T${m[2].slice(0,2)}:${m[2].slice(2,4)}:${m[2].slice(4,6)}` + (z? 'Z' : '');
        return new Date(iso);
      }
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    const start = parseDate(dtstart);
    const end = parseDate(dtend);
    const created = dtstamp ? parseDate(dtstamp) : null;
    
    if(start && end) {
      events.push({ 
        uid, 
        bookingId,
        summary, 
        description,
        arrival,
        departure,
        start: start.toISOString(), 
        end: end.toISOString(),
        createdAt: created ? created.toISOString() : null,
        nights: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      });
    }
  });
  return events;
}
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname);
const PROPS_FILE = path.join(DATA_DIR, 'properties.json');
const CACHE_DIR = path.join(DATA_DIR, 'cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

const app = express();
app.use(cors());
app.use(express.json());

// Simple auth (no DB). Read defaults from environment or .env file.
const DEFAULT_USER = process.env.ADMIN_USER || 'admin';
const DEFAULT_PASS = process.env.ADMIN_PASS || 'Password123!';
const TOKENS = {}; // token -> { user, expires }

function generateToken() {
  return uuidv4();
}

function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'missing token' });
  const parts = auth.split(' ');
  if (parts.length !== 2) return res.status(401).json({ error: 'invalid auth header' });
  const token = parts[1];
  const info = TOKENS[token];
  if (!info) return res.status(401).json({ error: 'invalid token' });
  if (new Date() > new Date(info.expires)) { delete TOKENS[token]; return res.status(401).json({ error: 'token expired' }); }
  req.user = info.user;
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username === DEFAULT_USER && password === DEFAULT_PASS) {
    const token = generateToken();
    const expires = new Date(Date.now() + 24 * 3600 * 1000); // 24h
    TOKENS[token] = { user: username, expires: expires.toISOString() };
    return res.json({ token, expires: expires.toISOString() });
  }
  return res.status(401).json({ error: 'invalid credentials' });
});


function readProperties() {
  try {
    const raw = fs.readFileSync(PROPS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeProperties(props) {
  fs.writeFileSync(PROPS_FILE, JSON.stringify(props, null, 2));
}

async function downloadIcs(property) {
  const url = property.icsUrl;
  const id = property.id;
  const dest = path.join(CACHE_DIR, `${id}.json`);
  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) throw new Error('Failed to fetch: ' + res.status);
    const text = await res.text();
    // parse with simple internal parser
    const events = parseIcs(text);
    const payload = { fetchedAt: new Date().toISOString(), events };
    fs.writeFileSync(dest, JSON.stringify(payload, null, 2));
    return payload;
  } catch (err) {
    console.error('downloadIcs error for', id, err.message || err);
    return { error: err.message };
  }
}

// Background fetch but don't await - returns immediately
function triggerBackgroundFetch(property) {
  setImmediate(async () => {
    await downloadIcs(property);
  });
}

// Protected endpoints: require token
app.get('/api/properties', requireAuth, (req, res) => {
  const props = readProperties();
  const auth = req.headers['authorization'];
  const token = auth.replace('Bearer ', '');
  const payload = TOKENS[token];
  const username = payload.user;
  const isAdminUser = username === DEFAULT_USER;
  
  if (isAdminUser) {
    res.json(props);
  } else {
    // Non-admin: only accessible properties
    const users = readUsers();
    const user = users.find(u => u.username === username);
    const accessibleIds = user?.accessibleProperties || [];
    const filtered = props.filter(p => accessibleIds.includes(p.id));
    res.json(filtered);
  }
});

app.post('/api/properties', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const { name, icsUrl } = req.body;
  if (!name || !icsUrl) return res.status(400).json({ error: 'name and icsUrl required' });
  const props = readProperties();
  const existing = props.find(p => p.icsUrl === icsUrl || p.name === name);
  if (existing) {
    // trigger background re-fetch and return existing
    triggerBackgroundFetch(existing);
    return res.json({ existing, message: 'already exists, refresh triggered' });
  }
  const newProp = { id: uuidv4(), name, icsUrl, createdAt: new Date().toISOString() };
  props.push(newProp);
  writeProperties(props);
  // trigger background download
  triggerBackgroundFetch(newProp);
  res.status(201).json(newProp);
});

app.delete('/api/properties/:id', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const id = req.params.id;
  let props = readProperties();
  const exists = props.find(p => p.id === id);
  if (!exists) return res.status(404).json({ error: 'not found' });
  props = props.filter(p => p.id !== id);
  writeProperties(props);
  // remove cache
  const dest = path.join(CACHE_DIR, `${id}.json`);
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
  res.json({ ok: true });
});

// update property (name, icsUrl)
app.put('/api/properties/:id', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const id = req.params.id;
  const { name, icsUrl } = req.body || {};
  if (!name || !icsUrl) return res.status(400).json({ error: 'name and icsUrl required' });
  let props = readProperties();
  const idx = props.findIndex(p => p.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const old = props[idx];
  props[idx] = { ...old, name, icsUrl, updatedAt: new Date().toISOString() };
  writeProperties(props);
  // trigger background fetch if url changed
  if (old.icsUrl !== icsUrl) triggerBackgroundFetch(props[idx]);
  res.json({ ok: true, property: props[idx] });
});

// trigger an immediate refresh for a property
app.post('/api/properties/:id/refresh', requireAuth, async (req, res) => {
  const id = req.params.id;
  const props = readProperties();
  const prop = props.find(p => p.id === id);
  if (!prop) return res.status(404).json({ error: 'not found' });
  const result = await downloadIcs(prop);
  if (result && result.error) return res.status(500).json({ error: result.error });
  return res.json({ ok: true, fetchedAt: result.fetchedAt, count: (result.events||[]).length });
});

// return bookings overlapping a date range
app.get('/api/properties/:id/bookings', (req, res) => {
  const id = req.params.id;
  const from = req.query.from; // ISO yyyy-mm-dd
  const to = req.query.to;
  const cacheFile = path.join(CACHE_DIR, `${id}.json`);
  if (!fs.existsSync(cacheFile)) return res.status(404).json({ error: 'no cache yet' });
  const raw = fs.readFileSync(cacheFile, 'utf8');
  const parsed = JSON.parse(raw);
  const events = parsed.events || [];
  let filtered = events;
  if (from || to) {
    const fromDate = from ? new Date(from) : new Date('1970-01-01');
    const toDate = to ? new Date(to) : new Date('2100-01-01');
    filtered = events.filter(e => {
      const s = e.start ? new Date(e.start) : null;
      const en = e.end ? new Date(e.end) : null;
      if (!s || !en) return false;
      // overlap test
      return s < toDate && en > fromDate;
    });
  }
  res.json({ fetchedAt: parsed.fetchedAt, events: filtered });
});

app.get('/api/properties/:id/status', (req, res) => {
  const id = req.params.id;
  const cacheFile = path.join(CACHE_DIR, `${id}.json`);
  if (!fs.existsSync(cacheFile)) return res.json({ status: 'not-fetched' });
  const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  res.json({ status: 'ok', fetchedAt: parsed.fetchedAt, count: (parsed.events || []).length });
});


// ===== USER MANAGEMENT SYSTEM =====
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function readUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch (e) { console.error('Error reading users:', e); return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Only admin (from .env) can create/manage users
function isAdmin(req) {
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const token = auth.replace('Bearer ', '');
  const payload = TOKENS[token];
  return payload && payload.user === DEFAULT_USER;
}

// Get all users (admin only)
app.get('/api/users', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const users = readUsers();
  res.json(users.map(u => ({ id: u.id, username: u.username, accessibleProperties: u.accessibleProperties || [], createdAt: u.createdAt })));
});

// Create new user (admin only)
app.post('/api/users', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const { username, password, accessibleProperties } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User already exists' });
  
  const newUser = {
    id: uuidv4(),
    username,
    password, // In production, hash this!
    accessibleProperties: accessibleProperties || [],
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeUsers(users);
  res.json({ id: newUser.id, username: newUser.username, accessibleProperties: newUser.accessibleProperties, createdAt: newUser.createdAt });
});

// Update user's accessible properties (admin only)
app.put('/api/users/:userId', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const { userId } = req.params;
  const { accessibleProperties } = req.body;
  if (!Array.isArray(accessibleProperties)) return res.status(400).json({ error: 'accessibleProperties must be an array' });
  
  const users = readUsers();
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  user.accessibleProperties = accessibleProperties;
  writeUsers(users);
  res.json({ id: user.id, username: user.username, accessibleProperties: user.accessibleProperties });
});

// Delete user (admin only)
app.delete('/api/users/:userId', requireAuth, (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Admin only' });
  const { userId } = req.params;
  
  let users = readUsers();
  const initialLength = users.length;
  users = users.filter(u => u.id !== userId);
  
  if (users.length === initialLength) return res.status(404).json({ error: 'User not found' });
  writeUsers(users);
  res.json({ success: true });
});

// Get current user info (logged-in users)
app.get('/api/me', requireAuth, (req, res) => {
  const auth = req.headers['authorization'];
  const token = auth.replace('Bearer ', '');
  const payload = TOKENS[token];
  const username = payload.user;
  const isAdminUser = username === DEFAULT_USER;
  
  if (isAdminUser) {
    res.json({ username, role: 'admin', accessibleProperties: [] });
  } else {
    const users = readUsers();
    const user = users.find(u => u.username === username);
    res.json({ username, role: 'viewer', accessibleProperties: user?.accessibleProperties || [] });
  }
});

// serve Angular build from public folder
const CLIENT_DIST = path.join(__dirname, '..', 'public');
console.log('CLIENT_DIST:', CLIENT_DIST);
console.log('CLIENT_DIST exists:', fs.existsSync(CLIENT_DIST));
if (fs.existsSync(CLIENT_DIST)) {
  console.log('Serving static files from:', CLIENT_DIST);
  app.use('/', express.static(CLIENT_DIST));
  // SPA fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
  });
} else {
  console.warn('CLIENT_DIST not found! Will serve 404 for all routes except /api/*');
}

// trigger initial fetch for existing properties (non-blocking)
try{
  const existing = readProperties();
  existing.forEach((p, i) => setTimeout(()=> triggerBackgroundFetch(p), i * 500));
}catch(e){ /* ignore */ }

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
console.log('PORT env var:', process.env.PORT);
console.log('Parsed PORT:', PORT);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Access the app at http://localhost${PORT === 80 ? '' : ':' + PORT}`);
});
