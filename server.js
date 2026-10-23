// OWP23 - Servidor (Oni World Production)
// Node + Express + crypto (sem dependencias extra). Guarda dados em data.json.
// Login/Contas + Reservas + Mensagens/Notificacoes + Painel /admin.
const express = require('express');
const crypto  = require('crypto');
const fs      = require('fs');
const path    = require('path');

// Le o ficheiro .env (se existir) sem precisar de pacotes extra
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(function(line){
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    });
  }
} catch(e){}

const VERSION     = 'OWP23-2026-10-23-r1'; // marcador para confirmar qual codigo esta live
const PORT        = process.env.PORT || 3000;
const HOST        = process.env.HOST || '0.0.0.0';
const ADMIN_KEY   = process.env.ADMIN_KEY   || 'muda-isto-123';
const AUTH_SECRET = process.env.AUTH_SECRET || 'muda-este-segredo-456';
const DATA_FILE   = path.join(__dirname, 'data.json');

const ADMIN_HTML = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>OWP23 - Painel</title>
<style>
 body{font-family:system-ui,Arial,sans-serif;margin:0;background:#0f0f14;color:#eee}
 header{padding:14px 18px;background:#17171f;border-bottom:1px solid #2a2a35}
 h1{font-size:18px;margin:0}
 main{padding:18px;max-width:1000px;margin:auto}
 input,button,textarea,select{font:inherit;padding:8px 10px;border-radius:8px;border:1px solid #333;background:#1b1b24;color:#eee}
 button{background:#6c4cff;border:0;cursor:pointer}
 .card{background:#17171f;border:1px solid #2a2a35;border-radius:12px;padding:14px;margin:12px 0}
 table{width:100%;border-collapse:collapse;font-size:14px}
 th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #2a2a35;vertical-align:top}
 .muted{color:#9a9ab0;font-size:12px}
 .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
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
  <div class="card"><h3>Clientes</h3><div id="users"></div></div>
  <div class="card"><h3>Reservas</h3><div id="bookings"></div></div>
  <div class="card"><h3>Enviar mensagem a um cliente</h3>
   <div class="row"><select id="mUser"></select></div>
   <div class="row" style="margin-top:8px"><input id="mTitle" placeholder="Titulo" style="flex:1"></div>
   <div class="row" style="margin-top:8px"><textarea id="mBody" placeholder="Mensagem" style="flex:1;min-height:70px"></textarea></div>
   <div class="row" style="margin-top:8px"><button onclick="sendMsg()">Enviar</button><span id="mOk" class="muted"></span></div>
  </div>
 </div>
</main>
<script>
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function K(){return localStorage.getItem('owp23_admin_key')||'';}
async function api(p,opt){opt=opt||{};opt.headers=Object.assign({'Content-Type':'application/json','X-Admin-Key':K()},opt.headers||{});const r=await fetch(p,opt);if(!r.ok)throw new Error((await r.json()).error||'erro');return r.json();}
async function start(){var k=document.getElementById('key').value.trim();localStorage.setItem('owp23_admin_key',k);var msg=document.getElementById('msg');msg.textContent='A entrar... (se o servidor estava a dormir pode demorar ate 1 minuto)';try{await load();document.getElementById('app').style.display='';msg.textContent='';}catch(e){msg.textContent='Nao foi possivel entrar: '+(e.message||'erro')+'. Verifique a ADMIN_KEY.';}}
let USERS=[];
async function load(){
 const d=await api('/api/admin/bookings');USERS=d.users||[];
 document.getElementById('users').innerHTML = USERS.length? '<table><tr><th>Nome</th><th>Email</th></tr>'+USERS.map(function(u){return '<tr><td>'+esc(u.nome)+'</td><td>'+esc(u.email)+'</td></tr>';}).join('')+'</table>' : '<div class="muted">Sem clientes.</div>';
 var sel=document.getElementById('mUser');sel.innerHTML=USERS.map(function(u){return '<option value="'+esc(u.id)+'">'+esc(u.nome)+' ('+esc(u.email)+')</option>';}).join('');
 var bs=d.bookings||[];
 document.getElementById('bookings').innerHTML = bs.length? '<table><tr><th>Data</th><th>Cliente</th><th>Servico</th><th>Quando</th><th>Estado</th><th></th></tr>'+bs.map(function(b){var nm=(USERS.find(function(u){return u.id===b.userId;})||{}).nome||b.nome||'(sem conta)';return '<tr><td>'+new Date(b.criadoEm||b.createdAt||Date.now()).toLocaleString('pt-PT')+'</td><td>'+esc(nm)+'</td><td>'+esc(b.servico||'')+'</td><td class="muted">'+esc((b.data||'')+' '+(b.hora||''))+'</td><td>'+esc(b.estado||b.status||'')+'</td><td><button onclick="conf(\''+b.id+'\')">Confirmar</button></td></tr>';}).join('')+'</table>' : '<div class="muted">Sem reservas.</div>';
}
async function conf(id){try{await api('/api/admin/bookings/'+id+'/status',{method:'POST',body:JSON.stringify({status:'confirmada'})});await load();}catch(e){alert(e.message);}}
async function sendMsg(){try{await api('/api/admin/messages',{method:'POST',body:JSON.stringify({userId:document.getElementById('mUser').value,title:document.getElementById('mTitle').value,body:document.getElementById('mBody').value})});document.getElementById('mOk').textContent='Enviada!';document.getElementById('mTitle').value='';document.getElementById('mBody').value='';}catch(e){alert(e.message);}}
if(K()){document.getElementById('key').value=K();}
</script>
</body></html>`;

// ---------- armazenamento simples (ficheiro JSON) ----------
function load(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE,'utf8')); }
  catch(e){ return { users:[], bookings:[], messages:[] }; }
}
function save(db){ fs.writeFileSync(DATA_FILE, JSON.stringify(db,null,2)); }
let db = load();
function uid(){ return crypto.randomBytes(9).toString('hex'); }

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
function userFromReq(req){
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const id = readToken(token);
  if (!id) return null;
  return db.users.find(u => u.id === id) || null;
}
function publicUser(u){ return u ? { id:u.id, nome:u.nome||'', email:u.email, telefone:u.telefone||'' } : null; }

// ---------- mensagens / notificacoes ----------
function addMessage(userId, titulo, texto){
  const m = { id:uid(), userId, titulo:titulo||'', texto:texto||'', lida:false, criadoEm:Date.now() };
  db.messages.push(m); save(db); return m;
}
// normaliza uma reserva para os nomes de campos que o site espera
function toClientBooking(b){
  return {
    id:b.id, code:b.code||'',
    servico: b.servico || b.svcName || '',
    data: b.data || b.date || '',
    hora: b.hora || b.time || '',
    valor: (b.valor!=null ? b.valor : (b.price!=null ? b.price : 0)),
    estado: b.estado || b.status || 'pendente',
    criadoEm: b.criadoEm || b.created || b.createdAt || Date.now()
  };
}

// ---------- app ----------
const app = express();
app.use(express.json({ limit:'1mb' }));
app.use(express.urlencoded({ extended:true, limit:'1mb' })); // aceita tambem formularios normais
// CORS (o site no Netlify chama este servidor)
app.use((req,res,next)=>{
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

function requireAdmin(req,res,next){
  const key = req.headers['x-admin-key'] || req.query.key || '';
  if (key !== ADMIN_KEY) return res.status(401).json({ error:'Chave de admin invalida' });
  next();
}

// ---------- AUTH ----------
app.post('/api/auth/register', (req,res)=>{
  const b = req.body || {};
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  let nome = String(b.nome || b.name || '').trim();
  const telefone = String(b.telefone || b.phone || '').trim();
  if (!email || !password) return res.status(400).json({ error:'Preencha email e palavra-passe.' });
  if (!nome) nome = email.split('@')[0];
  if (db.users.find(u => u.email === email)) return res.status(409).json({ error:'Ja existe uma conta com esse email.' });
  const u = { id:uid(), nome, email, telefone, pass:hashPass(password), criadoEm:Date.now() };
  db.users.push(u); save(db);
  addMessage(u.id, 'Bem-vindo a OWP23', 'A sua conta foi criada. Marque a sua sessao quando quiser!');
  res.json({ token:makeToken(u.id), user:publicUser(u) });
});

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body || {};
  const em = String(email||'').trim().toLowerCase();
  const u = db.users.find(x => x.email === em);
  if (!u || !checkPass(String(password||''), u.pass)) return res.status(401).json({ error:'Email ou palavra-passe incorretos.' });
  res.json({ token:makeToken(u.id), user:publicUser(u) });
});

app.get('/api/me', (req,res)=>{
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  res.json({ user:publicUser(u) });
});

app.get('/api/me/bookings', (req,res)=>{
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  const list = db.bookings.filter(b => b.userId === u.id)
    .sort((a,b)=>(b.criadoEm||b.createdAt||0)-(a.criadoEm||a.createdAt||0)).map(toClientBooking);
  res.json({ bookings: list });
});

app.get('/api/me/messages', (req,res)=>{
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  res.json({ messages: db.messages.filter(m => m.userId === u.id).sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)) });
});

// marcar TODAS as mensagens como lidas
app.post('/api/me/messages/read', (req,res)=>{
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  db.messages.forEach(m=>{ if(m.userId===u.id) m.lida=true; });
  save(db); res.json({ ok:true });
});

// marcar UMA mensagem como lida
app.post('/api/me/messages/:id/read', (req,res)=>{
  const u = userFromReq(req);
  if (!u) return res.status(401).json({ error:'Sessao nao iniciada' });
  const m = db.messages.find(x => x.id === req.params.id && x.userId === u.id);
  if (m){ m.lida = true; save(db); }
  res.json({ ok:true });
});

// ---------- RESERVAS ----------
app.post('/api/bookings', (req,res)=>{
  const u = userFromReq(req); // pode ser null (reserva sem conta)
  const r = req.body || {};
  const b = {
    id: uid(),
    code: r.code || '',
    userId: u ? u.id : null,
    servico: r.servico || r.svcName || '',
    data: r.data || r.date || '',
    hora: r.hora || r.time || '',
    valor: (r.valor!=null ? r.valor : (r.price!=null ? r.price : 0)),
    nome: r.nome || r.name || (u?u.nome:''),
    telefone: r.telefone || r.phone || '',
    email: r.email || (u?u.email:''),
    notas: r.notas || r.notes || '',
    estado: 'pendente',
    criadoEm: Date.now()
  };
  db.bookings.push(b); save(db);
  if (u){
    addMessage(u.id, 'Reserva recebida',
      'Recebemos a sua marcacao. Assim que o pagamento for confirmado, avisamos por aqui.');
  }
  res.json({ ok:true, booking:b });
});

// ---------- ADMIN (API) ----------
app.get('/api/admin/bookings', requireAdmin, (req,res)=>{
  res.json({ bookings: db.bookings.slice().sort((a,b)=>(b.criadoEm||b.createdAt||0)-(a.criadoEm||a.createdAt||0)), users: db.users.map(publicUser) });
});

app.get('/api/admin/messages', requireAdmin, (req,res)=>{
  res.json({ messages: db.messages.slice().sort((a,b)=>(b.criadoEm||0)-(a.criadoEm||0)) });
});

// enviar mensagem/notificacao a um cliente
app.post('/api/admin/messages', requireAdmin, (req,res)=>{
  const b = req.body || {};
  const userId = b.userId;
  const titulo = String(b.titulo || b.title || '');
  const texto = String(b.texto || b.body || '');
  if (!userId || !titulo) return res.status(400).json({ error:'Falta userId ou titulo' });
  if (!db.users.find(u => u.id === userId)) return res.status(404).json({ error:'Cliente nao encontrado' });
  const m = addMessage(userId, titulo, texto);
  res.json({ ok:true, message:m });
});

// confirmar/atualizar estado de uma reserva (e avisar o cliente)
app.post('/api/admin/bookings/:id/status', requireAdmin, (req,res)=>{
  const b = db.bookings.find(x => x.id === req.params.id);
  if (!b) return res.status(404).json({ error:'Reserva nao encontrada' });
  const novo = String((req.body||{}).estado || (req.body||{}).status || 'confirmada');
  b.estado = novo; save(db);
  if (b.userId){
    addMessage(b.userId, 'Reserva ' + novo,
      'O estado da sua marcacao passou para: ' + novo + '.');
  }
  res.json({ ok:true, booking:b });
});

// ---------- PAINEL /admin (pagina simples) ----------
app.get('/admin', (req,res)=>{
  res.type('html').send(ADMIN_HTML);
});

app.get('/version', (req,res)=> res.json({ version: VERSION }));

app.get('/', (req,res)=> res.type('html').send('<h2>OWP23 servidor ativo</h2><p>Versao: <b>' + VERSION + '</b></p><p>Painel: <a href="/admin">/admin</a></p>'));

app.listen(PORT, HOST, ()=>{
  console.log('OWP23 servidor a correr em http://' + HOST + ':' + PORT);
  console.log('Painel admin: /admin  (precisa da ADMIN_KEY)');
});
