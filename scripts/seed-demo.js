/**
 * Demo data seed for the local TEST database: creates centers, doctors, staff, patients, appointments and
 * mammography analyses through the real API. Usage and rationale: docs/info/2026-10-03-datos-demo.md.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const sharp = require('sharp');
const Redis = require('ioredis');

const API = (process.env.SEED_API_URL || `http://localhost:${process.env.PORT || 8008}`).replace(/\/+$/, '');
const PASSWORD = 'Abc123456.';
const BCRYPT_COST = 10; // same cost as user.service.ts / profile.service.ts
const BOOTSTRAP_USER = process.env.SEED_ADMIN || 'qa_super_clean';
const UPLOADS = path.resolve(process.cwd(), process.env.UPLOADS_PATH || 'uploads');
const ONLY_TODAY = process.argv.includes('--today');
const CLEAN_JUNK = process.argv.includes('--clean-junk');
const DAY = 86_400_000;
const MIN = 60_000;
// Past appointments are created this far ahead (same weekday and hour), processed, then moved back with SQL.
const STAGING_MIN_DAYS = 70;
const FUTURE_WINDOW_DAYS = 42;
const HISTORY_WINDOW_DAYS = 150;

// The 4 real mammograms already in the uploads volume (sha-256 prefix → raw score of the original).
const SOURCE_IMAGES = {
  A: { rel: 'eeee6fe7-8116-4b30-b30f-78689b30696f/3c8a048b-a172-45fd-9141-9d7cd356b5ac/4a1142e2-1f41-4b88-9107-e54285e82296/1781290198380-iwz5cq.jpg', weight: 0.12 },
  B: { rel: 'eeee6fe7-8116-4b30-b30f-78689b30696f/3c8a048b-a172-45fd-9141-9d7cd356b5ac/4a1142e2-1f41-4b88-9107-e54285e82296/1781290198257-li4ufl.jpg', weight: 0.14 },
  C: { rel: 'eeee6fe7-8116-4b30-b30f-78689b30696f/3c8a048b-a172-45fd-9141-9d7cd356b5ac/4a1142e2-1f41-4b88-9107-e54285e82296/1781290198264-vdc5ds.jpg', weight: 0.24 },
  D: { rel: 'eeee6fe7-8116-4b30-b30f-78689b30696f/3c8a048b-a172-45fd-9141-9d7cd356b5ac/4a1142e2-1f41-4b88-9107-e54285e82296/1781290198395-e2y32e.jpg', weight: 0.5 },
};
const VARIANT_COUNT = 180;

// ───────────────────────────── utilities ─────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), ...a);

function rngFrom(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (a, b) => a + Math.floor(next() * (b - a + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  next.shuffle = (arr) => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return next;
}

const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const hm = (t) => t.split(':').map(Number);

let db;
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

// API calls stay under the global throttler (medium 20/10 s, long 100/60 s per IP).
const hits = [];
async function throttle() {
  for (;;) {
    const now = Date.now();
    while (hits.length && now - hits[0] > 61_000) hits.shift();
    const last10 = hits.filter((t) => now - t < 10_500).length;
    if (last10 < 17 && hits.length < 90) {
      hits.push(now);
      return;
    }
    await sleep(200);
  }
}

const stats = { requests: 0, created: {}, rejectedVariants: 0, flowRejected: 0, scoreMismatch: 0 };
const bump = (k, n = 1) => (stats.created[k] = (stats.created[k] || 0) + n);

async function api(token, method, url, body, form) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    stats.requests++;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    let payload;
    if (form) payload = form();
    else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(API + url, { method, headers, body: payload });
    const json = await res.json().catch(() => ({}));
    if (res.status === 429) {
      log('429 from throttler, waiting 95 s');
      await sleep(95_000);
      continue;
    }
    if (!res.ok) {
      const err = new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(json.error ?? json.message ?? json)}`);
      err.status = res.status;
      throw err;
    }
    return json.data !== undefined ? json.data : json;
  }
  throw new Error(`${method} ${url}: throttled too many times`);
}

const tokens = new Map();
async function tokenFor(username) {
  if (tokens.has(username)) return tokens.get(username);
  const data = await api(null, 'POST', '/auth/login', { credential: username, password: PASSWORD, isSystemUser: false });
  const token = data.access_token ?? data.accessToken ?? data.token;
  if (!token) throw new Error(`login ${username}: no token in response`);
  tokens.set(username, token);
  return token;
}

// ───────────────────────────── roster ─────────────────────────────

const CENTERS = [
  {
    key: 'C1', name: 'Centro Clínico Ávila', address: 'Av. Francisco de Miranda, Torre Ávila, pisos 2 y 3, Chacao, Caracas, Miranda',
    phone: '+58 212-2635500', email: 'contacto@clinicoavila.example.com', numBeds: 60, numOperatingRooms: 4,
    hasEmergency: true, hasHospitalization: true, hasIntensiveCare: true, hasParking: true, hasPharmacy: true, hasLaboratory: true,
    departments: ['MS', 'RAD', 'GO', 'ONCO', 'MG'],
  },
  {
    key: 'C2', name: 'Policlínica Los Próceres', address: 'Av. Los Próceres, Edif. Santa Mónica, Los Rosales, Caracas, Distrito Capital',
    phone: '+58 212-6327700', email: 'citas@losproceres.example.com', numBeds: 35, numOperatingRooms: 2,
    hasEmergency: true, hasHospitalization: true, hasIntensiveCare: false, hasParking: true, hasPharmacy: true, hasLaboratory: true,
    departments: ['MS', 'RAD', 'MG'],
  },
  {
    key: 'C3', name: 'Unidad Médica Guaparo', address: 'Av. Bolívar Norte con calle 137, Urb. Guaparo, Valencia, Carabobo',
    phone: '+58 241-8241100', email: 'atencion@umguaparo.example.com', numBeds: 28, numOperatingRooms: 2,
    hasEmergency: false, hasHospitalization: true, hasIntensiveCare: false, hasParking: true, hasPharmacy: false, hasLaboratory: true,
    departments: ['MS', 'RAD', 'GO'],
  },
  {
    key: 'C4', name: 'Centro de Salud Integral del Lago', address: 'Av. 5 de Julio con calle 72, sector Tierra Negra, Maracaibo, Zulia',
    phone: '+58 261-7984400', email: 'info@saluddellago.example.com', numBeds: 40, numOperatingRooms: 3,
    hasEmergency: true, hasHospitalization: true, hasIntensiveCare: true, hasParking: true, hasPharmacy: true, hasLaboratory: true,
    departments: ['MS', 'RAD', 'MG'],
  },
];

// Department name per specialty code. "Mamografía"/"Mastología" in the name enables the frontend mammography tab.
const DEPARTMENTS = {
  MS: { name: 'Mastología', description: 'Consulta de patología mamaria, pesquisa y seguimiento.' },
  RAD: { name: 'Radiología y Mamografía', description: 'Mamografía de pesquisa y diagnóstica, ecografía mamaria.' },
  GO: { name: 'Ginecología', description: 'Consulta ginecológica y control preventivo.' },
  ONCO: { name: 'Oncología', description: 'Evaluación y seguimiento oncológico.' },
  MG: { name: 'Medicina General', description: 'Atención primaria y control de enfermedades crónicas.' },
};

const SPECIALTIES = {
  MS: { name: 'Mastología', description: 'Diagnóstico y tratamiento de la patología mamaria.' },
  RAD: { name: 'Radiología', description: 'Diagnóstico por imágenes.' },
  GO: { name: 'Ginecología y Obstetricia', description: 'Salud de la mujer.' },
  ONCO: { name: 'Oncología Médica', description: 'Tratamiento médico del cáncer.' },
  MG: { name: 'Medicina General', description: 'Atención primaria.' },
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const DOCTORS = [
  { u: 'cmendoza', f: 'Carolina', m: 'Isabel', l: 'Mendoza', l2: 'Rivas', doc: '11284537', sp: 'MS', c: 'C1', lic: 'MPPS-48217', main: true,
    blocks: [...WEEKDAYS.map((d) => [d, '08:00', '16:00']), [6, '08:00', '12:00']], patients: 18 },
  { u: 'lgutierrez', f: 'Luisa', m: 'Fernanda', l: 'Gutiérrez', l2: 'Salas', doc: '13502981', sp: 'RAD', c: 'C1', lic: 'MPPS-55104',
    blocks: [...WEEKDAYS.map((d) => [d, '08:00', '14:00']), [6, '08:00', '12:00']], patients: 10 },
  { u: 'rparedes', f: 'Ricardo', m: 'José', l: 'Paredes', l2: 'Ochoa', doc: '9876214', sp: 'MS', c: 'C1', lic: 'MPPS-39822',
    blocks: [[1, '08:00', '12:00'], [3, '08:00', '12:00'], [5, '08:00', '12:00'], [2, '13:00', '18:00'], [4, '13:00', '18:00']], patients: 9 },
  { u: 'mfigueroa', f: 'Mariana', m: 'Alejandra', l: 'Figueroa', l2: 'Tovar', doc: '15938420', sp: 'GO', c: 'C1', lic: 'MPPS-61375',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '12:00']), patients: 8 },
  { u: 'jcastillo', f: 'José', m: 'Gregorio', l: 'Castillo', l2: 'Pérez', doc: '7654328', sp: 'ONCO', c: 'C1', lic: 'MPPS-28940',
    blocks: [[1, '13:00', '17:00'], [3, '13:00', '17:00'], [5, '13:00', '17:00']], patients: 5 },
  { u: 'arodriguez', f: 'Andreína', m: null, l: 'Rodríguez', l2: 'Blanco', doc: '17420375', sp: 'MG', c: 'C1', lic: 'MPPS-70218',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '16:00']), patients: 8 },
  { u: 'fmarquez', f: 'Fernando', m: 'Antonio', l: 'Márquez', l2: 'Linares', doc: '10457823', sp: 'MS', c: 'C2', lic: 'MPPS-44561',
    blocks: WEEKDAYS.map((d) => [d, '09:00', '15:00']), patients: 10 },
  { u: 'vherrera', f: 'Valentina', m: null, l: 'Herrera', l2: 'Bello', doc: '18234956', sp: 'RAD', c: 'C2', lic: 'MPPS-73302',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '13:00']), patients: 6 },
  { u: 'pacosta', f: 'Pedro', m: 'Luis', l: 'Acosta', l2: 'Guerra', doc: '12093847', sp: 'MG', c: 'C2', lic: 'MPPS-50876',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '14:00']), patients: 5 },
  { u: 'gsilva', f: 'Gabriela', m: 'Cristina', l: 'Silva', l2: 'Montero', doc: '14827361', sp: 'MS', c: 'C3', lic: 'MPPS-58893',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '13:00']), patients: 9 },
  { u: 'nperez', f: 'Natalia', m: null, l: 'Pérez', l2: 'Colmenares', doc: '16592048', sp: 'GO', c: 'C3', lic: 'MPPS-66140',
    blocks: [1, 2, 3, 4].map((d) => [d, '13:00', '18:00']), patients: 5 },
  { u: 'ezambrano', f: 'Eduardo', m: 'Rafael', l: 'Zambrano', l2: 'Ruiz', doc: '11930562', sp: 'RAD', c: 'C3', lic: 'MPPS-47725',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '12:00']), patients: 5 },
  { u: 'aurdaneta', f: 'Alejandro', m: 'José', l: 'Urdaneta', l2: 'Fernández', doc: '8945172', sp: 'MS', c: 'C4', lic: 'MPPS-35618',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '14:00']), patients: 8 },
  { u: 'mchourio', f: 'Milagros', m: 'del Carmen', l: 'Chourio', l2: 'Atencio', doc: '13748290', sp: 'RAD', c: 'C4', lic: 'MPPS-54037',
    blocks: WEEKDAYS.map((d) => [d, '08:00', '13:00']), patients: 4 },
];

const STAFF = [
  { u: 'enf.ramirez', f: 'Yelitza', m: 'Coromoto', l: 'Ramírez', l2: 'Pineda', doc: '16204873', role: 'enfermero', centers: ['C1'] },
  { u: 'enf.torres', f: 'Jesús', m: 'Alberto', l: 'Torres', l2: 'Medina', doc: '19385720', role: 'enfermero', centers: ['C2'] },
  { u: 'enf.gonzalez', f: 'Rosa', m: 'María', l: 'González', l2: 'Quintero', doc: '14572093', role: 'enfermero', centers: ['C3', 'C4'] },
  { u: 'admin.caracas', f: 'Daniela', m: null, l: 'Morales', l2: 'Arias', doc: '17839204', role: 'superusuario', centers: ['C1', 'C2'] },
  { u: 'admin.regional', f: 'Luis', m: 'Eduardo', l: 'Villalobos', l2: 'Nava', doc: '12650381', role: 'superusuario', centers: ['C3', 'C4'] },
];

const FEMALE = ['María', 'Ana', 'Carmen', 'Luisa', 'Yolanda', 'Gladys', 'Marisol', 'Yusmary', 'Daniela', 'Andrea', 'Gabriela', 'Rosa', 'Elena',
  'Patricia', 'Mónica', 'Isabel', 'Beatriz', 'Carolina', 'Josefina', 'Milagros', 'Yelitza', 'Nancy', 'Zuleima', 'Mariela', 'Raquel',
  'Lucía', 'Valeria', 'Fabiola', 'Thaís', 'Oriana', 'Ninoska', 'Xiomara', 'Maryori', 'Francys', 'Mirna', 'Teresa', 'Coromoto', 'Inés',
  'Alejandra', 'Verónica', 'Desirée', 'Lorena', 'Johana', 'Wendy', 'Sorelys', 'Belkis', 'Aura', 'Eglee', 'Mercedes', 'Rebeca'];
const FEMALE_2 = ['José', 'Alejandra', 'Isabel', 'del Carmen', 'Victoria', 'Elena', 'Gabriela', 'Teresa', 'Andreína', 'Cristina', 'Eugenia',
  'Josefina', 'Lucía', 'Margarita', 'Beatriz', 'Antonieta'];
const MALE = ['José', 'Luis', 'Carlos', 'Juan', 'Pedro', 'Rafael', 'Jesús', 'Miguel', 'Francisco', 'Antonio', 'Manuel', 'Héctor', 'Ramón',
  'Orlando', 'Wilmer', 'Freddy', 'Gustavo', 'Douglas', 'Nelson', 'Richard'];
const MALE_2 = ['Gregorio', 'Alberto', 'Rafael', 'Antonio', 'Eduardo', 'Enrique', 'Javier', 'Ramón', 'Ignacio', 'David'];
const SURNAMES = ['González', 'Rodríguez', 'Pérez', 'Hernández', 'García', 'Martínez', 'López', 'Díaz', 'Sánchez', 'Ramírez', 'Torres',
  'Rojas', 'Gómez', 'Flores', 'Morales', 'Silva', 'Castillo', 'Romero', 'Suárez', 'Mendoza', 'Medina', 'Herrera', 'Blanco', 'Chacón',
  'Guerrero', 'Rivas', 'Salazar', 'Contreras', 'Briceño', 'Marcano', 'Colmenares', 'Linares', 'Urdaneta', 'Villalobos', 'Bracho',
  'Montilla', 'Peña', 'Zambrano', 'Ochoa', 'Carrillo', 'Molina', 'Pacheco', 'Aguilar', 'Bastidas', 'Palacios', 'Uzcátegui', 'Quintero',
  'Arteaga', 'Graterol', 'Escalona'];
const FOREIGN_SURNAMES = ['Cardona', 'Restrepo', 'Ospina', 'Mejía', 'Vélez', 'Zapata', 'Ferreira', 'Rossi', 'Da Silva', 'Monsalve'];
const OCCUPATIONS = ['Docente', 'Contadora', 'Comerciante', 'Ama de casa', 'Abogada', 'Enfermera', 'Ingeniera', 'Administradora',
  'Secretaria', 'Estudiante universitaria', 'Odontóloga', 'Peluquera', 'Funcionaria pública', 'Jubilada', 'Costurera', 'Farmacéutica',
  'Diseñadora gráfica', 'Vendedora', 'Psicóloga', 'Bioanalista'];
const OCCUPATIONS_M = ['Comerciante', 'Ingeniero', 'Chofer', 'Contador', 'Docente', 'Mecánico', 'Jubilado', 'Abogado', 'Técnico electricista', 'Agricultor'];
const INSURERS = ['Seguros Horizonte', 'Aseguradora Andina', 'Seguros del Ávila', 'Previsión Médica Integral'];
const BLOOD = [['O+', 0.45], ['A+', 0.27], ['B+', 0.1], ['O-', 0.06], ['AB+', 0.04], ['A-', 0.04], ['B-', 0.02], ['AB-', 0.02]];
const PHONE_PREFIX = ['412', '414', '416', '424', '426'];
const ALLERGY_NAMES = ['Penicilina', 'Aspirina', 'Sulfamidas', 'Ibuprofeno', 'Látex', 'Mariscos crustáceos', 'Yodo', 'Medios de contraste',
  'Ácaros del polvo', 'Polen de gramíneas', 'Amoxicilina', 'Diclofenaco', 'Huevo', 'Maní/Cacahuate'];
const CHRONIC_NAMES = ['Hipertensión arterial', 'Diabetes mellitus tipo 2', 'Hipotiroidismo', 'Asma bronquial', 'Dislipidemia',
  'Osteoporosis', 'Migraña crónica', 'Síndrome de ovario poliquístico', 'Artritis reumatoide', 'Enfermedad por reflujo gastroesofágico'];

function weighted(rng, pairs) {
  let r = rng();
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[pairs.length - 1][0];
}

/** Deterministic patient roster: same documents on every run, so re-runs find them instead of duplicating. */
function buildPatients() {
  const rng = rngFrom(20261003);
  const out = [];
  const usedDocs = new Set();
  const usedNames = new Set();
  for (const d of DOCTORS) {
    for (let i = 0; i < d.patients; i++) {
      const maleChance = { MG: 0.45, ONCO: 0.25, GO: 0, MS: 0.04, RAD: 0.03 }[d.sp];
      const male = rng.chance(maleChance);
      const foreign = rng.chance(0.06);
      const age = d.sp === 'GO' ? rng.int(24, 58) : d.sp === 'MG' ? rng.int(25, 75) : rng.int(32, 75);
      let first, middle, last, last2;
      do {
        first = rng.pick(male ? MALE : FEMALE);
        middle = rng.chance(0.75) ? rng.pick(male ? MALE_2 : FEMALE_2) : null;
        if (middle === first) middle = null;
        last = rng.pick(foreign ? FOREIGN_SURNAMES : SURNAMES);
        last2 = rng.pick(SURNAMES);
      } while (usedNames.has(`${first} ${last} ${last2}`) || last === last2);
      usedNames.add(`${first} ${last} ${last2}`);
      // Venezuelan ID numbers grow with the birth year; foreigners get the 8x.xxx.xxx E- range.
      let docNum;
      do {
        docNum = foreign
          ? String(rng.int(81_000_000, 84_999_999))
          : String(Math.max(1_200_000, Math.round((3.4 + (2026 - age - 1950) * 0.47) * 1e6 + rng.int(-900_000, 900_000))));
      } while (usedDocs.has(docNum));
      usedDocs.add(docNum);
      const email = rng.chance(0.85) ? `${ascii(first)}.${ascii(last)}${rng.int(10, 99)}@example.com` : null;
      const phone = `+58 ${rng.pick(PHONE_PREFIX)}-${rng.int(1_000_000, 9_999_999)}`;
      const married = age < 30 ? 'soltero' : weighted(rng, [['casado', 0.45], ['soltero', 0.25], ['divorciado', 0.12], ['union_libre', 0.1], ['viudo', age > 60 ? 0.2 : 0.03]]);
      const contactFirst = rng.pick(rng.chance(0.5) ? MALE : FEMALE);
      const relationship = married === 'casado' || married === 'union_libre' ? (male ? 'Esposa' : 'Esposo') : rng.pick(['Hija', 'Hijo', 'Hermana', 'Madre', 'Hermano']);
      const allergies = rng.chance(0.3) ? rng.shuffle(ALLERGY_NAMES).slice(0, rng.chance(0.25) ? 2 : 1) : [];
      const chronic = rng.chance(age > 50 ? 0.55 : 0.25) ? rng.shuffle(CHRONIC_NAMES.filter((c) => !(male && c.includes('ovario')))).slice(0, rng.chance(0.3) ? 2 : 1) : [];
      const insured = rng.chance(0.55);
      out.push({
        homeDoctor: d.u, male, age, foreign,
        dto: {
          commonPerson: {
            letter: foreign ? 'E' : 'V', documentNumber: docNum, firstName: first, middleName: middle, lastName: last, secondLastName: last2,
            phoneNumber: phone,
            // Derived from the document, not from rng, so the rest of the generated data does not shift.
            birthDate: `${2026 - age}-${String((Number(docNum) % 12) + 1).padStart(2, '0')}-${String((Number(docNum) % 28) + 1).padStart(2, '0')}`,
            sex: male ? 'M' : 'F',
          },
          email,
          maritalStatus: married,
          occupation: age >= 65 ? (male ? 'Jubilado' : 'Jubilada') : rng.pick(male ? OCCUPATIONS_M : OCCUPATIONS),
          bloodType: weighted(rng, BLOOD),
          emergencyContactName: `${contactFirst} ${rng.chance(0.5) ? last : rng.pick(SURNAMES)}`,
          emergencyContactPhone: `+58 ${rng.pick(PHONE_PREFIX)}-${rng.int(1_000_000, 9_999_999)}`,
          emergencyContactRelationship: relationship,
          insuranceCompany: insured ? rng.pick(INSURERS) : undefined,
          insurancePolicyNumber: insured ? `POL-${rng.int(100000, 999999)}` : undefined,
        },
        allergies, chronic,
      });
    }
  }
  return out;
}

