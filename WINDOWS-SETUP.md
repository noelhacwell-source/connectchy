# Start Connectchy on Windows

Use these steps on the **64-bit Intel or AMD Windows PC** where you want to run Connectchy. Each box contains one command. Paste it into **PowerShell**, press **Enter**, and wait until the prompt comes back before copying the next command.

## First time only

**1. Open PowerShell.** Click Start, type **PowerShell**, and open it. Install Node.js:

```powershell
winget install --exact --id OpenJS.NodeJS.LTS
```

If Windows says it is already installed, continue. Accept the installer prompts.

**2. Install Git** in the same window:

```powershell
winget install --exact --id Git.Git
```

**3. Close PowerShell and open it again.** Go to your Windows user folder:

```powershell
cd $env:USERPROFILE
```

**4. Download Connectchy:**

```powershell
git clone https://github.com/noelhacwell-source/connectchy.git
```

**5. Enter its folder:**

```powershell
cd connectchy
```

**6. Run setup:**

```powershell
.\setup-windows.cmd
```

Wait for **Setup complete**. This downloads the official Cloudflare tunnel tool, creates a private PostgreSQL database on your PC, generates its password, and builds the app. Everything is set up for you. If setup stops, read the last error and repeat step 6 after fixing it.

**7. Start Connectchy:**

```powershell
.\start-windows.cmd
```

**Leave this window open.** Open your browser and enter **http://127.0.0.1:3000** in the address bar.

## What to click in the app

- **Share a folder with an AI:** Choose **Project Upload**, choose your folders, then click **Upload project**. Click **Copy project link** and send that link to the AI. Anyone who has it can download and replace that project.
- **Connect Roblox Studio:** Create a **Roblox Studio** workspace. In its connection settings, download your own **StudioLink.rbxmx**. Open **Plugins → Plugins Folder** in Studio, put the file there, restart Studio and open your place. Allow the local HTTP connection if Studio asks. Wait for the dashboard to show Studio online.
- **Connect VS Code:** Create a **VS Code** workspace and download the VSIX from connection settings. In VS Code open **Extensions → … → Install from VSIX**, choose the downloaded file, open your project folder, and connect using your workspace link.

For an AI on another computer, copy the public link from Connectchy once the tunnel is ready. The temporary address can change after restarting. To give someone their own copy of the app, share the GitHub repository link. Keep your generated database password and paired Studio plugin private.

## Next time

Open PowerShell. Enter this command:

```powershell
cd "$env:USERPROFILE\connectchy"
```

Then start the app:

```powershell
.\start-windows.cmd
```

Open **http://127.0.0.1:3000** again. Press **Ctrl+C** in the app window when you want to stop the app and its tunnel.
