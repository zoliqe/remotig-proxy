cd /home/om4aa/remotig-proxy
echo "::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::;;" >> proxy.log
date >> proxy.log
node proxy.js | tee -a proxy.log
