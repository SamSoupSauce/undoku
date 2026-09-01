const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { createApiRouter } = require('./routes/api');

function createApp(storage) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Mount REST API router
  app.use('/api', createApiRouter(storage));

  // Serve static Wiki if wiki/dist exists
  const wikiDistPath = path.resolve(__dirname, '../../wiki/dist');
  if (fs.existsSync(wikiDistPath)) {
    app.use('/wiki', express.static(wikiDistPath));
  }

  // Serve static assets from web/ (engine.js, manifest, icons, sw.js, etc.)
  const webDir = path.resolve(__dirname, '../../web');
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir));
  }

  // Serve root Web Canvas Sudoku Engine
  const webIndexPath = path.resolve(__dirname, '../../web/index.html');
  app.get('/', (req, res) => {
    if (fs.existsSync(webIndexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(webIndexPath);
    } else {
      res.send('<h1>Undoku Server</h1>');
    }
  });

  return app;
}

module.exports = {
  createApp
};
