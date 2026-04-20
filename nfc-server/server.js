/**
 * CampusTrack NFC Server — Windows PC/SC via PowerShell
 * ─────────────────────────────────────────────────────
 * Reads the card UID (no authentication needed — works on all cards).
 * Stores UID + matric number mapping in Firestore via the app.
 * No native Node.js modules — uses Windows built-in winscard.dll.
 *
 * Endpoints:
 *   GET  /status     — is ACR122U connected?
 *   GET  /nfc/read   — wait for card, return its UID
 *   POST /nfc/link   — wait for card, return UID (app saves to Firestore)
 */

const express = require('express');
const cors = require('cors');
const { execFile } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3333;
const WAIT_TIMEOUT_MS = 60000; // wait up to 60s for card placement

// ─── PowerShell runner ────────────────────────────────────────────────────────

function runPS(script, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.trim() || err.message));
        else resolve(stdout.trim());
      }
    );
  });
}

// ─── PC/SC type definitions (shared across scripts) ───────────────────────────

const PCSC_TYPES = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinSCard {
    public const uint SCOPE_SYSTEM    = 2;
    public const uint SHARE_EXCLUSIVE = 1;
    public const uint PROTO_T0        = 1;
    public const uint PROTO_T1        = 2;
    public const uint STATE_UNAWARE   = 0;
    public const int  INFINITE        = -1;

    [DllImport("winscard.dll", CharSet=CharSet.Auto)]
    public static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr ctx);
    [DllImport("winscard.dll")]
    public static extern int SCardReleaseContext(IntPtr ctx);
    [DllImport("winscard.dll", CharSet=CharSet.Auto)]
    public static extern int SCardListReaders(IntPtr ctx, string groups, char[] buf, ref uint len);
    [DllImport("winscard.dll", CharSet=CharSet.Auto)]
    public static extern int SCardConnect(IntPtr ctx, string reader, uint shareMode, uint protocols, out IntPtr card, out uint proto);
    [DllImport("winscard.dll")]
    public static extern int SCardDisconnect(IntPtr card, uint disposition);
    [DllImport("winscard.dll")]
    public static extern int SCardTransmit(IntPtr card, [In] ref IoReq ioReq, byte[] send, uint sendLen, IntPtr recvPci, byte[] recv, ref uint recvLen);
    [DllImport("winscard.dll", CharSet=CharSet.Auto)]
    public static extern int SCardGetStatusChange(IntPtr ctx, uint timeout, [In,Out] ReaderState[] states, uint count);

    [StructLayout(LayoutKind.Sequential)]
    public struct IoReq { public uint Protocol; public uint Length; }

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
    public struct ReaderState {
        [MarshalAs(UnmanagedType.LPTStr)] public string Reader;
        public IntPtr UserData;
        public uint CurrentState;
        public uint EventState;
        public uint AtrLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst=36)] public byte[] Atr;
    }
}
'@
`;

// ─── Status check ─────────────────────────────────────────────────────────────

const PS_STATUS = PCSC_TYPES + `
$ctx = [IntPtr]::Zero
if ([WinSCard]::SCardEstablishContext([WinSCard]::SCOPE_SYSTEM, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$ctx) -ne 0) {
    Write-Output "DISCONNECTED"; exit
}
$len = [uint32]0
[WinSCard]::SCardListReaders($ctx, $null, $null, [ref]$len) | Out-Null
if ($len -le 2) { Write-Output "DISCONNECTED"; [WinSCard]::SCardReleaseContext($ctx)|Out-Null; exit }
$buf = New-Object char[] $len
[WinSCard]::SCardListReaders($ctx, $null, $buf, [ref]$len) | Out-Null
$name = (New-Object string($buf,0,$len)).Split([char]0,[System.StringSplitOptions]::RemoveEmptyEntries)[0]
Write-Output "CONNECTED:$name"
[WinSCard]::SCardReleaseContext($ctx) | Out-Null
`;

// ─── Read card UID ────────────────────────────────────────────────────────────
// Uses FF CA 00 00 00 APDU — reads UID with no authentication on any NFC card

function PS_READ_UID(waitSecs) {
  return PCSC_TYPES + `
$ctx = [IntPtr]::Zero
if ([WinSCard]::SCardEstablishContext([WinSCard]::SCOPE_SYSTEM, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$ctx) -ne 0) {
    Write-Output "ERROR:PC/SC context failed"; exit
}

# List readers
$len = [uint32]0
[WinSCard]::SCardListReaders($ctx, $null, $null, [ref]$len) | Out-Null
if ($len -le 2) { Write-Output "ERROR:No reader found"; [WinSCard]::SCardReleaseContext($ctx)|Out-Null; exit }
$buf = New-Object char[] $len
[WinSCard]::SCardListReaders($ctx, $null, $buf, [ref]$len) | Out-Null
$reader = (New-Object string($buf,0,$len)).Split([char]0,[System.StringSplitOptions]::RemoveEmptyEntries)[0]

# Wait for card (blocks until card placed or timeout)
$rs = New-Object WinSCard+ReaderState
$rs.Reader = $reader
$rs.CurrentState = [WinSCard]::STATE_UNAWARE
$rs.Atr = New-Object byte[] 36
$waitRet = [WinSCard]::SCardGetStatusChange($ctx, [uint32](${waitSecs} * 1000), @($rs), 1)
if ($waitRet -ne 0) {
    Write-Output "TIMEOUT"
    [WinSCard]::SCardReleaseContext($ctx) | Out-Null
    exit
}