// ───────────────────────────── clinical templates ─────────────────────────────

const VITALS = (rng, male) => ({
  bloodPressure: `${rng.int(105, 145)}/${rng.int(65, 92)}`,
  heartRate: rng.int(62, 92),
  temperature: Number((36 + rng() * 0.9).toFixed(1)),
  respiratoryRate: rng.int(14, 19),
  oxygenSaturation: rng.int(95, 99),
  weight: Number((male ? 68 + rng() * 30 : 52 + rng() * 32).toFixed(1)),
  height: male ? rng.int(162, 184) : rng.int(150, 172),
});

const item = (name, dosage, frequency, duration, quantity, instructions) => ({ name, dosage, frequency, duration, quantity, instructions });

const CONSULTS = {
  MS: [
    { reason: 'Control mamográfico anual', symptoms: 'Asintomática. Acude a pesquisa anual.', exam: 'Mamas simétricas, sin nódulos palpables ni adenopatías axilares.',
      dx: 'Pesquisa de cáncer de mama, sin hallazgos clínicos', code: 'Z12.31', plan: 'Mamografía bilateral y control en 12 meses.', items: [item('Vitamina D', '1000 UI', 'Una vez al día', '3 meses', 3, 'Tomar con el almuerzo')] },
    { reason: 'Dolor mamario cíclico', symptoms: 'Mastalgia bilateral premenstrual de 3 meses de evolución.', exam: 'Tejido mamario denso, doloroso a la palpación, sin nódulos dominantes.',
      dx: 'Mastalgia cíclica', code: 'N64.4', plan: 'Analgesia, sostén adecuado, mamografía de control.', items: [item('Ibuprofeno', '400 mg', 'Cada 8 horas', '5 días', 2, 'Tomar después de las comidas'), item('Omeprazol', '20 mg', 'Una vez al día en ayunas', '5 días', 1, 'Protección gástrica')] },
    { reason: 'Nódulo palpable en mama izquierda', symptoms: 'Refiere nódulo indoloro en cuadrante superior externo de mama izquierda.', exam: 'Nódulo móvil de 1,5 cm en CSE de mama izquierda, bordes regulares.',
      dx: 'Nódulo mamario en estudio', code: 'N63', plan: 'Mamografía diagnóstica y ecografía mamaria complementaria.', items: [item('Paracetamol', '500 mg', 'Cada 8 horas si hay dolor', '5 días', 1, 'No exceder 3 g al día')] },
    { reason: 'Nódulo palpable en mama derecha', symptoms: 'Autoexamen positivo hace 2 semanas.', exam: 'Nódulo de 2 cm en CSI de mama derecha, consistencia firme.',
      dx: 'Fibroadenoma de mama', code: 'D24', plan: 'Seguimiento ecográfico en 6 meses.', items: [item('Paracetamol', '500 mg', 'Cada 8 horas si hay dolor', '5 días', 1, 'No exceder 3 g al día')] },
    { reason: 'Antecedente familiar de cáncer de mama', symptoms: 'Madre con cáncer de mama a los 52 años. Asintomática.', exam: 'Sin nódulos palpables. Piel y pezones sin alteraciones.',
      dx: 'Historia familiar de neoplasia maligna de mama', code: 'Z80.3', plan: 'Pesquisa anual con mamografía y ecografía; asesoría genética.', items: [item('Vitamina D', '1000 UI', 'Una vez al día', '3 meses', 3, 'Tomar con alimentos')] },
    { reason: 'Secreción por el pezón', symptoms: 'Secreción serosa espontánea por pezón derecho.', exam: 'Secreción serosa unicanalicular, sin masa palpable.',
      dx: 'Mama fibroquística', code: 'N60.1', plan: 'Citología de secreción, mamografía y ecografía.', items: [item('Meloxicam', '15 mg', 'Una vez al día', '7 días', 1, 'Tomar con alimentos')] },
  ],
  RAD: [
    { reason: 'Mamografía de pesquisa', symptoms: 'Paciente asintomática referida para pesquisa.', exam: 'Proyecciones CC y MLO bilaterales. Patrón fibroglandular disperso.',
      dx: 'Mamografía de pesquisa', code: 'Z12.31', plan: 'Informe al médico tratante. Control anual.' },
    { reason: 'Mamografía diagnóstica bilateral', symptoms: 'Referida por mastología por nódulo palpable.', exam: 'Proyecciones CC, MLO y compresión focalizada.',
      dx: 'Hallazgo mamográfico en estudio', code: 'R92.8', plan: 'Correlación ecográfica y control según BI-RADS.' },
    { reason: 'Mamografía de control a 6 meses', symptoms: 'Control de lesión probablemente benigna (BI-RADS 3).', exam: 'Comparación con estudio previo.',
      dx: 'Control de hallazgo probablemente benigno', code: 'R92.8', plan: 'Comparar con estudio previo; continuar seguimiento.' },
  ],
  GO: [
    { reason: 'Control ginecológico anual', symptoms: 'Asintomática.', exam: 'Genitales externos normales. Cuello uterino sano.', dx: 'Examen ginecológico de rutina', code: 'Z01.4',
      plan: 'Citología y ecografía transvaginal.', items: [] },
    { reason: 'Flujo vaginal', symptoms: 'Flujo grisáceo con mal olor de 1 semana.', exam: 'Leucorrea homogénea, prueba de aminas positiva.', dx: 'Vaginosis bacteriana', code: 'N76.0',
      plan: 'Tratamiento antibiótico y control en 2 semanas.', items: [item('Metronidazol', '500 mg', 'Cada 12 horas', '7 días', 2, 'No consumir alcohol durante el tratamiento')] },
    { reason: 'Trastorno menstrual', symptoms: 'Ciclos irregulares y acné.', exam: 'Hirsutismo leve. Abdomen blando.', dx: 'Síndrome de ovario poliquístico', code: 'E28.2',
      plan: 'Perfil hormonal y ecografía pélvica.', items: [item('Metformina', '500 mg', 'Cada 12 horas', '3 meses', 3, 'Tomar con las comidas')] },
  ],
  ONCO: [
    { reason: 'Seguimiento oncológico', symptoms: 'Control post-tratamiento de cáncer de mama. Asintomática.', exam: 'Cicatriz quirúrgica sin alteraciones. Sin adenopatías.',
      dx: 'Seguimiento post-tratamiento de neoplasia de mama', code: 'Z08', plan: 'Marcadores tumorales y mamografía de control.', items: [item('Calcio', '600 mg', 'Una vez al día', '3 meses', 3, 'Tomar con vitamina D'), item('Vitamina D', '1000 UI', 'Una vez al día', '3 meses', 3, 'Tomar con alimentos')] },
    { reason: 'Evaluación de resultados de biopsia', symptoms: 'Referida por mastología con biopsia de mama.', exam: 'Nódulo de 2 cm en mama izquierda. Axila negativa.',
      dx: 'Neoplasia maligna de mama, en estadificación', code: 'C50.9', plan: 'Estudios de extensión y presentación en comité de tumores.', items: [item('Ondansetrón', '8 mg', 'Cada 12 horas si hay náuseas', '5 días', 1, 'Solo si presenta náuseas')] },
  ],
  MG: [
    { reason: 'Control de hipertensión arterial', symptoms: 'Cefalea ocasional. Cumple tratamiento.', exam: 'Ruidos cardíacos rítmicos. Sin edemas.', dx: 'Hipertensión arterial esencial', code: 'I10',
      plan: 'Continuar tratamiento, dieta hiposódica, control en 3 meses.', items: [item('Losartán', '50 mg', 'Una vez al día', '3 meses', 3, 'Tomar en la mañana')] },
    { reason: 'Control de glicemia', symptoms: 'Polidipsia leve.', exam: 'Sin alteraciones relevantes.', dx: 'Diabetes mellitus tipo 2', code: 'E11.9',
      plan: 'Hemoglobina glicosilada y control en 3 meses.', items: [item('Metformina', '850 mg', 'Cada 12 horas', '3 meses', 6, 'Tomar con las comidas')] },
    { reason: 'Infección respiratoria', symptoms: 'Rinorrea, odinofagia y fiebre de 2 días.', exam: 'Faringe eritematosa. Pulmones limpios.', dx: 'Infección aguda de vías respiratorias superiores', code: 'J06.9',
      plan: 'Hidratación, reposo y analgesia.', items: [item('Paracetamol', '500 mg', 'Cada 6 horas si hay fiebre', '3 días', 1, 'No exceder 3 g al día'), item('Loratadina', '10 mg', 'Una vez al día', '5 días', 1, 'Puede causar somnolencia leve')] },
    { reason: 'Chequeo médico general', symptoms: 'Asintomático. Solicita evaluación anual.', exam: 'Examen físico sin alteraciones.', dx: 'Examen médico general', code: 'Z00.0',
      plan: 'Perfil 20, lipídico y uroanálisis.', items: [] },
    { reason: 'Dolor lumbar', symptoms: 'Lumbalgia mecánica de 5 días.', exam: 'Contractura paravertebral lumbar. Lasègue negativo.', dx: 'Lumbago no especificado', code: 'M54.5',
      plan: 'Analgesia, calor local y reposo relativo.', items: [item('Diclofenaco', '50 mg', 'Cada 12 horas', '5 días', 1, 'Tomar después de las comidas')] },
  ],
};

