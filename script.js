/* ============================= TABS ============================= */
const tabSearchBtn = document.getElementById('tabSearchBtn');
const tabImportBtn = document.getElementById('tabImportBtn');
const panelSearch = document.getElementById('panelSearch');
const panelImport = document.getElementById('panelImport');

tabSearchBtn.addEventListener('click', () => {
  tabSearchBtn.classList.add('active'); tabImportBtn.classList.remove('active');
  panelSearch.classList.add('active'); panelImport.classList.remove('active');
});
tabImportBtn.addEventListener('click', () => {
  tabImportBtn.classList.add('active'); tabSearchBtn.classList.remove('active');
  panelImport.classList.add('active'); panelSearch.classList.remove('active');
});

/* ============================= SEARCH (OSM) ============================= */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const CATEGORIES = {
  'Marché / Market': [['amenity','marketplace'],['shop','marketplace']],
  'Supermarché': [['shop','supermarket']],
  'Épicerie': [['shop','convenience'],['shop','grocery']],
  'Pharmacie': [['amenity','pharmacy']],
  'Restaurant': [['amenity','restaurant']],
  'Café': [['amenity','cafe']],
  'Boulangerie': [['shop','bakery']],
  'Boucherie': [['shop','butcher']],
  'Coiffeur': [['shop','hairdresser']],
  'Garage / Mécanicien': [['shop','car_repair']],
  'Hôtel': [['tourism','hotel']],
  'Banque': [['amenity','bank']],
  'Vêtements': [['shop','clothes']],
  'Électronique': [['shop','electronics']],
  'Quincaillerie': [['shop','hardware']],
  'Autre (texte libre)': null,
};

const categorySelect = document.getElementById('categorySelect');
Object.keys(CATEGORIES).forEach(label => {
  const opt = document.createElement('option');
  opt.value = label; opt.textContent = label;
  categorySelect.appendChild(opt);
});

const cityInput = document.getElementById('cityInput');
const regionInput = document.getElementById('regionInput');
const citySuggest = document.getElementById('citySuggest');
const searchBtn = document.getElementById('searchBtn');
const searchStatus = document.getElementById('searchStatus');
const modeSelect = document.getElementById('modeSelect');

let selectedGeo = null;
let suggestDebounce = null;

cityInput.addEventListener('input', () => {
  selectedGeo = null;
  clearTimeout(suggestDebounce);
  const q = cityInput.value.trim();
  if (q.length < 2) { citySuggest.style.display = 'none'; return; }
  suggestDebounce = setTimeout(fetchSuggestions, 450);
});
document.addEventListener('click', (e) => {
  if (!citySuggest.contains(e.target) && e.target !== cityInput) citySuggest.style.display = 'none';
});

