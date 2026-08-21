# Generate Windows multi-resolution icon.ico from a single high-res PNG.
# Pure PowerShell + .NET Framework System.Drawing (no external deps).
# Output: resources/branding/icon.ico (16/24/32/48/64/128/256 embedded as PNG).
param(
  [Parameter(Mandatory = $true)][string]$SourcePng,
  [Parameter(Mandatory = $true)][string]$OutputIco
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngBlobs = @()

$src = [System.Drawing.Image]::FromFile((Resolve-Path $SourcePng))
try {
  foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($src, 0, 0, $size, $size)
      } finally {
        $g.Dispose()
      }
      $ms = New-Object System.IO.MemoryStream
      try {
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $pngBlobs += , $ms.ToArray()
      } finally {
        $ms.Dispose()
      }
    } finally {
      $bmp.Dispose()
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
    # ICONDIR
    $bw.Write([uint16]0)                    # reserved
    $bw.Write([uint16]1)                    # type=1 icon
    $bw.Write([uint16]$pngBlobs.Count)      # count

    # offset where first image data starts
    $dataOffset = 6 + 16 * $pngBlobs.Count

    for ($i = 0; $i -lt $sizes.Count; $i++) {
      $size = $sizes[$i]
      $blob = $pngBlobs[$i]
      $w = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $h = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      # ICONDIRENTRY
      $bw.Write([byte]$w)                   # width (0 = 256)
      $bw.Write([byte]$h)                   # height (0 = 256)
      $bw.Write([byte]0)                    # colorCount (0 = >256)
      $bw.Write([byte]0)                    # reserved
      $bw.Write([uint16]1)                  # planes
      $bw.Write([uint16]32)                 # bitCount
      $bw.Write([uint32]$blob.Length)       # size
      $bw.Write([uint32]$dataOffset)        # offset
      $dataOffset += $blob.Length
    }

    for ($i = 0; $i -lt $pngBlobs.Count; $i++) {
      $bw.Write($pngBlobs[$i])
    }
  } finally {
    $bw.Dispose()
  }

  [System.IO.File]::WriteAllBytes((Resolve-Path -Path (Split-Path $OutputIco -Parent) -ErrorAction SilentlyContinue | Join-Path -ChildPath (Split-Path $OutputIco -Leaf)), $ms.ToArray())
} finally {
  $ms.Dispose()
}

Write-Host "Wrote $OutputIco ($((Get-Item $OutputIco).Length) bytes, $($sizes.Count) sizes: $($sizes -join ','))"