// Consultations that come with a mammography, chosen by the detector result planned for them.
const MAMMO_CONSULTS = {
  benign: { reason: 'Mamografía de pesquisa', symptoms: 'Asintomática. Pesquisa anual.', exam: 'Mamas sin nódulos palpables. Axilas libres.',
    dx: 'Mamografía sin hallazgos sospechosos (BI-RADS 2)', code: 'Z12.31', plan: 'Control mamográfico anual.', items: [item('Vitamina D', '1000 UI', 'Una vez al día', '3 meses', 3, 'Tomar con alimentos')] },
  borderline: { reason: 'Nódulo palpable en estudio', symptoms: 'Nódulo de reciente aparición, indoloro.', exam: 'Nódulo de 1 cm, móvil, en CSE de mama izquierda.',
    dx: 'Hallazgo probablemente benigno (BI-RADS 3)', code: 'R92.8', plan: 'Ecografía complementaria y control en 6 meses.', items: [item('Paracetamol', '500 mg', 'Cada 8 horas si hay dolor', '5 días', 1, 'No exceder 3 g al día')] },
  malignant: { reason: 'Nódulo palpable en mama derecha', symptoms: 'Nódulo duro de 1 mes de evolución, retracción leve de piel.', exam: 'Nódulo de 2,5 cm, bordes irregulares, poco móvil, en CSE de mama derecha.',
    dx: 'Lesión sospechosa de malignidad (BI-RADS 4)', code: 'N63', plan: 'Biopsia con aguja gruesa guiada por ecografía y referencia a Oncología.', items: [item('Paracetamol', '500 mg', 'Cada 8 horas si hay dolor', '7 días', 1, 'No exceder 3 g al día')] },
};

