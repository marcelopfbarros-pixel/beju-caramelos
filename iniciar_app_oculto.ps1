$ErrorActionPreference = 'SilentlyContinue'
$appDir = $PSScriptRoot

function Test-VitePort {
  param([int]$Port = 5173)
  $client = $null
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    $connected = $iar.AsyncWaitHandle.WaitOne(250, $false)
    if ($connected -and $client.Connected) {
      $client.EndConnect($iar)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    if ($client) {
      $client.Dispose()
    }
  }
}

if (-not (Test-VitePort -Port 5173)) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $nodeExe = if ($nodeCmd) { $nodeCmd.Source } else { 'C:\Program Files\nodejs\node.exe' }
  $viteBin = Join-Path $appDir 'node_modules\vite\bin\vite.js'

  if ((Test-Path $nodeExe) -and (Test-Path $viteBin)) {
    Start-Process -FilePath $nodeExe -ArgumentList ('"' + $viteBin + '"') -WorkingDirectory $appDir -WindowStyle Hidden | Out-Null
  } else {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' -WorkingDirectory $appDir -WindowStyle Hidden | Out-Null
  }

  $deadline = (Get-Date).AddSeconds(25)
  while ((Get-Date) -lt $deadline) {
    if (Test-VitePort -Port 5173) {
      break
    }
    Start-Sleep -Milliseconds 250
  }
}

$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
)
$chromeExe = $chromeCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if ($chromeExe) {
  Start-Process -FilePath $chromeExe -ArgumentList '--app=http://localhost:5173', '--window-size=1600,920'
} else {
  Start-Process 'http://localhost:5173'
}
