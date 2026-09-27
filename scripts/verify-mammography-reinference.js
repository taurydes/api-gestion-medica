/**
 * M-40: re-runs the detector on every stored analysis image and compares raw_score (tolerance 1e-4).
 * Run inside the backend container: docker cp this file, then `cd /app && NODE_PATH=/app/node_modules node <file>`.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const TOLERANCE = 1e-4;

function sniff(buf, declared) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('hex', 0, 8) === '89504e470d0a1a0a') return 'image/png';
  return declared || 'application/octet-stream';
}

async function main() {
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, prediction, probability, raw_score, malignancy_probability, image_path, image_mime_type
       FROM mammography_analyses WHERE deleted_at IS NULL ORDER BY created_at`,
  );
  const uploads = path.resolve(process.cwd(), process.env.UPLOADS_PATH || 'uploads');
  const url = `${process.env.DETECTOR_URL.replace(/\/+$/, '')}/predict`;
  const out = [];

  for (const r of rows) {
    const row = { id: r.id, stored: r.prediction, storedRaw: r.raw_score };
    try {
      const file = path.resolve(uploads, r.image_path);
      if (!file.startsWith(uploads + path.sep)) throw new Error('path outside uploads');
      const buf = fs.readFileSync(file);
      const form = new FormData();
      form.append('file', new Blob([buf], { type: sniff(buf, r.image_mime_type) }), path.basename(file));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'X-Detector-Secret': process.env.DETECTOR_SECRET },
        body: form,
        signal: AbortSignal.timeout(60000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        row.result = `HTTP ${res.status}`;
        row.detail = body.detail;
      } else {
        const pred = body.prediction === 'MALIGNO' ? 'MALIGNANT' : 'BENIGN';
        row.newRaw = body.rawScore;
        row.diff = Math.abs(body.rawScore - r.raw_score);
        row.result = row.diff <= TOLERANCE && pred === r.prediction ? 'MATCH' : 'MISMATCH';
        row.newPrediction = pred;
      }
    } catch (err) {
      row.result = 'ERROR';
      row.detail = err.message;
    }
    out.push(row);
  }
  await db.end();

  console.table(out);
  const count = (k) => out.filter((o) => o.result === k).length;
  console.log(
    JSON.stringify({ total: out.length, match: count('MATCH'), mismatch: count('MISMATCH'), other: out.length - count('MATCH') - count('MISMATCH') }),
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