# Connect to card
$card = [IntPtr]::Zero; $proto = [uint32]0
# Connect to card — retry up to 5 times to avoid sharing violations
$card = [IntPtr]::Zero; $proto = [uint32]0; $cRet = -1
for ($i = 0; $i -lt 5; $i++) {
    $cRet = [WinSCard]::SCardConnect($ctx, $reader, 2, ([WinSCard]::PROTO_T0 -bor [WinSCard]::PROTO_T1), [ref]$card, [ref]$proto)
    if ($cRet -eq 0) { break }
    Start-Sleep -Milliseconds 300
}
if ($cRet -ne 0) {
    Write-Output "ERROR:Connect failed ($cRet)"
    [WinSCard]::SCardReleaseContext($ctx) | Out-Null
    exit
}

# Send GET UID APDU
$ioReq = New-Object WinSCard+IoReq; $ioReq.Protocol = $proto; $ioReq.Length = 8
$cmd = [byte[]](0xFF, 0xCA, 0x00, 0x00, 0x00)
$resp = New-Object byte[] 256; $respLen = [uint32]256
[WinSCard]::SCardTransmit($card, [ref]$ioReq, $cmd, [uint32]$cmd.Length, [IntPtr]::Zero, $resp, [ref]$respLen) | Out-Null

[WinSCard]::SCardDisconnect($card, 0) | Out-Null
[WinSCard]::SCardReleaseContext($ctx) | Out-Null

if ($respLen -lt 2) { Write-Output "ERROR:No response"; exit }
$sw1 = $resp[$respLen - 2]; $sw2 = $resp[$respLen - 1]
if ($sw1 -ne 0x90) {
    Write-Output ("ERROR:UID read failed SW=" + $sw1.ToString("X2") + $sw2.ToString("X2"))
    exit
}

$dataLen = [int]$respLen - 2
$uid = ($resp[0..($dataLen - 1)] | ForEach-Object { $_.ToString("X2") }) -join ":"
Write-Output "UID:$uid"
`;
}

// ─── Reader state ─────────────────────────────────────────────────────────────

let readerConnected = false;
let readerName = '';

async function pollStatus() {
  try {
    const out = await runPS(PS_STATUS, 6000);
    if (out.startsWith('CONNECTED:')) {
      readerConnected = true;
      readerName = out.replace('CONNECTED:', '').trim();
    } else {
      readerConnected = false;
      readerName = '';
    }
  } catch {
    readerConnected = false;
    readerName = '';
  }
}

pollStatus();
setInterval(pollStatus, 3000);

// ─── Endpoints ────────────────────────────────────────────────────────────────

// GET /status
app.get('/status', (_req, res) => {
  res.json({ connected: readerConnected, readerName });
});

// GET /nfc/read
// Waits for card, reads UID. Used to show card contents before linking.
app.get('/nfc/read', async (req, res) => {
  if (!readerConnected) return res.status(503).json({ error: 'Reader not connected' });

  req.setTimeout(WAIT_TIMEOUT_MS + 5000);

  try {
    const waitSecs = Math.floor(WAIT_TIMEOUT_MS / 1000);
    const out = await runPS(PS_READ_UID(waitSecs), WAIT_TIMEOUT_MS + 5000);

    if (out === 'TIMEOUT') {
      return res.status(408).json({ error: 'No card detected. Please place card on reader.' });
    }
    if (out.startsWith('ERROR:')) {
      return res.status(500).json({ error: out.replace('ERROR:', '').trim() });
    }
    if (out.startsWith('UID:')) {
      const uid = out.replace('UID:', '').trim();
      // rawData = the UID string
      // isEmpty = false (card always has a UID)
      // isMatric = false (UID is hex, not a matric number)
      return res.json({ rawData: uid, isEmpty: false, isMatric: false, uid });
    }
    return res.status(500).json({ error: 'Unexpected response: ' + out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /nfc/link  { matric: string }
// Waits for card, reads UID, returns both. App saves matric↔UID to Firestore.
// Replaces the old /nfc/write — no writing to card needed.
app.post('/nfc/link', async (req, res) => {
  const { matric } = req.body;
  if (!readerConnected) return res.status(503).json({ error: 'Reader not connected' });
  if (!matric?.trim()) return res.status(400).json({ error: 'Missing matric field' });

  req.setTimeout(WAIT_TIMEOUT_MS + 5000);

  try {
    const waitSecs = Math.floor(WAIT_TIMEOUT_MS / 1000);
    const out = await runPS(PS_READ_UID(waitSecs), WAIT_TIMEOUT_MS + 5000);

    if (out === 'TIMEOUT') {
      return res.status(408).json({ error: 'No card detected. Please place card on reader.' });
    }
    if (out.startsWith('ERROR:')) {
      return res.status(500).json({ error: out.replace('ERROR:', '').trim() });
    }
    if (out.startsWith('UID:')) {
      const uid = out.replace('UID:', '').trim();
      return res.json({ success: true, uid, matric: matric.trim() });
    }
    return res.status(500).json({ error: 'Unexpected response: ' + out });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n CampusTrack NFC Server  →  http://localhost:${PORT}`);
  console.log(' No native modules — uses Windows built-in PC/SC (winscard.dll)');
  console.log(' Plug in ACR122U and open the admin NFC registration page.\n');
});