async function geocodeCandidates(city, region, limit) {
  const queries = [];
  if (region) queries.push(`${city}, ${region}`);
  queries.push(city);
  for (const q of queries) {
    const url = `${NOMINATIM_URL}?format=json&limit=${limit}&addressdetails=1&q=${encodeURIComponent(q)}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data && data.length) return data;
    } catch (e) { /* try next */ }
  }
  return [];
}

async function fetchSuggestions() {
  const city = cityInput.value.trim();
  const region = regionInput.value.trim();
  if (!city) return;
  const candidates = await geocodeCandidates(city, region, 6);
  showSuggestions(candidates);
}

function showSuggestions(candidates) {
  citySuggest.innerHTML = '';
  if (!candidates.length) { citySuggest.style.display = 'none'; return; }
  candidates.forEach(c => {
    const div = document.createElement('div');
    div.className = 'suggest-item';
    div.textContent = (c.display_name || '').slice(0, 90);
    div.addEventListener('click', () => {
      selectedGeo = c;
      cityInput.value = (c.display_name || '').split(',')[0].trim();
      citySuggest.style.display = 'none';
    });
    citySuggest.appendChild(div);
  });
  citySuggest.style.display = 'block';
}

function buildOverpassQuery(geo, tagPairs) {
  if (geo.osm_type === 'relation') {
    const areaId = 3600000000 + parseInt(geo.osm_id, 10);
    const tagFilters = tagPairs.map(([k, v]) =>
      `node["${k}"="${v}"](area.searchArea);\n  way["${k}"="${v}"](area.searchArea);\n  relation["${k}"="${v}"](area.searchArea);\n  `
    ).join('');
    return `[out:json][timeout:60];\narea(${areaId})->.searchArea;\n(\n  ${tagFilters}\n);\nout center tags;`;
  }
  const [south, north, west, east] = geo.boundingbox;
  const bbox = `${south},${west},${north},${east}`;
  const bboxFilters = tagPairs.map(([k, v]) =>
    `node["${k}"="${v}"](${bbox});\n  way["${k}"="${v}"](${bbox});\n  `
  ).join('');
  return `[out:json][timeout:60];\n(\n  ${bboxFilters}\n);\nout center tags;`;
}

async function runOverpass(query, onProgress) {
  let lastError = null;
  for (let i = 0; i < OVERPASS_ENDPOINTS.length; i++) {
    const url = OVERPASS_ENDPOINTS[i];
    try {
      if (i > 0 && onProgress) onProgress(`Serveur précédent indisponible, nouvel essai (${i + 1}/${OVERPASS_ENDPOINTS.length})...`);
      const resp = await fetch(url, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (resp.status === 429) { lastError = 'Trop de requêtes envoyées, réessayez dans une minute.'; continue; }
      if (resp.status >= 500) { lastError = `Serveur Overpass indisponible (${resp.status}).`; continue; }
      if (!resp.ok) { lastError = `Erreur Overpass (${resp.status}).`; continue; }
      return await resp.json();
    } catch (e) {
      lastError = 'Erreur réseau sur un serveur Overpass.';
      continue;
    }
  }
  throw new Error(lastError || 'Tous les serveurs Overpass sont indisponibles pour le moment.');
}

function hasWebsite(tags) { return !!(tags.website || tags['contact:website'] || tags.url); }
function hasPhone(tags) { return !!(tags.phone || tags['contact:phone'] || tags['contact:mobile']); }
function hasEmail(tags) { return !!(tags.email || tags['contact:email']); }

function extractAddress(tags) {
  const parts = [];
  if (tags['addr:housenumber'] && tags['addr:street']) parts.push(`${tags['addr:housenumber']} ${tags['addr:street']}`);
  else if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  if (tags['addr:postcode']) parts.push(tags['addr:postcode']);
  return parts.length ? parts.join(', ') : 'Non disponible';
}
function extractPhone(tags) { return tags.phone || tags['contact:phone'] || tags['contact:mobile'] || 'Non disponible'; }
function extractEmail(tags) { return tags.email || tags['contact:email'] || 'Non disponible'; }
function extractWebsite(tags) { return tags.website || tags['contact:website'] || tags.url || 'Aucun'; }

function searchPlacesFromOverpass(data, mode) {
  const results = [];
  const seen = new Set();
  (data.elements || []).forEach(el => {
    const tags = el.tags || {};
    const name = tags.name;
    if (!name) return;

    const websitePresent = hasWebsite(tags);
    let statut;
    if (websitePresent) {
      if (mode !== 'with_website' && mode !== 'both') return;
      statut = 'Avec site web';
    } else {
      if (mode !== 'no_website' && mode !== 'both') return;
      if (!(hasPhone(tags) || hasEmail(tags))) return;
      statut = 'Sans site web';
    }

    let lat, lon;
    if (el.type === 'node') { lat = el.lat; lon = el.lon; }
    else { lat = el.center ? el.center.lat : undefined; lon = el.center ? el.center.lon : undefined; }
    if (lat === undefined || lon === undefined) return;

    const key = `${name}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
    if (seen.has(key)) return;
    seen.add(key);

    results.push({
      'Nom': name,
      'Statut': statut,
      'Adresse': extractAddress(tags),
      'Téléphone': extractPhone(tags),
      'E-mail': extractEmail(tags),
      'Site web': extractWebsite(tags),
      'Lien Google Maps': `https://www.google.com/maps?q=${lat},${lon}`,
    });
  });
  return results;
}

let lastSearchResults = [];

