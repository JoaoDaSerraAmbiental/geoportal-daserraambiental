$port = 8080
$path = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "=========================================================="
Write-Host "      Servidor Geoportal - Da Serra Ambiental Ativo"
Write-Host "      Acesse no navegador: http://localhost:$port/"
Write-Host "      Mantenha esta janela aberta enquanto usa o site."
Write-Host "=========================================================="

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestUrl = $context.Request.Url.LocalPath

        if ($requestUrl -eq "/") { $requestUrl = "/index.html" }

        $filePath = Join-Path $path $requestUrl.Replace('/', '\')

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html"    { "text/html; charset=utf-8" }
                ".css"     { "text/css; charset=utf-8" }
                ".js"      { "application/javascript; charset=utf-8" }
                ".geojson" { "application/json; charset=utf-8" }
                ".json"    { "application/json; charset=utf-8" }
                ".png"     { "image/png" }
                ".jpg"     { "image/jpeg" }
                ".svg"     { "image/svg+xml" }
                ".ico"     { "image/x-icon" }
                default    { "application/octet-stream" }
            }

            $context.Response.ContentType = $contentType
            $content = [System.IO.File]::ReadAllBytes($filePath)
            $context.Response.ContentLength64 = $content.Length
            $context.Response.OutputStream.Write($content, 0, $content.Length)
            $context.Response.StatusCode = 200
        } else {
            $context.Response.StatusCode = 404
        }
        $context.Response.Close()
    }
} finally {
    $listener.Stop()
}
