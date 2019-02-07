//const express = require('express');
//const app = express();
//app.use(express.static('static'));
//app.listen(8080);

const audioPort = 8073
const controlPort = 8088
// const httpPort = 80
const httpsPort = 8088

console.log('Starting')
// Dependencies
const fs = require('fs')
const http = require('http')
const https = require('https')
const express = require('express')
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

const loginHtml = fs.readFileSync('ws-login.html', 'utf8')
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
  const onError = err => console.log('Proxy error:', err)

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

setupRoutes({rig: 'om3rrc-butorky', host: '10.0.0.2'})

app.use('/smartceiver', express.static('smartceiver-ws'))

app.use((req, res) => {
    res.send('.-. . -- --- - .. --.')
})

// Starting http & https servers
const httpsServer = https.createServer(credentials, app)
const audioServer = https.createServer(credentials, audioApp)
httpsServer.listen(httpsPort, () => console.log(`HTTPS Server running on port ${httpsPort}`))
audioServer.listen(audioPort, () => console.log(`Audio WSS server running on port ${audioPort}`))

