# TrackMetal - Sistema de Rastreamento com Login

## 📋 Configuração Inicial

### 1. Banco de Dados

#### Se é a primeira vez executando:
```bash
# Execute o arquivo login.sql no MySQL
mysql -u root -p < login.sql
```

#### Se o banco já existe, adicione a coluna de senha:
```sql
ALTER TABLE pessoas ADD COLUMN senha VARCHAR(100) NOT NULL DEFAULT '';
```

### 2. Dependências

```bash
npm install
```

### 3. Iniciar o Servidor

```bash
node server.js
```

O servidor estará rodando em: **http://localhost:3000**

---

## 🔐 Sistema de Autenticação

### Fluxo de Usuário:

1. **Página de Login** (`loginstate.html`)
   - Acessar: http://localhost:3000
   - Login com CPF e Senha

2. **Página de Cadastro** (`login.html`)
   - Acessar: http://localhost:3000/register
   - Cadastrar novo usuário
   - Senha padrão = CPF

3. **Dashboard** (`index.html`)
   - Acessar: http://localhost:3000/index
   - Acesso apenas para usuários autenticados
   - Mostrar informações do usuário logado
   - Botão de logout na barra lateral

---

## 🚀 Recursos

### Autenticação
- ✅ Login com CPF e Senha
- ✅ Proteção de página (redireciona para login se não autenticado)
- ✅ Armazenamento de sessão (localStorage)
- ✅ Botão de logout

### Interface
- ✅ Design responsivo e moderno
- ✅ Modo claro/escuro
- ✅ Animações suaves
- ✅ Mensagens de erro/sucesso

### Banco de Dados
- ✅ Validação de CPF único
- ✅ Verificação de credenciais
- ✅ Armazenamento de endereço

---

## 📱 Endpoints da API

### POST `/login`
**Request:**
```json
{
  "cpf": "00000000000",
  "senha": "senha123"
}
```

**Response (Sucesso):**
```json
{
  "sucesso": true,
  "mensagem": "Login realizado com sucesso",
  "usuarioId": 1,
  "usuarioNome": "João Silva",
  "cpf": "00000000000"
}
```

**Response (Erro):**
```json
{
  "sucesso": false,
  "mensagem": "CPF ou senha inválidos"
}
```

### POST `/cadastrar`
**Request:**
```json
{
  "nome": "João Silva",
  "cpf": "00000000000",
  "data_nascimento": "1990-01-15",
  "rua": "Rua das Flores",
  "cidade": "São Paulo",
  "estado": "SP",
  "senha": "senha123"
}
```

---

## 🔒 Segurança

⚠️ **Atenção**: Este é um sistema de exemplo educacional.

### Para Produção:
- Use bcrypt para hash de senhas
- Implemente rate limiting
- Use HTTPS
- Adicione CSRF protection
- Implemente JWT tokens
- Adicione verificação de email

---

## 📝 Estrutura de Arquivos

```
site TSEA/
├── server.js          # Servidor Node.js/Express
├── loginstate.html    # Página de Login
├── login.html         # Página de Cadastro
├── index.html         # Dashboard (protegido)
├── login.sql          # Script de criação do BD
└── package.json       # Dependências
```

---

## 🆘 Troubleshooting

### "Conectado com sucesso ao MySQL!"
✅ Banco de dados está funcionando

### "Erro: EADDRINUSE :::3000"
A porta 3000 está em uso. Use outra porta ou encerre o processo.

### "CPF não encontrado"
O usuário não foi cadastrado ainda. Acesse /register para cadastrar.

---

## 📧 Contato & Suporte

Para dúvidas sobre o sistema, consulte a documentação interna.

---

**Última atualização:** 2026-07-01
