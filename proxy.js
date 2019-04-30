//const express = require('express');
//const app = express();
//app.use(express.static('static'));
//app.listen(8080);

const httpPort = 80
const httpsPort = 443
const tickSeconds = 10
const rigTtlMax = 60000

console.log('Starting')
// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet')
const app = express()

// Certificate
const credentials = {
	key: fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/privkey.pem', 'utf8'),
	cert: fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/cert.pem', 'utf8'),
	ca: fs.readFileSync('/etc/letsencrypt/live/om4aa.ddns.net/chain.pem', 'utf8')
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

const loginHtml = fs.readFileSync('login.html', 'utf8')
const loginHtmlFor = (rig) => loginHtml.replace('RIG_PLACEHOLDER', rig)

app.use('/smartceiver', express.static('smartceiver'))
//app.use('/webrtc', express.static('webrtc'))
app.use('/remotig-app', express.static('remotig'))
app.use('/.well-known', express.static('certbot/.well-known')) // certbot

const rigRouter = express.Router()
rigRouter.get('/', (req, res, next) => {
	res.send('<html><body><h1>.-. . -- --- - .. --.</h1><br/>BY<br/><h2>--- -- ....- .- .-</h2></body></html>')
})
rigRouter.get('/app', (req, res, next) => res.redirect('https://om4aa.ddns.net/remotig-app'))
rigRouter.get('/:rig', (req, res, next) => {
	res.send(loginHtmlFor(req.params.rig))
})
rigRouter.get('/:rig/status', (req, res, next) => {
	const rig = req.params.rig
	const {op, id, tick, rtt, userSocket} = (rigs[rig] || {})
	if (tick && Date.now() - tick < rigTtlMax) {
		res.send({op: op, id: id, rtt: rtt})
		return;
	}
	userSocket && leaveRig(rig, userSocket)
	rigs[rig] && delete rigs[rig]
	res.send({op: null, id: null, rtt: null})
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
		var clientsCount = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0
		if (clientsCount) {
			log('Rig ' + rig + ' now has ' + clientsCount + ' sockets opened, disconnecting them')
			socket.to(rig).emit('bye')
			rigs[rig] && leaveRig(rig, rigs[rig].userSocket)
		}
		rigs[rig] && delete rigs[rig]
		if (managedRigs.includes(rig)) {
			socket.join(rig)
			rigs[rig] = {id: socket.id, socket: socket, tick: Date.now()}
			log('Client ' + socket.id + ' opened rig ' + rig)
			socket.emit('opened', rig, socket.id)
		}
	})

	socket.on('join', kredence => {
		if (!kredence || !kredence.rig || !kredence.token) return;
		const rig = kredence.rig
		const op = whoIn(kredence.token)
		log('Join request:', { rig: rig, op: op })
		
		if (!rigs[rig]) { // rig not found
			log('empty', rig)
			socket.emit('empty', rig)
			return
		}
		if (!tokens[rig].includes(kredence.token.toUpperCase())) { // unauthorized
			log('full', rig)
			socket.emit('full', rig)
			return
		}
		log('Authored', op)

		// var clientsInStream = io.sockets.adapter.rooms[rig]
		// var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0
		if (!rigs[rig]) {
			log(`Rig ${rig} not opened.`)
			socket.emit('empty')
			return
		}

		let currentOp = rigs[rig].op
		if (currentOp === op) {
			leaveRig(rig, rigs[rig].userSocket)
			currentOp = null
		}
		if (!currentOp) {
			joinRig(rig, socket, op, log)
		} else { // max one op
			log(`Rig ${rig} is now operated by ${currentOp}.`)
			socket.emit('full', rig)
		}
	})
	socket.on('leave', kredence => {
		if (!kredence || !kredence.rig || !kredence.token) return;
		// if (!tokens[kredence.rig].includes(kredence.token.toUpperCase())) return; // unauthorized
		
		// const op = whoIn(kredence.token)
		leaveRig(kredence.rig, socket)
	})

	socket.on('logout', rig => {
		console.log('Logout all from', rig)
		if (!rigs[rig] || rigs[rig].id !== socket.id) return;
		leaveRig(rig, rigs[rig].userSocket)
	})
	socket.on('close', rig => {
		console.log('Closing', rig)
		if (!rigs[rig] || rigs[rig].id !== socket.id) return;
		leaveRig(rig, rigs[rig].userSocket)
		delete rigs[rig]
	})

	socket.on('po', params => {
		// console.log('pong:', params)
		if (!params || !rigs[params.rig]) return;
		const rig = rigs[params.rig]
		if (socket.id !== rig.id) return;

		rig.tick = Date.now()
		rig.rtt = rig.tick - Number(params.time)
	})
	socket.on('ping', data => socket.emit('pong', data))
})


setInterval(tick, tickSeconds * 1000)

function tick() {
	Object.keys(rigs).forEach(ping)
}

function ping(rig) {
	const p = {rig: rig, time: Date.now()}
	// console.log('ping:', p)
	rigs[rig] && rigs[rig].socket.emit('pi', p)
}

function joinRig(rig, socket, op, log) {
	io.sockets.in(rig).emit('join', op)
	socket.join(rig)
	rigs[rig].op = op
	rigs[rig].userSocket = socket
	log(`Operator ${op} (Client ID=${socket.id}) joined rig ${rig}`)
	socket.emit('joined', rig, op)
	io.sockets.in(rig).emit('ready')
}

function leaveRig(rig, socket) {
	const rigOp = rigs[rig]
	if (socket) {
		if (rigOp && socket !== rigOp.userSocket) return;
		socket.leave(rig)
		socket.disconnect(true)
	}
	rigOp && delete rigOp.op && delete rigOp.userSocket
}

function whoIn(token) {
	if (!token) return null
	const delPos = token.indexOf('-')
	return delPos > 3 ? token.substring(0, delPos).toUpperCase() : null
}

const secondsNow = () => Math.floor(Date.now() / 1000)
