# ==========================================================
# Gerador de Pacote GeoJSON (build_data.ps1)
# Da Serra Ambiental
# ----------------------------------------------------------
# Le as subpastas de "Limites de Projetos":
#   - Restauracao/       -> categoria: restauracao
#   - Floresta Pronta/   -> categoria: floresta_pronta
# Cada arquivo .geojson vira uma entrada em window.GEOPORTAL_DATA
# ==========================================================

$baseDir   = $PSScriptRoot
$outrosDir = Join-Path $baseDir "Outros Limites"
$outPath   = Join-Path $baseDir "geojson_data.js"

# Mapa de subpastas -> chave de categoria usada no app.js
# A chave do hashtable deve bater exatamente com o nome da pasta no disco
$categorias = [ordered]@{
    "Restaura$(([char]0xE7))$(([char]0xE3))o" = "restauracao"
    "Floresta Pronta"                          = "floresta_pronta"
}

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

$firstProj = $true

foreach ($catFolder in $categorias.Keys) {
    $catKey = $categorias[$catFolder]
    $catDir = [System.IO.Path]::Combine($baseDir, "Limites de Projetos", $catFolder)

    if (-not (Test-Path $catDir)) {
        Write-Host " [AVISO] Pasta nao encontrada: $catDir"
        continue
    }

    $projFiles = Get-ChildItem $catDir -Filter "*.geojson" | Sort-Object Name

    foreach ($f in $projFiles) {
        $key = [System.IO.Path]::GetFileNameWithoutExtension($f.Name)
        try {
            $content = (Get-FileContentShared $f.FullName).Trim()

            # Injeta o campo "categoria" dentro do FeatureCollection
            # para que o app.js leia sem precisar de mapeamento manual
            $content = $content -replace '"type"\s*:\s*"FeatureCollection"', "`"type`":`"FeatureCollection`",`"categoria`":`"$catKey`""

            if (-not $firstProj) { [void]$sb.Append(",") }
            $firstProj = $false
            [void]$sb.Append("`"$key`":$content")
            Write-Host " [OK] [$catFolder] $key"
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
