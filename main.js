const { app, BrowserWindow, ipcMain, session, systemPreferences } = require('electron')
const { ElectronBlocker } = require('@cliqz/adblocker-electron')
const { exec } = require('child_process')
const path = require('path')

const VPN_PROFILE = 'ExpressVPN Lightway'

const COUNTRIES = [
  { code: 'us', name: 'USA',         flag: '🇺🇸' },
  { code: 'gb', name: 'UK',          flag: '🇬🇧' },
  { code: 'de', name: 'Germany',     flag: '🇩🇪' },
  { code: 'nl', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'jp', name: 'Japan',       flag: '🇯🇵' },
]

function run(cmd) {
  return new Promise(resolve => exec(cmd, (err, stdout) => resolve(err ? '' : stdout.trim())))
}

// ── Auth ─────────────────────────────────────────────────────
ipcMain.handle('auth-check', () => {
  try {
    return systemPreferences.canPromptTouchID()
  } catch {
    return false
  }
})

ipcMain.handle('auth-fingerprint', async () => {
  try {
    await systemPreferences.promptTouchID('unlock BR0WSR')
    return { success: true }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('vpn-countries', () => COUNTRIES)

ipcMain.handle('vpn-status', async () => {
  const out = await run('scutil --nc list')
  for (const line of out.split('\n')) {
    if (line.includes(VPN_PROFILE)) {
      if (line.includes('(Connected)'))    return 'Connected'
      if (line.includes('(Connecting)'))   return 'Connecting'
      if (line.includes('(Disconnecting)'))return 'Disconnecting'
    }
  }
  return 'Disconnected'
})

ipcMain.handle('vpn-connect', async (_, countryCode) => {
  // Open ExpressVPN app so user can confirm / change server, then connect the profile
  await run(`open "expressvpn://"`)
  await new Promise(r => setTimeout(r, 800))
  await run(`scutil --nc start "${VPN_PROFILE}"`)
})

ipcMain.handle('vpn-disconnect', async () => {
  await run(`scutil --nc stop "${VPN_PROFILE}"`)
})

let win

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1200, height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
    }
  })

  win.loadFile('index.html')

  ElectronBlocker.fromPrebuiltAdsAndTracking(fetch).then(blocker => {
    blocker.enableBlockingInSession(session.defaultSession)
    app.on('session-created', s => blocker.enableBlockingInSession(s))
    console.log('[blocker] active')
  }).catch(err => console.error('[blocker] error:', err))
})

ipcMain.handle('screenshot-capture', async () => {
  const image = await win.webContents.capturePage()
  return image.toDataURL()
})

app.on('window-all-closed', () => app.quit())