searchBtn.addEventListener('click', async () => {
  const city = cityInput.value.trim();
  const region = regionInput.value.trim();
  const categoryLabel = categorySelect.value;
  const mode = modeSelect.value;

  if (!city) { searchStatus.textContent = 'Merci de saisir une ville.'; return; }

  let tagPairs = CATEGORIES[categoryLabel];
  if (!tagPairs) {
    const free = categoryLabel.trim().toLowerCase().replace(/\s+/g, '_');
    tagPairs = [['shop', free]];
  }

  searchBtn.disabled = true;
  document.getElementById('searchResultsCard').classList.add('hidden');
  searchStatus.textContent = 'Localisation de la ville...';

  try {
    let geo = selectedGeo;
    if (!geo) {
      const candidates = await geocodeCandidates(city, region, 1);
      if (!candidates.length) throw new Error(`Ville introuvable : ${city}`);
      geo = candidates[0];
    }

    searchStatus.textContent = "Interrogation d'OpenStreetMap (Overpass)...";
    const query = buildOverpassQuery(geo, tagPairs);
    const data = await runOverpass(query, (msg) => { searchStatus.textContent = msg; });
    const results = searchPlacesFromOverpass(data, mode);

    lastSearchResults = results;
    searchStatus.textContent = `${results.length} établissement(s) trouvé(s).`;
    renderSearchResultsPreview(results);
  } catch (e) {
    searchStatus.textContent = 'Erreur : ' + (e.message || e);
  } finally {
    searchBtn.disabled = false;
  }
});

function renderSearchResultsPreview(results) {
  const card = document.getElementById('searchResultsCard');
  const title = document.getElementById('searchResultsTitle');
  const table = document.getElementById('searchResultsTable');
  if (!results.length) { card.classList.add('hidden'); return; }

  title.textContent = `Résultats (${results.length})`;
  const cols = ['Nom', 'Statut', 'Adresse', 'Téléphone'];
  let html = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
  results.slice(0, 50).forEach(r => {
    html += '<tr>' + cols.map(c => `<td>${r[c] || ''}</td>`).join('') + '</tr>';
  });
  table.innerHTML = html;
  card.classList.remove('hidden');
}

document.getElementById('useResultsBtn').addEventListener('click', () => {
  ROWS = lastSearchResults;
  HEADERS = ['Nom', 'Statut', 'Adresse', 'Téléphone', 'E-mail', 'Site web', 'Lien Google Maps'];
  setupConfig();
  document.getElementById('configSection').scrollIntoView({ behavior: 'smooth' });
});

document.getElementById('downloadXlsxBtn').addEventListener('click', () => {
  if (!lastSearchResults.length) return;
  const ws = XLSX.utils.json_to_sheet(lastSearchResults);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Établissements');
  XLSX.writeFile(wb, 'resultats_etablissements.xlsx');
});

/* ============================= IMPORT (Excel) ============================= */
let HEADERS = [];
let ROWS = [];

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const filenameEl = document.getElementById('filename');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; handleFile(e.dataTransfer.files[0]); }
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

function handleFile(file) {
  filenameEl.textContent = '📄 ' + file.name;
  filenameEl.style.display = 'block';
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!json.length) { alert('Le fichier semble vide.'); return; }
    ROWS = json;
    HEADERS = Object.keys(json[0]);
    setupConfig();
    document.getElementById('configSection').scrollIntoView({ behavior: 'smooth' });
  };
  reader.readAsArrayBuffer(file);
}

/* ============================= SHARED: MAPPING + TEMPLATE ============================= */
const configSection = document.getElementById('configSection');
const resultsSection = document.getElementById('resultsSection');

const colName = document.getElementById('colName');
const colPhone = document.getElementById('colPhone');
const colAddress = document.getElementById('colAddress');
const colMaps = document.getElementById('colMaps');
const colStatus = document.getElementById('colStatus');
const statusChips = document.getElementById('statusChips');
const placeholdersEl = document.getElementById('placeholders');
const templateEl = document.getElementById('template');
const previewText = document.getElementById('previewText');
const generateBtn = document.getElementById('generateBtn');
const warnMsg = document.getElementById('warnMsg');

function guessColumn(aliases) {
  const lower = HEADERS.map(h => h.toLowerCase());
  for (const alias of aliases) {
    const idx = lower.findIndex(h => h.includes(alias));
    if (idx !== -1) return HEADERS[idx];
  }
  return '';
}

