# ==========================================================
# Robo de Sincronizacao Automatica (SharePoint -> GitHub)
# Da Serra Ambiental
# ==========================================================

$repoDir = $PSScriptRoot
Set-Location $repoDir

$logFile = Join-Path $repoDir "auto_sync.log"

function Escrever-Log($mensagem) {
    $dataHora = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $linha = "[$dataHora] $mensagem"
    Write-Output $linha
    try {
        Add-Content -Path $logFile -Value $linha -ErrorAction SilentlyContinue
    } catch {}
}

Escrever-Log "=== Robo de Sincronizacao Automatica Iniciado ==="
Escrever-Log "Monitorando pasta: $repoDir"

# 1. Verifica se o Git esta disponivel
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Escrever-Log "ERRO CRITICO: O executavel 'git' nao foi encontrado no PATH deste computador. Instale o Git para Windows."
    exit 1
}

# 2. Verifica se a pasta e um repositorio Git
if (-not (Test-Path (Join-Path $repoDir ".git"))) {
    Escrever-Log "AVISO: A pasta ainda nao possui a pasta .git (repositorio nao conectado localmente)."
    exit 1
}

# Loop continuo de monitoramento
while ($true) {
    try {
        # Verifica se ha alteracoes nos arquivos ou commits pendentes de envio
        $status = git status --porcelain 2>&1
        $ahead = (git status -sb 2>&1) -match 'ahead'

        if (($status -and $status.Count -gt 0) -or $ahead) {
            if ($status -and $status.Count -gt 0) {
                Escrever-Log "Alteracao detectada na pasta! Aguardando 15s para garantir termino do download pelo SharePoint..."
                Start-Sleep -Seconds 15

                # Recompila o pacote geojson_data.js caso novos arquivos tenham sido adicionados
                & (Join-Path $repoDir "build_data.ps1") *>$null

                # Adiciona todos os arquivos (respeitando o .gitignore)
                git add -A

                # Checa se ha mudancas preparadas para commit
                git diff --cached --quiet
                if ($LASTEXITCODE -ne 0) {
                    $timestamp = Get-Date -Format "dd/MM/yyyy HH:mm:ss"
                    Escrever-Log "Criando commit: Atualizacao automatica [$timestamp]"
                    git commit -m "Atualizacao automatica via SharePoint [$timestamp]" | Out-Null
                }
            }

            # Envia para o GitHub se houver commits a enviar
            Escrever-Log "Enviando alteracoes para o GitHub (git push)..."
            $pushResult = git push origin main 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Escrever-Log "[SUCESSO] Alteracoes enviadas para o GitHub! O site sera atualizado em instantes."
            } else {
                Escrever-Log "[AVISO] Falha ao enviar para o GitHub. Tentara novamente no proximo ciclo. Detalhes: $pushResult"
            }
        }
    } catch {
        Escrever-Log "Erro durante o ciclo de sincronizacao: $_"
    }

    # Aguarda 20 segundos antes da proxima checagem
    Start-Sleep -Seconds 20
}
