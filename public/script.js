const socket = io();
let myRoomId = '';
let myId = ''; 
let myUserId = ''; 
let selectedCards = []; 
let currentHand = [];
let isHost = false;

// 暫存遊戲狀態，用於補亮手牌
let currentTableInfo = null;
let currentTurnPlayer = '';

const ANIMAL_META = {
    MOSQUITO: {name:'蚊子', emoji:'🦟'},
    MOUSE: {name:'老鼠', emoji:'🐭'},
    HEDGEHOG: {name:'刺蝟', emoji:'🦔'},
    FOX: {name:'狐狸', emoji:'🦊'},
    LION: {name:'獅子', emoji:'🦁'},
    ELEPHANT: {name:'大象', emoji:'🐘'},
    CHAMELEON: {name:'變色龍', emoji:'🦎'},
    SMALL_FISH: {name:'小魚', emoji:'🐟'},
    BIG_FISH: {name:'大魚', emoji:'🐠'},
    SEAL: {name:'海豹', emoji:'🦦'},
    BEAR: {name:'北極熊', emoji:'🐻‍❄️'},
    CROCODILE: {name:'鱷魚', emoji:'🐊'}, 
    WHALE: {name:'鯨魚', emoji:'🐋'}
};

const PREDATOR_PREY_MAP = {
    'WHALE':     ['BEAR', 'SEAL', 'BIG_FISH', 'SMALL_FISH'],
    'ELEPHANT':  ['LION', 'BEAR', 'CROCODILE', 'FOX'],
    'LION':      ['FOX', 'MOUSE'],
    'BEAR':      ['FOX', 'SEAL', 'BIG_FISH', 'MOUSE'],
    'CROCODILE': ['FOX', 'BIG_FISH', 'SMALL_FISH', 'HEDGEHOG', 'MOUSE', 'MOSQUITO'],
    'FOX':       ['HEDGEHOG', 'MOUSE'],
    'SEAL':      ['BIG_FISH', 'SMALL_FISH', 'MOUSE'],
    'BIG_FISH':  ['SMALL_FISH'],
    'SMALL_FISH':['MOSQUITO'],
    'HEDGEHOG':  ['MOUSE', 'MOSQUITO'],
    'MOUSE':     ['ELEPHANT', 'MOSQUITO'],
    'MOSQUITO':  [], 
    'CHAMELEON': []
};

const SORT_ORDER = [
    'MOSQUITO', 'MOUSE', 'HEDGEHOG', 'FOX', 'LION', 'ELEPHANT',
    'CHAMELEON', 'SMALL_FISH', 'BIG_FISH', 'SEAL', 'BEAR', 'CROCODILE', 'WHALE'
];

const POLAR_BEAR_URL = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f43b-200d-2744-fe0f.svg";

function getCardContent(type, emojiChar) {
    if (type === 'BEAR') {
        return `<img src="${POLAR_BEAR_URL}" class="emoji-img" alt="北極熊">`;
    } else {
        return `<span class="emoji">${emojiChar}</span>`;
    }
}

function initUser() {
    let storedId = localStorage.getItem('zoo_user_id');
    if (!storedId) {
        storedId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('zoo_user_id', storedId);
    }
    myUserId = storedId;

    const lastUser = localStorage.getItem('zoo_username');
    const lastNick = localStorage.getItem('zoo_nickname');
    const lastRoom = localStorage.getItem('zoo_last_room');
    
    if(lastUser) document.getElementById('username').value = lastUser;
    if(lastNick) document.getElementById('nickname').value = lastNick;
    if(lastRoom) document.getElementById('room-id').value = lastRoom;
}

initUser();

socket.on('connect', () => { 
    console.log("已連線, Socket ID:", socket.id);
    myId = socket.id; 
});

function showToast(msg) {
    const toast = document.getElementById('toast');
    if(toast) {
        toast.innerText = msg;
        toast.classList.remove('hidden');
        toast.style.animation = 'none';
        toast.offsetHeight; 
        toast.style.animation = null; 
    } else {
        alert(msg); 
    }
}

