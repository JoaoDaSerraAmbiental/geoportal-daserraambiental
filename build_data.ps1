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
    # Procura por Python no PATH ou na pasta do usuário (AppData)
    $pyExecs = @(
        (Get-Command py -ErrorAction SilentlyContinue),
        (Get-Command python -ErrorAction SilentlyContinue),
        (Get-ChildItem "$env:LOCALAPPDATA\Python\*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1),
        (Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\*\python.exe" -ErrorAction SilentlyContinue | Select-Object -First 1)
    ) | Where-Object { $_ }

    foreach ($pyCmd in $pyExecs) {
        $pyPath = if ($pyCmd.Source) { $pyCmd.Source } else { $pyCmd.FullName }
        if (Test-Path $pyPath) {
            Write-Host "Executando build_data.py via '$pyPath'..."
            & $pyPath $pyScript
            if ($LASTEXITCODE -eq 0) { exit 0 }
        }
    }
}

Write-Host "Executando compilação nativa em PowerShell com busca recursiva e vinculação de QA..."

$categorias = [ordered]@{
    "Restaura$(([char]0xE7))$(([char]0xE3))o" = "restauracao"
    "Floresta Pronta"                          = "floresta_pronta"
    "$(([char]0xC1))rea da Propriedade"        = "area_propriedade"
}

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
$qaFiles = Get-ChildItem (Join-Path $baseDir "Limites de Projetos") -Recurse -Filter "*.geojson" | 
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

foreach ($catFolder in $categorias.Keys) {
    $catKey = $categorias[$catFolder]
    $catDir = [System.IO.Path]::Combine($baseDir, "Limites de Projetos", $catFolder)

    if (-not (Test-Path $catDir)) {
        Write-Host " [AVISO] Pasta nao encontrada: $catDir"
        continue
    }

    $projFiles = Get-ChildItem $catDir -Recurse -Filter "*.geojson" | 
        Where-Object { $_.FullName -notmatch "Quadros de ($(([char]0xC1))|a)rea|quadro" } | 
        Sort-Object Name

    foreach ($f in $projFiles) {
        $rawKey = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
        $thisCatKey = $catKey
        if ($catKey -eq "floresta_pronta" -and ($f.FullName -match "mata|nativa|vegetac")) {
            $thisCatKey = "floresta_mata_nativa"
        }
        $key = "${thisCatKey}__${rawKey}"
        $normRaw = $rawKey.ToLower().Trim()
        try {
            $content = (Get-FileContentShared $f.FullName).Trim()

            if ($thisCatKey -eq "floresta_pronta" -and $qaMap.ContainsKey($normRaw)) {
                $qaStr = $qaMap[$normRaw]
                $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$thisCatKey`",`"quadro_area`":$qaStr"
            } else {
                $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$thisCatKey`""
            }

            if (-not $firstProj) { [void]$sb.Append(",") }
            $firstProj = $false
            [void]$sb.Append("`"$key`":$content")
            Write-Host " [OK] [$catFolder] $rawKey ($key)"
        } catch {
            Write-Host " [ERRO] Falha ao carregar $($key): $_"
        }
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
