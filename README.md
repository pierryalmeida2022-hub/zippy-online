# Zippy Adventure Multiplayer

## Estrutura
- index.html
- style.css
- game.js
- server.js
- package.json

## Testar no PC
1. Instale Node.js 18+.
2. Abra o terminal nesta pasta.
3. Rode:
   npm install
4. Depois:
   npm start
5. Abra `http://localhost:3000` somente para testar o servidor; o jogo deve ser servido por um servidor HTTP, por exemplo Live Server.
6. No `game.js`, para testar localmente, o endereço padrão do Socket.IO já é `http://localhost:3000`.

## Publicar
O GitHub Pages hospeda o front-end, mas NÃO o `server.js`.
Você precisa publicar o servidor Node em um serviço que aceite WebSockets.
Depois, no começo de `game.js`, você pode definir:
window.MULTIPLAYER_SERVER_URL = "https://SEU-SERVIDOR.example";
antes da linha `const socket = io(...)`.

## Recursos
- criar sala com código de 6 caracteres
- entrar por código
- até 8 jogadores
- jogadores visíveis
- sincronização de posição em tempo real
- nomes acima dos jogadores
- cores diferentes
