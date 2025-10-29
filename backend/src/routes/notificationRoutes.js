const express = require('express');
const { EventEmitter } = require('events');
const router = express.Router();
const legacyBus = require('../utils/eventBus');

const bus = new EventEmitter();
const connections = new Set();

const emitTxEvent = (payload) => {
  bus.emit('tx', payload);
};

legacyBus.on('check:added', (event) => {
  bus.emit('legacy', { type: 'check:added', data: event.data || event });
});

legacyBus.on('minute:summary', (event) => {
  bus.emit('legacy', { type: 'minute:summary', data: event.data || event });
});

legacyBus.on('error:occurred', (event) => {
  bus.emit('legacy', { type: 'error:occurred', data: event.data || event });
});

router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write('event: ready\n');
  res.write('data: {}\n\n');

  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  const onTx = (payload) => {
    res.write('event: tx\n');
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const onLegacy = (payload) => {
    res.write('event: legacy\n');
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  bus.on('tx', onTx);
  bus.on('legacy', onLegacy);

  const connection = { res, onTx, onLegacy, heartbeat };
  connections.add(connection);
  console.log(`[sse] connection opened (active=${connections.size})`);

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('tx', onTx);
    bus.off('legacy', onLegacy);
    connections.delete(connection);
    console.log(`[sse] connection closed (active=${connections.size})`);
  });
});

router.get('/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      activeConnections: connections.size,
      timestamp: new Date().toISOString()
    }
  });
});

router.emitTxEvent = emitTxEvent;
router.getActiveConnections = () => connections.size;

module.exports = router;
