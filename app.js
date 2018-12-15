//const express = require('express');
//const app = express();
//app.use(express.static('static'));
//app.listen(8080);

const audioPort = 8073
const controlPort = 8088
const httpPort = 8080

console.log('Starting')
// Dependencies
const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const helmet = require('helmet')
const proxy = require('http-proxy-middleware')

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

app.use(function(req, res, next) {
  if (!req.secure) {
    return res.redirect(['https://', req.get('Host'), req.baseUrl].join(''))
  }
  next()
})

app.use(proxy('/remotig-om4aa-k2/control', {
	target: `http://192.168.100.230:${controlPort}/control`,
	pathRewrite: {'^/remotig-om4aa-k2/control': ''},
	changeOrigin: true,
	ws: true,
	loglovel: 'debug'
}))
app.use(proxy('/remotig-om4aa-k2/status', {
	target: `http://192.168.100.230:${controlPort}/status`,
	pathRewrite: {'^/remotig-om4aa-k2/status': ''},
	changeOrigin: true,
	ws: false,
	loglovel: 'debug'
}))
app.use(proxy('/remotig-om3rrc-butorky/control', {
	target: `http://10.0.0.2:${controlPort}/control`,
	pathRewrite: {'^/remotig-om3rrc-butorky/control': ''},
	changeOrigin: true,
	ws: true,
	loglovel: 'debug'
}))
app.use(proxy('/remotig-om3rrc-butorky/status', {
	target: `http://10.0.0.2:${controlPort}/status`,
	pathRewrite: {'^/remotig-om3rrc-butorky/status': ''},
	changeOrigin: true,
	ws: false,
	loglovel: 'debug'
}))

app.use('/remotig', express.static('remotig'))
app.use('/smartceiver', express.static('smartceiver'))

app.use((req, res) => {
    res.send('.-. . -- --- - .. --.')
})

// Starting both http & https servers
const httpServer = http.createServer(app)
const httpsServer = https.createServer(credentials, app)
httpServer.listen(httpPort, () => console.log(`HTTP Server running on port ${httpPort}`))
httpsServer.listen(controlPort, () => console.log(`HTTPS Server running on port ${controlPort}`))


const audioApp = express()
audioApp.use(helmet())
audioApp.use(proxy('/remotig-om4aa-k2/audio', {
	target: `http://192.168.100.230:${audioPort}`,
	pathRewrite: {'^/remotig-om4aa-k2/audio': ''},
	changeOrigin: true,
	ws: true,
	loglovel: 'debug'
}))
audioApp.use(proxy('/remotig-om3rrc-butorky/audio', {
	target: `http://192.168.100.230:${audioPort}`,
	pathRewrite: {'^/remotig-om3rrc-butorky/audio': ''},
	changeOrigin: true,
	ws: true,
	loglovel: 'debug'
}))
const audioServer = https.createServer(credentials, app)
audioServer.listen(audioPort, () => console.log(`Audio WSS server running on port ${audioPort}`))
