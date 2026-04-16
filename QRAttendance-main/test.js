const { execFile } = require('child_process');

console.log('Testing Windows PC/SC connection...\n');

const PS_STATUS = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class PCSC {
    [DllImport("winscard.dll")]
    public static extern int SCardEstablishContext(uint scope, IntPtr r1, IntPtr r2, out IntPtr ctx);
    [DllImport("winscard.dll", CharSet=CharSet.Auto)]
    public static extern int SCardListReaders(IntPtr ctx, string groups, char[] buf, ref uint len);
    [DllImport("winscard.dll")]
    public static extern int SCardReleaseContext(IntPtr ctx);
}
'@
$ctx = [IntPtr]::Zero
$ret = [PCSC]::SCardEstablishContext(2, [IntPtr]::Zero, [IntPtr]::Zero, [ref]$ctx)
if ($ret -ne 0) { Write-Output "ERROR:PC/SC service not available ($ret)"; exit }
$len = [uint32]0
[PCSC]::SCardListReaders($ctx, $null, $null, [ref]$len) | Out-Null
if ($len -le 2) { Write-Output "DISCONNECTED:No reader found"; [PCSC]::SCardReleaseContext($ctx)|Out-Null; exit }
$buf = New-Object char[] $len
[PCSC]::SCardListReaders($ctx, $null, $buf, [ref]$len) | Out-Null
$name = (New-Object string($buf,0,$len)).Split([char]0,[System.StringSplitOptions]::RemoveEmptyEntries)[0]
Write-Output "CONNECTED:$name"
[PCSC]::SCardReleaseContext($ctx) | Out-Null
`;

execFile(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-Command', PS_STATUS],
  { timeout: 10000 },
  (err, stdout, stderr) => {
    if (err) {
      console.error('❌ PowerShell failed:', stderr || err.message);
      return;
    }
    const result = stdout.trim();
    if (result.startsWith('CONNECTED:')) {
      const name = result.replace('CONNECTED:', '');
      console.log('✅ Reader detected:', name);
      console.log('\nACR122U is ready. You can now start the server:');
      console.log('  node server.js\n');
    } else if (result.startsWith('DISCONNECTED:')) {
      console.log('⚠️  PC/SC service reachable but no reader found.');
      console.log('   Make sure the ACR122U is plugged in.');
    } else if (result.startsWith('ERROR:')) {
      console.log('❌ Error:', result.replace('ERROR:', ''));
      console.log('   Make sure the Smart Card service is running:');
      console.log('   Run as admin: Start-Service SCardSvr');
    } else {
      console.log('Unknown response:', result);
    }
  }
);