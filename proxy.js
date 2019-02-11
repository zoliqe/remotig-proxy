//const express = require('express');
//const app = express();
//app.use(express.static('static'));
//app.listen(8080);

const httpPort = 80
const httpsPort = 443

console.log('Starting')
// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet')
const app = express()

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/privkey.pem', 'utf8')
const certificate = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/cert.pem', 'utf8')
const ca = fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/chain.pem', 'utf8')

const credentials = {
		key: privateKey,
		cert: certificate,
		ca: ca
}

const tokens = require('./tokens')
const managedRigs = Object.keys(tokens)
const rigs = {}
console.log('Managed rigs:', managedRigs)

app.use(helmet())
// redirect HTTP request to HTTPS
app.use(function(req, res, next) {
	if (!req.secure) {
		return res.redirect(['https://', req.get('Host'), req.url].join(''))
	}
	next()
})

app.use('/smartceiver', express.static('smartceiver'))
app.use('/webrtc', express.static('webrtc'))
app.use('/remotig-pwa', express.static('remotig'))

const loginHtml = fs.readFileSync('login.html', 'utf8')
const loginHtmlFor = (rig) => loginHtml.replace('RIG_PLACEHOLDER', rig)

const rigRouter = express.Router()
rigRouter.get('/', (req, res, next) => {
	res.send('.-. . -- --- - .. --.   BY   --- -- ....- .- .-')
})
rigRouter.get('/:rigId', (req, res, next) => {
	res.send(loginHtmlFor(req.params.rigId))
})
rigRouter.get('/:rigId/status', (req, res, next) => {
	res.send(rigs[req.params.rigId] || {})
})
app.use('/remotig', rigRouter)

// Starting http & https servers
const httpServer = http.createServer(app)
const httpsServer = https.createServer(credentials, app)

httpServer.listen(httpPort, () => console.log(`HTTP Server running on port ${httpPort}`))
httpsServer.listen(httpsPort, () => console.log(`HTTPS Server running on port ${httpsPort}`))

///////////////////////////////////////////////////////////////////////////////////////////////////
var socketIO = require('socket.io');

var io = socketIO.listen(httpsServer);
io.sockets.on('connection', function(socket) {

	// convenience function to log server messages on the client
	function log() {
		console.log(...arguments)
		var array = ['proxy:'];
		array.push.apply(array, arguments);
		socket.emit('log', array);
	}

	socket.on('message', message => {
		log(`Client ${socket.id}: ${JSON.stringify(message)}`)
		const rigs = Object.keys(socket.rooms)
		rigs.forEach(rig => socket.to(rig).emit('message', message))
	})

	socket.on('open', rig => {
		log('Received request to open rig ' + rig)

		var clientsInStream = io.sockets.adapter.rooms[rig]
		var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0
		log('Rig ' + rig + ' now has ' + numClients + ' operators')

		if (numClients === 0 && managedRigs.includes(rig)) {
			socket.join(rig)
			rigs[rig] = {id: socket.id}
			log('Client ' + socket.id + ' opened rig ' + rig)
			socket.emit('opened', rig, socket.id)
		}
	})

	socket.on('join', kredence => {
		if (!kredence || !kredence.rig || !kredence.token) return;
		const rig = kredence.rig
		const op = whoIn(kredence.token)
		log('Received request to join:', { rig: rig, op: op })
		
		if (!rigs[rig]) { // rig not found
			log('empty', rig)
			socket.emit('empty', rig)
			return
		}
		if (!tokens[rig].includes(kredence.token.toUpperCase())) { // unauthorized
			log('full', kredence)
			socket.emit('full', rig)
			return
		}
		log('Authored', op)

		var clientsInStream = io.sockets.adapter.rooms[rig]
		var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0
		log('Rig ' + rig + ' now has ' + numClients + ' operators')

		if (numClients === 1 && !rigs[rig].op) {
			log('Client ID ' + socket.id + ' joined rig ' + rig)
			io.sockets.in(rig).emit('join', rig)
			socket.join(rig)
			rigs[rig].op = op
			rigs[rig].opId = socket.id
			socket.emit('joined', rig, socket.id)
			io.sockets.in(rig).emit('ready')
		} else if (numClients === 0) {
			socket.emit('empty', rig)
		} else { // max one clients
			if (rigs[rig].op === op) {
				// TODO disc others (when op === rigs[rig].op), restart session

			}
			socket.emit('full', rig)
		}
	})

	socket.on('close', rig => {
		console.log('Closing', rig)
		delete rigs[rig]
	})
})

function whoIn(token) {
	if (!token) return null
	const delPos = token.indexOf('-')
	return delPos > 3 ? token.substring(0, delPos).toUpperCase() : null
}

