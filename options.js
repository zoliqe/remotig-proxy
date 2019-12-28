const domain = 'MY_DOMAIN'
module.exports = {
	httpPort: 80,
	httpsPort: 443,
	tickSeconds: 10,
	rigTtlMax: 60000,
	// files from letsencrypt
	keyFile: `/etc/letsencrypt/live/${domain}/privkey.pem`,
	certFile: `/etc/letsencrypt/live/${domain}/cert.pem`,
	caFile: `/etc/letsencrypt/live/${domain}/chain.pem`,
	iceServers: [
		{ urls: 'stun:stun.l.google.com:19302'},
		// change to own TURN server configuration
		{ urls: `turns:${domain}`, username: 'remotig', credential: 'PASSWORD' },
	],
}
