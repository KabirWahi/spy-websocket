const WebSocket = require('ws');
const http = require('http');
const url = require('url');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const parties = new Map();

function generateUniquePartyCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result;
  do {
    result = '';
    for (let i = 0; i < 4; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
  } while (parties.has(result));
  return result;
}

function broadcastToParty(partyCode, message) {
  const party = parties.get(partyCode);
  if (party) {
    party.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }
}

function assignNewHost(partyCode) {
  const party = parties.get(partyCode);
  if (party && party.length > 0) {
    party[0].isHost = true;
    broadcastToParty(partyCode, { 
      type: 'newHost', 
      hostName: party[0].name 
    });
  }
}

wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true).query;
  let partyCode = parameters.partyCode;
  const playerName = parameters.playerName;

  if (!playerName) {
    ws.send(JSON.stringify({ type: 'error', message: 'Player name is required' }));
    ws.close();
    return;
  }

  if (partyCode) {
    if (!parties.has(partyCode)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Party not found' }));
      ws.close();
      return;
    }

    const party = parties.get(partyCode);
    if (party.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
      ws.send(JSON.stringify({ type: 'error', message: 'A player with this name already exists in the lobby' }));
      ws.close();
      return;
    }
  } else {
    partyCode = generateUniquePartyCode();
    parties.set(partyCode, []);
  }

  const party = parties.get(partyCode);

  if (party.length >= 8) {
    ws.send(JSON.stringify({ type: 'error', message: 'Party is full' }));
    ws.close();
    return;
  }

  const playerInfo = { ws, name: playerName, isHost: party.length === 0 };
  party.push(playerInfo);

  console.log(`Player ${playerName} joined lobby ${partyCode}. Total players: ${party.length}`);

  const playerList = party.map(p => ({ name: p.name, isHost: p.isHost }));
  broadcastToParty(partyCode, { 
    type: 'playerList', 
    players: playerList,
    partyCode: partyCode,
    selectedDeck: party.selectedDeck,
    selectedMode: party.selectedMode
  });

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    
    if ((data.type === 'updateDeck' || data.type === 'updateMode') && playerInfo.isHost) {
      if (data.type === 'updateDeck') {
        party.selectedDeck = data.deck;
      } else if (data.type === 'updateMode') {
        party.selectedMode = data.mode;
      }
      broadcastToParty(partyCode, { 
        type: 'playerList', 
        players: party.map(p => ({ name: p.name, isHost: p.isHost })),
        partyCode: partyCode,
        selectedDeck: party.selectedDeck,
        selectedMode: party.selectedMode
      });
    } else {
      broadcastToParty(partyCode, data);
    }
  });

  ws.on('close', () => {
    const index = party.findIndex(p => p.ws === ws);
    if (index !== -1) {
      const wasHost = party[index].isHost;
      party.splice(index, 1);
      console.log(`Player ${playerName} left lobby ${partyCode}. Remaining players: ${party.length}`);
      
      if (party.length === 0) {
        parties.delete(partyCode);
        console.log(`Lobby ${partyCode} has been closed`);
      } else {
        if (wasHost) {
          assignNewHost(partyCode);
        }
        const updatedPlayerList = party.map(p => ({ name: p.name, isHost: p.isHost }));
        broadcastToParty(partyCode, { 
          type: 'playerList', 
          players: updatedPlayerList,
          partyCode: partyCode,
          selectedDeck: party.selectedDeck,
          selectedMode: party.selectedMode
        });
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});