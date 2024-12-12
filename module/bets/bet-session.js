import { appConfig } from "../../utilities/app-config.js";
import { updateBalanceFromAccount } from "../../utilities/common-function.js";
import { setCache, deleteCache } from "../../utilities/redis-connection.js";
import { insertSettlement } from "./bet-db.js";

export const createGameData = (matchId, betAmount) => {
    const gameData = {
        matchId: matchId,
        roundId: `${Date.now()}_0`,
        bank: 0,
        multiplier: 0,
        bet: betAmount,
        green: [],
        orange: [],
        purple: [],
        multipliers: {
            green: [1.6, 5.0, 10.5],
            orange: [2.5, 8.0, 16.5, 28.5, 45.0],
            purple: [4.0, 13.0, 28.5, 53.0, 88.0, 137.5, 205.0]
        },
        bonusMultipliers: [100, 200, 300, 400, 500],
        result: '',
        darkGem: false,
        stone: false
    }
    return gameData;
}


export const calculatePayout = (section, game) => {
    if (section === "green" && game.green.length > game.multipliers.green.length) return 7.5;
    if (section === "orange" && game.orange.length > game.multipliers.orange.length) return 21.0;
    if (section === "purple" && game.purple.length > game.multipliers.purple.length) {
        const bonusMultiplier = game.bonusMultipliers[Math.floor(Math.random() * game.bonusMultipliers.length)];
        return bonusMultiplier;
    }
    return 0;
}

const dynamicSubtraction = (arr) => {
    return arr.length > 1 ? arr[arr.length - 1] - arr[arr.length - 2] : arr[0] || null;
}

export const spinGem = async (game, playerDetails, socket, io) => {
    const [roundPrefix, roundNumber] = game.roundId.split('_');
    game.roundId = `${roundPrefix}_${Number(roundNumber) + 1}`;

    const userIP = socket.handshake.headers?.['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
    const playerId = playerDetails.id.split(':')[1];

    const updateBalanceData = {
        id: game.roundId,
        bet_amount: game.bet,
        socket_id: playerDetails.socketId,
        user_id: playerId,
        ip: userIP
    };

    const transaction = await updateBalanceFromAccount(updateBalanceData, "DEBIT", playerDetails);
    if (!transaction) return { error: 'Bet Cancelled by Upstream'};

    playerDetails.balance = (playerDetails.balance - game.bet).toFixed(2);
    await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
    socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });

    game.txn_id = transaction.txn_id;
    game.darkGem = game.stone = false;
    game.result = '';
    let currentMultiplier = 0;
    const spinResult = Math.random();
    const sectionData = { green: game.green, orange: game.orange, purple: game.purple };
    if (spinResult > 0.5) {
        const section = spinResult < 0.7 ? "green" : spinResult < 0.9 ? "orange" : "purple";
        game.result = section;

        const sectionFilled = game[section].length === game.multipliers[section].length;
        const multiplier = sectionFilled ? game[section][game[section].length - 1] : game.multipliers[section][game[section].length];

        game[section].push(multiplier);
        sectionData[section] = JSON.parse(JSON.stringify(game[section]));
        currentMultiplier = dynamicSubtraction(game[section]);

        const payout = calculatePayout(section, game);
        if (payout) {
            currentMultiplier = payout;
            game[section].pop();
            if (section == 'purple') {
                game.bank -= game.bet * game[section][game[section].length - 1];
                game[section] = [];
            }

            const winAmount = Math.min(game.bet * currentMultiplier, appConfig.maxCashoutAmount).toFixed(2);
            setTimeout(()=> {
                socket.emit('payout', { matchId: game.matchId, payout: (winAmount - game.bet).toFixed(2)});
                socket.emit('spin_result', {
                    matchId: game.matchId,
                    roundId: game.roundId,
                    bank: game.bank,
                    sections: { green: game.green, orange: game.orange, purple: game.purple },
                    result: game.result,
                    darkGem: game.darkGem,
                    stone: game.stone,
                    multiplier: game.multiplier
                });
            }, 1000);
            const creditData = { id: game.roundId, winning_amount: winAmount, socket_id: playerDetails.socketId, txn_id: game.txn_id, user_id: playerId, ip: userIP };
            const creditTransaction = await updateBalanceFromAccount(creditData, "CREDIT", playerDetails);

            if (!creditTransaction) console.error(`Credit failed for user: ${playerDetails.userId} for round ${game.roundId}`);
            playerDetails.balance = (Number(playerDetails.balance) + Number(winAmount)).toFixed(2);

            await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
            socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });
        }
    } else if (spinResult > 0.3) {
        game.darkGem = true;
        game.bank -= game.bet;
    } else {
        ["green", "orange", "purple"].forEach(section => {
            if (game[section].length) {
                currentMultiplier -= game[section].at(-1);
                game[section].pop();
                sectionData[section] = JSON.parse(JSON.stringify(game[section]));
            }
        });
        game.stone = true;
    }

    //Insert Settlement into Database
    await insertSettlement({
        roundId: game.roundId,
        matchId: game.matchId,
        userId: playerDetails.userId,
        operatorId: playerDetails.operatorId,
        bet_amount: Number(game.bet),
        max_mult: currentMultiplier,
        status: currentMultiplier > 0 ? 'WIN' : 'LOSS'
    });

    const isAllSectionsEmpty = [game.green, game.orange, game.purple].every(arr => arr.length === 0);
    if (isAllSectionsEmpty) {
        await deleteCache(`GM:${playerDetails.id}`);
        game.bank = game.multiplier = 0;
        game.matchId = '';
    } else {
        game.multiplier = ["green", "orange", "purple"].reduce((sum, section) => sum + (game[section].at(-1) || 0), 0);
        game.bank = game.multiplier * game.bet;
        await setCache(`GM:${playerDetails.id}`, JSON.stringify(game), 3600);
    };

    io.emit('bets', {
        betId: game.roundId,
        userId: `${playerDetails.userId.slice(0, 2)}**${playerDetails.userId.slice(-2)}`,
        payout: currentMultiplier,
        Profit: Number(game.bet * currentMultiplier - game.bet).toFixed(2),
        created_at: new Date()
    });

    return {
        matchId: game.matchId,
        roundId: game.roundId,
        bank: game.bank,
        sections: sectionData,
        result: game.result,
        darkGem: game.darkGem,
        stone: game.stone,
        multiplier: game.multiplier
    };
}


