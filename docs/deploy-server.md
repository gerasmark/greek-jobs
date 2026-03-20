# Server Deployment for `gerasmark.com/greek-jobs`

This guide shows how to serve this project at:

- `https://gerasmark.com/greek-jobs/`

The app is a static site. The deployable output is the contents of `site/`, and the browser must be able to load these files over HTTP:

- `index.html`
- `styles.css`
- `app.js`
- `data.json`
- `_meta.json`

No code changes are required to serve it from `/greek-jobs/`, because the frontend uses relative paths for its assets and JSON files.

## Assumptions

- The repo exists on the VM at `/home/user/Documents/greek-jobs`
- The VM is reachable from the public internet
- `gerasmark.com` points to the VM public IP
- The server is Ubuntu or Debian with `sudo`
- We want Nginx to serve the app under the path prefix `/greek-jobs/`

Important note:
- If `gerasmark.com` already has an Nginx config for another site, do not create a second competing `server` block for the same domain. Add the `/greek-jobs` location rules to the existing `server_name gerasmark.com` block instead.
- If Nginx already has separate `80` and `443` blocks for `gerasmark.com`, add the path rules to the block that actually serves the site, usually the `443` block, and keep the `80 -> 443` redirect behavior intact.

## 1. Point the Domain to the VM

In DNS, point:

- `A` record for `gerasmark.com` to the VM public IPv4
- Optional: `A` or `CNAME` for `www.gerasmark.com` if you also want `www`

Wait for DNS to resolve before continuing.

## 2. Install the Required Packages

```bash
sudo apt update
sudo apt install -y nginx python3 rsync certbot python3-certbot-nginx
```

If you use `ufw`, allow web traffic:

```bash
sudo ufw allow 'Nginx Full'
```

## 3. Build the Static Site

From the repo root:

```bash
cd /home/user/Documents/greek-jobs
python3 scripts/build_all.py
```

This refreshes the generated files inside `site/`.

## 4. Copy the Site to a Web Root

Serve the built files from a path Nginx can read cleanly:

```bash
sudo mkdir -p /var/www/greek-jobs
sudo rsync -a --delete /home/user/Documents/greek-jobs/site/ /var/www/greek-jobs/
```

Using `/var/www/greek-jobs` is preferable to serving directly from `/home/user/...`, because home-directory permissions often block the web server.

## 5. Configure Nginx for `/greek-jobs/`

### If `gerasmark.com` already exists in Nginx

Edit the existing server config for `gerasmark.com` and add these two `location` blocks inside the relevant `server {}` block. If the domain already serves HTTPS, that usually means the `listen 443 ssl;` block:

```nginx
location = /greek-jobs {
    return 301 /greek-jobs/;
}

location /greek-jobs/ {
    alias /var/www/greek-jobs/;
    index index.html;
    try_files $uri $uri/ =404;
}
```

### If this is a fresh Nginx site

Create `/etc/nginx/sites-available/gerasmark.com` with:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name gerasmark.com www.gerasmark.com;

    location = /greek-jobs {
        return 301 /greek-jobs/;
    }

    location /greek-jobs/ {
        alias /var/www/greek-jobs/;
        index index.html;
        try_files $uri $uri/ =404;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/gerasmark.com /etc/nginx/sites-enabled/gerasmark.com
```

If the symlink already exists, leave it as-is.

## 6. Test and Reload Nginx

```bash
sudo nginx -t
sudo systemctl reload nginx
```

At this point, plain HTTP should work at:

- `http://gerasmark.com/greek-jobs/`

## 7. Enable HTTPS with Let's Encrypt

```bash
sudo certbot --nginx -d gerasmark.com -d www.gerasmark.com
```

Follow the prompts. After success, the site should be available at:

- `https://gerasmark.com/greek-jobs/`

## 8. Redeploy After Future Data or Frontend Changes

Whenever the app changes:

```bash
cd /home/user/Documents/greek-jobs
python3 scripts/build_all.py
sudo rsync -a --delete /home/user/Documents/greek-jobs/site/ /var/www/greek-jobs/
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Verify the Deployment

These requests should succeed:

```bash
curl -I http://gerasmark.com/greek-jobs/
curl -I http://gerasmark.com/greek-jobs/index.html
curl -I http://gerasmark.com/greek-jobs/data.json
curl -I http://gerasmark.com/greek-jobs/_meta.json
```

After HTTPS is enabled, repeat the checks with `https://`.

In the browser, confirm that:

- The page loads at `/greek-jobs/`
- The treemap appears
- There are no `404` errors for `app.js`, `styles.css`, `data.json`, or `_meta.json`

## Troubleshooting

### The HTML loads, but the visualization is blank

Usually one of these files is not being served:

- `data.json`
- `_meta.json`
- `app.js`

Check:

```bash
curl -I https://gerasmark.com/greek-jobs/data.json
curl -I https://gerasmark.com/greek-jobs/_meta.json
```

### `/greek-jobs` works badly but `/greek-jobs/` works

That means the redirect is missing. Keep this exact rule:

```nginx
location = /greek-jobs {
    return 301 /greek-jobs/;
}
```

The trailing slash matters because the app uses relative asset paths.

### Nginx shows `403 Forbidden`

Most often:

- The files were not copied into `/var/www/greek-jobs`
- The `alias` path is wrong
- Nginx cannot read the directory because of permissions

Using `/var/www/greek-jobs` avoids most permission problems.

### The domain does not open from outside your network

Check all of these:

- DNS points to the VM public IP, not a private address like `192.168.x.x` or `10.x.x.x`
- The cloud firewall or security group allows inbound `80` and `443`
- The VM firewall allows inbound `80` and `443`

### `gerasmark.com` already hosts another app

That is fine. Keep the existing root site and only add the `/greek-jobs` path block to the existing Nginx server for `gerasmark.com`.

## Deployment Summary

The shortest repeatable deployment flow is:

```bash
cd /home/user/Documents/greek-jobs
python3 scripts/build_all.py
sudo rsync -a --delete site/ /var/www/greek-jobs/
sudo nginx -t
sudo systemctl reload nginx
```

If Nginx already serves `gerasmark.com` and includes the `/greek-jobs/` path rules, this is enough to publish updates.
