const clients = new Set();

function initSSE(req, res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write('event: ping\ndata: {}\n\n');

  const keepAlive = setInterval(() => {
    res.write(':keep-alive\n\n');
  }, 25000);

  clients.add(res);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const res of clients) {
    res.write(data);
  }
}

module.exports = { initSSE, broadcast };
