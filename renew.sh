echo "Killing node (remotig-proxy) first, so it not blocking port 80..."
killall node
sudo certbot renew --dry-run
echo "Script runs as dry-run, to really renew, edit this script and uncomment last line..."
#sudo certbot renew
