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

function logServerState() {
  console.log('\n--- Server State ---');
  console.log(`Active Lobbies: ${parties.size}`);
  parties.forEach((party, code) => {
    console.log(`Lobby ${code}: ${party.size} player(s)`);
  });
  console.log('--------------------\n');
}

wss.on('connection', (ws, req) => {
  const parameters = url.parse(req.url, true).query;
  let partyCode = parameters.partyCode;

  if (partyCode) {
    // If a party code is provided, check if it exists
    if (!parties.has(partyCode)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Party not found' }));
      ws.close();
      return;
    }
  } else {
    // If no party code is provided, generate a new unique one
    partyCode = generateUniquePartyCode();
  }

  if (!parties.has(partyCode)) {
    parties.set(partyCode, new Set());
  }

  const party = parties.get(partyCode);

  if (party.size >= 8) {
    ws.send(JSON.stringify({ type: 'error', message: 'Party is full' }));
    ws.close();
    return;
  }

  party.add(ws);
  ws.partyCode = partyCode;

  console.log(`Player joined lobby ${partyCode}. Total players: ${party.size}`);
  logServerState();

  ws.send(JSON.stringify({ type: 'connected', partyCode, playerCount: party.size }));

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    party.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });

  ws.on('close', () => {
    party.delete(ws);
    console.log(`Player left lobby ${partyCode}. Remaining players: ${party.size}`);
    if (party.size === 0) {
      parties.delete(partyCode);
      console.log(`Lobby ${partyCode} has been closed`);
    } else {
      party.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'playerLeft', playerCount: party.size }));
        }
      });
    }
    logServerState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on port ${PORT}`);
  logServerState();
});