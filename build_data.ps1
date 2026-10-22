# ==========================================================
# Gerador de Pacote GeoJSON (build_data.ps1)
# Da Serra Ambiental
# ==========================================================

$baseDir   = $PSScriptRoot
$outrosDir = Join-Path $baseDir "Outros Limites"
$outPath   = Join-Path $baseDir "geojson_data.js"
$pyScript  = Join-Path $baseDir "build_data.py"

# 1. Tenta executar o script Python (build_data.py), que inclui processamento de Quadros de Área
if (Test-Path $pyScript) {
    $pyCandidates = [System.Collections.Generic.List[string]]::new()

    # Procura Python no QGIS
    try {
        $qgisPy = Resolve-Path "C:\Program Files\QGIS*\apps\Python*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($qgisPy) { $pyCandidates.Add($qgisPy.Path) }
    } catch {}

    # Procura py.exe e python.exe no PATH (ignorando o stub da Microsoft Store)
    $cmdPy = Get-Command py -ErrorAction SilentlyContinue
    if ($cmdPy -and $cmdPy.Source) { $pyCandidates.Add($cmdPy.Source) }

    $cmdPython = Get-Command python -ErrorAction SilentlyContinue
    if ($cmdPython -and $cmdPython.Source -and ($cmdPython.Source -notmatch "WindowsApps")) {
        $pyCandidates.Add($cmdPython.Source)
    }

    # Procura Python no AppData
    Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\*\python.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        $pyCandidates.Add($_.FullName)
    }
    Get-ChildItem "$env:LOCALAPPDATA\Python\*\python.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        $pyCandidates.Add($_.FullName)
    }

    foreach ($p in $pyCandidates) {
        if (Test-Path $p) {
            if ($p -match "apps\\Python") {
                $env:PYTHONHOME = Split-Path $p -Parent
            }
            # Testa se o Python funciona
            & $p -c "import sys; sys.exit(0)" 2>$null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Executando build_data.py via '$p'..."
                & $p $pyScript
                if ($LASTEXITCODE -eq 0) { exit 0 }
            }
        }
    }
}

Write-Host "Executando compilação nativa em PowerShell com busca recursiva e vinculação de QA..."

function Get-FileContentShared($path) {
    $fs = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $sr = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
    $text = $sr.ReadToEnd()
    $sr.Close()
    $fs.Close()
    return $text
}

# 1. Pre-scan todos os arquivos de Quadros de Área no PowerShell
$qaMap = @{}
$qaFiles = Get-ChildItem (Join-Path $baseDir "Limites de Projetos") -Recurse -Filter "*.geojson" -ErrorAction SilentlyContinue | 
    Where-Object { $_.FullName -match "Quadros de ($(([char]0xC1))|a)rea|quadro" }

foreach ($qf in $qaFiles) {
    $qname = [System.IO.Path]::GetFileNameWithoutExtension($qf.Name)
    $cleanName = $qname -replace '(?i)^qa\s*', ''
    $normName = $cleanName.ToLower().Trim()
    try {
        $jsonText = Get-FileContentShared $qf.FullName
        $qObj = $jsonText | ConvertFrom-Json
        if ($qObj.features) {
            $rows = @()
            foreach ($feat in $qObj.features) {
                if ($feat.properties) {
                    $rows += $feat.properties
                }
            }
            if ($rows.Count -gt 0) {
                $qaMap[$normName] = ($rows | ConvertTo-Json -Compress)
                Write-Host " [QA LINKED PS] Quadro de Área -> $cleanName ($($rows.Count) linhas)"
            }
        }
    } catch {}
}