const CANCEL_REASONS = ['La paciente no pudo asistir por motivos laborales.', 'Reprogramada a solicitud de la paciente.', 'Inconveniente de transporte.',
  'El médico no estuvo disponible ese día.', 'La paciente presentó un cuadro gripal y prefirió reprogramar.'];

const REVIEW_AGREE = {
  benign: ['Concuerdo con el modelo: sin hallazgos sospechosos (BI-RADS 2). Control anual.', 'Revisado. Parénquima fibroglandular disperso, sin lesiones. Control en 12 meses.'],
  borderline: ['Concuerdo parcialmente: hallazgo probablemente benigno (BI-RADS 3). Control a 6 meses con ecografía.'],
  malignant: ['Concuerdo con el modelo: lesión espiculada sospechosa (BI-RADS 4C). Se indica biopsia guiada.', 'Revisado. Masa irregular con microcalcificaciones; referencia a Oncología.'],
};
const REVIEW_DISAGREE = {
  benign: 'No concuerdo: se observan microcalcificaciones agrupadas en CSE; se solicita proyección magnificada.',
  borderline: 'No concuerdo: corresponde a tejido glandular denso superpuesto; sin lesión real. Control anual.',
  malignant: 'No concuerdo: imagen compatible con quiste simple confirmado por ecografía (BI-RADS 2).',
};
const CREATION_NOTES = ['Médico: Confirma resultado', 'Médico: Confirma resultado | Nota: correlacionar con ecografía', 'Médico: Incierto, requiere revisión',
  'Médico: Confirma resultado | Nota: comparar con estudio previo'];

// ───────────────────────────── steps ─────────────────────────────

async function ensurePasswords() {
  const hash = await bcrypt.hash(PASSWORD, BCRYPT_COST);
  let updated = 0;
  for (const table of ['public.users', 'seguridad.users']) {
    const users = await q(`SELECT id, password FROM ${table} WHERE deleted_at IS NULL`);
    for (const u of users) {
      const ok = u.password && u.password.startsWith('$2') && (await bcrypt.compare(PASSWORD, u.password).catch(() => false));
      if (!ok) {
        await q(`UPDATE ${table} SET password = $1 WHERE id = $2`, [hash, u.id]);
        updated++;
      }
    }
  }
  log(`passwords: ${updated} user(s) set to the demo password`);
  return updated;
}

async function ensureSpecialties(admin) {
  const ids = {};
  for (const [code, s] of Object.entries(SPECIALTIES)) {
    let row = (await q(`SELECT id, name FROM parametro.specialties WHERE code = $1 AND deleted_at IS NULL`, [code]))[0];
    if (!row) {
      const created = await api(admin, 'POST', '/specialties', { name: s.name, code, description: s.description });
      row = { id: created.id, name: s.name };
      bump('specialties');
    } else if (code === 'MS' && row.name !== s.name) {
      // Fix the lowercase QA spelling so the demo shows "Mastología".
      await api(admin, 'PATCH', `/specialties/${row.id}`, { name: s.name }).catch((e) => log('specialty rename skipped:', e.message));
    }
    ids[code] = row.id;
  }
  return ids;
}

async function ensureCenters(admin, specialtyIds) {
  const centers = {};
  for (const c of CENTERS) {
    let row = (await q(`SELECT id FROM parametro.medical_centers WHERE name = $1 AND deleted_at IS NULL`, [c.name]))[0];
    if (!row) {
      const { key, departments, ...dto } = c;
      row = await api(admin, 'POST', '/medical-centers', { ...dto, isActive: true });
      bump('medical_centers');
    }
    const depts = {};
    for (const code of c.departments) {
      const d = DEPARTMENTS[code];
      let dep = (await q(`SELECT id FROM parametro.departments WHERE medical_center_id = $1 AND name = $2 AND deleted_at IS NULL`, [row.id, d.name]))[0];
      if (!dep) {
        dep = await api(admin, 'POST', '/departments', { name: d.name, description: d.description, medicalCenterId: row.id, isActive: true, specialtyIds: [specialtyIds[code]], supportsMammography: /mamograf|mastolog/i.test(d.name) });
        bump('departments');
      }
      depts[code] = dep.id;
    }
    centers[c.key] = { id: row.id, name: c.name, depts };
  }
  return centers;
}

