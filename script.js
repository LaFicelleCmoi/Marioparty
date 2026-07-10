const SECRET_KEY = "MarioParty2026_SecureKey_$$$";

function escapeHtml(str){
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function encrypt(obj){ return CryptoJS.AES.encrypt(JSON.stringify(obj), SECRET_KEY).toString(); }
function decrypt(cipher){
    try { return JSON.parse(CryptoJS.AES.decrypt(cipher, SECRET_KEY).toString(CryptoJS.enc.Utf8)); }
    catch(e){ return null; }
}

// ============================================================
// 🎮 DONNÉES PRINCIPALES
// ============================================================
const maxWins = {
    "Janvier":4,"Février":4,"Mars":5,"Avril":4,
    "Mai":4,"Juin":5,"Juillet":4,"Août":5,
    "Septembre":4,"Octobre":4,"Novembre":5,"Décembre":4
};
const monthOrder = Object.keys(maxWins);
const defaultData = {
    "Janvier":[],"Février":[],"Mars":[],"Avril":[],"Mai":[],"Juin":[],
    "Juillet":[],"Août":[],"Septembre":[],"Octobre":[],"Novembre":[],"Décembre":[]
};

let rawData = localStorage.getItem("marioParty2026");
let data;
if(rawData){
    const dec = decrypt(rawData);
    if(dec){ data = dec; }
    else {
        try { data = JSON.parse(rawData); localStorage.setItem("marioParty2026", encrypt(data)); }
        catch(e){ data = defaultData; }
    }
} else { data = defaultData; }

// ============================================================
// 👥 PARTICIPANTS
// ============================================================
let participants = [];
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

;(function(){
    Object.values(data).forEach(month=>{
        month.forEach(name=>{
            const clean = name.replace('#','').trim();
            if(clean && !participants.find(p => p.name.toLowerCase() === clean.toLowerCase())){
                participants.push({ name: clean, extraGames: 0 });
            }
        });
    });
    saveParts();
})();

function saveData(){ localStorage.setItem("marioParty2026", encrypt(data)); }
function saveParts(){ localStorage.setItem("mp26_participants", encrypt(participants)); }

// ============================================================
// 🎛 PANNEAUX
// ============================================================
let rankingOpen = false, partsOpen = false;

function toggleRanking(){
    if(partsOpen) closeAll();
    rankingOpen = !rankingOpen;
    document.body.classList.toggle("menu-open", rankingOpen);
    document.getElementById("rankingPanel").classList.toggle("open", rankingOpen);
    document.getElementById("rankingOverlay").classList.toggle("open", rankingOpen);
    document.getElementById("rankingToggle").style.opacity = rankingOpen ? "0" : "1";
    document.getElementById("rankingToggle").style.pointerEvents = rankingOpen ? "none" : "auto";
}
function toggleParticipants(){
    if(rankingOpen) closeAll();
    partsOpen = !partsOpen;
    document.getElementById("participantsPanel").classList.toggle("open", partsOpen);
    document.getElementById("rankingOverlay").classList.toggle("open", partsOpen);
    if(partsOpen) renderParticipants();
}
function closeAll(){
    rankingOpen = false; partsOpen = false;
    document.body.classList.remove("menu-open");
    document.getElementById("rankingPanel").classList.remove("open");
    document.getElementById("participantsPanel").classList.remove("open");
    document.getElementById("rankingOverlay").classList.remove("open");
    document.getElementById("rankingToggle").style.opacity = "1";
    document.getElementById("rankingToggle").style.pointerEvents = "auto";
}
function closeRanking(){ closeAll(); }

// ============================================================
// 👥 LOGIQUE PARTICIPANTS
// ============================================================
function addParticipant(){
    const input = document.getElementById('partInput');
    const val = input.value.trim();
    if(!val) return;
    if(participants.find(p => p.name.toLowerCase() === val.toLowerCase())){
        input.value = ''; return;
    }
    participants.push({ name: val, extraGames: 0 });
    saveParts();
    input.value = '';
    renderParticipants();
}

function removeParticipant(name){
    participants = participants.filter(p => p.name !== name);
    // Retire aussi ses entrées des mois, sinon il reste au classement
    // et serait recréé automatiquement au prochain chargement.
    const norm = name.toLowerCase();
    Object.keys(data).forEach(month=>{
        data[month] = data[month].filter(n => n.replace('#','').trim().toLowerCase() !== norm);
    });
    saveParts();
    saveData();
    renderParticipants();
    render();
}

function changeGames(name, delta){
    const p = participants.find(p => p.name === name);
    if(!p) return;
    p.extraGames = Math.max(0, (p.extraGames || 0) + delta);
    saveParts();
    renderParticipants();
}

function getParticipantStats(name){
    const norm = name.toLowerCase();
    let wins = 0, gamesInData = 0;
    Object.values(data).forEach(month=>{
        month.forEach(n=>{
            if(n.replace('#','').trim().toLowerCase() === norm){
                gamesInData++;
                if(!n.includes('#')) wins++;
            }
        });
    });
    const p = participants.find(p => p.name.toLowerCase() === norm);
    const extraGames = p ? (p.extraGames || 0) : 0;
    return { wins, participations: gamesInData + extraGames };
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

        const safeName = p.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        item.innerHTML = `
            <div class="part-item-right">
                <button class="part-del" onclick="removeParticipant('${safeName}')">✖</button>
            </div>
            <div class="part-item-left">
                <div class="part-name">${medal}${escapeHtml(p.name)}</div>
                <div class="part-stats">
                    <span>🏆 ${stats.wins}</span>
                    <div class="part-games-ctrl">
                        <button class="ctrl-btn minus" onclick="changeGames('${safeName}', -1)">−</button>
                        <span>📅${stats.participations}</span>
                        <button class="ctrl-btn" onclick="changeGames('${safeName}', +1)">＋</button>
                    </div>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

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
    if(action === 'confirm_import'){
        input.style.display = 'none'; msg.style.display = 'block'; msg.textContent = initialValue;
    } else {
        input.style.display = 'block'; msg.style.display = 'none';
        input.value = initialValue; setTimeout(()=>input.focus(), 100);
    }
    modal.classList.add("open");
}
function closeModal(){ document.getElementById("customModal").classList.remove("open"); currentAction = null; }

document.getElementById("modalConfirmBtn").onclick = () => {
    if(!currentAction) return;
    const inputVal = document.getElementById("modalInput").value.trim();
    if(currentAction.type === 'add' && inputVal){
        data[currentAction.month].push(inputVal);
        if(!participants.find(p => p.name.toLowerCase() === inputVal.toLowerCase())){
            participants.push({ name: inputVal, extraGames: 0 });
            saveParts();
        }
        saveData(); render();
    } else if(currentAction.type === 'edit' && inputVal){
        const oldName = data[currentAction.month][currentAction.index];
        data[currentAction.month][currentAction.index] = inputVal + (oldName.includes("#") ? "#" : "");
        saveData(); render();
    } else if(currentAction.type === 'confirm_import'){
        data = currentAction.newData; saveData();
        if(currentAction.newParticipants !== null && currentAction.newParticipants !== undefined){
            participants = currentAction.newParticipants; saveParts();
        }
        render();
        openModal('info','Succès','Données restaurées !');
        setTimeout(closeModal, 1500); return;
    }
    closeModal();
};
document.getElementById("modalInput").addEventListener("keypress", e=>{
    if(e.key === "Enter") document.getElementById("modalConfirmBtn").click();
});

// ============================================================
// 💾 EXPORT / IMPORT
// ============================================================
function exportData(){
    const backup = { data: data, participants: participants };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const dl = document.createElement('a');
    dl.setAttribute("href", dataStr); dl.setAttribute("download","mario_party_2026_backup.json");
    document.body.appendChild(dl); dl.click(); dl.remove();
}
function importData(input){
    const file = input.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = e=>{
        try {
            const imported = JSON.parse(e.target.result);
            if(imported.data && imported.data["Janvier"] && Array.isArray(imported.data["Janvier"])){
                openModal('confirm_import','Restaurer ?','Cela écrasera les données actuelles.',{
                    newData: imported.data,
                    newParticipants: imported.participants || []
                });
            } else if(imported["Janvier"] && Array.isArray(imported["Janvier"])){
                openModal('confirm_import','Restaurer ?','Cela écrasera les données actuelles.',{
                    newData: imported,
                    newParticipants: null
                });
            }
        } catch(err){ alert("Fichier invalide"); }
    };
    reader.readAsText(file); input.value = "";
}

// ============================================================
// 📊 CLASSEMENT
// ============================================================
function computeRanking(){
    const counts = {}, displayNames = {};
    Object.values(data).forEach(month=>{
        month.forEach(name=>{
            if(!name.includes("#")){
                const clean = name.trim(), norm = clean.toLowerCase();
                if(!counts[norm]){ counts[norm]=0; displayNames[norm]=clean; }
                counts[norm]++;
            }
        });
    });
    return Object.entries(counts).sort((a,b)=>{
        if(b[1]!==a[1]) return b[1]-a[1];
        return displayNames[a[0]].localeCompare(displayNames[b[0]]);
    });
}

// ============================================================
// 🖥 RENDER
// ============================================================
function render(){
    const container = document.getElementById("container"); container.innerHTML = "";
    let globalPreviousWinner = null;

    monthOrder.forEach(month=>{
        const div = document.createElement("div"); div.className = "month";
        const currentCount = data[month].length, maxCount = maxWins[month];

        const title = document.createElement("h2");
        title.textContent = month + " (" + currentCount + "/" + maxCount + ")";
        div.appendChild(title);

        const pct = Math.min(100,(currentCount/maxCount)*100);
        const pc = document.createElement("div"); pc.className = "progress-container";
        const pb = document.createElement("div"); pb.className = "progress-bar";
        pb.style.width = pct+"%";
        if(currentCount >= maxCount) pb.classList.add("full");
        pc.appendChild(pb); div.appendChild(pc);

        const monthWins = {};
        data[month].forEach(n=>{
            const k = n.replace("#","").trim().toLowerCase();
            monthWins[k] = (monthWins[k]||0)+1;
        });

        const ul = document.createElement("ul");
        data[month].forEach((name,index)=>{
            const li = document.createElement("li");
            const span = document.createElement("span"); span.className = "name";
            if(name.includes("#")) span.classList.add("passed");

            const cleanName = name.replace("#","").trim();
            const normName  = cleanName.toLowerCase();
            let badges = "";
            if(globalPreviousWinner === normName) badges += `<span class="badge" title="En feu !">🔥</span>`;
            if(!name.includes("#")) globalPreviousWinner = normName;
            if(monthWins[normName] >= 3) badges += `<span class="badge" title="Roi du mois">👑</span>`;

            span.innerHTML = escapeHtml(cleanName) + badges;
            span.onclick = ()=>{
                data[month][index] = name.includes("#") ? name.replace("#","") : name+"#";
                saveData(); render();
            };

            const bc = document.createElement("div"); bc.className = "buttons";
            const eb = document.createElement("button"); eb.textContent="✏"; eb.className="edit-btn";
            eb.onclick = ()=>{ openModal('edit','Modifier',cleanName,{month,index}); };
            const db = document.createElement("button"); db.textContent="🗑"; db.className="delete-btn";
            db.onclick = ()=>{ data[month].splice(index,1); saveData(); render(); };
            bc.appendChild(eb); bc.appendChild(db);
            li.appendChild(span); li.appendChild(bc); ul.appendChild(li);
        });
        div.appendChild(ul);

        const ab = document.createElement("button"); ab.textContent="➕ Ajouter"; ab.className="add-btn";
        if(currentCount >= maxCount){ ab.disabled=true; ab.textContent="🔒 Complet"; }
        ab.onclick = ()=>{
            if(data[month].length >= maxWins[month]) return;
            openModal('add','Ajouter ('+month+')','',{month});
        };
        div.appendChild(ab); container.appendChild(div);
    });

    updateRanking();
    if(partsOpen) renderParticipants();
}

function updateRanking(){
    const cDiv = document.getElementById("counter");
    const pDiv = document.getElementById("podium");
    const fDiv = document.getElementById("fullRanking");
    const sorted = computeRanking();

    pDiv.innerHTML = ""; fDiv.innerHTML = "";
    if(!sorted.length){ cDiv.innerHTML = "Aucun vainqueur"; return; }

    const maxS = sorted[0][1];
    const leaderList = sorted.filter(p=>p[1]===maxS).map(p=>p[0].charAt(0).toUpperCase()+p[0].slice(1));
    const leaders = leaderList.map(escapeHtml).join(", ");
    const leaderLabel = leaderList.length > 1 ? "Grands vainqueurs actuels" : "Grand vainqueur actuel";
    cDiv.innerHTML = "👑 "+leaderLabel+" : <b>"+leaders+"</b> ("+maxS+") victoire(s)";

    [{rank:1,cls:"second",e:"🥈"},{rank:0,cls:"first",e:"🥇"},{rank:2,cls:"third",e:"🥉"}].forEach(s=>{
        if(sorted[s.rank]){
            const nm = sorted[s.rank][0].charAt(0).toUpperCase()+sorted[s.rank][0].slice(1);
            const sc = sorted[s.rank][1];
            const b = document.createElement("div"); b.className = s.cls;
            b.innerHTML = s.e+"<br><b>"+escapeHtml(nm)+"</b><br>"+sc; pDiv.appendChild(b);
        }
    });

    let lastScore=null, vRank=-1;
    const ps = document.createElement("div"); ps.className="ranking-section";
    ps.innerHTML="<div class='ranking-title'>PODIUM</div>";
    const rs = document.createElement("div"); rs.className="ranking-section";
    rs.innerHTML="<div class='ranking-title'>CLASSEMENT</div>";

    sorted.forEach((entry,i)=>{
        if(entry[1]!==lastScore){ vRank++; lastScore=entry[1]; }
        const dp = entry[0].charAt(0).toUpperCase()+entry[0].slice(1);
        const item = document.createElement("div"); item.className="ranking-item";
        if(vRank===0) item.classList.add("gold");
        else if(vRank===1) item.classList.add("silver");
        else if(vRank===2) item.classList.add("bronze");
        item.innerHTML="<span>"+(i+1)+". "+escapeHtml(dp)+"</span><span class='ranking-score'>"+entry[1]+"</span>";
        if(vRank<3) ps.appendChild(item); else rs.appendChild(item);
    });
    fDiv.appendChild(ps); fDiv.appendChild(rs);
}

render();

// ============================================================
// ⌨️ TYPEWRITER
// ============================================================
const twTexts = [
    "🎮 Qui sera le champion de 2026 ?",
    "🏆 Chaque partie compte !",
    "🎲 Que le meilleur gagne !",
    "⭐ L'étoile n'attend que vous !",
];
let twIndex = 0, twChar = 0, twDeleting = false;
const twSpeed = 80;
const twEl = document.getElementById("typewriter-text");

function typeEffect() {
    const current = twTexts[twIndex];
    if (!twDeleting) {
        twEl.textContent = current.substring(0, twChar + 1);
        twChar++;
        if (twChar === current.length) { setTimeout(() => twDeleting = true, 1800); }
    } else {
        twEl.textContent = current.substring(0, twChar - 1);
        twChar--;
        if (twChar === 0) { twDeleting = false; twIndex = (twIndex + 1) % twTexts.length; }
    }
    setTimeout(typeEffect, twDeleting ? twSpeed / 2 : twSpeed);
}
typeEffect();

// ============================================================
// 🔒 SÉCURITÉ
// ============================================================
document.addEventListener('contextmenu', e => e.preventDefault());
document.onkeydown = function(e){
    if(e.keyCode==123) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='I'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='C'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.shiftKey&&e.keyCode=='J'.charCodeAt(0)) return false;
    if(e.ctrlKey&&e.keyCode=='U'.charCodeAt(0)) return false;
};
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

// ============================================================
// 🖱 CURSEUR CUSTOM MARIO PARTY (Corrigé)
// ============================================================
const cursorEl = document.getElementById('cursor');
cursorEl.textContent = '⭐'; // Étoile par défaut

// Déplacement (on garde left/top pour ne pas écraser ton scale CSS)
document.addEventListener('mousemove', (e) => {
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top  = e.clientY + 'px';
});

// Détection du survol (Délégation d'événements pour les boutons dynamiques)
document.addEventListener('mouseover', (e) => {
    // Liste des éléments où le curseur doit réagir
    const interactable = e.target.closest('button, a, input, textarea, [onclick], .name, .part-del, .ctrl-btn');
    
    if (interactable) {
        cursorEl.classList.add('hovered');
        cursorEl.textContent = '🌟'; // Étoile brillante
    }
});

// Quand on quitte l'élément
document.addEventListener('mouseout', (e) => {
    const interactable = e.target.closest('button, a, input, textarea, [onclick], .name, .part-del, .ctrl-btn');
    
    if (interactable) {
        cursorEl.classList.remove('hovered');
        cursorEl.textContent = '⭐'; // Retour à l'étoile normale
    }
});