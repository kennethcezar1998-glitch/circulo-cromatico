# Como instalar o Círculo Cromático no Photoshop

Passo a passo de instalação · versão 1.0.0

> **O que você precisa:** o arquivo [`dist/Circulo-Cromatico.ccx`](dist/Circulo-Cromatico.ccx). É o instalador do plug-in.
> Não precisa abrir nem descompactar: siga os passos abaixo.
> (A mesma explicação, formatada para abrir no navegador, está em [`dist/COMO INSTALAR.html`](dist/COMO%20INSTALAR.html).)

## 1. Antes de começar

- **Photoshop 2024 (versão 25.0) ou mais novo.** Para conferir, abra o Photoshop e vá em **Ajuda › Sobre o Photoshop** (no Mac: **Photoshop › Sobre o Photoshop**).
- **Aplicativo Creative Cloud** instalado. Ele já vem com o Photoshop e é ele que faz a instalação.
- Abra o Photoshop **pelo menos uma vez** antes de instalar e depois **feche-o**.
- Funciona no Windows e no Mac.

## 2. Instalar com dois cliques (jeito normal)

1. Feche o Photoshop.
2. Copie o arquivo `Circulo-Cromatico.ccx` para o computador (por exemplo, para a Área de Trabalho).
3. Dê **dois cliques** no arquivo `Circulo-Cromatico.ccx`.
4. O aplicativo Creative Cloud vai abrir e mostrar um aviso dizendo que o plug-in *não vem do Marketplace da Adobe*. Isso é normal para plug-ins distribuídos diretamente. Clique em **Instalar** (ou **OK**).
5. Se o Windows ou o Mac pedir senha de administrador, digite a senha do computador.
6. Aguarde a mensagem de que a instalação foi concluída.

**Deu certo?** Pule para a seção [4. Abrir o painel](#4-abrir-o-painel).
Se o duplo clique não fez nada ou apareceu um erro, use a seção 3.

## 3. Se o duplo clique não funcionar

### Windows

1. Clique no menu Iniciar, digite `cmd`, clique com o botão direito em **Prompt de Comando** e escolha **Executar como administrador**.
2. Copie e cole este comando e aperte **Enter**:

   ```
   cd "C:\Program Files\Common Files\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent"
   ```

3. Depois cole este, trocando o caminho pelo lugar onde está o seu arquivo, e aperte **Enter**:

   ```
   UnifiedPluginInstallerAgent.exe /install "%USERPROFILE%\Desktop\Circulo-Cromatico.ccx"
   ```

   Dica: se o arquivo estiver em outra pasta, segure **Shift**, clique com o botão direito nele e escolha **Copiar como caminho**; depois cole no lugar do caminho acima.

4. A mensagem final deve dizer que a instalação foi concluída com sucesso.

### Mac

1. Abra o **Terminal** (Aplicativos › Utilitários › Terminal).
2. Cole este comando e aperte **Enter**:

   ```
   cd "/Library/Application Support/Adobe/Adobe Desktop Common/RemoteComponents/UPI/UnifiedPluginInstallerAgent/UnifiedPluginInstallerAgent.app/Contents/macOS"
   ```

3. Depois este (ajuste o caminho se o arquivo não estiver na Mesa):

   ```
   sudo ./UnifiedPluginInstallerAgent --install ~/Desktop/Circulo-Cromatico.ccx
   ```

   Ele vai pedir a senha do Mac. Os caracteres não aparecem enquanto você digita; é normal.

### Último recurso: carregar pelo UXP Developer Tool

Use só se nada acima funcionar. Nesse modo, o plug-in precisa ser carregado de novo toda vez que o Photoshop for aberto.

1. Renomeie `Circulo-Cromatico.ccx` para `Circulo-Cromatico.zip` e extraia para uma pasta.
2. No Photoshop: **Editar › Preferências › Plug-ins** (no Mac: **Photoshop › Configurações › Plug-ins**) e marque **Ativar Modo de Desenvolvedor**. Reinicie o Photoshop.
3. No aplicativo Creative Cloud, procure e instale **UXP Developer Tool**.
4. Abra o UXP Developer Tool, clique em **Add Plugin** e escolha o arquivo `manifest.json` da pasta extraída.
5. Com o Photoshop aberto, clique nos **•••** do plug-in e em **Load**.

## 4. Abrir o painel

1. Abra o Photoshop.
2. Vá em **Plug-ins › Círculo Cromático RYB › Círculo Cromático**.
3. O painel aparece flutuando. Arraste-o pela aba até a lateral para encaixá-lo junto aos outros painéis.

Não aparece no menu **Plug-ins**? Feche e abra o Photoshop de novo. Se ainda não aparecer, abra **Plug-ins › Painel de Plug-ins** e veja se o Círculo Cromático está na lista e ativado.

## 5. Como usar

| Ação | O que acontece |
|---|---|
| Arrastar no anel ou no triângulo | A cor vira a **cor de primeiro plano** do Photoshop na hora. |
| Usar o conta-gotas, o seletor de cores, `X` ou `D` no Photoshop | O círculo acompanha automaticamente. |
| Clicar numa amostra (harmonias, paleta de 9 cores, Luz e Sombra) | A amostra vira a cor de primeiro plano. O círculo continua onde estava, para você poder pegar várias cores da mesma paleta. |
| **Alt** + clique numa amostra | Copia o código HEX. |
| Quadrados no canto do círculo | Cor principal e secundária (primeiro plano e plano de fundo). A setinha troca as duas; o ícone preto e branco volta ao padrão. |
| Botão branco no canto | Modo compacto: mostra só o círculo e as harmonias. |
| Bolinha no canto do título | **Verde**: ligado ao Photoshop. **Cinza**: sem ligação. Geralmente é porque alguma caixa de diálogo do Photoshop está aberta; feche-a. |

## 6. Atualizar ou desinstalar

- **Atualizar:** quando receber um `.ccx` mais novo, é só instalar por cima, do mesmo jeito.
- **Desinstalar:** no aplicativo Creative Cloud, abra a área de **Plug-ins** (em **Stock e Marketplace** ou pelo ícone de peça de quebra-cabeça), clique em **Gerenciar plug-ins**, depois nos **•••** ao lado de “Círculo Cromático RYB” e em **Desinstalar**.

## 7. Problemas comuns

| Problema | Solução |
|---|---|
| Erro “status = -198” ou “falha na instalação” | Atualize o aplicativo Creative Cloud, abra e feche o Photoshop uma vez e tente de novo pela seção 3, como administrador. |
| “Este plug-in não é compatível” | O Photoshop é anterior à versão 25.0 (2024). Atualize o Photoshop pelo Creative Cloud. |
| A cor não muda no Photoshop | Veja se a bolinha do título está verde. Se estiver cinza, feche diálogos abertos (Níveis, Curvas, Salvar etc.). |
| O duplo clique abre outro programa (WinRAR, 7-Zip…) | Use o método da seção 3. |