const person = (p) => ({ letter: 'V', documentNumber: p.doc, firstName: p.f, middleName: p.m, lastName: p.l, secondLastName: p.l2,
  phoneNumber: `+58 414-${p.doc.slice(-7).padStart(7, '3')}` });
const emailOf = (u) => `${u.replace(/\./g, '')}@medos-demo.example.com`;

async function ensureDoctors(admin, centers, specialtyIds) {
  const out = {};
  for (const d of DOCTORS) {
    const center = centers[d.c];
    let row = (await q(
      `SELECT u.id user_id, doc.id doctor_id FROM users u JOIN doctors doc ON doc.common_person_id = u.common_person_id
        WHERE u.name = $1 AND u.deleted_at IS NULL AND doc.deleted_at IS NULL`, [d.u]))[0];
    if (!row) {
      const created = await api(admin, 'POST', '/users', {
        name: d.u, email: emailOf(d.u), password: PASSWORD, firstLogin: false, status: true, commonPerson: person(d),
        doctor: { specialtyIds: [specialtyIds[d.sp]], medicalCenterIds: [center.id], licenseNumber: d.lic, isActive: true },
      });
      row = { user_id: created.id, doctor_id: created.doctor?.id };
      if (!row.doctor_id) {
        row.doctor_id = (await q(`SELECT doc.id FROM doctors doc JOIN users u ON u.common_person_id = doc.common_person_id WHERE u.id = $1`, [created.id]))[0]?.id;
      }
      bump('doctors');
    }
    const deptId = center.depts[d.sp];
    const linked = await q(`SELECT 1 FROM departments_doctors WHERE doctor_id = $1 AND department_id = $2`, [row.doctor_id, deptId]);
    if (!linked.length) await api(admin, 'POST', `/medical-centers/${center.id}/assign-doctor/${row.doctor_id}?departmentId=${deptId}`);
    const sched = await q(`SELECT 1 FROM doctor_schedules WHERE doctor_id = $1 AND medical_center_id = $2 AND deleted_at IS NULL AND is_active`, [row.doctor_id, center.id]);
    if (!sched.length) {
      await api(admin, 'POST', '/doctors/schedules', {
        doctorId: row.doctor_id, medicalCenterId: center.id,
        blocks: d.blocks.map(([dayOfWeek, startTime, endTime]) => ({ dayOfWeek, startTime, endTime, slotDurationMinutes: 30, maxPatientsPerSlot: 1, maxDailyAppointments: 16 })),
      });
      bump('doctor_schedule_sets');
    }
    out[d.u] = { ...d, userId: row.user_id, doctorId: row.doctor_id, centerId: center.id, deptId, specialtyId: specialtyIds[d.sp] };
  }
  return out;
}

async function ensureStaff(admin, centers) {
  const roles = Object.fromEntries((await q(`SELECT nombre, id FROM seguridad.roles WHERE deleted_at IS NULL`)).map((r) => [r.nombre, r.id]));
  for (const s of STAFF) {
    const exists = await q(`SELECT 1 FROM users WHERE name = $1 AND deleted_at IS NULL`, [s.u]);
    if (exists.length) continue;
    await api(admin, 'POST', '/users', {
      name: s.u, email: emailOf(s.u), password: PASSWORD, firstLogin: false, status: true, roleId: roles[s.role], commonPerson: person(s),
      medicalCenterIds: s.centers.map((k) => centers[k].id),
    });
    bump('staff_users');
  }
}

async function ensurePatients(admin, roster) {
  const catalog = async (table, names) =>
    Object.fromEntries((await q(`SELECT name, id FROM parametro.${table} WHERE name = ANY($1) AND deleted_at IS NULL`, [names])).map((r) => [r.name, r.id]));
  const allergyIds = await catalog('allergies', ALLERGY_NAMES);
  const chronicIds = await catalog('chronic_diseases', CHRONIC_NAMES);
  for (const p of roster) {
    const cp = p.dto.commonPerson;
    const row = (await q(
      `SELECT pt.id FROM patients pt JOIN persona_comun pc ON pc.id = pt.common_person_id
        WHERE pc.letra = $1 AND pc.documento = $2 AND pt.deleted_at IS NULL`, [cp.letter, cp.documentNumber]))[0];
    if (row) {
      p.id = row.id;
      continue;
    }
    const created = await api(admin, 'POST', '/patient', {
      ...p.dto,
      allergyIds: p.allergies.map((n) => allergyIds[n]).filter(Boolean),
      chronicDiseaseIds: p.chronic.map((n) => chronicIds[n]).filter(Boolean),
    });
    p.id = created.id;
    bump('patients');
  }
}

// ───────────────────────────── scheduling ─────────────────────────────

const occupied = new Set(); // `${doctorId}|${epochMs}`
const dayLoad = new Map(); // `${doctorId}|${yyyy-mm-dd}` → count
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function loadOccupancy(doctorIds) {
  const rows = await q(
    `SELECT doctor_id, appointment_date FROM medical_appointments WHERE doctor_id = ANY($1) AND deleted_at IS NULL AND status <> 'cancelled'`, [doctorIds]);
  for (const r of rows) {
    occupied.add(`${r.doctor_id}|${r.appointment_date.getTime()}`);
    const k = `${r.doctor_id}|${dayKey(r.appointment_date)}`;
    dayLoad.set(k, (dayLoad.get(k) || 0) + 1);
  }
}

function slotsOn(doc, date) {
  const out = [];
  for (const [dow, start, end] of doc.blocks) {
    if (dow !== date.getDay()) continue;
    const [sh, sm] = hm(start);
    const [eh, em] = hm(end);
    // Starts at block start + 30 min: the API compares 'HH:mm' >= 'HH:mm:ss' as strings and rejects the exact start.
    for (let t = sh * 60 + sm + 30; t + 30 <= eh * 60 + em; t += 30) out.push(new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(t / 60), t % 60));
  }
  return out;
}

function reserve(doc, when) {
  occupied.add(`${doc.doctorId}|${when.getTime()}`);
  const k = `${doc.doctorId}|${dayKey(when)}`;
  dayLoad.set(k, (dayLoad.get(k) || 0) + 1);
}

/** Random free slot for the doctor between today+fromDay and today+toDay, strictly before/after now as asked. */
function pickSlot(rng, doc, fromDay, toDay, { past, avoidDays }) {
  const today = startOfDay(new Date());
  const now = Date.now();
  for (let tries = 0; tries < 80; tries++) {
    const date = addDays(today, rng.int(fromDay, toDay));
    const k = `${doc.doctorId}|${dayKey(date)}`;
    if ((dayLoad.get(k) || 0) >= 10 || avoidDays?.has(dayKey(date))) continue;
    const free = slotsOn(doc, date).filter((s) => !occupied.has(`${doc.doctorId}|${s.getTime()}`) && (past ? s.getTime() + 60 * MIN < now : s.getTime() > now + 30 * MIN));
    if (!free.length) continue;
    const when = rng.pick(free);
    reserve(doc, when);
    return when;
  }
  return null;
}

// ───────────────────────────── mammography variants ─────────────────────────────

const pool = { M: [], m: [], b: [], B: [] }; // M raw<0.08, m 0.08–0.15, b 0.15–0.30, B >0.30
const CLASS_OF = (raw) => (raw < 0.08 ? 'M' : raw <= 0.15 ? 'm' : raw <= 0.3 ? 'b' : 'B');

async function makeVariant(index) {
  const rng = rngFrom(9000 + index);
  const key = weighted(rng, Object.entries(SOURCE_IMAGES).map(([k, v]) => [k, v.weight]));
  const src = path.join(UPLOADS, SOURCE_IMAGES[key].rel);
  if (index < 4) {
    const k = 'ABCD'[index];
    return { key: k, buf: fs.readFileSync(path.join(UPLOADS, SOURCE_IMAGES[k].rel)), params: 'original' };
  }
  const meta = await sharp(src).metadata();
  const crop = 0.02 + rng() * 0.07;
  const cw = Math.round(meta.width * (1 - crop));
  const ch = Math.round(meta.height * (1 - crop));
  const left = rng.int(0, meta.width - cw);
  const top = rng.int(0, meta.height - ch);
  const flop = rng.chance(0.5);
  const rot = -5 + rng() * 10;
  const contrast = 0.86 + rng() * 0.32;
  const brightness = 0.86 + rng() * 0.28;
  const pad = Math.round(Math.min(cw, ch) * rng() * 0.05);
  let img = sharp(src).extract({ left, top, width: cw, height: ch });
  if (flop) img = img.flop();
  img = img.rotate(rot, { background: '#000000' }).linear(contrast, (brightness - 1) * 128 + (1 - contrast) * 20);
  if (pad > 0) img = img.extend({ top: pad, bottom: pad, left: pad, right: pad, background: '#000000' });
  const buf = await img.jpeg({ quality: 92 }).toBuffer();
  return { key, buf, params: `crop=${crop.toFixed(2)} flop=${flop} rot=${rot.toFixed(1)} c=${contrast.toFixed(2)} b=${brightness.toFixed(2)} pad=${pad}` };
}

