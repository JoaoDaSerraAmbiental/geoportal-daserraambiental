# ==========================================================
# Gerador de Pacote GeoJSON (build_data.ps1)
# Da Serra Ambiental
# ==========================================================

$baseDir = $PSScriptRoot
$projetosDir = Join-Path $baseDir "Limites de Projetos"
$outrosDir = Join-Path $baseDir "Outros Limites"
$outPath = Join-Path $baseDir "geojson_data.js"

function Get-FileContentShared($path) {
    $fs = [System.IO.FileStream]::new($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $sr = [System.IO.StreamReader]::new($fs, [System.Text.Encoding]::UTF8)
    $text = $sr.ReadToEnd()
    $sr.Close()
    $fs.Close()
    return $text
}

Write-Host "Compilando camadas GeoJSON para geojson_data.js..."

$sb = [System.Text.StringBuilder]::new()
[void]$sb.Append("window.GEOPORTAL_DATA = {`"projetos`":{")

if (Test-Path $projetosDir) {
    $projFiles = Get-ChildItem $projetosDir -Filter "*.geojson" | Sort-Object Name
    $first = $true
    foreach ($f in $projFiles) {
        $key = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
        try {
            $content = (Get-FileContentShared $f.FullName).Trim()
            if (-not $first) { [void]$sb.Append(",") }
            $first = $false
            [void]$sb.Append("`"$key`":$content")
            Write-Host " [OK] Projeto carregado: $key"
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
            Write-Host " [OK] Outro Limite carregado: $key"
        } catch {
            Write-Host " [ERRO] Falha ao carregar $($key): $_"
        }
    }
}

[void]$sb.Append("}};")

[System.IO.File]::WriteAllText($outPath, $sb.ToString(), [System.Text.Encoding]::UTF8)
$sizeMb = [math]::Round((Get-Item $outPath).Length / 1MB, 2)
Write-Host "`n[SUCESSO] geojson_data.js gerado com sucesso! Tamanho: $sizeMb MB"
