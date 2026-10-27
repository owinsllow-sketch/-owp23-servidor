// OWP23 - Servidor (Oni World Production)
// Node + Express. Guarda dados em Postgres (DATABASE_URL) ou em data.json (reserva).
// Contas/Login + Reservas + Mensagens + Mural de musicas + Painel /admin.
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

// Le o .env (se existir) sem precisar de pacotes extra
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function(line){
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  }
} catch(e){}

const VERSION     = 'OWP23-2026-10-27-r2'; // marcador para confirmar qual codigo esta live
const PORT        = process.env.PORT || 3000;
const HOST        = process.env.HOST || '0.0.0.0';
const ADMIN_KEY   = process.env.ADMIN_KEY   || 'muda-isto-123';
const AUTH_SECRET = process.env.AUTH_SECRET || 'muda-este-segredo-456';
const DATA_FILE   = path.join(__dirname, 'data.json');
const DATABASE_URL= process.env.DATABASE_URL || '';
const USE_PG      = !!DATABASE_URL;

// ---------- Base de dados (Postgres) OU ficheiro (reserva) ----------
let pool = null;
if (USE_PG) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

function fileLoad(){
  try{
    const d = JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    d.users=d.users||[]; d.bookings=d.bookings||[]; d.messages=d.messages||[]; d.posts=d.posts||[];
    return d;
  }catch(e){ return { users:[], bookings:[], messages:[], posts:[] }; }
}
function fileSave(db){ fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }
let fdb = USE_PG ? null : fileLoad();

