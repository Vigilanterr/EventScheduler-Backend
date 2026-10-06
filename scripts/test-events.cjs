const BASE = process.env.TEST_BASE || 'http://localhost:3001';
let pass = 0, fail = 0;
const results = [];
async function req(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { json = null; }
  return { status: r.status, json };
}
function check(n, cond, detail) {
  if (cond) { pass++; results.push(`PASS ${n}`); }
  else { fail++; results.push(`FAIL ${n} :: ${detail}`); }
}
(async () => {
  await req('GET', '/');
  // clean slate: list & delete all
  const list0 = await req('GET', '/events');
  if (list0.json && Array.isArray(list0.json.data)) {
    for (const e of list0.json.data) await req('DELETE', '/events/' + e.id);
  }
  // 1. create tanpa conflict
  const a = await req('POST', '/events', { title: 'Meeting Project', start_time: '2026-10-06T10:00:00Z', end_time: '2026-10-06T11:00:00Z', participants: ['haidar', 'budi', 'andi'] });
  check(1, a.status === 201 && a.json && a.json.success && a.json.data && a.json.data.id, JSON.stringify(a));
  const idA = a.json && a.json.data && a.json.data.id;
  // 2. overlap tapi participant beda -> berhasil
  const b = await req('POST', '/events', { title: 'Lain', start_time: '2026-10-06T10:30:00Z', end_time: '2026-10-06T11:30:00Z', participants: ['siti', 'rudi'] });
  check(2, b.status === 201 && b.json && b.json.success, JSON.stringify(b));
  const idB = b.json && b.json.data && b.json.data.id;
  // 3. overlap + participant sama -> 409
  const c = await req('POST', '/events', { title: 'Bentrok', start_time: '2026-10-06T10:30:00Z', end_time: '2026-10-06T11:30:00Z', participants: ['budi', 'citra'] });
  check(3, c.status === 409 && c.json && c.json.success === false, JSON.stringify(c));
  // 4. conflict response menampilkan event bentrok
  check(4, c.json && Array.isArray(c.json.conflicts) && c.json.conflicts.length >= 1 && c.json.conflicts[0].event_id === idA, JSON.stringify(c.json && c.json.conflicts));
  // 5. menampilkan participant bentrok
  check(5, c.json && c.json.conflicts[0].conflicting_participants && c.json.conflicts[0].conflicting_participants.map(s => s.toLowerCase()).includes('budi'), JSON.stringify(c.json && c.json.conflicts));
  // 6. suggestion ada
  check(6, c.json && c.json.suggestion && c.json.suggestion.start_time && c.json.suggestion.end_time, JSON.stringify(c.json && c.json.suggestion));
  // 7. suggestion mempertahankan durasi (60 mnt)
  let durOk = false, durDetail = '';
  if (c.json && c.json.suggestion) {
    const d = new Date(c.json.suggestion.end_time).getTime() - new Date(c.json.suggestion.start_time).getTime();
    durOk = d === 60 * 60 * 1000; durDetail = 'dur=' + d;
  }
  check(7, durOk, durDetail);
  // 8. suggestion tidak conflict (coba create di slot suggestion)
  let freeOk = false, freeDetail = '';
  if (c.json && c.json.suggestion) {
    const s = await req('POST', '/events', { title: 'Ikut saran', start_time: c.json.suggestion.start_time, end_time: c.json.suggestion.end_time, participants: ['budi', 'citra'] });
    freeOk = s.status === 201; freeDetail = JSON.stringify(s);
    if (s.json && s.json.data) await req('DELETE', '/events/' + s.json.data.id);
  }
  check(8, freeOk, freeDetail);
  // 8b. batas waktu bersinggungan tidak konflik (11:00-12:00 dgn A 10-11, peserta sama)
  const edge = await req('POST', '/events', { title: 'Tepat setelah', start_time: '2026-10-06T11:00:00Z', end_time: '2026-10-06T12:00:00Z', participants: ['haidar'] });
  check('8b', edge.status === 201, JSON.stringify(edge));
  const idEdge = edge.json && edge.json.data && edge.json.data.id;
  // 9. update tanpa conflict -> berhasil
  const u1 = await req('PUT', '/events/' + idB, { title: 'Lain update', start_time: '2026-10-06T12:00:00Z', end_time: '2026-10-06T13:00:00Z', participants: ['siti', 'rudi'] });
  check(9, u1.status === 200 && u1.json && u1.json.success, JSON.stringify(u1));
  // 10. update menjadi conflict -> ditolak
  const u2 = await req('PUT', '/events/' + idB, { title: 'Paksa bentrok', start_time: '2026-10-06T10:30:00Z', end_time: '2026-10-06T11:30:00Z', participants: ['andi', 'x'] });
  check(10, u2.status === 409, JSON.stringify(u2));
  // 10b. update diri sendiri waktu sama -> berhasil (tidak konflik dgn diri sendiri)
  const u3 = await req('PUT', '/events/' + idA, { title: 'Meeting Project rev', start_time: '2026-10-06T10:00:00Z', end_time: '2026-10-06T11:00:00Z', participants: ['haidar', 'budi', 'andi'] });
  check('10b', u3.status === 200, JSON.stringify(u3));
  // 11. delete -> berhasil
  const d1 = await req('DELETE', '/events/' + idB);
  check(11, d1.status === 200, JSON.stringify(d1));
  if (idEdge) await req('DELETE', '/events/' + idEdge);
  // 12. get events -> berhasil + terurut ASC
  const g = await req('GET', '/events');
  let sorted = false;
  if (g.status === 200 && g.json && Array.isArray(g.json.data)) {
    sorted = g.json.data.every((e, i, arr) => i === 0 || new Date(arr[i-1].start_time) <= new Date(e.start_time));
  }
  check(12, g.status === 200 && sorted, JSON.stringify((g.json && g.json.data || []).map(e => e.start_time)));
  // error cases
  const e1 = await req('GET', '/events/bukan-uuid');
  check('E1', e1.status === 400, JSON.stringify(e1));
  const e2 = await req('POST', '/events', { title: '', start_time: '2026-10-06T10:00:00Z', end_time: '2026-10-06T11:00:00Z', participants: ['a'] });
  check('E2', e2.status === 400, JSON.stringify(e2));
  const e3 = await req('POST', '/events', { title: 'x', start_time: 'invalid', end_time: '2026-10-06T11:00:00Z', participants: ['a'] });
  check('E3', e3.status === 400, JSON.stringify(e3));
  const e4 = await req('POST', '/events', { title: 'x', start_time: '2026-10-06T12:00:00Z', end_time: '2026-10-06T11:00:00Z', participants: ['a'] });
  check('E4', e4.status === 400, JSON.stringify(e4));
  const e5 = await req('POST', '/events', { title: 'x', start_time: '2026-10-06T12:00:00Z', end_time: '2026-10-06T13:00:00Z', participants: 'bukan-array' });
  check('E5', e5.status === 400, JSON.stringify(e5));
  const e6 = await req('GET', '/events/00000000-0000-0000-0000-000000000000');
  check('E6', e6.status === 404, JSON.stringify(e6));
  console.log(results.join('\n'));
  console.log(`\nRINGKASAN: lolos=${pass} gagal=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TESTERR ' + e.stack); process.exit(1); });
