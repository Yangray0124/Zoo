const socket = io();
let myRoomId = '';
let myId = ''; 
let myUserId = ''; 
let selectedCards = []; 
let currentHand = [];
let isHost = false;

let currentTableInfo = null;
let currentTurnPlayer = '';

const ANIMAL_META = {
    MOSQUITO: {name:'蚊子', emoji:'🦟', color: '#95a5a6'}, 
    MOUSE: {name:'老鼠', emoji:'🐭', color: '#bdc3c7'}, 
    HEDGEHOG: {name:'刺蝟', emoji:'🦔', color: '#d35400'}, 
    FOX: {name:'狐狸', emoji:'🦊', color: '#e67e22'}, 
    LION: {name:'獅子', emoji:'🦁', color: '#f1c40f'}, 
    ELEPHANT: {name:'大象', emoji:'🐘', color: '#95a5a6'}, 
    CHAMELEON: {name:'變色龍', emoji:'🦎', color: '#2ecc71'}, 
    SMALL_FISH: {name:'小魚', emoji:'🐟', color: '#3498db'}, 
    BIG_FISH: {name:'大魚', emoji:'🐠', color: '#2980b9'}, 
    SEAL: {name:'海豹', emoji:'🦦', color: '#8e44ad'}, 
    BEAR: {name:'北極熊', emoji:'🐻‍❄️', color: '#ecf0f1'}, // 雖然這裡有 emoji，但下面的函式會用圖片覆蓋它
    CROCODILE: {name:'鱷魚', emoji:'🐊', color: '#27ae60'}, 
    WHALE: {name:'鯨魚', emoji:'🐋', color: '#34495e'} 
};

const PREDATOR_PREY_MAP = {
    'WHALE':     ['BEAR', 'SEAL', 'BIG_FISH', 'SMALL_FISH'],
    'ELEPHANT':  ['LION', 'BEAR', 'CROCODILE', 'FOX'],
    'LION':      ['FOX', 'MOUSE'],
    'BEAR':      ['FOX', 'SEAL', 'BIG_FISH', 'MOUSE'],
    'CROCODILE': ['FOX', 'BIG_FISH', 'SMALL_FISH', 'MOUSE', 'MOSQUITO'],
    'FOX':       ['HEDGEHOG', 'MOUSE'],
    'SEAL':      ['BIG_FISH', 'SMALL_FISH', 'MOUSE'],
    'BIG_FISH':  ['SMALL_FISH'],
    'SMALL_FISH':['MOSQUITO'],
    'HEDGEHOG':  ['MOUSE', 'MOSQUITO'],
    'MOUSE':     ['ELEPHANT', 'MOSQUITO'],
    'MOSQUITO':  ['ELEPHANT'], 
    'CHAMELEON': []
};

const SORT_ORDER = [
    'MOSQUITO', 'MOUSE', 'HEDGEHOG', 'FOX', 'LION', 'ELEPHANT',
    'CHAMELEON', 'SMALL_FISH', 'BIG_FISH', 'SEAL', 'BEAR', 'CROCODILE', 'WHALE'
];

// [修正] 北極熊圖片網址
const POLAR_BEAR_URL = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/1f43b-200d-2744-fe0f.svg";

// [修正] 如果是熊，回傳圖片；否則回傳 emoji
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