function fillSelect(sel, headers, selected, allowNone) {
  sel.innerHTML = '';
  if (allowNone) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— Aucune —';
    sel.appendChild(opt);
  }
  headers.forEach(h => {
    const opt = document.createElement('option');
    opt.value = h; opt.textContent = h;
    if (h === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function setupConfig() {
  configSection.classList.remove('hidden');
  resultsSection.style.display = 'none';

  const guessedName = guessColumn(['nom', 'name', 'business', 'entreprise', 'établissement', 'etablissement']);
  const guessedPhone = guessColumn(['téléphone', 'telephone', 'tel', 'phone', 'numero', 'numéro']);
  const guessedAddress = guessColumn(['adresse', 'address']);
  const guessedMaps = guessColumn(['maps', 'lien google maps', 'map']);
  const guessedStatus = guessColumn(['statut', 'status', 'categorie', 'catégorie']);

  fillSelect(colName, HEADERS, guessedName, false);
  fillSelect(colPhone, HEADERS, guessedPhone, false);
  fillSelect(colAddress, HEADERS, guessedAddress, true);
  fillSelect(colMaps, HEADERS, guessedMaps, true);
  fillSelect(colStatus, HEADERS, guessedStatus, true);

  buildPlaceholders();
  buildStatusChips();

  if (!templateEl.value.trim()) {
    const nm = colName.value ? `{{${colName.value}}}` : '{{Nom}}';
    templateEl.value = `Hi ${nm}, I came across your business and noticed you don't have a website yet. I help small businesses get a clean, professional website at an affordable price. Would you be open to a quick free mockup, no obligation?`;
  }
  updatePreview();
}

function buildPlaceholders() {
  placeholdersEl.innerHTML = '';
  HEADERS.forEach(h => {
    const btn = document.createElement('button');
    btn.className = 'ph-btn';
    btn.type = 'button';
    btn.textContent = `{{${h}}}`;
    btn.addEventListener('click', () => insertAtCursor(templateEl, `{{${h}}}`));
    placeholdersEl.appendChild(btn);
  });
}

function insertAtCursor(el, text) {
  const start = el.selectionStart, end = el.selectionEnd;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  el.focus();
  el.selectionStart = el.selectionEnd = start + text.length;
  updatePreview();
}

function buildStatusChips() {
  statusChips.innerHTML = '';
  const col = colStatus.value;
  if (!col) return;
  const uniqueVals = [...new Set(ROWS.map(r => String(r[col]).trim()).filter(v => v))];
  uniqueVals.forEach(v => {
    const label = document.createElement('label');
    label.className = 'chip';
    label.innerHTML = `<input type="checkbox" value="${v}" checked> ${v}`;
    statusChips.appendChild(label);
  });
}

function applyTemplate(template, row) {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (m, col) => {
    const key = col.trim();
    return row[key] !== undefined ? String(row[key]) : m;
  });
}

function updatePreview() {
  if (!ROWS.length) return;
  const msg = applyTemplate(templateEl.value, ROWS[0]);
  previewText.textContent = msg;
}

[colName, colPhone, colAddress, colMaps].forEach(sel => sel.addEventListener('change', updatePreview));
colStatus.addEventListener('change', buildStatusChips);
templateEl.addEventListener('input', updatePreview);

// Normalise un numéro vers le format international attendu par WhatsApp
// (wa.me/<indicatif><numéro>, sans "+", sans "0" initial, sans espaces).
function cleanPhone(v, countryCode) {
  let digits = String(v || '').replace(/\D/g, '');
  if (!digits) return '';

  const cc = String(countryCode || '').replace(/\D/g, '');

  // Déjà au format international avec le "00" internationalisé (ex: 00213555...)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    return digits;
  }

  // Pas d'indicatif renseigné : on ne touche pas au numéro (on suppose
  // qu'il est déjà complet, ex: import Excel déjà au format international).
  if (!cc) return digits;

  // Le numéro commence déjà par l'indicatif (ex: 213555123456) : on le garde tel quel.
  if (digits.startsWith(cc)) return digits;

  // Format local avec 0 initial (ex: 0555123456 -> 213555123456)
  if (digits.startsWith('0')) return cc + digits.slice(1);

  // Sinon on préfixe simplement l'indicatif.
  return cc + digits;
}

let contacts = [];
const doneState = {};

generateBtn.addEventListener('click', () => {
  const nameCol = colName.value;
  const phoneCol = colPhone.value;
  const addrCol = colAddress.value;
  const mapsCol = colMaps.value;
  const statusCol = colStatus.value;
  const countryCode = document.getElementById('countryCode').value;

  if (!nameCol || !phoneCol) { warnMsg.style.display = 'block'; return; }
  warnMsg.style.display = 'none';

  let allowedStatuses = null;
  if (statusCol) allowedStatuses = [...statusChips.querySelectorAll('input:checked')].map(i => i.value);

  contacts = [];
  let skippedNoPhone = 0;
  ROWS.forEach((row, i) => {
    const phone = cleanPhone(row[phoneCol], countryCode);
    if (phone.length < 8) { skippedNoPhone++; return; }
    if (statusCol && allowedStatuses && !allowedStatuses.includes(String(row[statusCol]).trim())) return;

    const msg = applyTemplate(templateEl.value, row);
    contacts.push({
      id: i,
      name: String(row[nameCol] || '').trim(),
      address: addrCol ? String(row[addrCol] || '').trim() : '',
      phoneDisplay: String(row[phoneCol] || ''),
      maps: mapsCol ? String(row[mapsCol] || '') : '',
      waLink: `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    });
  });

  Object.keys(doneState).forEach(k => delete doneState[k]);
  resultsSection.style.display = 'block';
  renderList();
  skippedMsgEl.textContent = skippedNoPhone > 0
    ? `${skippedNoPhone} contact(s) ignoré(s) (numéro de téléphone manquant ou invalide).`
    : '';
  resultsSection.scrollIntoView({ behavior: 'smooth' });
});

function waIcon() {
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.32A8.86 8.86 0 0 0 12.05 4a8.94 8.94 0 0 0-7.75 13.4L3 21l3.7-1.28a8.94 8.94 0 0 0 5.35 1.75h.01a8.94 8.94 0 0 0 8.93-8.94 8.86 8.86 0 0 0-2.39-6.21zm-5.55 13.7h-.01a7.43 7.43 0 0 1-3.79-1.04l-.27-.16-2.83.97.95-2.76-.18-.28a7.43 7.43 0 0 1 6.14-11.46 7.36 7.36 0 0 1 5.24 2.18 7.36 7.36 0 0 1 2.17 5.24 7.43 7.43 0 0 1-7.42 7.31zm4.07-5.56c-.22-.11-1.31-.65-1.51-.72-.2-.07-.35-.11-.5.11-.15.22-.57.72-.7.87-.13.15-.26.16-.48.05-.22-.11-.94-.35-1.79-1.1-.66-.59-1.11-1.32-1.24-1.54-.13-.22-.01-.34.1-.45.1-.1.22-.26.33-.39.11-.13.15-.22.22-.37.07-.15.04-.28-.02-.39-.06-.11-.5-1.2-.68-1.65-.18-.43-.36-.37-.5-.38-.13-.01-.28-.01-.43-.01-.15 0-.39.06-.6.28-.2.22-.78.76-.78 1.86s.8 2.16.91 2.31c.11.15 1.57 2.4 3.81 3.36.53.23.95.37 1.27.47.53.17 1.02.15 1.4.09.43-.06 1.31-.53 1.49-1.05.18-.51.18-.95.13-1.05-.05-.1-.2-.16-.42-.27z"/></svg>';
}

const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
const listSearchEl = document.getElementById('listSearch');
const skippedMsgEl = document.getElementById('skippedMsg');

function renderList() {
  const q = listSearchEl.value.trim().toLowerCase();
  listEl.innerHTML = '';
  let visible = 0;

  contacts.forEach(c => {
    const hay = (c.name + ' ' + c.address).toLowerCase();
    if (q && !hay.includes(q)) return;
    visible++;

    const row = document.createElement('div');
    row.className = 'row' + (doneState[c.id] ? ' done' : '');
    row.innerHTML = `
      <input type="checkbox" class="check" ${doneState[c.id] ? 'checked' : ''} data-id="${c.id}">
      <div class="info">
        <div class="name">${c.name}</div>
        <div class="addr">${c.address}</div>
        <div class="phone">${c.phoneDisplay}</div>
      </div>
      <div class="actions">
        ${c.maps ? `<a class="btn btn-map" href="${c.maps}" target="_blank" rel="noopener">Maps</a>` : ''}
        <a class="btn btn-wa" href="${c.waLink}" target="_blank" rel="noopener">${waIcon()} WhatsApp</a>
      </div>
    `;
    listEl.appendChild(row);
  });

  emptyEl.style.display = visible === 0 ? 'block' : 'none';
  updateStats();
}

function updateStats() {
  const total = contacts.length;
  const done = Object.values(doneState).filter(Boolean).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statLeft').textContent = total - done;
}

listEl.addEventListener('change', (e) => {
  if (e.target.classList.contains('check')) {
    const id = e.target.dataset.id;
    doneState[id] = e.target.checked;
    e.target.closest('.row').classList.toggle('done', e.target.checked);
    updateStats();
  }
});

listSearchEl.addEventListener('input', renderList);
