# Install Connectchy on your Windows PC

These steps are for a fresh installation on 64-bit Intel or AMD Windows with PowerShell. Run them on the computer where you use Roblox Studio or VS Code. You generate your own database password, tunnel and plugin during setup. The repository link is all you need from the person sharing Connectchy.

## 1. Install the tools

Open **PowerShell** and run these commands. Skip a line if that tool is already installed.

```powershell
winget install --exact --id Git.Git
winget install --exact --id OpenJS.NodeJS.LTS
winget install --exact --id Docker.DockerDesktop
```

Open **Docker Desktop** from Start and finish its setup. If it requests WSL or a reboot, follow its prompts and reopen Docker Desktop. Wait for the engine to start. Open a **new PowerShell** and verify these commands work before continuing. Use Node.js 22.13 or newer.

```powershell
git --version
node --version
npm.cmd --version
docker info --format '{{.ServerVersion}}'
```

## 2. Download Connectchy and its tunnel tool

```powershell
Set-Location $env:USERPROFILE
git clone https://github.com/noelhacwell-source/connectchy.git
Set-Location .\connectchy
New-Item -ItemType Directory -Force .local-runtime | Out-Null
curl.exe --fail --location "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" --output ".local-runtime\cloudflared.exe"
.\.local-runtime\cloudflared.exe --version
```

The last command should print a version. Connectchy looks in this directory automatically. The executable comes from Cloudflare's official release. [Cloudflare downloads](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/)

## 3. Create your local database once

Stay in the same PowerShell window. Paste this whole block. It creates a PostgreSQL database accessible on your PC at port 55433, keeps the data in a Docker volume, and writes the connection settings to a private local file.

```powershell
if (Test-Path .env) { throw "An .env file already exists. Use your existing database settings or start in a fresh clone." }
$dbPassword = node -p "require('node:crypto').randomBytes(32).toString('hex')"
if ($LASTEXITCODE -ne 0 -or $dbPassword -notmatch '^[0-9a-f]{64}$') { throw "Could not generate a database password." }
docker run --name connectchy-db --restart unless-stopped -p 127.0.0.1:55433:5432 -e POSTGRES_USER=connectchy -e POSTGRES_DB=connectchy -e "POSTGRES_PASSWORD=$dbPassword" -v connectchy-pgdata:/var/lib/postgresql/data -d postgres:16
if ($LASTEXITCODE -ne 0) { throw "Database creation failed. Read the Docker message before continuing." }
"DATABASE_URL=postgresql://connectchy:${dbPassword}@127.0.0.1:55433/connectchy" | Set-Content -Encoding ascii .env
Remove-Variable dbPassword
```

Run this check until it prints **accepting connections**.

```powershell
docker exec connectchy-db pg_isready -U connectchy -d connectchy
```

## 4. Build and start

Run each command in order. Continue when the preceding command succeeds.

```powershell
npm.cmd ci
npx.cmd drizzle-kit push
npm.cmd run build
npm.cmd start
```

Leave this window open. Open **http://127.0.0.1:3000** in your browser. Startup launches the tunnel automatically. Wait for the public address ending in **trycloudflare.com** before copying a link for someone outside your PC.

## 5. Choose what to share

- **Roblox Studio** — Create a Roblox Studio workspace, open its connection settings, and download your own StudioLink.rbxmx. In Studio open **Plugins → Plugins Folder**, place the file there, restart Studio and open your place. Allow the plugin's local HTTP connection if prompted. Check that the dashboard reports Studio online. The default plugin server address is http://127.0.0.1:3000 on your PC.
- **VS Code** — Create a VS Code workspace, download its VSIX from connection settings, and use **Extensions → … → Install from VSIX** in VS Code. Open the intended project folder and use the extension's connect command with your own workspace link.
- **Project Upload** — Choose Project Upload on the home page, add your folders and upload. **Copy project link** gives a recipient instructions for downloading that project and pushing an updated version. Anyone holding this link can replace that project's files. Check your selected folders for passwords, .env files and private keys before uploading.

To share the application itself, send the **GitHub repository link**. Keep your generated StudioLink plugin, .env, .local-runtime directory and live workspace links private unless you intend to grant the corresponding access.

## Start again another day

Start Docker Desktop, then open PowerShell and run:

```powershell
Set-Location "$env:USERPROFILE\connectchy"
docker start connectchy-db
npm.cmd start
```

Use **Ctrl+C** in the app window to stop Connectchy. After restarting, copy the current public link again because the temporary tunnel hostname can change. Your database stays in the Docker volume.

## If something fails

- **Docker engine unavailable** — Open Docker Desktop and rerun the docker info check in step 1.
- **Database unavailable** — Run the pg_isready command in step 3. To see startup errors, run `docker logs --tail 40 connectchy-db`.
- **App opens, but a remote AI cannot reach it** — Check that cloudflared prints its version in step 2 and that the start window reports a public tunnel. Copy the public project or agent link from the dashboard. A localhost link points to the recipient's own machine.
