/* ============================================================
   ⭐ MARIO PARTY 2026
   ============================================================ */
const SECRET_KEY = "MarioParty2026_SecureKey_$$$";
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function escapeHtml(str){
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function encrypt(obj){ return CryptoJS.AES.encrypt(JSON.stringify(obj), SECRET_KEY).toString(); }
function decrypt(cipher){
    try { return JSON.parse(CryptoJS.AES.decrypt(cipher, SECRET_KEY).toString(CryptoJS.enc.Utf8)); }
    catch(e){ return null; }
}

// Avatar à initiale, teinte stable dérivée du nom
function nameHue(name){
    let h = 0;
    for(const c of String(name).toLowerCase()) h = (h*31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
}
function avatarHtml(name, cls=''){
    const hue = nameHue(normName(name) || name);
    const ini = escapeHtml(String(name).trim().charAt(0).toUpperCase() || '?');
    return `<span class="avatar ${cls}" style="background:linear-gradient(135deg,hsl(${hue},72%,55%),hsl(${(hue+45)%360},72%,38%))">${ini}</span>`;
}

// ============================================================
// 🔗 COMPTABILITÉ DES NOMS
// Peu importe l'écriture (casse, accents, petite faute de
// frappe), tout est rattaché au même joueur.
// ============================================================
function normName(s){
    return String(s).replace('#','').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g,'')   // retire les accents
        .replace(/\s+/g,' ');
}
function levenshtein(a, b){
    if(a === b) return 0;
    const m = a.length, n = b.length;
    if(!m) return n; if(!n) return m;
    let prev = Array.from({length:n+1}, (_,i)=>i);
    for(let i=1;i<=m;i++){
        const cur = [i];
        for(let j=1;j<=n;j++){
            cur[j] = Math.min(prev[j]+1, cur[j-1]+1, prev[j-1] + (a[i-1]===b[j-1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}
function sameNorm(a, b){
    const na = normName(a), nb = normName(b);
    if(na === nb) return true;
    const len = Math.min(na.length, nb.length);
    if(len < 4) return false;
    const tol = len >= 7 ? 2 : 1;
    return levenshtein(na, nb) <= tol;
}
function canonicalName(input){
    const exact = participants.find(p => normName(p.name) === normName(input));
    if(exact) return exact.name;
    const fuzzy = participants.find(p => sameNorm(p.name, input));
    return fuzzy ? fuzzy.name : String(input).trim();
}

// ============================================================
// 🎮 DONNÉES — liste de parties illimitée
// game = { name, passed, date: "YYYY-MM-DD"|null, label?: mois d'origine }
// ============================================================
const monthOrder = ["Janvier","Février","Mars","Avril","Mai","Juin",
                    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const MONTH_SEASON = {
    "Janvier":"winter","Février":"winter","Mars":"spring","Avril":"spring",
    "Mai":"spring","Juin":"summer","Juillet":"summer","Août":"summer",
    "Septembre":"autumn","Octobre":"autumn","Novembre":"autumn","Décembre":"winter"
};
const SEASON_GOAL = 52; // objectif indicatif : une partie par semaine

// Ancien format {Janvier:[...], ...} → liste de parties
function migrateMonths(monthMap){
    const out = [];
    monthOrder.forEach(m=>{
        (monthMap[m] || []).forEach(raw=>{
            const clean = String(raw).replace('#','').trim();
            if(clean) out.push({ name: clean, passed: String(raw).includes('#'), date: null, label: m });
        });
    });
    return out;
}
function normalizeGamesInput(obj){
    if(obj && obj.v === 2 && Array.isArray(obj.games)) return obj.games;
    if(obj && obj["Janvier"] && Array.isArray(obj["Janvier"])) return migrateMonths(obj);
    return null;
}

let games = [];
{
    const raw = localStorage.getItem("marioParty2026");
    if(raw){
        let dec = decrypt(raw);
        if(!dec){ try { dec = JSON.parse(raw); } catch(e){ dec = null; } }
        const g = normalizeGamesInput(dec);
        if(g) games = g;
    }
}

function monthOfGame(g){
    if(g.label) return g.label;
    if(g.date){
        const d = new Date(g.date + "T12:00:00");
        if(!isNaN(d)) return monthOrder[d.getMonth()];
    }
    return null;
}
function gameDateText(g){
    if(g.date){
        const d = new Date(g.date + "T12:00:00");
        if(!isNaN(d)) return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'long' });
    }
    return g.label || null;
}

function saveData(){ localStorage.setItem("marioParty2026", encrypt({ v:2, games })); }
function saveParts(){ localStorage.setItem("mp26_participants", encrypt(participants)); }

// ============================================================
// 👥 PARTICIPANTS
// ============================================================
let participants = [];
{
    const rawParts = localStorage.getItem("mp26_participants");
    if(rawParts){
        const dec = decrypt(rawParts);
        if(dec){
            if(dec.length && typeof dec[0] === 'string'){
                participants = dec.map(n => ({ name: n, extraGames: 0 }));
            } else {
                participants = dec;
            }
        }
    }
}

;(function(){
    // 1) Fusionne les participants en double (casse / accents / typo)
    const kept = [];
    participants.forEach(p=>{
        const twin = kept.find(k => sameNorm(k.name, p.name));
        if(twin){ twin.extraGames = (twin.extraGames||0) + (p.extraGames||0); }
        else kept.push(p);
    });
    participants = kept;

    // 2) Crée les participants manquants depuis les parties
    games.forEach(g=>{
        if(g.name && !participants.find(p => sameNorm(p.name, g.name))){
            participants.push({ name: String(g.name).trim(), extraGames: 0 });
        }
    });

    // 3) Réécrit chaque partie avec le nom officiel du joueur
    let changed = false;
    games.forEach(g=>{
        const canon = canonicalName(g.name);
        if(canon !== g.name){ g.name = canon; changed = true; }
    });

    saveParts();
    if(changed) saveData();
})();

// ============================================================
// 🔊 SONS RÉTRO (WebAudio — aucun fichier externe)
// ============================================================
const Sound = {
    enabled: localStorage.getItem('mp26_sound') !== 'off',
    ctx: null,
    _ensure(){
        if(!this.ctx){
            const AC = window.AudioContext || window.webkitAudioContext;
            if(AC) this.ctx = new AC();
        }
        if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    _tone(freq, dur, opts={}){
        const { type='square', vol=0.10, when=0, slide=null } = opts;
        const ctx = this._ensure(); if(!ctx) return;
        try {
            const t = ctx.currentTime + when;
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(freq, t);
            if(slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
            g.gain.setValueAtTime(vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(ctx.destination);
            o.start(t); o.stop(t + dur + 0.05);
        } catch(e){}
    },
    coin(){    if(!this.enabled) return; this._tone(987.77,0.09); this._tone(1318.51,0.35,{when:0.09}); },
    click(){   if(!this.enabled) return; this._tone(600,0.06,{type:'triangle',vol:0.06}); },
    del(){     if(!this.enabled) return; this._tone(320,0.18,{type:'sawtooth',vol:0.07,slide:140}); },
    undo(){    if(!this.enabled) return; this._tone(400,0.08,{type:'triangle'}); this._tone(600,0.12,{when:0.08,type:'triangle'}); },
    fanfare(){ if(!this.enabled) return; [523.25,659.25,783.99,1046.50].forEach((f,i)=>this._tone(f,0.28,{when:i*0.12,vol:0.09})); }
};
function toggleSound(){
    Sound.enabled = !Sound.enabled;
    localStorage.setItem('mp26_sound', Sound.enabled ? 'on' : 'off');
    document.getElementById('soundToggle').textContent = Sound.enabled ? '🔊' : '🔇';
    if(Sound.enabled) Sound.click();
}

// ============================================================
// 🍞 TOASTS + ANNULATION
// ============================================================
function showToast(msg, opts={}){
    const { actionLabel=null, onAction=null, duration=4500, icon='⭐' } = opts;
    const cont = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-ic">${icon}</span><span class="toast-msg">${escapeHtml(msg)}</span>`;
    if(actionLabel){
        const b = document.createElement('button');
        b.className = 'toast-action'; b.textContent = actionLabel;
        b.onclick = ()=>{ if(onAction) onAction(); dismiss(); };
        t.appendChild(b);
    }
    cont.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    let gone = false;
    function dismiss(){ if(gone) return; gone = true; t.classList.remove('show'); setTimeout(()=>t.remove(), 350); }
    setTimeout(dismiss, duration);
}

function snapshotState(){
    return { games: JSON.parse(JSON.stringify(games)), participants: JSON.parse(JSON.stringify(participants)) };
}
function withUndo(label, mutate){
    const snap = snapshotState();
    mutate();
    showToast(label, { actionLabel:'Annuler', icon:'🗑️', onAction:()=>{
        games = snap.games; participants = snap.participants;
        saveData(); saveParts(); render();
        if(openPanel === 'parts') renderParticipants();
        Sound.undo();
    }});
}

// ============================================================
// 🎉 CONFETTIS
// ============================================================
const fxCanvas = document.getElementById('fxCanvas');
const fxCtx = fxCanvas.getContext('2d');
let fxParts = [], fxRunning = false;
const FX_COLORS = ['#e52521','#fbd000','#43b047','#049cd8','#ffffff','#ff7f27'];

function fxResize(){ fxCanvas.width = innerWidth; fxCanvas.height = innerHeight; }
window.addEventListener('resize', fxResize);
fxResize();

function confettiBurst(x, y, n=90){
    if(REDUCED_MOTION) return;
    for(let i=0;i<n;i++){
        const a = Math.random()*Math.PI*2, sp = 4+Math.random()*7;
        fxParts.push({
            x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp-3, g: 0.18,
            s: 4+Math.random()*5, r: Math.random()*Math.PI, vr: (Math.random()-0.5)*0.3,
            c: FX_COLORS[(Math.random()*FX_COLORS.length)|0], life: 70+Math.random()*40
        });
    }
    if(!fxRunning){ fxRunning = true; requestAnimationFrame(fxLoop); }
}
function fxLoop(){
    fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height);
    fxParts = fxParts.filter(p=>p.life>0);
    fxParts.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.vx*=0.99; p.r+=p.vr; p.life--;
        fxCtx.save();
        fxCtx.translate(p.x,p.y); fxCtx.rotate(p.r);
        fxCtx.globalAlpha = Math.min(1, p.life/30);
        fxCtx.fillStyle = p.c;
        fxCtx.fillRect(-p.s/2, -p.s/2, p.s, p.s*0.6);
        fxCtx.restore();
    });
    if(fxParts.length){ requestAnimationFrame(fxLoop); }
    else { fxRunning = false; fxCtx.clearRect(0,0,fxCanvas.width,fxCanvas.height); }
}

// ============================================================
// 🎛 PANNEAUX (classement / participants / stats)
// ============================================================
let openPanel = null;

function setPanel(name){
    openPanel = (openPanel === name) ? null : name;
    document.getElementById("rankingPanel").classList.toggle("open", openPanel==='ranking');
    document.getElementById("participantsPanel").classList.toggle("open", openPanel==='parts');
    document.getElementById("statsPanel").classList.toggle("open", openPanel==='stats');
    document.getElementById("rankingOverlay").classList.toggle("open", !!openPanel);
    document.body.classList.toggle("menu-open", !!openPanel);
    if(openPanel==='parts') renderParticipants();
    if(openPanel==='stats') renderStats();
    Sound.click();
}
function toggleRanking(){ setPanel('ranking'); }
function toggleParticipants(){ setPanel('parts'); }
function toggleStats(){ setPanel('stats'); }
function closeAll(){
    openPanel = null;
    document.body.classList.remove("menu-open");
    ["rankingPanel","participantsPanel","statsPanel","rankingOverlay"].forEach(id=>
        document.getElementById(id).classList.remove("open"));
}

// ============================================================
// 👥 LOGIQUE PARTICIPANTS
// ============================================================
function addParticipant(){
    const input = document.getElementById('partInput');
    const val = input.value.trim();
    if(!val) return;
    if(participants.find(p => sameNorm(p.name, val))){
        input.value = ''; return;
    }
    participants.push({ name: val, extraGames: 0 });
    saveParts();
    input.value = '';
    renderParticipants();
    Sound.click();
}

function removeParticipant(name){
    withUndo(name + ' supprimé', ()=>{
        participants = participants.filter(p => p.name !== name);
        // Retire aussi ses parties, sinon il reste au classement
        // et serait recréé automatiquement au prochain chargement.
        const norm = normName(name);
        games = games.filter(g => normName(g.name) !== norm);
        saveParts(); saveData();
        renderParticipants(); render();
        Sound.del();
    });
}

function changeGames(name, delta){
    const p = participants.find(p => p.name === name);
    if(!p) return;
    p.extraGames = Math.max(0, (p.extraGames || 0) + delta);
    saveParts();
    renderParticipants();
    Sound.click();
}

function getParticipantStats(name){
    const norm = normName(name);
    let wins = 0, played = 0;
    games.forEach(g=>{
        if(normName(g.name) === norm){
            played++;
            if(!g.passed) wins++;
        }
    });
    const p = participants.find(p => normName(p.name) === norm);
    const extraGames = p ? (p.extraGames || 0) : 0;
    return { wins, participations: played + extraGames };
}

function renderParticipants(){
    const list  = document.getElementById('partList');
    const count = document.getElementById('partCount');
    list.innerHTML = '';
    count.textContent = participants.length + ' participant' + (participants.length > 1 ? 's' : '');

    if(!participants.length){
        list.innerHTML = '<div class="part-empty">Aucun participant enregistré</div>';
        return;
    }

    const sorted = [...participants].sort((a,b) =>
        getParticipantStats(b.name).wins - getParticipantStats(a.name).wins
    );

    sorted.forEach((p, idx) => {
        const stats  = getParticipantStats(p.name);
        const item   = document.createElement('div');
        item.className = 'part-item';
        if(idx === 0 && stats.wins > 0) item.classList.add('rank-1');
        else if(idx === 1 && stats.wins > 0) item.classList.add('rank-2');
        else if(idx === 2 && stats.wins > 0) item.classList.add('rank-3');

        const medal = idx === 0 && stats.wins > 0 ? '🥇 '
                    : idx === 1 && stats.wins > 0 ? '🥈 '
                    : idx === 2 && stats.wins > 0 ? '🥉 ' : '';

        const safeAttr = escapeHtml(p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'"));

        item.innerHTML = `
            <div class="part-item-right">
                <button class="part-del" onclick="removeParticipant('${safeAttr}')">✖</button>
            </div>
            <div class="part-item-left">
                ${avatarHtml(p.name,'av-sm')}
                <div class="part-name" onclick="openPlayerCard('${safeAttr}')" title="Voir la fiche">${medal}${escapeHtml(p.name)}</div>
                <div class="part-stats">
                    <span>🏆 ${stats.wins}</span>
                    <div class="part-games-ctrl">
                        <button class="ctrl-btn minus" onclick="changeGames('${safeAttr}', -1)">−</button>
                        <span>📅${stats.participations}</span>
                        <button class="ctrl-btn" onclick="changeGames('${safeAttr}', +1)">＋</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

// ============================================================
// 🃏 FICHE JOUEUR
// ============================================================
function playerSparkline(monthly){
    const w = 300, h = 80, pad = 8;
    let cum = 0;
    const pts = monthly.map(v => (cum += v));
    const max = Math.max(1, pts[pts.length-1]);
    const step = (w - pad*2) / (pts.length - 1);
    const coords = pts.map((v,i)=>[pad + i*step, h - pad - (v/max)*(h - pad*2)]);
    const poly = coords.map(c=>c[0].toFixed(1)+','+c[1].toFixed(1)).join(' ');
    const area = `${pad},${h-pad} ${poly} ${w-pad},${h-pad}`;
    const dots = coords.map((c,i)=> monthly[i]
        ? `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.5" fill="#fbd000" stroke="#1a1a2e" stroke-width="1.2"/>` : '').join('');
    return `<svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none">
        <polygon points="${area}" fill="rgba(4,156,216,0.15)"/>
        <polyline points="${poly}" fill="none" stroke="#049cd8" stroke-width="3"
                  stroke-linejoin="round" stroke-linecap="round"/>
        ${dots}
    </svg>`;
}

function openPlayerCard(name){
    const stats = getParticipantStats(name);
    const norm = normName(name);
    const monthly = monthOrder.map(m =>
        games.filter(g => !g.passed && normName(g.name) === norm && monthOfGame(g) === m).length
    );
    const winrate = stats.participations ? Math.round(stats.wins / stats.participations * 100) : 0;
    const ranking = computeRanking();
    const rankIdx = ranking.findIndex(e => normName(e[0]) === norm);
    const rankTxt = rankIdx >= 0 ? '#' + (rankIdx + 1) : '—';
    const maxMonthly = Math.max(1, ...monthly);

    const miniBars = monthOrder.map((m,i)=>`
        <div class="mc-col" title="${m} : ${monthly[i]} victoire${monthly[i]>1?'s':''}">
            <div class="mc-track"><div class="mc-fill" style="height:${monthly[i]/maxMonthly*100}%"></div></div>
            <span class="mc-lbl">${m.slice(0,1)}</span>
        </div>`).join('');

    const box = document.getElementById('playerCardBox');
    box.innerHTML = `
        <button class="close-btn" onclick="closePlayerCard()">✖</button>
        <div class="pc-avatar-row">${avatarHtml(name,'av-xl')}</div>
        <h3 class="pc-name">${escapeHtml(name)}</h3>
        <div class="pc-chips">
            <div class="pc-chip"><b>${stats.wins}</b><span>Victoires</span></div>
            <div class="pc-chip"><b>${stats.participations}</b><span>Parties</span></div>
            <div class="pc-chip"><b>${winrate}%</b><span>Réussite</span></div>
            <div class="pc-chip"><b>${rankTxt}</b><span>Rang</span></div>
        </div>
        <div class="pc-sub">Progression des victoires</div>
        ${playerSparkline(monthly)}
        <div class="pc-sub">Victoires par mois</div>
        <div class="mchart pc-mchart">${miniBars}</div>
    `;
    document.getElementById('playerCardOverlay').classList.add('open');
    Sound.click();
}
function closePlayerCard(){ document.getElementById('playerCardOverlay').classList.remove('open'); }

// ============================================================
// 🎮 MODAL
// ============================================================
let currentAction = null;

function openModal(action, title, initialValue="", extraData=null){
    const modal   = document.getElementById("customModal");
    const input   = document.getElementById("modalInput");
    const msg     = document.getElementById("modalMessage");
    const titleEl = document.getElementById("modalTitle");
    currentAction = { type: action, ...extraData };
    titleEl.textContent = title;
    if(action === 'confirm_import' || action === 'info'){
        input.style.display = 'none'; msg.style.display = 'block'; msg.textContent = initialValue;
    } else {
        input.style.display = 'block'; msg.style.display = 'none';
        input.value = initialValue; setTimeout(()=>input.focus(), 100);
    }
    renderSuggest(input.value);
    modal.classList.add("open");
}
function closeModal(){ document.getElementById("customModal").classList.remove("open"); currentAction = null; }

// Suggestions de joueurs existants dans la modale (un clic = validé)
function renderSuggest(filter=''){
    const box = document.getElementById('modalSuggest');
    if(!currentAction || (currentAction.type !== 'add' && currentAction.type !== 'edit')){
        box.innerHTML = ''; return;
    }
    const f = normName(filter);
    const list = participants
        .filter(p => !f || normName(p.name).includes(f))
        .slice(0, 8);
    box.innerHTML = list.map(p=>{
        const safeAttr = escapeHtml(p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'"));
        return `<button type="button" class="suggest-chip" onclick="pickSuggest('${safeAttr}')">${avatarHtml(p.name)}<span>${escapeHtml(p.name)}</span></button>`;
    }).join('');
}
function pickSuggest(name){
    document.getElementById('modalInput').value = name;
    document.getElementById('modalConfirmBtn').click();
}

function todayISO(){
    const d = new Date();
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
}

document.getElementById("modalConfirmBtn").onclick = () => {
    if(!currentAction) return;
    const inputVal = document.getElementById("modalInput").value.trim();
    if(currentAction.type === 'add' && inputVal){
        const canon = canonicalName(inputVal);
        games.push({ name: canon, passed: false, date: todayISO() });
        if(!participants.find(p => sameNorm(p.name, canon))){
            participants.push({ name: canon, extraGames: 0 });
            saveParts();
        }
        saveData(); render();
        Sound.coin();
        confettiBurst(innerWidth/2, innerHeight*0.35);
        if(normName(canon) !== normName(inputVal)){
            showToast('Compté pour ' + canon, { icon:'🔗' });
        }
        if(games.length % 10 === 0){
            Sound.fanfare();
            showToast(games.length + ' parties jouées cette saison ! 🏁', { icon:'🎉' });
        }
    } else if(currentAction.type === 'edit' && inputVal){
        const canon = canonicalName(inputVal);
        const g = games[currentAction.index];
        if(g) g.name = canon;
        if(!participants.find(p => sameNorm(p.name, canon))){
            participants.push({ name: canon, extraGames: 0 });
            saveParts();
        }
        saveData(); render();
        Sound.click();
        if(normName(canon) !== normName(inputVal)){
            showToast('Compté pour ' + canon, { icon:'🔗' });
        }
    } else if(currentAction.type === 'confirm_import'){
        games = currentAction.newGames; saveData();
        if(currentAction.newParticipants !== null && currentAction.newParticipants !== undefined){
            participants = currentAction.newParticipants; saveParts();
        }
        render();
        showToast('Données restaurées !', { icon:'✅' });
        Sound.fanfare();
    }
    closeModal();
};
document.getElementById("modalInput").addEventListener("keypress", e=>{
    if(e.key === "Enter") document.getElementById("modalConfirmBtn").click();
});
document.getElementById("modalInput").addEventListener("input", e=>{
    renderSuggest(e.target.value);
});

// ============================================================
// 💾 EXPORT / IMPORT
// ============================================================
function exportData(){
    const backup = { data: { v:2, games }, participants: participants, exported: new Date().toISOString() };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr); dl.setAttribute("download","mario_party_2026_backup.json");
    document.body.appendChild(dl); dl.click(); dl.remove();
    showToast('Sauvegarde téléchargée', { icon:'💾' });
}
function importData(input){
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = e=>{
        try {
            const imported = JSON.parse(e.target.result);
            const fromData = imported.data ? normalizeGamesInput(imported.data) : null;
            const direct   = normalizeGamesInput(imported);
            if(fromData){
                openModal('confirm_import','Restaurer ?','Cela écrasera les données actuelles.',{
                    newGames: fromData,
                    newParticipants: imported.participants || []
                });
            } else if(direct){
                openModal('confirm_import','Restaurer ?','Cela écrasera les données actuelles.',{
                    newGames: direct,
                    newParticipants: null
                });
            } else {
                showToast('Format de fichier non reconnu', { icon:'⚠️' });
            }
        } catch(err){ showToast('Fichier invalide', { icon:'⚠️' }); }
    };
    reader.readAsText(file); input.value = "";
}

// ============================================================
// 📊 CLASSEMENT & STATS
// ============================================================
function computeRanking(){
    const counts = {}, displayNames = {};
    games.forEach(g=>{
        if(!g.passed && g.name){
            const clean = String(g.name).trim(), norm = normName(clean);
            if(!counts[norm]){ counts[norm]=0; displayNames[norm]=clean; }
            counts[norm]++;
        }
    });
    return Object.entries(counts)
        .map(([norm, c]) => [displayNames[norm], c])
        .sort((a,b)=> b[1]-a[1] || a[0].localeCompare(b[0]));
}

function getChronology(){
    return games.map(g => ({
        name: String(g.name).trim(),
        norm: normName(g.name),
        win: !g.passed,
        month: monthOfGame(g)
    }));
}

function computeStreaks(){
    const wins = getChronology().filter(e=>e.win);
    let cur = { norm:null, name:'', len:0 }, best = { norm:null, name:'', len:0 };
    wins.forEach(e=>{
        if(e.norm === cur.norm){ cur.len++; }
        else { cur = { norm:e.norm, name:e.name, len:1 }; }
        if(cur.len > best.len) best = { ...cur };
    });
    return { current: cur, best };
}

// ============================================================
// 🖥 RENDER PRINCIPAL — cartes « Partie N »
// ============================================================
let firstRender = true;

function updateYearProgress(){
    const played = games.length;
    const pct = Math.min(100, played/SEASON_GOAL*100);
    document.getElementById('ypFill').style.width = pct + '%';
    document.getElementById('ypLabel').textContent =
        played + ' partie' + (played>1?'s':'') + ' jouée' + (played>1?'s':'');
    document.getElementById('chipPlayed').textContent = played;
}

function render(){
    const container = document.getElementById("container"); container.innerHTML = "";

    // 👑 rois du mois : 3+ victoires dans un même mois
    const monthWins = {};
    games.forEach(g=>{
        if(!g.passed){
            const k = (monthOfGame(g)||'?') + '|' + normName(g.name);
            monthWins[k] = (monthWins[k]||0)+1;
        }
    });

    let prevNorm = null, runLen = 0;
    const seenWinners = new Set();

    games.forEach((g, i)=>{
        const m = monthOfGame(g);
        const card = document.createElement("div");
        card.className = "month game-card season-" + (m ? MONTH_SEASON[m] : "winter");
        if(firstRender && !REDUCED_MOTION){
            card.classList.add("animate-in");
            card.style.animationDelay = (Math.min(i,20)*40)+"ms";
        }

        const title = document.createElement("h2");
        title.textContent = "🎲 Partie " + (i+1);
        card.appendChild(title);

        const nName = normName(g.name);
        let badges = "";
        if(!g.passed){
            if(nName === prevNorm) runLen++; else { prevNorm = nName; runLen = 1; }
            if(!seenWinners.has(nName)){
                badges += `<span class="badge" title="Première victoire de l'année">✨</span>`;
                seenWinners.add(nName);
            }
            if(runLen >= 2) badges += `<span class="badge" title="En feu ! ${runLen} victoires d'affilée">🔥</span>`;
            if(runLen >= 3) badges += `<span class="badge" title="Série de ${runLen} !">⚡</span>`;
            if(monthWins[(m||'?')+'|'+nName] >= 3) badges += `<span class="badge" title="Roi du mois">👑</span>`;
        }

        const ul = document.createElement("ul");
        const li = document.createElement("li");
        const span = document.createElement("span"); span.className = "name";
        if(g.passed) span.classList.add("passed");
        span.innerHTML = avatarHtml(g.name) + '<span class="name-txt">' + escapeHtml(g.name) + '</span>' + badges;
        span.title = "Cliquer pour marquer absent / présent";
        span.onclick = ()=>{ g.passed = !g.passed; saveData(); render(); Sound.click(); };

        const bc = document.createElement("div"); bc.className = "buttons";
        const eb = document.createElement("button"); eb.textContent="✏"; eb.className="edit-btn";
        eb.onclick = ()=>{ openModal('edit','Partie '+(i+1)+' — modifier', String(g.name), {index:i}); };
        const db = document.createElement("button"); db.textContent="🗑"; db.className="delete-btn";
        db.onclick = ()=>{
            withUndo('Partie '+(i+1)+' supprimée', ()=>{
                games.splice(i,1); saveData(); render();
                Sound.del();
            });
        };
        bc.appendChild(eb); bc.appendChild(db);
        li.appendChild(span); li.appendChild(bc); ul.appendChild(li);
        card.appendChild(ul);

        const dt = document.createElement("div"); dt.className = "game-date";
        const dtxt = gameDateText(g);
        dt.textContent = dtxt ? "📅 " + dtxt : "📅 —";
        card.appendChild(dt);

        container.appendChild(card);
    });

    // Carte « Nouvelle partie » (toujours en dernier, illimité)
    const addCard = document.createElement("button");
    addCard.className = "add-game-card";
    if(firstRender && !REDUCED_MOTION){
        addCard.classList.add("animate-in");
        addCard.style.animationDelay = (Math.min(games.length,21)*40)+"ms";
    }
    addCard.innerHTML = '<span class="agc-plus">＋</span><span>Nouvelle partie</span><small>La date du jour sera enregistrée</small>';
    addCard.onclick = ()=> openModal('add', 'Partie ' + (games.length+1) + ' — vainqueur');
    container.appendChild(addCard);

    firstRender = false;
    updateYearProgress();
    updateRanking();
    if(openPanel === 'parts') renderParticipants();
    if(openPanel === 'stats') renderStats();
}

function updateRanking(){
    const pDiv = document.getElementById("podium");
    const fDiv = document.getElementById("fullRanking");
    const chipLeader = document.getElementById("chipLeader");
    const chipStreak = document.getElementById("chipStreak");
    const sorted = computeRanking();
    const { current } = computeStreaks();

    chipStreak.textContent = current.len > 1 ? cap(current.name) + ' ×' + current.len : '—';

    pDiv.innerHTML = ""; fDiv.innerHTML = "";

    // Podium de cérémonie : 3 marches toujours visibles, places libres en pointillés
    [{rank:1,cls:"second",e:"🥈"},{rank:0,cls:"first",e:"🥇"},{rank:2,cls:"third",e:"🥉"}].forEach(s=>{
        const entry = sorted[s.rank];
        const slot = document.createElement("div");
        slot.className = "pod-slot" + (entry ? "" : " vacant");
        if(entry){
            const nm = cap(entry[0]), sc = entry[1];
            slot.innerHTML = `
                <div class="pod-player">
                    ${s.rank===0 ? `
                        <span class="pod-burst"></span>
                        <span class="pod-crown">👑</span>
                        <span class="pod-spark s1">✦</span>
                        <span class="pod-spark s2">✦</span>` : ''}
                    ${avatarHtml(nm,'av-pod')}
                    <b class="pod-name">${escapeHtml(nm)}</b>
                    <span class="pod-score">${s.e} ${sc}</span>
                </div>
                <div class="pod-step ${s.cls}"><span class="pod-rank">${s.rank+1}</span></div>`;
        } else {
            slot.innerHTML = `
                <div class="pod-player ghost">
                    <span class="pod-ghost-av">?</span>
                    <b class="pod-name">Place libre</b>
                </div>
                <div class="pod-step ${s.cls} empty"><span class="pod-rank">${s.rank+1}</span></div>`;
        }
        pDiv.appendChild(slot);
    });

    if(!sorted.length){ chipLeader.textContent = "—"; return; }

    const maxS = sorted[0][1];
    const leaderList = sorted.filter(p=>p[1]===maxS).map(p=>cap(p[0]));
    chipLeader.textContent = leaderList.join(", ") + " · " + maxS;

    let lastScore=null, vRank=-1;
    const ps = document.createElement("div"); ps.className="ranking-section";
    ps.innerHTML="<div class='ranking-title'>PODIUM</div>";
    const rs = document.createElement("div"); rs.className="ranking-section";
    rs.innerHTML="<div class='ranking-title'>CLASSEMENT</div>";

    sorted.forEach((entry,i)=>{
        if(entry[1]!==lastScore){ vRank++; lastScore=entry[1]; }
        const dp = cap(entry[0]);
        const st = getParticipantStats(entry[0]);
        const rate = st.participations ? Math.round(st.wins/st.participations*100) : 0;
        const item = document.createElement("div"); item.className="ranking-item";
        if(vRank===0) item.classList.add("gold");
        else if(vRank===1) item.classList.add("silver");
        else if(vRank===2) item.classList.add("bronze");
        item.innerHTML = "<div class='rk-fill' style='width:"+(entry[1]/maxS*100)+"%'></div>"
            + "<span class='rk-name'><span class='rk-pos'>"+(i+1)+"</span>"+avatarHtml(dp)+escapeHtml(dp)+"</span>"
            + "<span class='ranking-rate'>"+rate+"%</span>"
            + "<span class='ranking-score'>"+entry[1]+"</span>";
        if(vRank<3) ps.appendChild(item); else rs.appendChild(item);
    });
    fDiv.appendChild(ps); fDiv.appendChild(rs);
}

// ============================================================
// 📈 PANNEAU STATISTIQUES
// ============================================================
function renderStats(){
    const el = document.getElementById('statsContent');
    const played = games.length;
    const winsCount = games.filter(g=>!g.passed).length;
    const ranking = computeRanking();
    const { current, best } = computeStreaks();

    const leader = ranking.length ? escapeHtml(cap(ranking[0][0])) + ' · ' + ranking[0][1] : '—';
    const curTxt  = current.len > 1 ? escapeHtml(cap(current.name)) + ' ×' + current.len : '—';
    const bestTxt = best.len   > 1 ? escapeHtml(cap(best.name))   + ' ×' + best.len   : '—';

    const cards = `
        <div class="stat-cards">
            <div class="stat-card"><b>${played}</b><span>Parties jouées</span></div>
            <div class="stat-card"><b>${winsCount}</b><span>Victoires</span></div>
            <div class="stat-card"><b>${participants.length}</b><span>Joueurs</span></div>
            <div class="stat-card"><b>${ranking.length}</b><span>Vainqueurs distincts</span></div>
            <div class="stat-card"><b>${leader}</b><span>En tête</span></div>
            <div class="stat-card"><b>${curTxt}</b><span>Série en cours</span></div>
            <div class="stat-card wide"><b>${bestTxt}</b><span>Record de série (année)</span></div>
        </div>`;

    const perMonth = monthOrder.map(m => games.filter(g => monthOfGame(g) === m).length);
    const maxM = Math.max(1, ...perMonth);
    const mChart = `
        <div class="stats-block">
            <div class="stats-block-title">Parties par mois</div>
            <div class="mchart">${monthOrder.map((m,i)=>`
                <div class="mc-col" title="${m} : ${perMonth[i]} partie${perMonth[i]>1?'s':''}">
                    <div class="mc-track"><div class="mc-fill" style="height:${perMonth[i]/maxM*100}%"></div></div>
                    <span class="mc-lbl">${m.slice(0,1)}</span>
                </div>`).join('')}</div>
        </div>`;

    const maxW = ranking.length ? ranking[0][1] : 1;
    const rows = ranking.slice(0,8).map((e,i)=>{
        const st = getParticipantStats(e[0]);
        const rate = st.participations ? Math.round(st.wins/st.participations*100) : 0;
        return `<div class="tp-row">
            <span class="tp-name">${i+1}. ${escapeHtml(cap(e[0]))}</span>
            <div class="tp-bar"><div class="tp-fill c${i}" style="width:${e[1]/maxW*100}%"></div></div>
            <span class="tp-val">${e[1]}<small> · ${rate}%</small></span>
        </div>`;
    }).join('');
    const tChart = `
        <div class="stats-block">
            <div class="stats-block-title">Top joueurs</div>
            ${rows || '<div class="part-empty">Aucune victoire pour le moment</div>'}
        </div>`;

    el.innerHTML = cards + mChart + tChart;
}

// ============================================================
// ⌨️ TYPEWRITER
// ============================================================
const twStatic = [
    "🎮 Qui sera le champion de 2026 ?",
    "🏆 Chaque partie compte !",
    "🎲 Que le meilleur gagne !",
    "⭐ L'étoile n'attend que vous !",
    "🍄 Un champignon ça va, trois bonjour les dégâts…",
    "🐢 Gare aux carapaces bleues !",
    "🔥 Qui enchaînera les victoires ?",
    "👑 Le trône n'attend personne !",
    "🎯 La régularité paie toujours…",
    "💫 Une étoile peut tout changer !",
    "🎉 Pas de pitié, même entre amis !",
];

function twDynamic(){
    const msgs = [];
    const ranking = computeRanking();
    if(ranking.length){
        const [lead, wins] = ranking[0];
        msgs.push(`👑 ${cap(lead)} domine avec ${wins} victoire${wins>1?'s':''} !`);
        if(ranking.length > 1){
            if(ranking[1][1] === wins){
                msgs.push(`⚔️ Égalité au sommet : ${cap(lead)} contre ${cap(ranking[1][0])} !`);
            } else if(wins - ranking[1][1] === 1){
                msgs.push(`😱 ${cap(ranking[1][0])} n'est qu'à une victoire de ${cap(lead)} !`);
            }
        }
    }
    const { current, best } = computeStreaks();
    if(current.len >= 2) msgs.push(`🔥 ${cap(current.name)} enchaîne ${current.len} victoires !`);
    if(best.len >= 3)    msgs.push(`⚡ Record de l'année : ${best.len} d'affilée pour ${cap(best.name)} !`);

    const played = games.length;
    if(played === 0) msgs.push("🚦 La saison 2026 va commencer !");
    else             msgs.push(`🎲 Déjà ${played} partie${played>1?'s':''} cette saison !`);
    return msgs;
}

const twEl = document.getElementById("typewriter-text");
let twLast = "", twChars = [], twChar = 0, twDeleting = false;

function twPick(){
    const pool = twStatic.concat(twDynamic());
    let t;
    do { t = pool[(Math.random()*pool.length)|0]; } while(pool.length > 1 && t === twLast);
    twLast = t;
    return Array.from(t); // découpe par points de code : les emojis restent entiers
}

function typeEffect(){
    if(!twChars.length) twChars = twPick();
    let delay;
    if(!twDeleting){
        twChar++;
        twEl.textContent = twChars.slice(0, twChar).join('');
        delay = 55 + Math.random()*70;
        if(",;:!?…".includes(twChars[twChar-1])) delay += 220;
        if(twChar >= twChars.length){ twDeleting = true; delay = 2300; }
    } else {
        twChar--;
        twEl.textContent = twChars.slice(0, twChar).join('');
        delay = 26;
        if(twChar <= 0){ twDeleting = false; twChars = twPick(); delay = 550; }
    }
    setTimeout(typeEffect, delay);
}

// ============================================================
// 🔒 SÉCURITÉ (désactivée en local pour le développement)
// ============================================================
const IS_DEV = location.protocol === 'file:' ||
               ['localhost','127.0.0.1'].includes(location.hostname);

document.onkeydown = function(e){
    if(e.key === "Escape"){ closeModal(); closePlayerCard(); closeAll(); return; }
    if(IS_DEV) return;
    if(e.keyCode==123) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='I'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='C'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='J'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.keyCode=='U'.charCodeAt(0)) return false;
};
if(!IS_DEV){
    document.addEventListener('contextmenu', e => e.preventDefault());
    setInterval(function(){
        const start = performance.now(); debugger; const end = performance.now();
        if(end-start>100){
            document.getElementById('securityBreach').style.display='flex';
            document.getElementById('container').style.display='none';
        } else {
            document.getElementById('securityBreach').style.display='none';
            document.getElementById('container').style.display='grid';
        }
    }, 1000);
}

// ============================================================
// 🌌 FOND — confettis pastel flottants
// ============================================================
const bgCanvas = document.getElementById('bgCanvas');
const bctx = bgCanvas.getContext('2d');
let stars = [], shoot = null, shootTimer = 300;

const BG_COLORS = ['#e52521','#049cd8','#fbd000','#43b047'];
function makeStars(){
    const n = Math.min(90, (innerWidth*innerHeight/16000)|0);
    stars = Array.from({length:n}, ()=>({
        x: Math.random()*bgCanvas.width, y: Math.random()*bgCanvas.height,
        z: 0.3+Math.random()*0.7,
        c: BG_COLORS[(Math.random()*BG_COLORS.length)|0],
        tw: Math.random()*Math.PI*2, ts: 0.008+Math.random()*0.02
    }));
}
function bgResize(){ bgCanvas.width = innerWidth; bgCanvas.height = innerHeight; makeStars(); }
window.addEventListener('resize', bgResize);
bgResize();

function drawStars(animate){
    bctx.clearRect(0,0,bgCanvas.width,bgCanvas.height);
    stars.forEach(s=>{
        if(animate){
            s.tw += s.ts; s.y += s.z*0.15; s.x += s.z*0.05;
            if(s.y > bgCanvas.height){ s.y = 0; s.x = Math.random()*bgCanvas.width; }
            if(s.x > bgCanvas.width) s.x = 0;
        }
        bctx.globalAlpha = animate ? 0.16 + Math.abs(Math.sin(s.tw))*0.22 : 0.25;
        bctx.fillStyle = s.c;
        bctx.beginPath(); bctx.arc(s.x, s.y, s.z*2.4, 0, 7); bctx.fill();
    });
    bctx.globalAlpha = 1;
}
function bgLoop(){
    drawStars(true);
    if(!shoot && --shootTimer <= 0){
        shoot = { x: Math.random()*bgCanvas.width*0.7, y: Math.random()*bgCanvas.height*0.3,
                  vx: 9+Math.random()*5, vy: 4+Math.random()*3, life: 40 };
        shootTimer = 400 + Math.random()*600;
    }
    if(shoot){
        shoot.x += shoot.vx; shoot.y += shoot.vy; shoot.life--;
        bctx.globalAlpha = Math.min(1, shoot.life/20);
        const grad = bctx.createLinearGradient(shoot.x, shoot.y, shoot.x-shoot.vx*6, shoot.y-shoot.vy*6);
        grad.addColorStop(0,'#fbd000'); grad.addColorStop(1,'rgba(251,208,0,0)');
        bctx.strokeStyle = grad; bctx.lineWidth = 2;
        bctx.beginPath();
        bctx.moveTo(shoot.x, shoot.y);
        bctx.lineTo(shoot.x-shoot.vx*6, shoot.y-shoot.vy*6);
        bctx.stroke();
        bctx.globalAlpha = 1;
        if(shoot.life <= 0 || shoot.x > bgCanvas.width+100) shoot = null;
    }
    requestAnimationFrame(bgLoop);
}

// ============================================================
// 🚀 INIT
// ============================================================
document.getElementById('soundToggle').textContent = Sound.enabled ? '🔊' : '🔇';
render();
typeEffect();
if(!REDUCED_MOTION){ bgLoop(); } else { drawStars(false); }