$sb = [System.Text.StringBuilder]::new()
[void]$sb.Append("window.GEOPORTAL_DATA = {`"projetos`":{")

$firstProj = $true

$projFiles = Get-ChildItem (Join-Path $baseDir "Limites de Projetos") -Recurse -Filter "*.geojson" -ErrorAction SilentlyContinue | 
    Where-Object { $_.FullName -notmatch "Quadros de ($(([char]0xC1))|a)rea|quadro" } | 
    Sort-Object Name

foreach ($f in $projFiles) {
    $rawKey = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
    $rel = $f.FullName.Substring($baseDir.Length).ToLower()
    $thisCatKey = "restauracao"
    if ($rel -match "floresta") {
        if ($rel -match "mata|nativa|vegetac|averbad|sare|gleba") {
            $thisCatKey = "floresta_mata_nativa"
        } else {
            $thisCatKey = "floresta_pronta"
        }
    } elseif ($rel -match "propriedad") {
        $thisCatKey = "area_propriedade"
    } else {
        $thisCatKey = "restauracao"
    }

    $key = "${thisCatKey}__${rawKey}"
    $normRaw = $rawKey.ToLower().Trim()
    $baseRaw = ($normRaw -split ' - ')[0].Trim()
    try {
        $content = (Get-FileContentShared $f.FullName).Trim()

        $matchedQa = $null
        if ($thisCatKey -in @("floresta_pronta", "floresta_mata_nativa")) {
            if ($qaMap.ContainsKey($normRaw)) {
                $matchedQa = $qaMap[$normRaw]
            } elseif ($qaMap.ContainsKey($baseRaw)) {
                $matchedQa = $qaMap[$baseRaw]
            } else {
                $cleanRaw = $baseRaw -replace '^(faz\.|fazenda|sitio)\s*', '' -replace '\s+', ''
                foreach ($qk in $qaMap.Keys) {
                    $cleanQk = $qk -replace '^(faz\.|fazenda|sitio)\s*', '' -replace '\s+', ''
                    if ($cleanRaw -eq $cleanQk) {
                        $matchedQa = $qaMap[$qk]
                        break
                    }
                }
            }
        }

        if ($matchedQa) {
            $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$thisCatKey`",`"quadro_area`":$matchedQa"
        } else {
            $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$thisCatKey`""
        }

        if (-not $firstProj) { [void]$sb.Append(",") }
        $firstProj = $false
        [void]$sb.Append("`"$key`":$content")
        Write-Host " [OK] [$thisCatKey] $rawKey ($key)"
    } catch {
        Write-Host " [ERRO] Falha ao carregar $($key): $_"
    }
}

[void]$sb.Append("},`"outros`":{")

if (Test-Path $outrosDir) {
    $outrosFiles = Get-ChildItem $outrosDir -Filter "*.geojson" | Sort-Object Name
    $first = $true
    foreach ($f in $outrosFiles) {
        $key = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
        try {
            $content = (Get-FileContentShared $f.FullName).Trim()
            if (-not $first) { [void]$sb.Append(",") }
            $first = $false
            [void]$sb.Append("`"$key`":$content")
            Write-Host " [OK] [Outros Limites] $key"
        } catch {
            Write-Host " [ERRO] Falha ao carregar $($key): $_"
        }
    }
}

[void]$sb.Append("}};")

[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.Encoding]::UTF8)

# Update cache buster timestamp in index.html
$htmlPath = Join-Path $baseDir "index.html"
if (Test-Path $htmlPath) {
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $htmlContent = Get-Content $htmlPath -Raw -Encoding UTF8
    $newHtml = $htmlContent -replace 'geojson_data\.js(\?v=[^\s"''\>]+)?', "geojson_data.js?v=$ts"
    if ($newHtml -ne $htmlContent) {
        [System.IO.File]::WriteAllText($htmlPath, $newHtml, [System.Text.Encoding]::UTF8)
        Write-Host " [CACHE-BUSTER] index.html atualizado com v=$ts"
    }
}

$sizeMb = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
Write-Host "`n[SUCESSO] geojson_data.js gerado com sucesso! Tamanho: $sizeMb MB`n"
