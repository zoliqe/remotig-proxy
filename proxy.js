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
const loginUrl = rig => {
	const url = `/remotig/${rig}`
	console.log('use:', url)
	app.use(url, (req, res) => res.send(loginHtmlFor(rig)))
}

app.use('/smartceiver', express.static('smartceiver'))
app.use('/webrtc', express.static('webrtc'))
app.use('/remotig-tvcr', express.static('remotig'))

//app.use('', (req, res) => res.send('.-. . -- --- - .. --.   BY   --- -- ....- .- .-'))

loginUrl('om4aa-k2')
loginUrl('om4q-ft1000')

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

	socket.on('message', function(message) {
		log(`Client ${socket.id}: ${JSON.stringify(message)}`);
		const rigs = Object.keys(socket.rooms)
		rigs.forEach(rig => socket.to(rig).emit('message', message))
	});

	socket.on('create', function(rig) {
		log('Received request to create rig ' + rig);

		var clientsInStream = io.sockets.adapter.rooms[rig];
		var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0;
		log('Rig ' + rig + ' now has ' + numClients + ' listeners');

		if (numClients === 0) {
			socket.join(rig);
			log('Client ' + socket.id + ' created rig ' + rig);
			socket.emit('created', rig, socket.id);
		}
	});

	socket.on('join', function(rig) {
		log('Received request to join rig ' + rig);

		var clientsInStream = io.sockets.adapter.rooms[rig];
		var numClients = clientsInStream ? Object.keys(clientsInStream.sockets).length : 0;
		log('Rig ' + rig + ' now has ' + numClients + ' listeners');

		if (numClients === 1) {
			log('Client ID ' + socket.id + ' joined rig ' + rig);
			io.sockets.in(rig).emit('join', rig);
			socket.join(rig);
			socket.emit('joined', rig, socket.id);
			io.sockets.in(rig).emit('ready');
		} else if (numClients === 0) {
			socket.emit('empty', rig)
		} else { // max one clients
			socket.emit('full', rig);
		}
	});

	// socket.on('bye', function(){
	// 	console.log('received bye');
	// });
});
