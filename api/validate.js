const sessions = new Map();

module.exports = (req, res) => {
  const { sessionId, valid } = req.query;

  if (req.url.includes('/status/')) {
    const id = req.url.split('/status/')[1];
    const session = sessions.get(id);
    return res.json(session || { validated: null });
  }

  if (sessionId) {
    sessions.set(sessionId, { validated: valid === 'true' });
  }
  res.json({ success: true });
};
