/**
 * AA POS · Demo Version
 * Multi-rubro · Multi-dispositivo · PIN Auth · SSE en tiempo real · data.json
 * Sistema por AA Projects
 *
 * node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT      = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const HTML_FILE = path.join(__dirname, 'index.html');
const SEEDS_DIR = path.join(__dirname, 'seeds');

try {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch (e) { console.warn('⚠ No se pudo crear directorio de datos:', e.message); }

// ─── Seeds de rubros ──────────────────────────────────────────────
const RUBROS_SEED = require('./seeds/rubros.js');

// ─── Datos por defecto ────────────────────────────────────────────
function defaultMesas(n=8) {
  return Array.from({ length: n }, (_, i) => ({
    id: i+1, nombre: 'Mesa '+(i+1), estado:'libre', orden:[], personas:2, cobrado:0
  }));
}

function defaultSucursal(id, nombre, ciudad) {
  return {
    id, nombre, ciudad,
    menu:        [],
    inventario:  [],
    mesas:       defaultMesas(8),
    transacciones: [],
    ventas:      {},
    _nextMenuId: 1,
    _nextInvId:  1,
    _nextMesaId: 9,
  };
}

function defaultRubro(seed) {
  const nextMenuId = (seed.menu && seed.menu.length > 0)
    ? Math.max(...seed.menu.map(m=>m.id)) + 1 : 1;
  const nextInvId = (seed.inventario && seed.inventario.length > 0)
    ? Math.max(...seed.inventario.map(i=>i.id)) + 1 : 1;
  const nextMesaId = (seed.mesasCount || 0) + 1;

  return {
    slug:         seed.slug,
    nombre:       seed.nombre,
    icono:        seed.icono,
    descripcion:  seed.descripcion || '',
    color:        seed.color,
    colorDark:    seed.colorDark,
    colorLight:   seed.colorLight,
    colorCream:   seed.colorCream,
    tipo:         seed.tipo,
    tabs:         seed.tabs,
    menu:         (seed.menu || []).map(m=>({...m})),
    inventario:   (seed.inventario || []).map(i=>({...i})),
    mesas:        seed.tipo === 'mesas' ? defaultMesas(seed.mesasCount || 8) : [],
    transacciones: [],
    ventas:       {},
    _nextMenuId:  nextMenuId,
    _nextInvId:   nextInvId,
    _nextMesaId:  nextMesaId,
  };
}

function buildRubros() {
  const rubros = {};
  RUBROS_SEED.forEach(seed => { rubros[seed.slug] = defaultRubro(seed); });
  return rubros;
}

function defaultData() {
  return {
    pins: { admin: '1234', cajero: '0000' },
    sucursales: [defaultSucursal(1, 'Demo', '')],
    _nextSucId: 2,
    rubros: buildRubros(),
    _seedVersion: 1,
  };
}

// ─── Branding ────────────────────────────────────────────────────
const BRANDING = {
  name:     process.env.BRAND_NAME     || 'AA PROJECTS',
  tagline:  process.env.BRAND_TAGLINE  || 'Control de ventas',
  currency: process.env.BRAND_CURRENCY || 'Q',
  credit:   process.env.BRAND_CREDIT   || 'AA Projects',
};

// ─── Cargar / guardar ─────────────────────────────────────────────
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);

      const def = defaultData();
      if (!parsed.pins)       parsed.pins       = def.pins;
      if (!parsed._nextSucId) parsed._nextSucId = 2;

      // Garantizar sucursales
      if (!Array.isArray(parsed.sucursales) || parsed.sucursales.length === 0) {
        parsed.sucursales = def.sucursales;
      } else {
        parsed.sucursales = parsed.sucursales.map(s => {
          const ds = defaultSucursal(s.id || 1, s.nombre || 'Sucursal', s.ciudad || '');
          return { ...ds, ...s };
        });
      }

      // Garantizar rubros — añade slugs faltantes sin sobrescribir los existentes
      if (!parsed.rubros || typeof parsed.rubros !== 'object') {
        parsed.rubros = def.rubros;
      } else {
        RUBROS_SEED.forEach(seed => {
          if (!parsed.rubros[seed.slug]) {
            parsed.rubros[seed.slug] = defaultRubro(seed);
            console.log(`  + Rubro nuevo añadido: ${seed.slug}`);
          }
        });
      }

      return parsed;
    }
  } catch(e) {
    console.error('⚠ Error leyendo data.json:', e.message);
    try {
      const backup = DATA_FILE + '.backup-' + Date.now();
      fs.renameSync(DATA_FILE, backup);
      console.log('⚠ Backup en:', backup);
    } catch(_) {}
  }
  return defaultData();
}

function saveData() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8'); }
  catch(e) { console.error('⚠ Error guardando:', e.message); }
}

let db = loadData();
console.log(`✅ Datos cargados · ${Object.keys(db.rubros||{}).length} rubros`);

// ─── SSE ──────────────────────────────────────────────────────────
// keys: 'suc:ID' | 'rubro:slug' | 'all'
const sseClients = new Map();

function broadcast(scopeKey, event, payload) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  if (sseClients.has(scopeKey)) {
    sseClients.get(scopeKey).forEach(res => { try { res.write(msg); } catch(_){} });
  }
  if (sseClients.has('all')) {
    sseClients.get('all').forEach(res => { try { res.write(msg); } catch(_){} });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((res, rej) => {
    let b=''; req.on('data',c=>b+=c);
    req.on('end', () => { try{res(JSON.parse(b||'{}'))}catch(e){rej(e)} });
    req.on('error', rej);
  });
}

function corsHeaders() {
  return {
    'Content-Type':'application/json',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-Pin,X-Suc',
  };
}

function json(res, status, data) {
  res.writeHead(status, corsHeaders()); res.end(JSON.stringify(data));
}

function getSuc(id) { return db.sucursales.find(s=>s.id===id); }
function getRubro(slug) { return db.rubros && db.rubros[slug]; }

// ─── Lógica de cobro (compartida por suc y rubro) ─────────────────
function procesarCobro(scope, scopeKey, orden, mesaId, detalle, cobradoParcial, mostrador) {
  const total = orden.reduce((s,l) => s + l.precio * l.qty, 0);
  const now   = new Date();
  const hora  = now.toLocaleTimeString('es-GT', {hour:'2-digit', minute:'2-digit'});
  const fecha = now.toLocaleDateString('es-GT');
  const ts    = now.getTime();

  orden.forEach(l => { scope.ventas[l.nombre] = (scope.ventas[l.nombre]||0) + l.qty; });
  orden.forEach(l => {
    const mi  = scope.menu.find(m=>m.id===l.id);
    if (!mi || !mi.invId) return;
    const inv = scope.inventario.find(i=>i.id===mi.invId);
    if (inv) inv.stock = Math.max(0, parseFloat((inv.stock - l.qty).toFixed(3)));
  });

  if (mostrador) {
    const ticketNum = (scope.transacciones.filter(t=>t.mostrador).length) + 1;
    scope.transacciones.unshift({
      mesaId:0, mesaNombre:'Mostrador · Ticket #'+ticketNum,
      total, hora, fecha, ts,
      detalle: detalle || ('Ticket #'+ticketNum),
      orden:[...orden], mostrador:true
    });
    return { ok:true, total, ticket:ticketNum };
  }

  const mesaObj = scope.mesas.find(m=>m.id===mesaId);
  const mesaNombre = mesaObj ? mesaObj.nombre : 'Mesa '+mesaId;
  scope.transacciones.unshift({mesaId, mesaNombre, total, hora, fecha, ts,
    detalle: detalle||'Cuenta completa', orden:[...orden]});

  if (!cobradoParcial) {
    scope.mesas = scope.mesas.map(m=>m.id===mesaId?{...m,orden:[],estado:'libre',cobrado:0}:m);
  } else {
    scope.mesas = scope.mesas.map(m=>m.id===mesaId?{...m,cobrado:(m.cobrado||0)+total}:m);
  }
  return { ok:true, total };
}

// ─── Servidor ────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url    = req.url.split('?')[0];
  const method = req.method;

  if (method==='OPTIONS') {
    res.writeHead(204, corsHeaders()); return res.end();
  }

  // Healthcheck
  if (method==='GET' && url==='/health') {
    return json(res, 200, { ok:true, rubros: Object.keys(db.rubros||{}).length });
  }

  // Branding
  if (method==='GET' && url==='/api/config') {
    return json(res, 200, BRANDING);
  }

  // index.html
  if (method==='GET' && (url==='/'||url==='/index.html')) {
    try {
      const html = fs.readFileSync(HTML_FILE,'utf8');
      res.writeHead(200,{
        'Content-Type':'text/html;charset=utf-8',
        'Cache-Control':'no-store, no-cache, must-revalidate',
        'Pragma':'no-cache',
      });
      return res.end(html);
    } catch { res.writeHead(404); return res.end('index.html not found'); }
  }

  // Archivos estáticos de seeds/
  if (method==='GET' && url.startsWith('/seeds/')) {
    const fileName = url.replace('/seeds/','');
    const filePath = path.join(SEEDS_DIR, fileName);
    if (!filePath.startsWith(SEEDS_DIR)) {
      res.writeHead(403); return res.end('Forbidden');
    }
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(fileName);
      const ct = ext==='.css' ? 'text/css' : ext==='.js' ? 'application/javascript' : 'text/plain';
      res.writeHead(200, {'Content-Type':ct, 'Cache-Control':'no-cache'});
      return res.end(content);
    } catch { res.writeHead(404); return res.end('Not found'); }
  }

  // SSE /events?suc=ID o /events?rubro=slug
  if (method==='GET' && url.startsWith('/events')) {
    const params = new URL('http://x'+req.url).searchParams;
    const rubroSlug = params.get('rubro');
    const sucId     = parseInt(params.get('suc')||'0');

    res.writeHead(200,{
      'Content-Type':'text/event-stream','Cache-Control':'no-cache',
      'Connection':'keep-alive','Access-Control-Allow-Origin':'*',
    });

    if (rubroSlug) {
      const r = getRubro(rubroSlug);
      res.write(`event: init\ndata: ${JSON.stringify(r||{})}\n\n`);
      const key = 'rubro:'+rubroSlug;
      if (!sseClients.has(key)) sseClients.set(key, new Set());
      sseClients.get(key).add(res);
      req.on('close', () => sseClients.get(key)?.delete(res));
    } else {
      const payload = sucId>0 ? getSuc(sucId) : db;
      res.write(`event: init\ndata: ${JSON.stringify(payload)}\n\n`);
      const key = sucId>0 ? 'suc:'+sucId : 'all';
      if (!sseClients.has(key)) sseClients.set(key, new Set());
      sseClients.get(key).add(res);
      req.on('close', () => sseClients.get(key)?.delete(res));
    }
    return;
  }

  // Auth
  if (method==='POST' && url==='/api/auth') {
    const { pin, rol } = await readBody(req);
    if (db.pins[rol] && db.pins[rol]===String(pin)) {
      return json(res, 200, { ok:true, rol });
    }
    return json(res, 401, { ok:false, error:'PIN incorrecto' });
  }

  // GET /api/data?suc=ID
  if (method==='GET' && url.startsWith('/api/data')) {
    const sucId = parseInt(new URL('http://x'+req.url).searchParams.get('suc')||'0');
    if (sucId>0) {
      const s = getSuc(sucId);
      return s ? json(res,200,s) : json(res,404,{error:'Sucursal no encontrada'});
    }
    return json(res,200,db);
  }

  // Sucursales (se mantienen para compatibilidad)
  if (method==='GET' && url==='/api/sucursales') {
    return json(res,200, db.sucursales.map(s=>({id:s.id,nombre:s.nombre,ciudad:s.ciudad})));
  }
  if (method==='POST' && url==='/api/sucursales') {
    const body = await readBody(req);
    const s = defaultSucursal(db._nextSucId++, body.nombre||'Nueva Sucursal', body.ciudad||'');
    db.sucursales.push(s);
    saveData(); broadcast('all','update',db);
    return json(res,201,s);
  }
  const sucEditMatch = url.match(/^\/api\/sucursales\/(\d+)$/);
  if (method==='PUT' && sucEditMatch) {
    const id=parseInt(sucEditMatch[1]); const body=await readBody(req);
    db.sucursales=db.sucursales.map(s=>s.id===id?{...s,nombre:body.nombre??s.nombre,ciudad:body.ciudad??s.ciudad}:s);
    saveData(); broadcast('all','update',db);
    return json(res,200,getSuc(id));
  }
  if (method==='DELETE' && sucEditMatch) {
    const id=parseInt(sucEditMatch[1]);
    if(db.sucursales.length<=1){return json(res,400,{error:'Debe haber al menos una sucursal'});}
    db.sucursales=db.sucursales.filter(s=>s.id!==id);
    saveData(); broadcast('all','update',db);
    return json(res,200,{ok:true});
  }

  // Cambiar PINs
  if (method==='PUT' && url==='/api/pins') {
    const body=await readBody(req);
    if(body.admin) db.pins.admin=String(body.admin);
    if(body.cajero) db.pins.cajero=String(body.cajero);
    saveData();
    return json(res,200,{ok:true});
  }

  // ─── API DE RUBROS ─────────────────────────────────────────────

  // GET /api/rubros — metadata sin contenidos
  if (method==='GET' && url==='/api/rubros') {
    const meta = Object.values(db.rubros||{}).map(r=>({
      slug:r.slug, nombre:r.nombre, icono:r.icono, descripcion:r.descripcion,
      color:r.color, colorDark:r.colorDark, colorLight:r.colorLight, colorCream:r.colorCream,
      tipo:r.tipo, tabs:r.tabs
    }));
    return json(res, 200, meta);
  }

  // POST /api/demo/reset — regenerar rubros desde seeds
  if (method==='POST' && url==='/api/demo/reset') {
    const body = await readBody(req);
    const pin  = req.headers['x-pin'];
    if (pin !== db.pins.admin) {
      return json(res, 401, {error:'PIN incorrecto'});
    }
    if (body.slug) {
      const seed = RUBROS_SEED.find(s=>s.slug===body.slug);
      if (!seed) return json(res, 404, {error:'Rubro no encontrado'});
      db.rubros[body.slug] = defaultRubro(seed);
    } else {
      db.rubros = buildRubros();
    }
    saveData();
    broadcast('all', 'demo-reset', { slug: body.slug || null });
    return json(res, 200, {ok:true, resetSlug: body.slug || 'all'});
  }

  // Rutas /api/rubro/:slug/...
  const rubroMatch = url.match(/^\/api\/rubro\/([^/]+)(\/.*)$/);
  if (rubroMatch) {
    const slug    = rubroMatch[1];
    const subPath = rubroMatch[2];
    const rubro   = getRubro(slug);
    if (!rubro) return json(res, 404, {error:'Rubro no encontrado'});

    const scopeKey = 'rubro:'+slug;
    function save() { saveData(); broadcast(scopeKey,'update',rubro); }

    // GET /api/rubro/:slug/data
    if (method==='GET' && subPath==='/data') return json(res, 200, rubro);

    // ── Menú ──
    if (method==='GET' && subPath==='/menu') return json(res,200,rubro.menu);
    if (method==='POST' && subPath==='/menu') {
      const b=await readBody(req);
      const item={id:rubro._nextMenuId++, nombre:b.nombre||'Ítem', precio:Number(b.precio)||0,
        emoji:b.emoji||'🍽', invId:b.invId||null, unidad:b.unidad||'u'};
      rubro.menu.push(item); save(); return json(res,201,item);
    }
    const menuMatch=subPath.match(/^\/menu\/(\d+)$/);
    if (menuMatch) {
      const id=parseInt(menuMatch[1]);
      if (method==='PUT') {
        const b=await readBody(req);
        rubro.menu=rubro.menu.map(m=>m.id===id?{...m,...b,id}:m);
        save(); return json(res,200,rubro.menu.find(m=>m.id===id));
      }
      if (method==='DELETE') {
        rubro.menu=rubro.menu.filter(m=>m.id!==id);
        save(); return json(res,200,{ok:true});
      }
    }

    // ── Inventario ──
    if (method==='GET' && subPath==='/inventario') return json(res,200,rubro.inventario);
    if (method==='POST' && subPath==='/inventario') {
      const b=await readBody(req);
      const item={id:rubro._nextInvId++, nombre:b.nombre||'Producto',
        stock:parseFloat(b.stock)||0, min:parseFloat(b.min)||2, unidad:b.unidad||'u'};
      rubro.inventario.push(item); save(); return json(res,201,item);
    }
    const invMatch=subPath.match(/^\/inventario\/(\d+)$/);
    if (invMatch) {
      const id=parseInt(invMatch[1]);
      if (method==='PUT') {
        const b=await readBody(req);
        rubro.inventario=rubro.inventario.map(i=>i.id===id?{...i,...b,id}:i);
        save(); return json(res,200,rubro.inventario.find(i=>i.id===id));
      }
      if (method==='DELETE') {
        rubro.inventario=rubro.inventario.filter(i=>i.id!==id);
        save(); return json(res,200,{ok:true});
      }
    }

    // ── Mesas ──
    if (method==='GET' && subPath==='/mesas') return json(res,200,rubro.mesas);
    if (method==='POST' && subPath==='/mesas') {
      const b=await readBody(req);
      const mesa={id:rubro._nextMesaId++, nombre:b.nombre||'Mesa '+rubro._nextMesaId,
        estado:'libre', orden:[], personas:2, cobrado:0};
      rubro.mesas.push(mesa); save(); return json(res,201,mesa);
    }
    const mesaMatch=subPath.match(/^\/mesas\/(\d+)$/);
    if (mesaMatch) {
      const id=parseInt(mesaMatch[1]);
      if (method==='PUT') {
        const b=await readBody(req);
        rubro.mesas=rubro.mesas.map(m=>m.id===id?{...m,...b,id}:m);
        save(); return json(res,200,rubro.mesas.find(m=>m.id===id));
      }
      if (method==='DELETE') {
        rubro.mesas=rubro.mesas.filter(m=>m.id!==id);
        save(); return json(res,200,{ok:true});
      }
    }

    // ── Cobrar ──
    if (method==='POST' && subPath==='/cobrar') {
      const { mesaId, orden, detalle, cobradoParcial, mostrador } = await readBody(req);
      const result = procesarCobro(rubro, scopeKey, orden, mesaId, detalle, cobradoParcial, mostrador);
      save();
      return json(res, 200, result);
    }

    // ── Eliminar transacción ──
    const txDelMatch = subPath.match(/^\/transacciones\/(\d+)$/);
    if (method==='DELETE' && txDelMatch) {
      const ts = parseInt(txDelMatch[1]);
      rubro.transacciones = rubro.transacciones.filter(t=>t.ts!==ts);
      save();
      return json(res, 200, {ok:true});
    }

    res.writeHead(404); return res.end('Not found');
  }

  // Rutas legacy /api/suc/:id/...
  const sucMatch = url.match(/^\/api\/suc\/(\d+)(\/.*)$/);
  if (!sucMatch) { res.writeHead(404); return res.end('Not found'); }

  const sucId   = parseInt(sucMatch[1]);
  const subPath = sucMatch[2];
  const suc     = getSuc(sucId);
  if (!suc) return json(res,404,{error:'Sucursal no encontrada'});

  function save() { saveData(); broadcast('suc:'+sucId,'update',suc); }

  if (method==='GET' && subPath==='/menu') return json(res,200,suc.menu);
  if (method==='POST' && subPath==='/menu') {
    const b=await readBody(req);
    const item={id:suc._nextMenuId++,nombre:b.nombre||'Ítem',precio:Number(b.precio)||0,emoji:b.emoji||'🍽',invId:b.invId||null};
    suc.menu.push(item); save(); return json(res,201,item);
  }
  const menuMatchLeg=subPath.match(/^\/menu\/(\d+)$/);
  if (menuMatchLeg) {
    const id=parseInt(menuMatchLeg[1]);
    if (method==='PUT') { const b=await readBody(req); suc.menu=suc.menu.map(m=>m.id===id?{...m,...b,id}:m); save(); return json(res,200,suc.menu.find(m=>m.id===id)); }
    if (method==='DELETE') { suc.menu=suc.menu.filter(m=>m.id!==id); save(); return json(res,200,{ok:true}); }
  }

  if (method==='GET' && subPath==='/inventario') return json(res,200,suc.inventario);
  if (method==='POST' && subPath==='/inventario') {
    const b=await readBody(req);
    const item={id:suc._nextInvId++,nombre:b.nombre||'Producto',stock:Number(b.stock)||0,min:Number(b.min)||2};
    suc.inventario.push(item); save(); return json(res,201,item);
  }
  const invMatchLeg=subPath.match(/^\/inventario\/(\d+)$/);
  if (invMatchLeg) {
    const id=parseInt(invMatchLeg[1]);
    if (method==='PUT') { const b=await readBody(req); suc.inventario=suc.inventario.map(i=>i.id===id?{...i,...b,id}:i); save(); return json(res,200,suc.inventario.find(i=>i.id===id)); }
    if (method==='DELETE') { suc.inventario=suc.inventario.filter(i=>i.id!==id); save(); return json(res,200,{ok:true}); }
  }

  if (method==='GET' && subPath==='/mesas') return json(res,200,suc.mesas);
  if (method==='POST' && subPath==='/mesas') {
    const b=await readBody(req);
    const mesa={id:suc._nextMesaId++,nombre:b.nombre||'Mesa '+suc._nextMesaId,estado:'libre',orden:[],personas:2,cobrado:0};
    suc.mesas.push(mesa); save(); return json(res,201,mesa);
  }
  const mesaMatchLeg=subPath.match(/^\/mesas\/(\d+)$/);
  if (mesaMatchLeg) {
    const id=parseInt(mesaMatchLeg[1]);
    if (method==='PUT') { const b=await readBody(req); suc.mesas=suc.mesas.map(m=>m.id===id?{...m,...b,id}:m); save(); return json(res,200,suc.mesas.find(m=>m.id===id)); }
    if (method==='DELETE') { suc.mesas=suc.mesas.filter(m=>m.id!==id); save(); return json(res,200,{ok:true}); }
  }

  if (method==='POST' && subPath==='/cobrar') {
    const { mesaId, orden, detalle, cobradoParcial, mostrador } = await readBody(req);
    const result = procesarCobro(suc, 'suc:'+sucId, orden, mesaId, detalle, cobradoParcial, mostrador);
    save();
    return json(res, 200, result);
  }

  const txDelMatchLeg = subPath.match(/^\/transacciones\/(\d+)$/);
  if (method==='DELETE' && txDelMatchLeg) {
    const ts = parseInt(txDelMatchLeg[1]);
    suc.transacciones = suc.transacciones.filter(t => t.ts !== ts);
    save();
    return json(res, 200, {ok:true});
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`\n  ${BRANDING.name} — Demo Version\n  Sistema por ${BRANDING.credit}\n`);
  console.log(`   Local:  http://localhost:${PORT}`);
  const ifaces=os.networkInterfaces();
  Object.values(ifaces).flat().forEach(i=>{
    if(i.family==='IPv4'&&!i.internal)
      console.log(`   Red:    http://${i.address}:${PORT}  ← otros dispositivos`);
  });
  console.log(`\n   Datos:  ${DATA_FILE}`);
  console.log('   Ctrl+C para detener\n');
});

process.on('SIGINT', ()=>{ saveData(); console.log('\n💾 Guardado. ¡Hasta luego!'); process.exit(); });
process.on('SIGTERM',()=>{ saveData(); process.exit(); });
