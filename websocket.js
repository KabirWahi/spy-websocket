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
    // If a party code is provided, check if it exists
    if (!parties.has(partyCode)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Party not found' }));
      ws.close();
      return;
    }

    // Check for duplicate names in the existing party
    const party = parties.get(partyCode);
    if (party.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
      ws.send(JSON.stringify({ type: 'error', message: 'A player with this name already exists in the lobby' }));
      ws.close();
      return;
    }
  } else {
    // If no party code is provided, generate a new unique one
    partyCode = generateUniquePartyCode();
    parties.set(partyCode, []);
  }

  const party = parties.get(partyCode);

  if (party.length >= 8) {
    ws.send(JSON.stringify({ type: 'error', message: 'Party is full' }));
    ws.close();
    return;
  }

  const playerInfo = { ws, name: playerName };
  party.push(playerInfo);

  console.log(`Player ${playerName} joined lobby ${partyCode}. Total players: ${party.length}`);

  // Send updated player list to all clients in the party
  const playerList = party.map(p => p.name);
  broadcastToParty(partyCode, { 
    type: 'playerList', 
    players: playerList,
    partyCode: partyCode
  });

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    broadcastToParty(partyCode, data);
  });

  ws.on('close', () => {
    const index = party.findIndex(p => p.ws === ws);
    if (index !== -1) {
      party.splice(index, 1);
    }
    console.log(`Player ${playerName} left lobby ${partyCode}. Remaining players: ${party.length}`);
    if (party.length === 0) {
      parties.delete(partyCode);
      console.log(`Lobby ${partyCode} has been closed`);
    } else {
      const updatedPlayerList = party.map(p => p.name);
      broadcastToParty(partyCode, { 
        type: 'playerList', 
        players: updatedPlayerList,
        partyCode: partyCode
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
});