window.leaveRoom = function() {
    if (confirm("確定要離開房間嗎？")) {
        socket.emit('leave_room', myRoomId);
    }
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

socket.on('left_room_success', () => {
    myRoomId = '';
    isHost = false;
    currentHand = [];
    selectedCards = [];
    currentTableInfo = null;
    location.reload(); 
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

    // [新增] 房主皇冠邏輯：判斷 index === 0
    list.innerHTML = data.players.map((p, index) => {
        const isMe = p.id === myId ? '(我)' : '';
        const statusIcon = p.isReady ? '✅ 準備完成' : '⏳ 等待中...';
        const rowClass = p.isReady ? 'player-ready' : 'player-waiting';
        
        // 只有第一位玩家(房主)顯示皇冠
        const hostBadge = (index === 0) ? ' 👑' : '';

        let kickBtn = '';
        if (amIHost && p.id !== myId) {
            kickBtn = `<button class="btn-kick" onclick="kickPlayer('${p.id}')" title="踢出此人">🚫</button>`;
        }

        return `
            <div class="player-item-row ${rowClass}">
                <span style="font-weight:bold;">${p.name}${hostBadge} ${isMe}</span>
                <div class="row-right">
                    <span style="font-size:0.9em;">${statusIcon}</span>
                    ${kickBtn}
                </div>
            </div>
        `;
    }).join('');

    // --- 按鈕邏輯區 ---
    isHost = data.players[0].id === myId;
    const startBtn = document.getElementById('start-btn');
    const readyBtn = document.getElementById('ready-btn'); // 抓取準備按鈕
    const settingsBox = document.getElementById('deck-settings');
    
    if (data.status === 'WAITING') {
        settingsBox.classList.remove('hidden');
        renderSettings(data.config, isHost);

        if (isHost) {
            // --- 我是房主 ---
            startBtn.classList.remove('hidden'); // 顯示開始按鈕
            
            // [關鍵] 移除滿版樣式，讓它跟開始按鈕平分寬度
            readyBtn.classList.remove('btn-full'); 

            // 檢查是否所有人都準備好
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
            // --- 我不是房主 ---
            startBtn.classList.add('hidden'); // 隱藏開始按鈕
            
            // [關鍵] 加入滿版樣式，讓準備按鈕變超寬
            readyBtn.classList.add('btn-full'); 
        }
    } else {
        // 遊戲中
        startBtn.classList.add('hidden');
        settingsBox.classList.add('hidden');
        
        // 處理遊戲結束後的返回大廳按鈕
        if (data.status === 'FINISHED') {
            const backBtn = document.getElementById('back-lobby-btn');
            const waitMsg = document.getElementById('waiting-host-msg');
            
            if (isHost) {
                backBtn.classList.remove('hidden');
                waitMsg.classList.add('hidden');
            } else {
                backBtn.classList.add('hidden');
                waitMsg.classList.remove('hidden');
            }
        }
    }

    // 更新準備按鈕文字
    const me = data.players.find(p => p.id === myId);
    if(me) {
        if (me.isReady) {
            readyBtn.innerText = "取消準備";
            readyBtn.className = isHost ? "btn-cancel btn-action" : "btn-cancel btn-action btn-full";
        } else {
            readyBtn.innerText = "準備";
            readyBtn.className = isHost ? "btn-ready btn-action" : "btn-ready btn-action btn-full";
        }
    }
});

function renderSettings(config, amIHost) {
    const grid = document.getElementById('settings-grid');
    const disabledAttr = amIHost ? '' : 'disabled';
    const onChangeAttr = amIHost ? 'onchange="sendSettings()"' : '';

    let html = Object.keys(ANIMAL_META).map(type => {
        const count = config && config[type] !== undefined ? config[type] : 5;
        return `
            <div class="setting-item">
                <label>${getCardContent(type, ANIMAL_META[type].emoji)} ${ANIMAL_META[type].name}</label>
                <input type="number" id="setting-${type}" value="${count}" min="0" max="20" ${disabledAttr} ${onChangeAttr}>
            </div>
        `;
    }).join('');

    if (!amIHost) {
        html += `<div class="setting-hint">⚠️ 只有房主可以調整牌堆數量</div>`;
    }

    grid.innerHTML = html;
}

window.sendSettings = function() {
    const config = {};
    for (const type in ANIMAL_META) {
        const el = document.getElementById(`setting-${type}`);
        if(el) config[type] = parseInt(el.value) || 0;
    }
    socket.emit('update_settings', { roomId: myRoomId, config: config });
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

    currentTableInfo = data.tableCards;
    currentTurnPlayer = data.currentPlayer;

    renderOpponents(data.playersInfo || [], data.currentPlayer);

    renderTable(data.tableCards);

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

    applyHighlights();
});

socket.on('toast', (msg) => showToast(msg));
socket.on('error_message', (msg) => showToast("❌ " + msg));

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

function applyHighlights() {
    document.querySelectorAll('.card').forEach(el => el.classList.remove('playable'));

    if (currentTurnPlayer !== myId || currentHand.length === 0) return;

    const counts = {};
    let chameleonCount = 0;
    let mosquitoCount = 0;

    currentHand.forEach(c => {
        if (c.type === 'CHAMELEON') chameleonCount++;
        else if (c.type === 'MOSQUITO') mosquitoCount++;
        else counts[c.type] = (counts[c.type] || 0) + 1;
    });

    const playableTypes = new Set();
    let isChameleonPlayable = false;
    let isMosquitoPlayable = false;

    if (!currentTableInfo) {
        const hasNormalAnimal = Object.keys(counts).length > 0;
        if (hasNormalAnimal) {
            Object.keys(counts).forEach(t => playableTypes.add(t));
            isChameleonPlayable = true;
        }
        if (mosquitoCount > 0) isMosquitoPlayable = true;
        if (counts['ELEPHANT']) isMosquitoPlayable = true;

    } else {
        const targetType = currentTableInfo.type;
        const targetCount = currentTableInfo.count;

        if (targetType === 'ELEPHANT' && mosquitoCount >= targetCount) {
            isMosquitoPlayable = true;
        }

        Object.keys(counts).forEach(myType => {
            const myRealCount = counts[myType];
            const powerWithChameleon = myRealCount + chameleonCount;
            
            let powerWithMosquito = 0;
            if (myType === 'ELEPHANT') {
                const totalHosts = myRealCount + chameleonCount;
                const usableMosquitoes = Math.min(mosquitoCount, totalHosts);
                powerWithMosquito = totalHosts + usableMosquitoes;
            }

            const preyList = PREDATOR_PREY_MAP[myType] || [];
            const isPredator = preyList.includes(targetType);
            const isSame = (myType === targetType);

            let winWithChameleon = false;
            if (isPredator && powerWithChameleon >= targetCount) winWithChameleon = true;
            if (isSame && powerWithChameleon >= targetCount + 1) winWithChameleon = true;

            if (winWithChameleon) {
                playableTypes.add(myType);
                isChameleonPlayable = true;
            }

            if (myType === 'ELEPHANT') {
                let winWithMosquito = false;
                if (isPredator && powerWithMosquito >= targetCount) winWithMosquito = true;
                if (isSame && powerWithMosquito >= targetCount + 1) winWithMosquito = true;

                if (winWithMosquito) {
                    playableTypes.add(myType);
                    isMosquitoPlayable = true;
                    if (chameleonCount > 0) isChameleonPlayable = true;
                }
            }
        });
    }

    currentHand.forEach(card => {
        let highlight = false;
        if (card.type === 'CHAMELEON') {
            if (isChameleonPlayable) highlight = true;
        } else if (card.type === 'MOSQUITO') {
            if (isMosquitoPlayable) highlight = true;
        } else {
            if (playableTypes.has(card.type)) highlight = true;
        }

        if (highlight) {
            const el = document.getElementById('card-' + card.id);
            if (el) el.classList.add('playable');
        }
    });
}