export const cashOutAmount = async (game, playerDetails, socket) => {
    const winAmount = Math.min(game.bank, appConfig.maxCashoutAmount).toFixed(2);
    const userIP = socket.handshake.headers?.['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;
    const updateBalanceData = {
        id: game.roundId,
        winning_amount: winAmount,
        socket_id: playerDetails.socketId,
        txn_id: game.txn_id,
        user_id: playerDetails.id.split(':')[1],
        ip: userIP
    };
    const isTransactionSuccessful = await updateBalanceFromAccount(updateBalanceData, "CREDIT", playerDetails);
    if (!isTransactionSuccessful) console.error(`Credit failed for user: ${playerDetails.userId} for round ${game.roundId}`);
    playerDetails.balance = (Number(playerDetails.balance) + Number(winAmount)).toFixed(2);
    await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
    socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });
    await deleteCache(`GM:${playerDetails.id}`);
    return { payout: winAmount, matchId: '' };
}

export const cashOutPartial = async (game, playerDetails, socket) => {
    let partialPayout = 0;
    ["green", "orange", "purple"].forEach(section => {
        if (game[section].length) {
            partialPayout += dynamicSubtraction(game[section]);
            game[section].pop();
        }
    });
    const winAmount = Number(game.bet) * partialPayout;
    const finalAmount = Math.min(winAmount, appConfig.maxCashoutAmount).toFixed(2);
    game.multiplier = ["green", "orange", "purple"].reduce((sum, section) => sum + (game[section].at(-1) || 0), 0);
    game.bank -= finalAmount;
    await setCache(`GM:${playerDetails.id}`, JSON.stringify(game), 3600);
    const userIP = socket.handshake.headers?.['x-forwarded-for']?.split(',')[0].trim() || socket.handshake.address;

    const updateBalanceData = {
        id: game.roundId,
        winning_amount: finalAmount,
        socket_id: playerDetails.socketId,
        txn_id: game.txn_id,
        user_id: playerDetails.id.split(':')[1],
        ip: userIP
    };
    const isTransactionSuccessful = await updateBalanceFromAccount(updateBalanceData, "CREDIT", playerDetails);
    if (!isTransactionSuccessful) console.error(`Credit failed for user: ${playerDetails.userId} for round ${game.roundId}`);
    playerDetails.balance = (Number(playerDetails.balance) + Number(finalAmount)).toFixed(2);
    await setCache(`PL:${playerDetails.socketId}`, JSON.stringify(playerDetails));
    socket.emit('info', { user_id: playerDetails.userId, operator_id: playerDetails.operatorId, balance: playerDetails.balance });
    if (game.bank <= 0) { game.matchId = ''; deleteCache(`GM:${playerDetails.id}`) };
    return {
        payout: finalAmount,
        matchId: game.matchId,
        roundId: game.roundId,
        bank: game.bank,
        sections: { green: game.green, orange: game.orange, purple: game.purple },
        multiplier: game.multiplier
    };
}