/** Builds the variant pool and pre-screens it with the detector so the planned mix is reachable. */
async function buildPool() {
  const used = new Set((await q(`SELECT source_file_name FROM mammography_analyses WHERE source_file_name ~ '^MG_' AND deleted_at IS NULL`))
    .map((r) => Number(r.source_file_name.match(/_(\d{4})\.jpg$/)?.[1])));
  const url = `${process.env.DETECTOR_URL.replace(/\/+$/, '')}/predict`;
  let generated = 0;
  for (let i = 0; i < VARIANT_COUNT; i++) {
    const v = await makeVariant(i);
    generated++;
    const form = new FormData();
    form.append('file', new Blob([v.buf], { type: 'image/jpeg' }), 'variant.jpg');
    const res = await fetch(url, { method: 'POST', headers: { 'X-Detector-Secret': process.env.DETECTOR_SECRET }, body: form, signal: AbortSignal.timeout(60_000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      stats.rejectedVariants++;
      continue;
    }
    if (used.has(i)) continue;
    pool[CLASS_OF(body.rawScore)].push({ index: i, buf: v.buf, raw: body.rawScore, source: v.key, params: v.params });
  }
  stats.variantsGenerated = generated;
  log(`variants: generated ${generated}, rejected by the domain guard ${stats.rejectedVariants}, available M=${pool.M.length} m=${pool.m.length} b=${pool.b.length} B=${pool.B.length}`);
}

function takeVariant(cls) {
  const order = { M: ['M', 'm', 'b', 'B'], m: ['m', 'M', 'b', 'B'], b: ['b', 'B', 'm', 'M'], B: ['B', 'b', 'm', 'M'] }[cls];
  for (const c of order) if (pool[c].length) return pool[c].shift();
  return null;
}

// ───────────────────────────── appointment execution ─────────────────────────────

const pg = (d) => d; // Dates go through node-pg as local Caracas wall time, like TypeORM writes them.

async function createAppointment(admin, doc, patient, when, extra) {
  const base = { patientId: patient.id, doctorId: doc.doctorId, specialtyId: doc.specialtyId, medicalCenterId: doc.centerId, departmentId: doc.deptId, durationMinutes: 30 };
  const isPast = when.getTime() <= Date.now() + 5 * MIN;
  if (!isPast) return { apt: await api(admin, 'POST', '/medical-appointments', { ...base, ...extra, appointmentDate: when.toISOString() }), staged: false };
  // Same weekday and hour, whole weeks ahead: the doctor's schedule accepts it and the move back keeps it valid.
  let weeks = Math.ceil((Date.now() - when.getTime() + STAGING_MIN_DAYS * DAY) / (7 * DAY));
  for (let attempt = 0; attempt < 6; attempt++, weeks++) {
    const stage = new Date(when.getTime() + weeks * 7 * DAY);
    try {
      return { apt: await api(admin, 'POST', '/medical-appointments', { ...base, ...extra, appointmentDate: stage.toISOString() }), staged: true };
    } catch (e) {
      if (e.status !== 400 || attempt === 5) throw e;
    }
  }
}

function consultFor(rng, doc, family) {
  return family ? MAMMO_CONSULTS[family] : rng.pick(CONSULTS[doc.sp]);
}

async function finishConsultation(doc, patient, aptId, when, tpl, rng, medIds) {
  const token = await tokenFor(doc.u);
  const items = tpl.items || [];
  const o = patient.male ? 'o' : 'a';
  const body = {
    observations: rng.chance(0.5) ? `Paciente orientad${o} sobre signos de alarma.` : undefined,
    medicalHistory: {
      consultationDate: new Date(when.getTime() + 5 * MIN).toISOString(),
      reasonForVisit: tpl.reason,
      symptoms: tpl.symptoms,
      physicalExamination: tpl.exam,
      diagnosis: tpl.dx,
      diagnosisCode: tpl.code,
      treatmentPlan: tpl.plan,
      observations: rng.pick([`Paciente colaborador${patient.male ? '' : 'a'}, buen estado general.`, 'Se explican hallazgos y plan de manejo.',
        'Control según evolución.', `Acude acompañad${o} de familiar.`]),
      ...VITALS(rng, patient.male),
    },
  };
  if (items.length) {
    body.recipe = {
      diagnosis: tpl.dx,
      notes: 'Cumplir tratamiento completo. Acudir a control según indicación.',
      items: items.map((it) => ({ medicationId: medIds[it.name], medicationName: it.name, dosage: it.dosage, frequency: it.frequency, duration: it.duration, instructions: it.instructions, quantity: it.quantity })),
    };
  }
  await api(token, 'PATCH', `/medical-appointments/${aptId}/finish-consultation`, body);
}

async function runMammography(doc, patient, apt, family, images, review, rng) {
  const token = await tokenFor(doc.u);
  const historyId = (await q(`SELECT id FROM medical_histories WHERE medical_appointment_id = $1`, [apt.id]))[0]?.id;
  const side = rng.chance(0.5) ? 'DER' : 'IZQ';
  const clsFor = { malignant: rng.chance(0.75) ? 'M' : 'm', borderline: 'b', benign: 'B' }[family];
  const results = [];
  for (let i = 0; i < images; i++) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const v = takeVariant(clsFor);
      if (!v) return results;
      const fileName = `MG_${i === 0 ? 'CC' : 'MLO'}_${side}_${String(v.index).padStart(4, '0')}.jpg`;
      const file = await api(token, 'POST', '/files/appointment-upload', undefined, () => {
        const f = new FormData();
        f.append('file', new Blob([v.buf], { type: 'image/jpeg' }), fileName);
        f.append('appointmentId', apt.id);
        f.append('patientId', patient.id);
        f.append('medicalCenterId', doc.centerId);
        if (historyId) f.append('medicalHistoryId', historyId);
        f.append('fileType', 'mammography');
        f.append('description', `Mamografía #${i + 1}`);
        return f;
      });
      try {
        const notes = rng.chance(0.5) ? rng.pick(CREATION_NOTES) : undefined;
        // Structured agreement next to the note, as the consultation screen sends it (MJ-33)
        const doctorAgreement = notes?.startsWith('Médico: Confirma') ? 'accepted' : notes?.startsWith('Médico: Incierto') ? 'uncertain' : undefined;
        const analysis = await api(token, 'POST', '/mammography-analyses', { appointmentFileId: file.id, ...(notes ? { notes } : {}), ...(doctorAgreement ? { doctorAgreement } : {}) });
        if (Math.abs(analysis.rawScore - v.raw) > 1e-4) stats.scoreMismatch++;
        bump(`analyses_${analysis.prediction}`);
        results.push(analysis);
        break;
      } catch (e) {
        if (e.status !== 422) throw e;
        stats.flowRejected++;
        await q(`UPDATE appointment_files SET deleted_at = now(), is_active = false WHERE id = $1`, [file.id]);
      }
    }
  }
  if (review) {
    for (const a of results) {
      const disagree = review === 'disagree';
      const notes = disagree ? REVIEW_DISAGREE[family] : rng.pick(REVIEW_AGREE[family]);
      await api(token, 'PATCH', `/mammography-analyses/${a.id}/review`, { reviewNotes: notes, reviewAgreement: disagree ? 'rejected' : 'accepted' });
      bump('analyses_reviewed');
    }
  }
  return results;
}

/** Moves a staged appointment (and everything hanging from it) back to its real date. */
async function backdate(aptId, when, { bookedDaysBefore, reviewedAfterDays }) {
  const booked = new Date(when.getTime() - bookedDaysBefore * DAY - 3 * 60 * MIN);
  await q(`UPDATE medical_appointments SET appointment_date = $2::timestamp, created_at = $3::timestamp, updated_at = $4::timestamp WHERE id = $1`,
    [aptId, pg(when), pg(booked), pg(new Date(when.getTime() + 40 * MIN))]);
  await backdateDependents(aptId, when, reviewedAfterDays);
}

/** History, recipe, files and analyses of an appointment, relative to its real date. */
async function backdateDependents(aptId, when, reviewedAfterDays) {
  await q(`UPDATE medical_histories SET created_at = $2::timestamp, updated_at = $2::timestamp WHERE medical_appointment_id = $1`, [aptId, pg(new Date(when.getTime() + 35 * MIN))]);
  await q(`UPDATE recipes SET issue_date = $2::timestamp, created_at = $2::timestamp,
            updated_at = CASE WHEN status = 'dispensed' THEN $3::timestamp ELSE $2::timestamp END, expiry_date = $4::date
            WHERE medical_appointment_id = $1`,
    [aptId, pg(new Date(when.getTime() + 38 * MIN)), pg(new Date(when.getTime() + 2 * 60 * MIN)), dayKey(addDays(when, 30))]);
  await q(`UPDATE appointment_files SET created_at = $2::timestamp, updated_at = $2::timestamp WHERE appointment_id = $1`, [aptId, pg(new Date(when.getTime() + 45 * MIN))]);
  const reviewedAt = new Date(Math.min(Date.now() - 10 * MIN, when.getTime() + reviewedAfterDays * DAY + 3 * 60 * MIN));
  await q(`UPDATE mammography_analyses SET created_at = $2::timestamp, updated_at = CASE WHEN is_reviewed THEN $3::timestamp ELSE $2::timestamp END,
            reviewed_at = CASE WHEN is_reviewed THEN $3::timestamp ELSE NULL END WHERE appointment_id = $1`,
    [aptId, pg(new Date(when.getTime() + 47 * MIN)), pg(reviewedAt)]);
}

