const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Conexão com o Banco de Dados MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',          // Coloque o seu usuário do MySQL aqui
    password: '',          // Coloque a sua senha do MySQL aqui
    database: 'sistema_usuarios'
});

const ensureUserSchema = () => {
    db.query("SHOW COLUMNS FROM pessoas LIKE 'senha'", (err, results) => {
        if (err) {
            console.error('Erro ao verificar coluna senha:', err.message);
            return;
        }

        if (results.length === 0) {
            db.query("ALTER TABLE pessoas ADD COLUMN senha VARCHAR(100) NOT NULL DEFAULT ''", (alterErr) => {
                if (alterErr) {
                    console.error('Erro ao adicionar coluna senha:', alterErr.message);
                    return;
                }
                console.log('Coluna senha adicionada com sucesso na tabela pessoas.');
            });
        } else {
            console.log('Coluna senha já existe na tabela pessoas.');
        }
    });
};

db.connect((err) => {
    if (err) throw err;
    console.log('Conectado com sucesso ao MySQL!');
    ensureUserSchema();
});

// Rota principal (http://localhost:3000/) - Agora serve o seu novo index.html (Tela de Login)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota do painel de monitoramento - Agora serve o seu arquivo site.html
app.get('/site.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'site.html'));
});

// Rota para servir a página de registro (login.html)
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Rota de LOGIN - Valida CPF e Senha com criação de Token
app.post('/login', (req, res) => {
    const { cpf, senha } = req.body;

    if (!cpf || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'CPF e senha são obrigatórios' });
    }

    // Busca o usuário pelo CPF
    const query = 'SELECT id, nome, cpf, senha FROM pessoas WHERE cpf = ?';
    
    db.query(query, [cpf], (err, resultados) => {
        if (err) {
            return res.status(500).json({ sucesso: false, mensagem: 'Erro no servidor' });
        }

        if (resultados.length === 0) {
            return res.status(401).json({ sucesso: false, mensagem: 'CPF não encontrado' });
        }

        const usuario = resultados[0];

        // Verificar a senha (comparação simples)
        if (usuario.senha !== senha) {
            return res.status(401).json({ sucesso: false, mensagem: 'Senha incorreta' });
        }

        // Criamos um token simples juntando o ID e o Nome do banco (Codificado em Base64 para segurança básica)
        const infoUsuario = JSON.stringify({ id: usuario.id, nome: usuario.nome });
        const tokenSimples = Buffer.from(infoUsuario).toString('base64');

        // Login bem-sucedido retornando as credenciais e o token de acesso
        res.json({
            sucesso: true,
            mensagem: 'Login realizado com sucesso',
            token: tokenSimples,
            usuarioNome: usuario.nome,
            cpf: usuario.cpf
        });
    });
});

// Rota que recebe os dados enviados pelo arquivo HTML de CADASTRO
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, data_nascimento, rua, cidade, estado, senha } = req.body;

    // Validação básica
    if (!nome || !cpf || !data_nascimento || !rua || !cidade || !estado || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Todos os campos são obrigatórios' });
    }

    // Verificar se CPF já existe
    const checkQuery = 'SELECT id FROM pessoas WHERE cpf = ?';
    db.query(checkQuery, [cpf], (err, resultados) => {
        if (err) {
            return res.status(500).json({ sucesso: false, mensagem: 'Erro ao verificar CPF: ' + err.message });
        }

        if (resultados.length > 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'Este CPF já está cadastrado' });
        }

        // 1. Insere primeiro na tabela de pessoas
        const queryPessoa = 'INSERT INTO pessoas (nome, cpf, data_nascimento, senha) VALUES (?, ?, ?, ?)';
        
        db.query(queryPessoa, [nome, cpf, data_nascimento, senha], (err, resultado) => {
            if (err) {
                return res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar pessoa: ' + err.message });
            }

            // Descobre o ID que o MySQL acabou de gerar para essa pessoa
            const pessoaId = resultado.insertId;

            // 2. Usa esse ID para salvar o endereço na tabela de endereços
            const queryEndereco = 'INSERT INTO enderecos (pessoa_id, rua, cidade, estado) VALUES (?, ?, ?, ?)';
            
            db.query(queryEndereco, [pessoaId, rua, cidade, estado], (err) => {
                if (err) {
                    return res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar endereço: ' + err.message });
                }
                
                res.json({ sucesso: true, mensagem: 'Cadastro realizado com sucesso' });
            });
        });
    });
});

// Inicia o servidor na porta 3000
const startServer = () => {
    app.listen(3000, () => {
        console.log('Servidor rodando em http://localhost:3000');
    });
};

// Espera a verificação do schema para iniciar o servidor
setTimeout(startServer, 500);
