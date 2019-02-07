//const express = require('express');
//const app = express();
//app.use(express.static('static'));
//app.listen(8080);

const audioPort = 8073
const controlPort = 8088
const httpPort = 80
const httpsPort = 443

console.log('Starting')
// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet')
const proxy = require('http-proxy-middleware')

const app = express()
const audioApp = express()

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/privkey.pem', 'utf8')
const certificate = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/cert.pem', 'utf8')
const ca = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/chain.pem', 'utf8')

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
}

app.use(helmet())
audioApp.use(helmet())

app.use(function(req, res, next) {
  if (!req.secure) {
    return res.redirect(['https://', req.get('Host'), req.url].join(''))
  }
  next()
})

const loginHtml = fs.readFileSync('login.html', 'utf8')
const loginHtmlFor = (rig) => loginHtml.replace('RIG_PLACEHOLDER', rig)

const setupRoutes = ({rig, host} = {rig: null, host: null}) => {
if (!rig || !host) return
console.log(`Configuring routes for ${rig}@${host}...`)

app.use(`/remotig/${rig}`, (req, res) => res.send(loginHtmlFor(rig)))

const rigRoute = (sub) => `/remotig-${rig}/${sub}`
const rigPathRule = (sub) => {
	const rule = {}
	rule[`^/remotig-${rig}/${sub}`] = ''
	return rule
}
// subscribe to http-proxy's error event
const onError = (err, req, res) => {
//	res.writeHead(500, { 'Content-Type': 'text/plain' })
//	res.end('Something went wrong.')
	console.log('Proxy error:', err)
}

app.use(proxy(rigRoute('control'), {
	target: `http://${host}:${controlPort}/control`,
	pathRewrite: rigPathRule('control'),
	changeOrigin: true,
	ws: true,
	loglovel: 'debug',
	onError: onError
}))
app.use(proxy(rigRoute('status'), {
	target: `http://${host}:${controlPort}/status`,
	pathRewrite: rigPathRule('status'),
	changeOrigin: true,
	ws: false,
	loglovel: 'debug',
	onError: onError
}))
audioApp.use(proxy(rigRoute('audio'), {
	target: `http://${host}:${audioPort}`,
	pathRewrite: rigPathRule('audio'),
	changeOrigin: true,
	ws: true,
	loglovel: 'debug',
	onError: onError
}))
}

setupRoutes({rig: 'om4aa-k2', host: '192.168.100.230'})
setupRoutes({rig: 'om3rrc-butorky', host: '10.0.0.2'})
setupRoutes({rig: 'om3rrc-rozkvet', host: '10.0.0.5'})

app.use('/smartceiver', express.static('smartceiver'))
app.use('/webrtc', express.static('webrtc'))

app.use((req, res) => {
    res.send('.-. . -- --- - .. --.')
})

// Starting http & https servers
const httpServer = http.createServer(app)
const httpsServer = https.createServer(credentials, app)
const audioServer = https.createServer(credentials, audioApp)

httpServer.listen(httpPort, () => console.log(`HTTP Server running on port ${httpPort}`))
httpsServer.listen(httpsPort, () => console.log(`HTTPS Server running on port ${httpsPort}`))
audioServer.listen(audioPort, () => console.log(`Audio WSS server running on port ${audioPort}`))

///////////////////////////////////////////////////////////////////////////////////////////////////
var socketIO = require('socket.io');

var io = socketIO.listen(httpsServer);
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', function(message) {
    log('Client said: ', message);
    // for a real app, would be room-only (not broadcast)
//    socket.broadcast.emit('message', message);
		const streams = Object.keys(socket.rooms)
		streams.forEach(stream => socket.to(stream).emit('message', message))
  });

  socket.on('create', function(stream) {
    log('Received request to create stream ' + stream);

    var clientsInStream = io.sockets.adapter.rooms[stream];
    var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0;
    log('Stream ' + stream + ' now has ' + numClients + ' listeners');

    if (numClients === 0) {
      socket.join(stream);
      log('Client ID ' + socket.id + ' created stream ' + stream);
      socket.emit('created', stream, socket.id);
    }
  });

  socket.on('join', function(stream) {
    log('Received request to join stream ' + stream);

    var clientsInStream = io.sockets.adapter.rooms[stream];
    var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0;
    log('Stream ' + stream + ' now has ' + numClients + ' listeners');

    if (numClients === 1) {
      log('Client ID ' + socket.id + ' joined stream ' + stream);
      io.sockets.in(stream).emit('join', stream);
      socket.join(stream);
      socket.emit('joined', stream, socket.id);
      io.sockets.in(stream).emit('ready');
    } else if (numClients === 0) {
		socket.emit('empty', stream)
    } else { // max one clients
      socket.emit('full', stream);
    }
  });

  socket.on('bye', function(){
    console.log('received bye');
  });

});
