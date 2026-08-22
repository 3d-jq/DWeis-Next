# Generate Windows multi-resolution icon.ico (and optionally a rounded PNG) from a single high-res PNG.
# Pure PowerShell + .NET Framework System.Drawing (no external deps).
# Output:
#   <OutputIco>            — multi-resolution ICO (16/24/32/48/64/128/256)
#   <OutputPng> (opt)      — full-size rounded PNG (matches the source dimensions)
#
# -CornerRadiusPct 在缩放/输出前对每张图应用圆角遮罩（裁掉外侧四角，露出透明）。
# 0 = 不应用（保持方形），0.10 = 10%（接近 Windows 11 风格），0.18~0.22 接近 iOS 风格。
# 注意：源图在画布上的位置保持不变（本项目 owl 在左下）；要主体居中得设计师
# 重做源图（AI 抠图重排版），单纯脚本做不到无损。
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
$src = [System.Drawing.Image]::FromFile((Resolve-Path $SourcePng))
$srcW = $src.Width
$srcH = $src.Height
$srcBmp = [System.Drawing.Bitmap]$src

# 把 alpha < 阈值的像素彻底置为透明（BGRA 字节直接操作，LockBits 加速）。
# 用途：圆角裁切后，弧线边缘会有半透明暗色像素（混合了原图深色背景），
# 在浅色/深色背景上都会呈现"四角阴影"。清理后边缘干净利落。
function Clear-HaloPixels($bmp) {
  $w = $bmp.Width
  $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $stride = $data.Stride
    $bytes = New-Object byte[] ($stride * $h)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $bytes.Length)
    for ($y = 0; $y -lt $h; $y++) {
      $row = $y * $stride
      for ($x = 0; $x -lt $w; $x++) {
        $i = $row + $x * 4
        if ($bytes[$i + 3] -lt 90) {
          $bytes[$i] = 0
          $bytes[$i + 1] = 0
          $bytes[$i + 2] = 0
          $bytes[$i + 3] = 0
        }
      }
    }
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $data.Scan0, $bytes.Length)
  } finally {
    $bmp.UnlockBits($data)
  }
}

function Render-PngBytes($canvasW, $canvasH) {
  $bmp = New-Object System.Drawing.Bitmap $canvasW, $canvasH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  try {
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    if ($CornerRadiusPct -gt 0) {
      $r = [int][Math]::Max(1, [Math]::Min($canvasW, $canvasH) * $CornerRadiusPct)
      $path = New-Object System.Drawing.Drawing2D.GraphicsPath
      $d = [double]$r * 2
      $path.AddArc(0, 0, $d, $d, 180, 90)
      $path.AddArc($canvasW - $d, 0, $d, $d, 270, 90)
      $path.AddArc($canvasW - $d, $canvasH - $d, $d, $d, 0, 90)
      $path.AddArc(0, $canvasH - $d, $d, $d, 90, 90)
      $path.CloseFigure()
      $g.SetClip($path)
      $path.Dispose()
    }
    $g.DrawImage($srcBmp, 0, 0, $canvasW, $canvasH)
    # 清理裁切边缘的抗锯齿晕边：alpha 极低的像素彻底置为透明（保留 RGB=0，避免 dark halo）。
    Clear-HaloPixels $bmp
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return ,$bytes
  } finally {
    $g.Dispose()
    $bmp.Dispose()
  }
}

$pngBlobs = [System.Collections.ArrayList]::new()
try {
  foreach ($size in $sizes) {
    $blob = Render-PngBytes $size $size
    [void]$pngBlobs.Add($blob)
  }

  if ($OutputPng) {
    $fullBytes = Render-PngBytes $srcW $srcH
    [System.IO.File]::WriteAllBytes($OutputPng, $fullBytes)
  }
} finally {
  $src.Dispose()
  $srcBmp.Dispose()
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

Write-Host "Wrote $OutputIco ($((Get-Item $OutputIco).Length) bytes, $($sizes.Count) sizes, corner=$CornerRadiusPct"
if ($OutputPng) {
  Write-Host "Wrote $OutputPng ($((Get-Item $OutputPng).Length) bytes)"
}
