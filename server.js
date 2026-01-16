const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 1. 動物定義與參數 (保持不變)
// ==========================================

const ANIMALS = {
    MOSQUITO:  { name: '蚊子', emoji: '🦟' },
    MOUSE:     { name: '老鼠', emoji: '🐭' },
    HEDGEHOG:  { name: '刺蝟', emoji: '🦔' },
    FOX:       { name: '狐狸', emoji: '🦊' },
    LION:      { name: '獅子', emoji: '🦁' },
    ELEPHANT:  { name: '大象', emoji: '🐘' },
    CHAMELEON: { name: '變色龍', emoji: '🦎' },
    SMALL_FISH:{ name: '小魚', emoji: '🐟' },
    BIG_FISH:  { name: '大魚', emoji: '🐠' },
    SEAL:      { name: '海豹', emoji: '🦦' },
    BEAR:      { name: '北極熊', emoji: '🐻‍❄️' },
    CROCODILE: { name: '鱷魚', emoji: '🐊' },
    WHALE:     { name: '鯨魚', emoji: '🐋' }
};

const DEFAULT_DECK_CONFIG = {
    MOSQUITO: 4, MOUSE: 5, HEDGEHOG: 5, 
    FOX: 5, LION: 5, ELEPHANT: 5, 
    CHAMELEON: 1,
    SMALL_FISH: 5, BIG_FISH: 5, SEAL: 5, 
    BEAR: 5, CROCODILE: 5, WHALE: 5
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

// ==========================================
// 2. 核心邏輯 (保持不變)
// ==========================================

function createDeck(config) {
    let deck = [];
    let idCounter = 0;
    const currentConfig = config || DEFAULT_DECK_CONFIG;

    for (const [type, count] of Object.entries(currentConfig)) {
        if (!ANIMALS[type]) continue;
        for (let i = 0; i < count; i++) {
            deck.push({ 
                id: `c_${Date.now()}_${idCounter++}`, 
                type: type,
                name: ANIMALS[type].name,
                emoji: ANIMALS[type].emoji 
            });
        }
    }
    return deck;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function resolveHandType(cards) {
    if (cards.length === 0) return { valid: false, msg: "未選牌" };

    const mosquitoes = cards.filter(c => c.type === 'MOSQUITO');
    const chameleons = cards.filter(c => c.type === 'CHAMELEON');
    const others = cards.filter(c => c.type !== 'MOSQUITO' && c.type !== 'CHAMELEON');

    let effectiveType = '';
    
    if (others.length === 0 && mosquitoes.length === 0) return { valid: false, msg: "變色龍無法單獨出牌" };
    if (others.length === 0) {
        // [修改] 這裡原本擋住了變色龍，現在改為允許
        // 規則：如果只有 蚊子+變色龍，視為「純蚊子」組合
        effectiveType = 'MOSQUITO';
        
        // 註：因為這裡 effectiveType 是 MOSQUITO，所以後面不會進到「蚊子變大象」的判斷，
        // 而是直接以「蚊子」的身分打出，這樣是符合規則的。
    }else {
        const firstType = others[0].type;
        if (!others.every(c => c.type === firstType)) return { valid: false, msg: "不能混打不同動物" };
        effectiveType = firstType;

        if (mosquitoes.length > 0) {
            if (firstType !== 'ELEPHANT') return { valid: false, msg: "蚊子只能配合大象" };
            if (mosquitoes.length > (others.length + chameleons.length)) {
                return { valid: false, msg: "蚊子數量不能超過大象(含變色龍)總數" };
            }
        }
    }

    return { 
        valid: true, 
        type: effectiveType, 
        count: cards.length,
        emoji: ANIMALS[effectiveType].emoji, 
        name: ANIMALS[effectiveType].name
    };
}

function isPredator(attackerType, defenderType) {
    const preyList = PREDATOR_PREY_MAP[attackerType];
    return preyList && preyList.includes(defenderType);
}

function validateMove(currentHandData, lastTable) {
    if (!lastTable) return { valid: true };

    const currType = currentHandData.type;
    const currCount = currentHandData.count;
    const lastType = lastTable.type;
    const lastCount = lastTable.count;

    if (currCount === lastCount) {
        if (isPredator(currType, lastType)) return { valid: true };
        else return { valid: false, msg: `${ANIMALS[currType].name} 吃不了 ${ANIMALS[lastType].name}` };
    }
    else if (currType === lastType) {
        if (currCount === lastCount + 1) return { valid: true };
        else return { valid: false, msg: "同種動物壓制，數量必須剛好 +1" };
    }

    return { valid: false, msg: "牌型無效 (需相同數量天敵，或同類+1)" };
}

function nextTurn(room) {
    let loops = 0;
    const activePlayers = room.players.filter(p => p.inGame);
    const count = room.players.length; 
    
    if (activePlayers.length === 0) return;

    do {
        room.turnIndex = (room.turnIndex + 1) % count;
        loops++;
    } while ( 
        (!room.players[room.turnIndex].inGame || room.players[room.turnIndex].hand.length === 0) 
        && loops < count 
    );
}

function getPublicRoomList() {
    return Object.values(rooms).map(r => ({
        id: r.id,
        count: r.players.length,
        status: r.status === 'WAITING' ? '等待中' : '進行中'
    }));
}

function checkGameOver(room) {
    const remainingPlayers = room.players.filter(p => p.inGame && p.hand.length > 0);
    if (remainingPlayers.length <= 1) {
        room.status = 'FINISHED';
        if (remainingPlayers.length === 1) {
            const loser = remainingPlayers[0];
            if (!room.winners.includes(loser.id)) {
                room.winners.push(loser.id);
            }
        }
        return true;
    }
    return false;
}

// ==========================================
// 3. Socket.io
// ==========================================

const rooms = {};

// 處理玩家真正移除的邏輯
// [修正] 處理玩家離開/斷線的邏輯
function handlePlayerRemove(socketId, roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.id === socketId);
    if (playerIndex === -1) return;
    
    // 記錄離開的人是否在遊戲中
    const wasInGame = room.players[playerIndex].inGame;
    
    // 移除玩家 (陣列會自動遞補，原本的 players[1] 會變成 players[0] 即新房主)
    room.players.splice(playerIndex, 1);

    if (room.players.length === 0) {
        delete rooms[roomId];
        io.emit('room_list_update', getPublicRoomList());
        return;
    }

    // 判斷房間狀態
    if (room.status === 'WAITING') {
        room.players.forEach(p => p.isReady = false);
    } 
    // [重點修正] 如果是「進行中」或「已結束」，只要有人離開，都要處理順位並廣播
    else if ((room.status === 'PLAYING' || room.status === 'FINISHED') && wasInGame) {
        
        // 如果輪到的那個人剛好跑了，或者順位因為移除而跑掉，修正 turnIndex
        if (room.turnIndex >= room.players.length) {
            room.turnIndex = 0;
        }
        
        // 檢查是否因為人跑光而結束
        if (checkGameOver(room)) {
            broadcastGameState(room);
        } else {
            // 如果是遊戲中，且輪到離開的人，要換下一位
            if (room.status === 'PLAYING') {
                // 這裡簡化處理：如果輪到的人不在了，直接跳下一個有牌的人
                // 因為上面已經移除了玩家，turnIndex 現在指向的是原本的「下一家」
                // 我們只需要確認這個人有牌，沒有就 nextTurn
                if (room.players[room.turnIndex].hand.length === 0) {
                     nextTurn(room);
                }
            }
            broadcastGameState(room);
        }
    }

    // 發送最新的房間資訊 (這會更新前端的 isHost 變數)
    io.to(roomId).emit('update_room', {
        players: room.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
        status: room.status,
        config: room.deckConfig
    });
    
    io.emit('room_list_update', getPublicRoomList());
}

io.on('connection', (socket) => {
    socket.emit('room_list_update', getPublicRoomList());

    // 踢人功能
    socket.on('kick_player', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.players[0].id !== socket.id) return;
        
        io.to(targetId).emit('kicked_out');
        // 踢人是強制立刻移除
        handlePlayerRemove(targetId, roomId);
    });

    socket.on('join_room', ({ roomId, username, nickname }) => {
        socket.join(roomId);
        socket.currentRoomId = roomId; // 綁定房間ID方便斷線查詢
        
        if (!rooms[roomId]) {
            rooms[roomId] = {
                id: roomId,
                players: [],
                status: 'WAITING',
                deckConfig: { ...DEFAULT_DECK_CONFIG },
                deck: [],
                tableCards: null, 
                turnIndex: 0,
                passCount: 0,
                winners: [],
                // [新增] 用來存斷線倒數計時器
                disconnectTimers: {} 
            };
            io.emit('room_list_update', getPublicRoomList());
        }

        const room = rooms[roomId];
        
        // [修改] 檢查是否為「斷線重連」的玩家
        const existingPlayer = room.players.find(p => p.username === username);

        if (existingPlayer) {
            // --- 這是重連回來的玩家 ---
            console.log(`玩家 ${nickname} 重連成功`);
            
            // 1. 如果有刪除倒數，立刻取消！
            if (room.disconnectTimers[existingPlayer.username]) {
                clearTimeout(room.disconnectTimers[existingPlayer.username]);
                delete room.disconnectTimers[existingPlayer.username];
            }

            // 2. 更新 Socket ID
            existingPlayer.id = socket.id;
            existingPlayer.name = nickname; // 更新暱稱(如果有的話)
            
            // 3. 發送手牌
            socket.emit('receive_hand', existingPlayer.hand);
        } else {
            // --- 這是新加入的玩家 ---
            const isSpectator = (room.status === 'PLAYING' || room.status === 'FINISHED');
            room.players.push({ 
                id: socket.id, 
                username: username, 
                name: nickname,     
                hand: [], 
                isReady: false,
                inGame: !isSpectator 
            });
            io.emit('room_list_update', getPublicRoomList());
        }

        io.to(roomId).emit('update_room', {
            players: room.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
            status: room.status,
            config: room.deckConfig
        });

        if (room.status !== 'WAITING') {
            broadcastGameState(room);
        }
    });

    // [修改] 主動離開房間 (按下按鈕) -> 不需要倒數，直接刪除
    socket.on('leave_room', (roomId) => {
        const room = rooms[roomId];
        if(room) {
             // 主動離開，也要清除可能的計時器(預防萬一)
            const player = room.players.find(p => p.id === socket.id);
            if (player && room.disconnectTimers[player.username]) {
                clearTimeout(room.disconnectTimers[player.username]);
                delete room.disconnectTimers[player.username];
            }
            handlePlayerRemove(socket.id, roomId);
        }
        
        socket.leave(roomId);
        socket.currentRoomId = null;
        socket.emit('left_room_success');
    });

    socket.on('player_ready', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (player) player.isReady = !player.isReady;
        
        io.to(roomId).emit('update_room', {
            players: room.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
            status: room.status,
            config: room.deckConfig
        });
    });

    socket.on('update_settings', ({ roomId, config }) => {
        const room = rooms[roomId];
        if (!room || room.players[0].id !== socket.id) return;
        room.deckConfig = config;
        io.to(roomId).emit('update_room', {
            players: room.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
            status: room.status,
            config: room.deckConfig
        });
    });

    socket.on('start_game', ({ roomId, config }) => {
        const room = rooms[roomId];
        if (!room || room.players.length < 2) return;

        const others = room.players.filter(p => p.id !== socket.id);
        const allReady = others.every(p => p.isReady);
        if (!allReady) {
            socket.emit('error_message', "還有玩家未準備，無法開始！");
            return;
        }

        const tempConfig = config || room.deckConfig;
        const tempDeck = createDeck(tempConfig);
        if (tempDeck.length < room.players.length) {
            socket.emit('error_message', `牌數不足！只有 ${tempDeck.length} 張牌，但有 ${room.players.length} 位玩家。`);
            return;
        }

        if (config) room.deckConfig = config;

        room.players.forEach(p => {
            p.inGame = true;
            p.hand = [];
        });
        
        room.status = 'PLAYING';
        room.deck = shuffle(tempDeck);
        room.winners = [];
        room.tableCards = null;
        room.passCount = 0;
        
        let pIdx = 0;
        while(room.deck.length > 0) {
            room.players[pIdx].hand.push(room.deck.pop());
            pIdx = (pIdx + 1) % room.players.length;
        }

        const randIdx = Math.floor(Math.random() * room.players.length);
        room.turnIndex = randIdx;

        io.emit('room_list_update', getPublicRoomList());

        io.to(roomId).emit('game_started', {
            currentPlayer: room.players[room.turnIndex].id
        });

        broadcastGameState(room);
    });

    socket.on('reset_game', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        room.status = 'WAITING';
        room.winners = [];
        room.tableCards = null;
        room.passCount = 0;
        room.deck = [];
        
        // 重置遊戲時，也要清空所有斷線計時器 (大家都得回來準備)
        for (const user in room.disconnectTimers) {
            clearTimeout(room.disconnectTimers[user]);
        }
        room.disconnectTimers = {};

        room.players.forEach(p => {
            p.hand = [];
            p.isReady = false;
        });

        io.emit('room_list_update', getPublicRoomList());
        
        io.to(roomId).emit('update_room', {
            players: room.players.map(p => ({ id: p.id, name: p.name, isReady: p.isReady })),
            status: room.status,
            config: room.deckConfig
        });
        
        io.to(roomId).emit('game_reset');
    });

    socket.on('play_cards', ({ roomId, cardIds }) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players[room.turnIndex];
        
        if (player.id !== socket.id) return;

        const selectedCards = player.hand.filter(c => cardIds.includes(c.id));
        if (selectedCards.length !== cardIds.length) return;

        const handRes = resolveHandType(selectedCards);
        if (!handRes.valid) {
            socket.emit('error_message', handRes.msg);
            return;
        }

        const moveVal = validateMove(handRes, room.tableCards);
        if (!moveVal.valid) {
            socket.emit('error_message', moveVal.msg);
            return;
        }

        player.hand = player.hand.filter(c => !cardIds.includes(c.id));
        room.tableCards = {
            type: handRes.type,
            count: handRes.count,
            displayCards: selectedCards,
            ownerId: player.id
        };
        room.passCount = 0;

        if (player.hand.length === 0) {
            if (!room.winners.includes(player.id)) {
                room.winners.push(player.id);
                io.to(roomId).emit('toast', `🎉 恭喜 ${player.name} 出完牌了！(第 ${room.winners.length} 名)`);
            }
        }

        if (checkGameOver(room)) {
            broadcastGameState(room);
            io.emit('room_list_update', getPublicRoomList()); 
            return;
        }

        nextTurn(room);
        broadcastGameState(room);
    });

    socket.on('pass_turn', (roomId) => {
        const room = rooms[roomId];
        if (!room) return;
        if (room.players[room.turnIndex].id !== socket.id) return;
        if (!room.tableCards) {
             socket.emit('error_message', "起始回合必須出牌");
             return;
        }

        room.passCount++;
        
        const playersWithCards = room.players.filter(p => p.inGame && p.hand.length > 0).length;
        const ownerId = room.tableCards.ownerId;
        const owner = room.players.find(p => p.id === ownerId);
        
        let passThreshold = playersWithCards;
        if (owner && owner.hand.length > 0) {
            passThreshold = playersWithCards - 1;
        }
        
        passThreshold = Math.max(1, passThreshold);

        if (room.passCount >= passThreshold) {
            const ownerIndex = room.players.findIndex(p => p.id === ownerId);

            room.tableCards = null; 
            room.passCount = 0;

            if (owner && owner.hand.length > 0) {
                room.turnIndex = ownerIndex;
                io.to(roomId).emit('toast', `無人能擋！${owner.name} 繼續出牌`);
            } else {
                room.turnIndex = ownerIndex;
                nextTurn(room); 
                io.to(roomId).emit('toast', `上一家已獲勝！順位延續`);
            }
        } else {
            nextTurn(room);
        }

        if (checkGameOver(room)) {
            broadcastGameState(room);
            io.emit('room_list_update', getPublicRoomList()); 
            return;
        }

        broadcastGameState(room);
    });

    // [修改] 斷線處理：加入緩衝保護
    socket.on('disconnect', () => {
        const roomId = socket.currentRoomId;
        const room = rooms[roomId];
        
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (!player) return;

            // 如果遊戲正在進行，給予 30 秒的重連寬限期
            if (room.status === 'PLAYING') {
                console.log(`玩家 ${player.name} 斷線，保留資料 30 秒...`);
                
                // 設定一個計時器，30秒後如果還沒連回來，才真的刪除
                room.disconnectTimers[player.username] = setTimeout(() => {
                    console.log(`玩家 ${player.name} 重連逾時，移除。`);
                    handlePlayerRemove(socket.id, roomId);
                    delete room.disconnectTimers[player.username];
                }, 30000); // 30秒

            } else {
                // 如果是大廳等待中，直接移除 (不用保留)
                handlePlayerRemove(socket.id, roomId);
            }
        }
    });
});

function broadcastGameState(room) {
    const playersPublicInfo = room.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.hand.length,
        isWinner: room.winners.includes(p.id),
        rank: room.winners.indexOf(p.id) + 1,
        inGame: p.inGame
    }));

    const publicData = {
        tableCards: room.tableCards ? {
            type: room.tableCards.type, 
            emoji: ANIMALS[room.tableCards.type].emoji,
            count: room.tableCards.count,
            cards: room.tableCards.displayCards
        } : null,
        currentPlayer: room.players[room.turnIndex].id,
        playersInfo: playersPublicInfo,
        winners: room.winners,
        status: room.status
    };

    io.to(room.id).emit('game_update', publicData);
    
    room.players.forEach(p => {
        io.to(p.id).emit('receive_hand', p.hand);
    });
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));