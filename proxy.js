console.log('Starting')
// Dependencies
const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
const helmet = require('helmet')
const options = require('./options')

// Certificate
const credentials = {
	key: fs.readFileSync(options.keyFile, 'utf8'),
	cert: fs.readFileSync(options.certFile, 'utf8'),
	ca: fs.readFileSync(options.caFile, 'utf8')
}

const tokens = require('./tokens')
const managedRigs = Object.keys(tokens)
const rigs = {}
console.log('Managed rigs:', managedRigs)

const app = express()
app.use(helmet())
// redirect HTTP request to HTTPS
app.use(function(req, res, next) {
	if (!req.secure) {
		return res.redirect(['https://', req.get('Host'), req.url].join(''))
	}
	next()
})

require('./extension')(app)

// Starting http & https servers
const httpServer = http.createServer(app)
const httpsServer = https.createServer(credentials, app)

httpServer.listen(options.httpPort, () => console.log(`HTTP Server running on port ${options.httpPort}`))
httpsServer.listen(options.httpsPort, () => console.log(`HTTPS Server running on port ${options.httpsPort}`))

///////////////////////////////////////////////////////////////////////////////////////////////////
var socketIO = require('socket.io');

var io = socketIO.listen(httpsServer);
io.sockets.on('connection', function(socket) {

	// convenience function to log server messages on the client
	function log() {
		console.log(new Date(), ...arguments)
//		var array = ['proxy:'];
//		array.push.apply(array, arguments);
//		socket.emit('log', array);
	}

	socket.on('message', message => {
//		log(`Client ${socket.id}: ${JSON.stringify(message)}`)
		const rigs = Object.keys(socket.rooms)
		rigs.forEach(rig => socket.to(rig).emit('message', message))
	})

	// controller commands
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
			socket.emit('opened', {rig: rig, iceServers: options.iceServers, id: socket.id})
		}
	})
	socket.on('leave', kredence => {
		if (!kredence || !kredence.rig || !kredence.token) return;
		log(`leaving ${kredence.rig}`)
		leaveRig(kredence.rig, socket)
	})
	socket.on('logout', rig => {
		log('Logout all from', rig)
		if (!rigs[rig] || rigs[rig].id !== socket.id) return;
		leaveRig(rig, rigs[rig].userSocket)
	})
	socket.on('close', rig => {
		log('Closing', rig)
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


	// connector cmds
	socket.on('state', rig => socket.emit('state', rigState(rig))) 
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
//	socket.on('ping', data => socket.emit('pong', data))
})


setInterval(tick, options.tickSeconds * 1000)

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
	socket.emit('joined', { rig: rig, op: op, iceServers: options.iceServers })
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

function rigState(rig) {
	const { op, id, tick, rtt, userSocket } = (rigs[rig] || {})
	if (tick && Date.now() - tick < options.rigTtlMax) return { op: op, id: id, rtt: rtt }

	userSocket && leaveRig(rig, userSocket)
	rigs[rig] && delete rigs[rig]
	return { op: null, id: null, rtt: null }
}

const secondsNow = () => Math.floor(Date.now() / 1000)