let lastTableSignature = ""; 

function renderTable(tableInfo) {
    const tableDiv = document.getElementById('table-cards');
    const discardPile = document.getElementById('discard-pile');
    const discardContainer = discardPile.querySelector('.pile-cards');

    const currentSignature = tableInfo ? `${tableInfo.type}-${tableInfo.count}` : "EMPTY";

    if (currentSignature === lastTableSignature) return;

    if (lastTableSignature !== "EMPTY" && currentSignature === "EMPTY") {
        const oldCards = tableDiv.querySelectorAll('.card');
        oldCards.forEach((card, index) => {
            setTimeout(() => {
                card.classList.add('animate-leave');
            }, index * 50);
        });

        setTimeout(() => {
            tableDiv.innerHTML = '';
            const cardBack = document.createElement('div');
            cardBack.className = 'card-back';
            cardBack.style.transform = `rotate(${Math.random() * 20 - 10}deg)`;
            discardContainer.appendChild(cardBack);
            
            while (discardContainer.children.length > 5) {
                discardContainer.removeChild(discardContainer.firstChild);
            }
        }, 600);
    } 
    else if (tableInfo) {
        tableDiv.innerHTML = '';
        discardPile.classList.remove('hidden');

        const tableInfoDiv = document.getElementById('table-info');
        // 這裡顯示文字描述，例如 "桌面: 2 張 (🐘)" -> 這部分維持顯示「變身後」的結果比較好辨識
        tableInfoDiv.innerText = `桌面: ${tableInfo.count} 張 (${tableInfo.emoji})`;

        // [修改重點] 改用 tableInfo.cards 來畫圖，確保顯示原始卡面
        if (tableInfo.cards && tableInfo.cards.length > 0) {
            tableInfo.cards.forEach((cardData, i) => {
                // 使用 cardData.type (原始類型) 來生成卡片
                const card = createCardElement({ type: cardData.type, id: `table-${i}` });
                
                // 加入動畫
                card.classList.add('animate-enter');
                card.style.animationDelay = `${i * 0.1}s`;
                
                tableDiv.appendChild(card);
            });
        } 
        // (保險起見的備用方案，如果 server 沒傳 cards 就用舊邏輯)
        else {
            for (let i = 0; i < tableInfo.count; i++) {
                const card = createCardElement({ type: tableInfo.type, id: `table-${i}` });
                card.classList.add('animate-enter');
                card.style.animationDelay = `${i * 0.1}s`;
                tableDiv.appendChild(card);
            }
        }
    }

    lastTableSignature = currentSignature;
}

function createCardElement(cardData) {
    const div = document.createElement('div');
    div.className = 'card';
    div.id = 'card-' + cardData.id;
    
    const meta = ANIMAL_META[cardData.type] || { emoji: '❓', name: cardData.type, color: '#bdc3c7' };
    div.style.backgroundColor = meta.color;
    
    // [修正] 使用 getCardContent 確保北極熊使用圖片
    const emojiContent = getCardContent(cardData.type, meta.emoji);

    div.innerHTML = `
        <div class="emoji">${emojiContent}</div>
        <div class="name">${meta.name}</div>
    `;
    return div;
}

function renderHand() {
    const container = document.getElementById('my-hand');
    container.innerHTML = '';

    currentHand.sort((a, b) => {
        return SORT_ORDER.indexOf(a.type) - SORT_ORDER.indexOf(b.type);
    });

    currentHand.forEach(card => {
        const div = createCardElement(card);
        
        if (selectedCards.includes(card.id)) {
            div.classList.add('selected');
        }

        div.onclick = () => {
            toggleSelect(card.id);
        };
        
        container.appendChild(div);
    });
    
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