function switchScreen(id) {
    document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function joinRoom(roomCode) {
    const username = document.getElementById('username').value.trim(); 
    const nickname = document.getElementById('nickname').value.trim();
    const room = roomCode || document.getElementById('room-id').value.trim();
    
    if(!username || !nickname || !room) return showToast("請輸入完整資訊");
    
    localStorage.setItem('zoo_username', username);
    localStorage.setItem('zoo_nickname', nickname);
    localStorage.setItem('zoo_last_room', room);

    myRoomId = room;
    switchScreen('lobby-screen'); 
    document.getElementById('display-room-id').innerText = room;

    socket.emit('join_room', { roomId: room, username: username, nickname: nickname });
}

function toggleReady() { socket.emit('player_ready', myRoomId); }

function startGame() {
    const config = {};
    for (const type in ANIMAL_META) {
        const el = document.getElementById(`setting-${type}`);
        if(el) config[type] = parseInt(el.value) || 0;
        else config[type] = 5;
    }
    socket.emit('start_game', { roomId: myRoomId, config: config });
}

function resetGame() {
    socket.emit('reset_game', myRoomId);
}

window.kickPlayer = function(targetId) {
    if(!confirm("確定要踢出這位玩家嗎？")) return;
    socket.emit('kick_player', { roomId: myRoomId, targetId: targetId });
}

// --- Socket 事件 ---

socket.on('room_list_update', (rooms) => {
    const listDiv = document.getElementById('room-list');
    if (rooms.length === 0) {
        listDiv.innerHTML = '<div class="empty-room-msg">目前沒有房間</div>';
        return;
    }
    listDiv.innerHTML = rooms.map(r => `
        <div class="room-item" onclick="joinRoom('${r.id}')">
            <span class="room-id">🏠 ${r.id}</span>
            <span class="room-status ${r.status === '進行中' ? 'status-playing' : 'status-waiting'}">${r.status}</span>
            <span class="room-count">👤 ${r.count}人</span>
        </div>
    `).join('');
});

socket.on('game_reset', () => {
    document.getElementById('game-over-overlay').classList.add('hidden');
    switchScreen('lobby-screen');
    currentHand = [];
    selectedCards = [];
    currentTableInfo = null; 
});

socket.on('kicked_out', () => {
    alert("您已被房主踢出房間！");
    location.reload(); 
});

socket.on('update_room', (data) => {
    const list = document.getElementById('player-list');
    const amIHost = data.players[0].id === myId;

    list.innerHTML = data.players.map(p => {
        const isMe = p.id === myId ? '(我)' : '';
        const statusIcon = p.isReady ? '✅ 準備完成' : '⏳ 等待中...';
        const rowClass = p.isReady ? 'player-ready' : 'player-waiting';
        
        let kickBtn = '';
        if (amIHost && p.id !== myId) {
            kickBtn = `<button class="btn-kick" onclick="kickPlayer('${p.id}')" title="踢出此人">🚫</button>`;
        }

        return `
            <div class="player-item-row ${rowClass}">
                <span style="font-weight:bold;">${p.name} ${isMe}</span>
                <div class="row-right">
                    <span style="font-size:0.9em;">${statusIcon}</span>
                    ${kickBtn}
                </div>
            </div>
        `;
    }).join('');

    isHost = data.players[0].id === myId;
    const startBtn = document.getElementById('start-btn');
    const settingsBox = document.getElementById('deck-settings');
    
    if(isHost && data.status === 'WAITING') {
        startBtn.classList.remove('hidden');
        settingsBox.classList.remove('hidden');
        const grid = document.getElementById('settings-grid');
        if (grid && grid.children.length === 0) renderSettings(data.config);

        const others = data.players.filter(p => p.id !== myId);
        const allOthersReady = others.length > 0 && others.every(p => p.isReady);

        if (allOthersReady) {
            startBtn.disabled = false;
            startBtn.innerText = "開始遊戲";
            startBtn.style.opacity = "1";
            startBtn.style.cursor = "pointer";
        } else {
            startBtn.disabled = true;
            if (others.length === 0) startBtn.innerText = "等待玩家加入...";
            else startBtn.innerText = "等待全員準備...";
            startBtn.style.opacity = "0.5";
            startBtn.style.cursor = "not-allowed";
        }
    } else {
        startBtn.classList.add('hidden');
        settingsBox.classList.add('hidden');
    }

    const me = data.players.find(p => p.id === myId);
    if(me) {
        const btn = document.getElementById('ready-btn');
        if (me.isReady) {
            btn.innerText = "取消準備";
            btn.className = "btn-cancel";
        } else {
            btn.innerText = "準備";
            btn.className = "btn-ready";
        }
    }
});

function renderSettings(config) {
    const grid = document.getElementById('settings-grid');
    grid.innerHTML = Object.keys(ANIMAL_META).map(type => {
        const count = config && config[type] !== undefined ? config[type] : 5;
        return `
            <div class="setting-item">
                <label>${ANIMAL_META[type].emoji} ${ANIMAL_META[type].name}</label>
                <input type="number" id="setting-${type}" value="${count}" min="0" max="20">
            </div>
        `;
    }).join('');
}

socket.on('game_started', (data) => {
    document.getElementById('game-over-overlay').classList.add('hidden'); 
    switchScreen('game-screen');
});

socket.on('receive_hand', (hand) => {
    currentHand = hand;
    selectedCards = []; 
    renderHand(); 
});

socket.on('game_update', (data) => {
    const gameScreen = document.getElementById('game-screen');
    if (data.status === 'PLAYING' && gameScreen.classList.contains('hidden')) {
        switchScreen('game-screen');
    }

    // 更新全域狀態
    currentTableInfo = data.tableCards;
    currentTurnPlayer = data.currentPlayer;

    renderOpponents(data.playersInfo || [], data.currentPlayer);

    const tableDiv = document.getElementById('table-cards');
    const tableInfo = document.getElementById('table-info');
    
    if (data.tableCards) {
        tableDiv.innerHTML = data.tableCards.cards.map(c => 
            `<div class="card">${getCardContent(c.type, c.emoji)}</div>`
        ).join('');
        tableInfo.innerText = `桌面: ${data.tableCards.count} 張 (${data.tableCards.emoji})`;
    } else {
        tableDiv.innerHTML = '<div class="empty-msg">等待出牌...</div>';
        tableInfo.innerText = '';
    }

    updateTurnInfo(data.currentPlayer);

    if (data.status === 'FINISHED') {
        const overlay = document.getElementById('game-over-overlay');
        const list = document.getElementById('result-list');
        const backBtn = document.getElementById('back-lobby-btn');
        const waitMsg = document.getElementById('waiting-host-msg');

        overlay.classList.remove('hidden');
        
        let resultHTML = '';
        data.winners.forEach((winnerId, index) => {
            const p = data.playersInfo.find(info => info.id === winnerId);
            const name = p ? p.name : '未知';
            const medals = ['🥇', '🥈', '🥉'];
            const medal = medals[index] || `第${index+1}`;
            resultHTML += `<div class="result-item"><span>${medal}</span> <span>${name}</span></div>`;
        });
        
        list.innerHTML = resultHTML;

        if (isHost) {
            backBtn.classList.remove('hidden');
            waitMsg.classList.add('hidden');
        } else {
            backBtn.classList.add('hidden');
            waitMsg.classList.remove('hidden');
        }
    }

    // 觸發高亮檢查
    applyHighlights();
});

socket.on('toast', (msg) => showToast(msg));
socket.on('error_message', (msg) => showToast("❌ " + msg));

// --- 渲染與操作 ---

function renderOpponents(players, currentTurnId) {
    const area = document.getElementById('opponents-area');
    const opponents = players.filter(p => p.id !== myId && p.inGame);
    
    area.innerHTML = opponents.map(p => {
        const isTurn = p.id === currentTurnId;
        const statusClass = isTurn ? 'opponent-active' : '';
        const winnerBadge = p.isWinner ? `<div class="badge">第 ${p.rank} 名</div>` : '';
        
        return `
            <div class="opponent-card ${statusClass}">
                <div class="avatar">👤</div>
                <div class="name">${p.name}</div>
                <div class="card-count">
                    <span>🎴</span> x ${p.cardCount}
                </div>
                ${winnerBadge}
            </div>
        `;
    }).join('');
}

function updateTurnInfo(currentId) {
    const bar = document.getElementById('status-bar');
    const isMyTurn = currentId === myId;
    
    const btnPlay = document.getElementById('btn-play');
    const btnPass = document.getElementById('btn-pass');
    
    if(btnPlay) btnPlay.disabled = !isMyTurn;
    if(btnPass) btnPass.disabled = !isMyTurn;

    if (isMyTurn) {
        bar.innerText = "🔥 輪到你了！";
        bar.style.color = "#f1c40f";
        document.getElementById('my-hand').classList.add('active-hand');
    } else {
        bar.innerText = "⏳ 等待對手...";
        bar.style.color = "#bdc3c7";
        document.getElementById('my-hand').classList.remove('active-hand');
    }
}

// [修改] 高亮邏輯：移除變色龍自動提示
function applyHighlights() {
    document.querySelectorAll('.card').forEach(el => el.classList.remove('playable'));

    if (currentTurnPlayer !== myId || currentHand.length === 0) return;

    currentHand.forEach(card => {
        let isPlayable = false;

        if (!currentTableInfo) {
            // 桌面無牌：任意牌都提示
            isPlayable = true;
        } else {
            const targetType = currentTableInfo.type;
            
            // 判斷 1: 天敵
            const preyList = PREDATOR_PREY_MAP[card.type];
            const isPredator = preyList && preyList.includes(targetType);

            // 判斷 2: 同類
            const isSameType = (card.type === targetType);

            // 判斷 3: 蚊子吃大象
            const isMosquitoVsElephant = (card.type === 'MOSQUITO' && targetType === 'ELEPHANT');
            
            // [修正] 移除變色龍自動提示 (因為變色龍不能單出，亂亮會誤導)
            // const isChameleon = (card.type === 'CHAMELEON');

            if (isPredator || isSameType || isMosquitoVsElephant) {
                isPlayable = true;
            }
        }

        if (isPlayable) {
            const el = document.getElementById('card-' + card.id);
            if (el) el.classList.add('playable');
        }
    });
}

function renderHand() {
    const handDiv = document.getElementById('my-hand');
    
    currentHand.sort((a, b) => {
        return SORT_ORDER.indexOf(a.type) - SORT_ORDER.indexOf(b.type);
    });

    handDiv.innerHTML = currentHand.map(c => `
        <div class="card" id="card-${c.id}" onclick="toggleSelect('${c.id}')">
            ${getCardContent(c.type, c.emoji)}
            <span class="name">${c.name}</span>
        </div>
    `).join('');
    
    applyHighlights();
}

window.toggleSelect = function(cardId) {
    const elementId = 'card-' + cardId;
    const cardEl = document.getElementById(elementId);
    if (!cardEl) return;

    if (selectedCards.includes(cardId)) {
        selectedCards = selectedCards.filter(id => id !== cardId);
        cardEl.classList.remove('selected');
    } else {
        selectedCards.push(cardId);
        cardEl.classList.add('selected');
    }
}

window.playCards = function() {
    if (selectedCards.length === 0) return showToast("請選牌");
    socket.emit('play_cards', { roomId: myRoomId, cardIds: selectedCards });
}

window.passTurn = function() {
    socket.emit('pass_turn', myRoomId);
}