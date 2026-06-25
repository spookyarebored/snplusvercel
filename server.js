const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/validate', (req, res) => {
    const { sessionId, valid } = req.query;
    if (sessionId) {
        sessions.set(sessionId, { validated: valid === 'true' });
    }
    res.json({ success: true });
});

app.get('/status/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    res.json(session ? session : { validated: null });
});

app.listen(PORT, () => {
    console.log(`Serveur actif sur http://localhost:${PORT}`);
});