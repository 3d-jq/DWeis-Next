# Generate Windows multi-resolution icon.ico (and optionally a rounded PNG) from a single high-res PNG.
# Pure PowerShell + .NET Framework System.Drawing (no external deps).
# Output:
#   <OutputIco>            — multi-resolution ICO (16/24/32/48/64/128/256)
#   <OutputPng> (opt)      — full-size rounded PNG (matches the source dimensions)
#
# -CornerRadiusPct 在缩放/输出前对每张图应用圆角遮罩（裁掉外侧四角，露出透明）。
# 0 = 不应用（保持方形），0.10 = 10%（接近 Windows 11 风格），0.18~0.22 接近 iOS 风格。
# 注意：激进圆角会切到源图四角附近的元素（如本项目 owl 在左下，建议 ≤0.12）。
param(
  [Parameter(Mandatory = $true)][string]$SourcePng,
  [Parameter(Mandatory = $true)][string]$OutputIco,
  [string]$OutputPng = "",
  [double]$CornerRadiusPct = 0
)

$ErrorActionPreference = "Stop"
if (-not $SourcePng -or -not $OutputIco) {
  throw "Usage: generate-app-icon.ps1 -SourcePng <path> -OutputIco <path> [-OutputPng <path>] [-CornerRadiusPct <0..0.3>]"
}
Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBlobs = @()
$src = [System.Drawing.Image]::FromFile((Resolve-Path $SourcePng))
$srcW = $src.Width
$srcH = $src.Height

function New-RoundedBitmap([int]$width, [int]$height, [double]$radiusPct) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    if ($radiusPct -gt 0) {
      $r = [int][Math]::Max(1, [Math]::Min($width, $height) * $radiusPct)
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      $d = [double]$r * 2
      $path.AddArc(0, 0, $d, $d, 180, 90)
      $path.AddArc($width - $d, 0, $d, $d, 270, 90)
      $path.AddArc($width - $d, $height - $d, $d, $d, 0, 90)
      $path.AddArc(0, $height - $d, $d, $d, 90, 90)
      $path.CloseFigure()
      $g.SetClip($path)
      try { $path.Dispose() } catch { }
    }
    $g.Clear([System.Drawing.Color]::Transparent)
    return @{ Bitmap = $bmp; Graphics = $g }
  } catch {
    $g.Dispose()
    $bmp.Dispose()
    throw
  }
}

try {
  foreach ($size in $sizes) {
    $pair = New-RoundedBitmap $size $size $CornerRadiusPct
    try {
      $pair.Graphics.DrawImage($src, 0, 0, $size, $size)
      $ms = New-Object System.IO.MemoryStream
      try {
        $pair.Bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBlobs += , $ms.ToArray()
      } finally {
        $ms.Dispose()
      }
    } finally {
      $pair.Graphics.Dispose()
      $pair.Bitmap.Dispose()
    }
  }

  # Optional: save full-size rounded PNG (matches source dimensions).
  if ($OutputPng) {
    $fullPair = New-RoundedBitmap $srcW $srcH $CornerRadiusPct
    try {
      $fullPair.Graphics.DrawImage($src, 0, 0, $srcW, $srcH)
      $fullPair.Bitmap.Save($OutputPng, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $fullPair.Graphics.Dispose()
      $fullPair.Bitmap.Dispose()
    }
  }
} finally {
  $src.Dispose()
}

# Build ICO: ICONDIR (6) + N*ICONDIRENTRY (16) + PNG blobs.
$ms = New-Object System.IO.MemoryStream
try {
  $bw = New-Object System.IO.BinaryWriter $ms
  try {
    $bw.Write([uint16]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]$pngBlobs.Count)
    $dataOffset = 6 + 16 * $pngBlobs.Count
    for ($i = 0; $i -lt $sizes.Count; $i++) {
      $size = $sizes[$i]
      $blob = $pngBlobs[$i]
      $w = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $h = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $bw.Write([byte]$w)
      $bw.Write([byte]$h)
      $bw.Write([byte]0)
      $bw.Write([byte]0)
      $bw.Write([uint16]1)
      $bw.Write([uint16]32)
      $bw.Write([uint32]$blob.Length)
      $bw.Write([uint32]$dataOffset)
      $dataOffset += $blob.Length
    }
    for ($i = 0; $i -lt $pngBlobs.Count; $i++) {
      $bw.Write($pngBlobs[$i])
    }
  } finally {
    $bw.Dispose()
  }
  [System.IO.File]::WriteAllBytes($OutputIco, $ms.ToArray())
} finally {
  $ms.Dispose()
}

Write-Host "Wrote $OutputIco ($((Get-Item $OutputIco).Length) bytes, $($sizes.Count) sizes: $($sizes -join ','), corner=$CornerRadiusPct)"
if ($OutputPng) {
  Write-Host "Wrote $OutputPng ($((Get-Item $OutputPng).Length) bytes)"
}
