const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'Cyberspace Dashboard',
  description: 'Cyberspace Intelligence Dashboard server',
  script: path.join(__dirname, 'server.js'),
  nodeOptions: [],
  wait: 2,
  grow: 0.5,
  maxRestarts: 3,
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service already installed.');
});

svc.on('start', () => {
  console.log('Service started. Check Services (services.msc) to confirm.');
});

svc.install();