async function initDb(){
  if(!USE_PG) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY, nome text, email text UNIQUE, telefone text, pass text, criado_em bigint)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
    id text PRIMARY KEY, code text, user_id text, servico text, data text, hora text,
    valor numeric, nome text, telefone text, email text, notas text, estado text, criado_em bigint)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id text PRIMARY KEY, user_id text, titulo text, texto text, lida boolean, criado_em bigint)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS posts (
    id text PRIMARY KEY, titulo text, artista text, capa text, descricao text, links jsonb, criado_em bigint)`);
  console.log('Base de dados pronta (Postgres).');
}

function num(v){ const n=Number(v); return isNaN(n)?0:n; }
function mapUser(r){ return r?{ id:r.id, nome:r.nome, email:r.email, telefone:r.telefone, pass:r.pass, criadoEm:Number(r.criado_em)||0 }:null; }
function mapBooking(r){ return r?{ id:r.id, code:r.code||'', userId:r.user_id||null, servico:r.servico||'', data:r.data||'', hora:r.hora||'', valor:num(r.valor), nome:r.nome||'', telefone:r.telefone||'', email:r.email||'', notas:r.notas||'', estado:r.estado||'pendente', criadoEm:Number(r.criado_em)||0 }:null; }
function mapMsg(r){ return r?{ id:r.id, userId:r.user_id, titulo:r.titulo||'', texto:r.texto||'', lida:!!r.lida, criadoEm:Number(r.criado_em)||0 }:null; }
function mapPost(r){ return r?{ id:r.id, titulo:r.titulo||'', artista:r.artista||'', capa:r.capa||'', descricao:r.descricao||'', links:r.links||{}, criadoEm:Number(r.criado_em)||0 }:null; }

const store = {
  // ----- USERS -----
  async findUserByEmail(email){
    if(USE_PG){ const r=await pool.query('SELECT * FROM users WHERE email=$1',[email]); return mapUser(r.rows[0]); }
    return fdb.users.find(u=>u.email===email)||null;
  },
  async findUserById(id){
    if(USE_PG){ const r=await pool.query('SELECT * FROM users WHERE id=$1',[id]); return mapUser(r.rows[0]); }
    return fdb.users.find(u=>u.id===id)||null;
  },
  async createUser(u){
    if(USE_PG){ await pool.query('INSERT INTO users(id,nome,email,telefone,pass,criado_em) VALUES($1,$2,$3,$4,$5,$6)',
      [u.id,u.nome,u.email,u.telefone,u.pass,u.criadoEm]); return u; }
    fdb.users.push(u); fileSave(fdb); return u;
  },
  async listUsers(){
    if(USE_PG){ const r=await pool.query('SELECT * FROM users ORDER BY criado_em DESC'); return r.rows.map(mapUser); }
    return fdb.users.slice();
  },
  // ----- BOOKINGS -----
  async createBooking(b){
    if(USE_PG){ await pool.query(`INSERT INTO bookings(id,code,user_id,servico,data,hora,valor,nome,telefone,email,notas,estado,criado_em)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [b.id,b.code,b.userId,b.servico,b.data,b.hora,b.valor,b.nome,b.telefone,b.email,b.notas,b.estado,b.criadoEm]); return b; }
    fdb.bookings.push(b); fileSave(fdb); return b;
  },
  async bookingsByUser(uid){
    if(USE_PG){ const r=await pool.query('SELECT * FROM bookings WHERE user_id=$1 ORDER BY criado_em DESC',[uid]); return r.rows.map(mapBooking); }
    return fdb.bookings.filter(b=>b.userId===uid).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  },
  async allBookings(){
    if(USE_PG){ const r=await pool.query('SELECT * FROM bookings ORDER BY criado_em DESC'); return r.rows.map(mapBooking); }
    return fdb.bookings.slice().sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  },
  async findBooking(id){
    if(USE_PG){ const r=await pool.query('SELECT * FROM bookings WHERE id=$1',[id]); return mapBooking(r.rows[0]); }
    return fdb.bookings.find(b=>b.id===id)||null;
  },
  async setBookingState(id,estado){
    if(USE_PG){ await pool.query('UPDATE bookings SET estado=$1 WHERE id=$2',[estado,id]); return; }
    const b=fdb.bookings.find(x=>x.id===id); if(b){ b.estado=estado; fileSave(fdb); }
  },
  // ----- MESSAGES -----
  async addMessage(uid,titulo,texto){
    const m={ id:uid2(), userId:uid, titulo:titulo||'', texto:texto||'', lida:false, criadoEm:Date.now() };
    if(USE_PG){ await pool.query('INSERT INTO messages(id,user_id,titulo,texto,lida,criado_em) VALUES($1,$2,$3,$4,$5,$6)',
      [m.id,m.userId,m.titulo,m.texto,m.lida,m.criadoEm]); return m; }
    fdb.messages.push(m); fileSave(fdb); return m;
  },
  async messagesByUser(uid){
    if(USE_PG){ const r=await pool.query('SELECT * FROM messages WHERE user_id=$1 ORDER BY criado_em DESC',[uid]); return r.rows.map(mapMsg); }
    return fdb.messages.filter(m=>m.userId===uid).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  },
  async markAllRead(uid){
    if(USE_PG){ await pool.query('UPDATE messages SET lida=true WHERE user_id=$1',[uid]); return; }
    fdb.messages.forEach(m=>{ if(m.userId===uid) m.lida=true; }); fileSave(fdb);
  },
  async markOneRead(uid,id){
    if(USE_PG){ await pool.query('UPDATE messages SET lida=true WHERE user_id=$1 AND id=$2',[uid,id]); return; }
    const m=fdb.messages.find(x=>x.id===id&&x.userId===uid); if(m){ m.lida=true; fileSave(fdb); }
  },
  async allMessages(){
    if(USE_PG){ const r=await pool.query('SELECT * FROM messages ORDER BY criado_em DESC'); return r.rows.map(mapMsg); }
    return fdb.messages.slice().sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  },
  // ----- POSTS (mural de musicas) -----
  async createPost(p){
    if(USE_PG){ await pool.query('INSERT INTO posts(id,titulo,artista,capa,descricao,links,criado_em) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [p.id,p.titulo,p.artista,p.capa,p.descricao,JSON.stringify(p.links||{}),p.criadoEm]); return p; }
    fdb.posts.push(p); fileSave(fdb); return p;
  },
  async listPosts(){
    if(USE_PG){ const r=await pool.query('SELECT * FROM posts ORDER BY criado_em DESC'); return r.rows.map(mapPost); }
    return fdb.posts.slice().sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0));
  },
  async deletePost(id){
    if(USE_PG){ await pool.query('DELETE FROM posts WHERE id=$1',[id]); return; }
    fdb.posts = fdb.posts.filter(p=>p.id!==id); fileSave(fdb);
  }
};

function uid2(){ return crypto.randomBytes(9).toString('hex'); }

