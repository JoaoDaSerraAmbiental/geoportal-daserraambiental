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
    if (Get-Command py -ErrorAction SilentlyContinue) {
        Write-Host "Executando build_data.py via 'py'..."
        & py $pyScript
        if ($LASTEXITCODE -eq 0) { exit 0 }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        Write-Host "Executando build_data.py via 'python'..."
        & python $pyScript
        if ($LASTEXITCODE -eq 0) { exit 0 }
    }
}

Write-Host "Executando compilação nativa em PowerShell com busca recursiva..."

$categorias = [ordered]@{
    "Restaura$(([char]0xE7))$(([char]0xE3))o" = "restauracao"
    "Floresta Pronta"                          = "floresta_pronta"
    "$(([char]0xC1))rea da Propriedade"        = "area_propriedade"
}

function Get-FileContentShared($path) {
    $fs = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $sr = [System.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
    $text = $sr.ReadToEnd()
    $sr.Close()
    $fs.Close()
    return $text
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
        $key = "${catKey}__${rawKey}"
        try {
            $content = (Get-FileContentShared $f.FullName).Trim()

            # Injeta o campo "categoria" dentro do FeatureCollection
            $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$catKey`""

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
$sizeMb = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
Write-Host "`n[SUCESSO] geojson_data.js gerado com sucesso! Tamanho: $sizeMb MB`n"