/** Recovers a run that stopped between the API calls and the move back: dependents newer than their past appointment. */
async function repairBackdates(doctorIds) {
  const rows = await q(
    `SELECT a.id, a.appointment_date FROM medical_appointments a
      WHERE a.doctor_id = ANY($1) AND a.deleted_at IS NULL AND a.status = 'completed' AND a.appointment_date < now() - interval '1 hour'
        AND (EXISTS (SELECT 1 FROM recipes r WHERE r.medical_appointment_id = a.id AND r.issue_date > a.appointment_date + interval '1 day')
          OR EXISTS (SELECT 1 FROM appointment_files f WHERE f.appointment_id = a.id AND f.created_at > a.appointment_date + interval '1 day')
          OR EXISTS (SELECT 1 FROM mammography_analyses m WHERE m.appointment_id = a.id AND m.created_at > a.appointment_date + interval '1 day'))`,
    [doctorIds]);
  for (const r of rows) await backdateDependents(r.id, r.appointment_date, 1);
  if (rows.length) log(`repair: re-dated the dependents of ${rows.length} appointment(s)`);
}

async function executeCompleted(admin, plan, rng, medIds) {
  const { doc, patient, when, family, images, review, type } = plan;
  const tpl = consultFor(rng, doc, family);
  const { apt, staged } = await createAppointment(admin, doc, patient, when, { type, reason: tpl.reason, status: 'confirmed' });
  await finishConsultation(doc, patient, apt.id, when, tpl, rng, medIds);
  bump('appointments_completed');
  if (family) await runMammography(doc, patient, apt, family, images, review, rng);
  if (tpl.items?.length && when.getTime() < Date.now() - 2 * DAY && rng.chance(0.55)) {
    const recipe = (await q(`SELECT id FROM recipes WHERE medical_appointment_id = $1`, [apt.id]))[0];
    if (recipe) {
      await api(admin, 'PATCH', `/recipes/${recipe.id}/dispense`, {});
      bump('recipes_dispensed');
    }
  }
  if (staged) await backdate(apt.id, when, { bookedDaysBefore: rng.int(2, 20), reviewedAfterDays: rng.int(0, 2) });
  return apt;
}

async function executeCancelled(admin, plan, rng) {
  const { doc, patient, when, type } = plan;
  const tpl = consultFor(rng, doc, null);
  const { apt, staged } = await createAppointment(admin, doc, patient, when, { type, reason: tpl.reason, status: 'pending' });
  await api(admin, 'PATCH', `/medical-appointments/${apt.id}/cancel`, { cancellationReason: rng.pick(CANCEL_REASONS) });
  bump('appointments_cancelled');
  if (staged) {
    await q(`UPDATE medical_appointments SET appointment_date = $2::timestamp, created_at = $3::timestamp, updated_at = $4::timestamp WHERE id = $1`,
      [apt.id, pg(when), pg(new Date(when.getTime() - rng.int(5, 15) * DAY)), pg(new Date(when.getTime() - rng.int(1, 3) * DAY))]);
  }
}

async function executeFuture(admin, plan, rng) {
  const { doc, patient, when, type } = plan;
  const tpl = consultFor(rng, doc, null);
  const status = rng.chance(0.45) ? 'confirmed' : 'pending';
  await api(admin, 'POST', '/medical-appointments', {
    patientId: patient.id, doctorId: doc.doctorId, specialtyId: doc.specialtyId, medicalCenterId: doc.centerId, departmentId: doc.deptId,
    durationMinutes: 30, appointmentDate: when.toISOString(), type, reason: type === 'follow_up' ? `Control: ${tpl.reason.toLowerCase()}` : tpl.reason, status,
    observations: rng.chance(0.2) ? 'Traer estudios previos.' : undefined,
  });
  bump(`appointments_${status}`);
}

// ───────────────────────────── plans ─────────────────────────────

function radiologistOf(doctors, centerKey) {
  return Object.values(doctors).find((d) => d.sp === 'RAD' && d.c === centerKey);
}

/** Full history for patients that have no appointments yet. */
function planHistory(doctors, roster) {
  const rng = rngFrom(4242);
  const plans = [];
  for (const p of roster) {
    if (p.hasAppointments) continue;
    const doc = doctors[p.homeDoctor];
    const days = new Set();
    const slot = (d, from, to, past) => {
      const when = pickSlot(rng, d, from, to, { past, avoidDays: days });
      if (when) days.add(dayKey(when));
      return when;
    };
    const nCompleted = 1 + (rng.chance(0.5) ? 1 : 0) + (rng.chance(0.15) ? 1 : 0);
    let lastDay = -HISTORY_WINDOW_DAYS;
    for (let i = 0; i < nCompleted; i++) {
      const from = Math.max(lastDay + 14, -HISTORY_WINDOW_DAYS);
      const to = Math.min(from + 70, -1);
      if (from > to) break;
      const when = slot(doc, from, to, true);
      if (!when) continue;
      lastDay = Math.round((startOfDay(when) - startOfDay(new Date())) / DAY);
      plans.push({ kind: 'completed', doc, patient: p, when, type: i === 0 ? 'first_visit' : 'follow_up' });
    }
    // Mastology patients are often referred to the radiologist of the same center for the mammogram.
    if (doc.sp === 'MS' && rng.chance(0.45)) {
      const rad = radiologistOf(doctors, doc.c);
      const when = rad && slot(rad, -HISTORY_WINDOW_DAYS + 10, -1, true);
      if (when) plans.push({ kind: 'completed', doc: rad, patient: p, when, type: 'first_visit' });
    }
    if (rng.chance(0.16)) {
      const when = slot(doc, -90, -1, true);
      if (when) plans.push({ kind: 'cancelled', doc, patient: p, when, type: 'follow_up' });
    }
    if (rng.chance(0.62)) {
      const when = slot(doc, 1, FUTURE_WINDOW_DAYS, false);
      if (when) plans.push({ kind: 'future', doc, patient: p, when, type: 'follow_up' });
    }
  }
  // Mammography: completed mastology/radiology consultations, a fixed realistic mix of planned results.
  const candidates = rng.shuffle(plans.filter((pl) => pl.kind === 'completed' && (pl.doc.sp === 'MS' || pl.doc.sp === 'RAD')));
  const families = rng.shuffle([...Array(26).fill('benign'), ...Array(5).fill('borderline'), ...Array(9).fill('malignant')]);
  candidates.slice(0, families.length).forEach((pl, i) => {
    pl.family = families[i];
    pl.images = i % 6 === 0 ? 2 : 1;
    const ageDays = (Date.now() - pl.when.getTime()) / DAY;
    const reviewed = ageDays > 6 ? rng.chance(0.82) : rng.chance(0.3);
    pl.review = reviewed ? (rng.chance(0.12) ? 'disagree' : 'agree') : null;
  });
  return plans.sort((a, b) => a.when - b.when);
}

/** Today's agenda for the demo mastologist and the radiologist of her center; skipped if they already have one today. */
async function planToday(doctors, roster) {
  const rng = rngFrom(Number(dayKey(new Date()).replace(/-/g, '')));
  const plans = [];
  const today = startOfDay(new Date());
  for (const u of ['cmendoza', 'lgutierrez']) {
    const doc = doctors[u];
    const existing = await q(`SELECT 1 FROM medical_appointments WHERE doctor_id = $1 AND deleted_at IS NULL AND appointment_date::date = $2::date`, [doc.doctorId, dayKey(today)]);
    if (existing.length) {
      log(`today: ${u} already has an agenda today, skipped`);
      continue;
    }
    const slots = slotsOn(doc, today).filter((s) => !occupied.has(`${doc.doctorId}|${s.getTime()}`));
    if (!slots.length) {
      log(`today: ${u} has no schedule on this weekday, skipped`);
      continue;
    }
    // Disjoint patient sets per doctor, so nobody is booked twice at the same hour.
    const homes = u === 'cmendoza' ? ['cmendoza'] : ['lgutierrez', 'rparedes'];
    const patients = rng.shuffle(roster.filter((p) => p.id && homes.includes(p.homeDoctor)));
    const chosen = slots.filter((_, i) => i % (u === 'cmendoza' ? 1 : 2) === 0).slice(0, u === 'cmendoza' ? 8 : 4);
    chosen.forEach((when, i) => {
      const patient = patients[i % patients.length];
      reserve(doc, when);
      const done = when.getTime() + 40 * MIN < Date.now();
      if (!done && when.getTime() < Date.now() + 15 * MIN) return; // in progress right now: leave the slot free
      if (done) {
        const family = i % 4 === 3 ? 'malignant' : i % 5 === 4 ? 'borderline' : i % 3 === 2 && u === 'cmendoza' ? null : 'benign';
        plans.push({ kind: 'completed', doc, patient, when, type: 'follow_up', family, images: family && i === 0 ? 2 : 1, review: family && i === 1 ? 'agree' : null });
      } else {
        plans.push({ kind: 'future', doc, patient, when, type: 'follow_up' });
      }
    });
  }
  return plans;
}

async function runPlans(admin, plans, medIds, label) {
  const rng = rngFrom(777 + plans.length);
  let n = 0;
  for (const pl of plans) {
    n++;
    try {
      if (pl.kind === 'completed') await executeCompleted(admin, pl, rng, medIds);
      else if (pl.kind === 'cancelled') await executeCancelled(admin, pl, rng);
      else await executeFuture(admin, pl, rng);
    } catch (e) {
      stats.errors = (stats.errors || 0) + 1;
      log(`${label} ${n}/${plans.length} FAILED (${pl.kind} ${pl.doc.u} ${pl.when.toISOString()}): ${e.message}`);
      if (stats.errors > 15) throw new Error('too many failures, aborting');
    }
    if (n % 25 === 0) log(`${label}: ${n}/${plans.length} (requests so far ${stats.requests})`);
  }
}