// ---------- passwords (scrypt) ----------
function hashPass(pw){
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return salt + ':' + h;
}
function checkPass(pw, stored){
  try{
    const [salt,h] = String(stored).split(':');
    const test = crypto.scryptSync(pw, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(test));
  }catch(e){ return false; }
}
// ---------- tokens (HMAC) ----------
function makeToken(userId){
  const payload = Buffer.from(JSON.stringify({ u:userId, t:Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function readToken(token){
  try{
    const [payload,sig] = String(token).split('.');
    const good = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (sig !== good) return null;
    const data = JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
    return data.u || null;
  }catch(e){ return null; }
}
async function userFromReq(req){
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const id = readToken(token);
  if (!id) return null;
  return await store.findUserById(id);
}
function publicUser(u){ return u ? { id:u.id, nome:u.nome||'', email:u.email, telefone:u.telefone||'' } : null; }

// ---------- app ----------
const app = express();
app.use(express.json({ limit:'2mb' }));
app.use(express.urlencoded({ extended:true, limit:'2mb' }));
app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
function requireAdmin(req,res,next){
  const key = req.headers['x-admin-key'] || req.query.key || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error:'Chave de admin invalida' });
  next();
}
// Pequeno embrulho para apanhar erros nas rotas async
function wrap(fn){ return function(req,res){ Promise.resolve(fn(req,res)).catch(err=>{ console.error(err); res.status(500).json({ error:'Erro no servidor' }); }); }; }

// ---------- AUTH ----------
app.post('/api/auth/register', wrap(async (req,res)=>{
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  let nome = String(b.nome || b.name || '').trim();
  const telefone = String(b.telefone || b.phone || '').trim();
  if (!email || !password) return res.status(400).json({ error:'Preencha email e palavra-passe.' });
  if (!nome) nome = email.split('@')[0];
  if (await store.findUserByEmail(email)) return res.status(409).json({ error:'Ja existe uma conta com esse email.' });
  const u = { id:uid2(), nome, email, telefone, pass:hashPass(password), criadoEm:Date.now() };
  await store.createUser(u);
  await store.addMessage(u.id, 'Bem-vindo a OWP23', 'A sua conta foi criada. Veja o mural de musicas e marque a sua sessao quando quiser!');
  res.json({ token:makeToken(u.id), user:publicUser(u) });
}));

app.post('/api/auth/login', wrap(async (req,res)=>{
  const { email, password } = req.body || {};
  const em = String(email||'').trim().toLowerCase();
  const u = await store.findUserByEmail(em);
  if (!u || !checkPass(String(password||''), u.pass)) return res.status(401).json({ error:'Email ou palavra-passe incorretos.' });
  res.json({ token:makeToken(u.id), user:publicUser(u) });
}));

app.get('/api/me', wrap(async (req,res)=>{
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  res.json({ user:publicUser(u) });
}));

app.get('/api/me/bookings', wrap(async (req,res)=>{
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  res.json({ bookings: await store.bookingsByUser(u.id) });
}));

app.get('/api/me/messages', wrap(async (req,res)=>{
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  res.json({ messages: await store.messagesByUser(u.id) });
}));

app.post('/api/me/messages/read', wrap(async (req,res)=>{
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  await store.markAllRead(u.id); res.json({ ok:true });
}));

app.post('/api/me/messages/:id/read', wrap(async (req,res)=>{
  const u = await userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  await store.markOneRead(u.id, req.params.id); res.json({ ok:true });
}));

// ---------- RESERVAS ----------
app.post('/api/bookings', wrap(async (req,res)=>{
  const u = await userFromReq(req); // pode ser null
  const r = req.body || {};
  const b = {
    id: uid2(),
    code: r.code || '',
    userId: u ? u.id : null,
    servico: r.servico || r.svcName || '',
    data: r.data || r.date || '',
    hora: r.hora || r.time || '',
    valor: (r.valor!=null ? num(r.valor) : (r.price!=null ? num(r.price) : 0)),
    nome: r.nome || r.name || (u?u.nome:''),
    telefone: r.telefone || r.phone || '',
    email: r.email || (u?u.email:''),
    notas: r.notas || r.notes || '',
    estado: 'pendente',
    criadoEm: Date.now()
  };
  await store.createBooking(b);
  if (u){ await store.addMessage(u.id, 'Reserva recebida',
      'Recebemos a sua marcacao. Assim que o pagamento for confirmado, avisamos por aqui.'); }
  res.json({ ok:true, booking:b });
}));

// ---------- MURAL DE MUSICAS (publico) ----------
app.get('/api/posts', wrap(async (req,res)=>{
  res.json({ posts: await store.listPosts() });
}));

// ---------- ADMIN (API) ----------
app.get('/api/admin/bookings', requireAdmin, wrap(async (req,res)=>{
  const [bookings, users] = await Promise.all([ store.allBookings(), store.listUsers() ]);
  res.json({ bookings, users: users.map(publicUser) });
}));

app.get('/api/admin/messages', requireAdmin, wrap(async (req,res)=>{
  res.json({ messages: await store.allMessages() });
}));

app.post('/api/admin/messages', requireAdmin, wrap(async (req,res)=>{
  const b = req.body || {};
  const userId = b.userId;
  const titulo = String(b.titulo || b.title || '');
  const texto = String(b.texto || b.body || '');
  if (!userId || !titulo) return res.status(400).json({ error:'Falta userId ou titulo' });
  if (!(await store.findUserById(userId))) return res.status(404).json({ error:'Cliente nao encontrado' });
  const m = await store.addMessage(userId, titulo, texto);
  res.json({ ok:true, message:m });
}));

app.post('/api/admin/bookings/:id/status', requireAdmin, wrap(async (req,res)=>{
  const b = await store.findBooking(req.params.id);
  if (!b) return res.status(404).json({ error:'Reserva nao encontrada' });
  const novo = String((req.body||{}).estado || (req.body||{}).status || 'confirmada');
  await store.setBookingState(b.id, novo);
  if (b.userId){ await store.addMessage(b.userId, 'Reserva ' + novo,
      'O estado da sua marcacao passou para: ' + novo + '.'); }
  res.json({ ok:true });
}));

// publicar musica no mural (so admin)
app.post('/api/admin/posts', requireAdmin, wrap(async (req,res)=>{
  const b = req.body || {};
  const titulo = String(b.titulo||'').trim();
  if(!titulo) return res.status(400).json({ error:'Falta o titulo da musica' });
  const links = (b.links && typeof b.links==='object') ? b.links : {};
  const p = {
    id: uid2(),
    titulo,
    artista: String(b.artista||'').trim(),
    capa: String(b.capa||'').trim(),
    descricao: String(b.descricao||'').trim(),
    links,
    criadoEm: Date.now()
  };
  await store.createPost(p);
  res.json({ ok:true, post:p });
}));

app.delete('/api/admin/posts/:id', requireAdmin, wrap(async (req,res)=>{
  await store.deletePost(req.params.id); res.json({ ok:true });
}));

// ---------- paginas ----------
app.get('/admin', (req,res)=> res.type('html').send(ADMIN_HTML));
app.get('/version', (req,res)=> res.json({ version: VERSION, storage: USE_PG?'postgres':'ficheiro' }));
app.get('/', (req,res)=> res.type('html').send('<h2>OWP23 servidor ativo</h2><p>Versao: <b>'+VERSION+'</b></p><p>Dados: <b>'+(USE_PG?'base de dados (Postgres)':'ficheiro (temporario)')+'</b></p><p>Painel: <a href="/admin">/admin</a></p>'));

initDb().then(()=>{
  app.listen(PORT, HOST, ()=>{
    console.log('OWP23 servidor a correr em http://'+HOST+':'+PORT+'  ('+(USE_PG?'Postgres':'ficheiro')+')');
    console.log('Painel admin: /admin  (precisa da ADMIN_KEY)');
  });
}).catch(err=>{
  console.error('Falha ao preparar a base de dados:', err);
  process.exit(1);
});

// ====================== PAGINA /admin ======================
const ADMIN_HTML = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OWP23 - Painel</title>
<style>
 body{font-family:system-ui,Arial,sans-serif;margin:0;background:#0f0f14;color:#eee}
 header{padding:14px 18px;background:#17171f;border-bottom:1px solid #2a2a35}
 h1{font-size:18px;margin:0} h3{margin:0 0 10px}
 main{padding:18px;max-width:1000px;margin:auto}
 input,button,textarea,select{font:inherit;padding:9px 11px;border-radius:8px;border:1px solid #333;background:#1b1b24;color:#eee}
 button{background:#6c4cff;border:0;cursor:pointer;color:#fff;font-weight:600}
 button.del{background:#b13a4a}
 .card{background:#17171f;border:1px solid #2a2a35;border-radius:12px;padding:16px;margin:12px 0}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #2a2a35;vertical-align:top}
 .muted{color:#9a9ab0;font-size:12px}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
 label{display:block;font-size:13px;color:#b9b9cc;margin:8px 0 3px}
 .full{width:100%}
 .post{display:flex;gap:12px;border-bottom:1px solid #2a2a35;padding:10px 0;align-items:flex-start}
 .post img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:#222}
 .tag{display:inline-block;background:#2a2a36;border-radius:999px;padding:2px 8px;font-size:12px;margin:2px 4px 0 0}
</style></head><body>
<header><h1>OWP23 - Painel de administracao</h1></header>
<main>
 <div class="card">
  <div class="row">
   <input id="key" type="password" placeholder="ADMIN_KEY" style="flex:1;min-width:200px">
   <button onclick="start()">Entrar</button>
  </div>
  <div class="muted">A chave fica so neste navegador.</div>
  <div id="msg" class="muted" style="margin-top:8px"></div>
 </div>
 <div id="app" style="display:none">
  <div class="card"><h3>Publicar musica no mural</h3>
   <label>Titulo da musica *</label><input id="pTit" class="full" placeholder="Ex: Arrasta-me para o Inferno">
   <label>Artista</label><input id="pArt" class="full" placeholder="Ex: Oni World">
   <label>Imagem da capa (link)</label><input id="pCapa" class="full" placeholder="https://...jpg">
   <label>Descricao</label><textarea id="pDesc" class="full" style="min-height:60px" placeholder="Fala sobre a musica..."></textarea>
   <label>Links das plataformas (deixe vazio o que nao tiver)</label>
   <input id="pSpotify" class="full" placeholder="Spotify (link)" style="margin-bottom:6px">
   <input id="pApple" class="full" placeholder="Apple Music (link)" style="margin-bottom:6px">
   <input id="pYoutube" class="full" placeholder="YouTube (link)" style="margin-bottom:6px">
   <input id="pAudiomack" class="full" placeholder="Audiomack (link)" style="margin-bottom:6px">
   <input id="pBoomplay" class="full" placeholder="Boomplay (link)" style="margin-bottom:6px">
   <input id="pOutro" class="full" placeholder="Outro link" style="margin-bottom:6px">
   <div class="row" style="margin-top:8px"><button onclick="publishPost()">Publicar</button><span id="pOk" class="muted"></span></div>
   <div id="posts" style="margin-top:14px"></div>
  </div>
  <div class="card"><h3>Clientes</h3><div id="users"></div></div>
  <div class="card"><h3>Reservas</h3><div id="bookings"></div></div>
  <div class="card"><h3>Enviar mensagem a um cliente</h3>
   <div class="row"><select id="mUser" class="full"></select></div>
   <div class="row" style="margin-top:8px"><input id="mTitle" placeholder="Titulo" class="full"></div>
   <div class="row" style="margin-top:8px"><textarea id="mBody" placeholder="Mensagem" class="full" style="min-height:70px"></textarea></div>
   <div class="row" style="margin-top:8px"><button onclick="sendMsg()">Enviar</button><span id="mOk" class="muted"></span></div>
  </div>
 </div>
</main>
<script>
var KEY='';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function api(path,opts){opts=opts||{};opts.headers=Object.assign({'Content-Type':'application/json','X-Admin-Key':KEY},opts.headers||{});return fetch(path,opts).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Erro');return d;});});}
function start(){KEY=document.getElementById('key').value.trim();document.getElementById('msg').textContent='A ligar...';api('/api/admin/bookings').then(function(){document.getElementById('app').style.display='block';document.getElementById('msg').textContent='';load();loadPosts();}).catch(function(e){document.getElementById('msg').textContent=e.message;});}
var USERS=[];
function load(){return api('/api/admin/bookings').then(function(d){USERS=d.users||[];var B=d.bookings||[];
 document.getElementById('users').innerHTML = USERS.length? '<table><tr><th>Nome</th><th>Email</th><th>Telefone</th></tr>'+USERS.map(function(u){return '<tr><td>'+esc(u.nome)+'</td><td>'+esc(u.email)+'</td><td>'+esc(u.telefone)+'</td></tr>';}).join('')+'</table>' : '<div class="muted">Sem clientes.</div>';
 document.getElementById('mUser').innerHTML=USERS.map(function(u){return '<option value="'+esc(u.id)+'">'+esc(u.nome)+' ('+esc(u.email)+')</option>';}).join('');
 document.getElementById('bookings').innerHTML = B.length? '<table><tr><th>Cliente</th><th>Servico</th><th>Data/Hora</th><th>Valor</th><th>Estado</th><th></th></tr>'+B.map(function(b){return '<tr><td>'+esc(b.nome)+'<div class="muted">'+esc(b.telefone)+'</div></td><td>'+esc(b.servico)+'</td><td>'+esc(b.data)+' '+esc(b.hora)+'</td><td>'+esc(b.valor)+' Kz</td><td>'+esc(b.estado)+'</td><td>'+(b.estado!=='confirmada'?'<button onclick="conf(\\''+b.id+'\\')">Confirmar</button>':'<span class="muted">ok</span>')+'</td></tr>';}).join('')+'</table>' : '<div class="muted">Sem reservas.</div>';
});}
function conf(id){api('/api/admin/bookings/'+id+'/status',{method:'POST',body:JSON.stringify({estado:'confirmada'})}).then(load).catch(function(e){alert(e.message);});}
function sendMsg(){var ok=document.getElementById('mOk');ok.textContent='A enviar...';api('/api/admin/messages',{method:'POST',body:JSON.stringify({userId:document.getElementById('mUser').value,titulo:document.getElementById('mTitle').value,texto:document.getElementById('mBody').value})}).then(function(){ok.textContent='Enviada!';document.getElementById('mTitle').value='';document.getElementById('mBody').value='';}).catch(function(e){ok.textContent=e.message;});}
function loadPosts(){fetch('/api/posts').then(function(r){return r.json();}).then(function(d){var P=d.posts||[];
 document.getElementById('posts').innerHTML = P.length? P.map(function(p){var ls=p.links||{};var tags=Object.keys(ls).filter(function(k){return ls[k];}).map(function(k){return '<span class="tag">'+esc(k)+'</span>';}).join('');return '<div class="post">'+(p.capa?'<img src="'+esc(p.capa)+'">':'<div style="width:56px;height:56px;border-radius:8px;background:#222"></div>')+'<div style="flex:1"><strong>'+esc(p.titulo)+'</strong> <span class="muted">'+esc(p.artista)+'</span><div class="muted" style="margin:4px 0">'+esc(p.descricao)+'</div><div>'+tags+'</div></div><button class="del" onclick="delPost(\\''+p.id+'\\')">Apagar</button></div>';}).join('') : '<div class="muted">Ainda sem publicacoes.</div>';
});}
function val(id){return document.getElementById(id).value.trim();}
function publishPost(){var ok=document.getElementById('pOk');var titulo=val('pTit');if(!titulo){ok.textContent='Falta o titulo.';return;}ok.textContent='A publicar...';
 var links={};var sp=val('pSpotify');if(sp)links.spotify=sp;var ap=val('pApple');if(ap)links.apple=ap;var yt=val('pYoutube');if(yt)links.youtube=yt;var am=val('pAudiomack');if(am)links.audiomack=am;var bp=val('pBoomplay');if(bp)links.boomplay=bp;var ou=val('pOutro');if(ou)links.outro=ou;
 api('/api/admin/posts',{method:'POST',body:JSON.stringify({titulo:titulo,artista:val('pArt'),capa:val('pCapa'),descricao:val('pDesc'),links:links})}).then(function(){ok.textContent='Publicada!';['pTit','pArt','pCapa','pDesc','pSpotify','pApple','pYoutube','pAudiomack','pBoomplay','pOutro'].forEach(function(i){document.getElementById(i).value='';});loadPosts();}).catch(function(e){ok.textContent=e.message;});}
function delPost(id){if(!confirm('Apagar esta publicacao?'))return;api('/api/admin/posts/'+id,{method:'DELETE'}).then(loadPosts).catch(function(e){alert(e.message);});}
</script>
</body></html>`;
