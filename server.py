import http.server
import socketserver
import webbrowser
import os
import sys

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class GeoportalHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        if self.path == '/' or self.path == '' or self.path == '/index':
            self.path = '/index.html'
        return super().do_GET()

    def log_message(self, format, *args):
        # Quiet log output to keep console clean
        pass

def run_server():
    socketserver.TCPServer.allow_reuse_address = True
    ports = [8000, 8001, 8080, 8088]
    httpd = None
    selected_port = 8000

    for port in ports:
        try:
            httpd = socketserver.TCPServer(("", port), GeoportalHandler)
            selected_port = port
            break
        except OSError:
            continue

    if not httpd:
        print("Erro: Nenhuma porta disponível para iniciar o servidor local.")
        return

    url = f"http://localhost:{selected_port}/index.html"
    print("==========================================================")
    print("      Servidor Geoportal - Da Serra Ambiental Ativo")
    print(f"      Acesse no seu navegador: {url}")
    print("      Mantenha esta janela aberta enquanto usa o site.")
    print("==========================================================")

    webbrowser.open(url)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()