/** Demo patients get a registration date a few days before their first booking (idempotent: only if registered later). */
async function backdatePatients(roster) {
  for (const p of roster.filter((x) => x.id)) {
    const row = (await q(
      `SELECT p.created_at, (SELECT min(a.created_at) FROM medical_appointments a WHERE a.patient_id = p.id AND a.deleted_at IS NULL) first
         FROM patients p WHERE p.id = $1`, [p.id]))[0];
    if (!row?.first || row.created_at <= row.first) continue;
    const at = new Date(row.first.getTime() - (1 + (p.dto.commonPerson.documentNumber.charCodeAt(3) % 9)) * DAY);
    await q(`UPDATE patients SET created_at = $2::timestamp, updated_at = $2::timestamp WHERE id = $1`, [p.id, pg(at)]);
    await q(`UPDATE persona_comun SET created_at = $2::timestamp, updated_at = $2::timestamp WHERE id = (SELECT common_person_id FROM patients WHERE id = $1)`, [p.id, pg(at)]);
  }
}

// ───────────────────────────── optional: junk test rows ─────────────────────────────

// Old manual-test rows that look bad in a demo. Deletions are soft (API) and only when nothing clinical hangs from them.
const JUNK_USERS = ['alasdoasd', 'asdasdasd', 'marco', 'royfran'];
const JUNK_DOCTOR_LICENSES = ['6546846']; // doctor without user, person "asdasda asdasdasdasd"
const JUNK_PATIENT_CODES = ['PAC-2026-00002', 'PAC-2026-00003', 'QA-M18-002']; // QA patients without appointments
// Kept users (QA reports rely on them) whose person had placeholder names.
const PERSON_RENAMES = {
  mario: { firstName: 'Mario', middleName: 'Alberto', lastName: 'Díaz', secondLastName: 'Rojas' },
  ysleidy: { firstName: 'Ysleidy', middleName: 'Carolina', lastName: 'Rangel', secondLastName: 'Pérez' },
};
const CENTER_FIXES = {
  'el rosal': { name: 'Clínica El Rosal', address: 'Av. Venezuela, El Rosal, Chacao, Caracas', phone: '+58 212-9531200' },
  'montalbancito ': { name: 'Ambulatorio Montalbán', address: 'Av. Teherán, Montalbán, Caracas', phone: '+58 212-4723300' },
  'san rafael': { name: 'Clínica San Rafael', address: 'Av. Principal de La Florida, Caracas', phone: '+58 212-7310500' },
  'santa ines': { name: 'Centro Médico Santa Inés', address: 'Av. Principal de Santa Inés, Baruta, Miranda', phone: '+58 212-9452100' },
  'Dr. perez carreño': { name: 'Hospital Dr. Pérez Carreño', address: 'Av. Intercomunal de El Valle, La Yaguara, Caracas', phone: '+58 212-4722331' },
};
const DEPARTMENT_RENAMES = { Cardiologia: 'Cardiología', mamografia: 'Mamografía', mastologia: 'Mastología', traumatologia: 'Traumatología' };

async function cleanJunk(admin) {
  const done = { usersDeleted: 0, doctorsDeleted: 0, patientsDeleted: 0, personsRenamed: 0, centersFixed: 0, departmentsRenamed: 0, skipped: [] };
  const busyDoctor = async (doctorId) =>
    (await q(`SELECT count(*)::int c FROM medical_appointments WHERE doctor_id = $1 AND deleted_at IS NULL`, [doctorId]))[0].c > 0;

  for (const name of JUNK_USERS) {
    const u = (await q(
      `SELECT u.id, d.id doctor_id FROM users u LEFT JOIN doctors d ON d.common_person_id = u.common_person_id AND d.deleted_at IS NULL
        WHERE u.name = $1 AND u.deleted_at IS NULL`, [name]))[0];
    if (!u) continue;
    if (u.doctor_id && (await busyDoctor(u.doctor_id))) {
      done.skipped.push(`${name}: has appointments`);
      continue;
    }
    if (u.doctor_id) {
      await api(admin, 'DELETE', `/doctors/${u.doctor_id}`);
      done.doctorsDeleted++;
    }
    await api(admin, 'DELETE', `/users/${u.id}`);
    done.usersDeleted++;
  }
  for (const lic of JUNK_DOCTOR_LICENSES) {
    const d = (await q(`SELECT id FROM doctors WHERE license_number = $1 AND deleted_at IS NULL`, [lic]))[0];
    if (!d) continue;
    if (await busyDoctor(d.id)) {
      done.skipped.push(`doctor ${lic}: has appointments`);
      continue;
    }
    await api(admin, 'DELETE', `/doctors/${d.id}`);
    done.doctorsDeleted++;
  }
  for (const code of JUNK_PATIENT_CODES) {
    const p = (await q(
      `SELECT p.id, (SELECT count(*)::int FROM medical_appointments a WHERE a.patient_id = p.id AND a.deleted_at IS NULL) apts
         FROM patients p WHERE p.patient_code = $1 AND p.deleted_at IS NULL`, [code]))[0];
    if (!p) continue;
    if (p.apts > 0) {
      done.skipped.push(`${code}: has appointments`);
      continue;
    }
    await api(admin, 'DELETE', `/patient/${p.id}`);
    done.patientsDeleted++;
  }
  for (const [name, names] of Object.entries(PERSON_RENAMES)) {
    const u = (await q(`SELECT common_person_id id FROM users WHERE name = $1 AND deleted_at IS NULL`, [name]))[0];
    const cur = u && (await q(`SELECT primernombre FROM persona_comun WHERE id = $1`, [u.id]))[0];
    if (!cur || cur.primernombre === names.firstName) continue;
    await api(admin, 'PATCH', `/common-persons/${u.id}`, names);
    done.personsRenamed++;
  }
  for (const [oldName, fix] of Object.entries(CENTER_FIXES)) {
    const c = (await q(`SELECT id FROM parametro.medical_centers WHERE name = $1 AND deleted_at IS NULL`, [oldName]))[0];
    if (!c) continue;
    await api(admin, 'PATCH', `/medical-centers/${c.id}`, fix);
    done.centersFixed++;
  }
  for (const [oldName, newName] of Object.entries(DEPARTMENT_RENAMES)) {
    for (const d of await q(`SELECT id FROM parametro.departments WHERE name = $1 AND deleted_at IS NULL`, [oldName])) {
      await api(admin, 'PATCH', `/departments/${d.id}`, { name: newName });
      done.departmentsRenamed++;
    }
  }
  log('clean-junk', JSON.stringify(done));
}

/** Direct SQL bypassed the services: drop every cache key except sessions and BullMQ queues. */
async function purgeCache() {
  const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || process.env.REDIS_PASS || undefined });
  let cursor = '0';
  let deleted = 0;
  do {
    const [next, keys] = await redis.scan(cursor, 'COUNT', 500);
    cursor = next;
    const victims = keys.filter((k) => !k.startsWith('session:') && !k.startsWith('bull:'));
    if (victims.length) deleted += await redis.del(...victims);
  } while (cursor !== '0');
  await redis.quit();
  log(`cache: ${deleted} key(s) deleted (session:* and bull:* kept)`);
}

// ───────────────────────────── main ─────────────────────────────

async function main() {
  db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME });
  await db.connect();
  try {
    await ensurePasswords();
    const admin = await tokenFor(BOOTSTRAP_USER);
    if (CLEAN_JUNK) {
      await cleanJunk(admin);
      await purgeCache();
      return;
    }
    const specialtyIds = await ensureSpecialties(admin);
    const centers = await ensureCenters(admin, specialtyIds);
    const doctors = await ensureDoctors(admin, centers, specialtyIds);
    await ensureStaff(admin, centers);
    const roster = buildPatients();
    await ensurePatients(admin, roster);
    log(`roster ready: ${roster.length} patients, ${Object.keys(doctors).length} doctors`);

    const withApts = new Set((await q(`SELECT DISTINCT patient_id FROM medical_appointments WHERE deleted_at IS NULL AND patient_id = ANY($1)`, [roster.map((p) => p.id)])).map((r) => r.patient_id));
    roster.forEach((p) => (p.hasAppointments = withApts.has(p.id)));
    await loadOccupancy(Object.values(doctors).map((d) => d.doctorId));
    await repairBackdates(Object.values(doctors).map((d) => d.doctorId));
    const medIds = Object.fromEntries((await q(`SELECT name, id FROM parametro.medications WHERE deleted_at IS NULL`)).map((r) => [r.name, r.id]));

    const history = ONLY_TODAY ? [] : planHistory(doctors, roster);
    const today = await planToday(doctors, roster);
    const needImages = [...history, ...today].some((p) => p.family);
    log(`plan: ${history.length} historical appointment(s), ${today.length} for today`);
    if (needImages) await buildPool();
    await runPlans(admin, history, medIds, 'history');
    await runPlans(admin, today, medIds, 'today');
    await backdatePatients(roster);
    await purgeCache();
  } finally {
    await db.end();
  }
  log('summary', JSON.stringify(stats));
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
