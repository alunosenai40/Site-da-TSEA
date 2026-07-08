require('dotenv').config();

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

// Em produção (Render, etc.) essas variáveis vêm do painel de configuração do serviço.
// Localmente, se não existir um .env, cai nos valores padrão de sempre (MySQL local).
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistema_usuarios'
};

// Bancos como TiDB Cloud exigem SSL. Ative com DB_SSL=true no ambiente de produção.
if (process.env.DB_SSL === 'true') {
    dbConfig.ssl = { minVersion: 'TLSv1.2', rejectUnauthorized: true };
}

const db = mysql.createConnection(dbConfig);

const query = (sql, params = []) => new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
        if (err) {
            reject(err);
            return;
        }
        resolve(results);
    });
});

const ensureUserSchema = async () => {
    const results = await query("SHOW COLUMNS FROM pessoas LIKE 'senha'");
    if (results.length === 0) {
        await query("ALTER TABLE pessoas ADD COLUMN senha VARCHAR(100) NOT NULL DEFAULT ''");
        console.log('Coluna senha adicionada com sucesso na tabela pessoas.');
    } else {
        console.log('Coluna senha já existe na tabela pessoas.');
    }
};

const ensureBusinessSchema = async () => {
    await query(`
        CREATE TABLE IF NOT EXISTS ordens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            numero_op VARCHAR(30) NOT NULL UNIQUE,
            cliente VARCHAR(100) NOT NULL,
            total_pecas INT NOT NULL DEFAULT 0,
            marcadas INT NOT NULL DEFAULT 0,
            status VARCHAR(30) NOT NULL DEFAULT 'Em andamento',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS datamatrix_leituras (
            id INT AUTO_INCREMENT PRIMARY KEY,
            peca VARCHAR(100) NOT NULL,
            codigo VARCHAR(100) NOT NULL,
            lote VARCHAR(100) DEFAULT '',
            data_leitura VARCHAR(30) DEFAULT '',
            status VARCHAR(30) DEFAULT 'Produção',
            setor VARCHAR(50) DEFAULT '',
            empresa VARCHAR(100) DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const colunaEmpresa = await query("SHOW COLUMNS FROM datamatrix_leituras LIKE 'empresa'");
    if (colunaEmpresa.length === 0) {
        await query("ALTER TABLE datamatrix_leituras ADD COLUMN empresa VARCHAR(100) DEFAULT ''");
    }

    const colunaOrdem = await query("SHOW COLUMNS FROM datamatrix_leituras LIKE 'ordem'");
    if (colunaOrdem.length === 0) {
        await query("ALTER TABLE datamatrix_leituras ADD COLUMN ordem VARCHAR(30) DEFAULT ''");
    }

    await query(`
        CREATE TABLE IF NOT EXISTS empresas (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    console.log('Esquema de ordens e leituras criado com sucesso.');
};

db.connect((err) => {
    if (err) throw err;
    console.log('Conectado com sucesso ao MySQL!');

    (async () => {
        try {
            await ensureUserSchema();
            await ensureBusinessSchema();
            startServer();
        } catch (error) {
            console.error('Erro ao inicializar o banco:', error.message);
            startServer();
        }
    })();
});

const ajustarMarcadasDaOrdem = async (numero_op, delta) => {
    if (!numero_op) return;
    const ordens = await query('SELECT id, marcadas, total_pecas, status FROM ordens WHERE numero_op = ?', [numero_op]);
    if (ordens.length === 0) return;

    const ordem = ordens[0];
    let novasMarcadas = (ordem.marcadas || 0) + delta;
    if (novasMarcadas < 0) novasMarcadas = 0;
    if (ordem.total_pecas && novasMarcadas > ordem.total_pecas) novasMarcadas = ordem.total_pecas;

    let novoStatus = ordem.status;
    if (ordem.total_pecas && novasMarcadas >= ordem.total_pecas) {
        novoStatus = 'Concluída';
    } else if (novoStatus === 'Concluída' && novasMarcadas < ordem.total_pecas) {
        novoStatus = 'Em andamento';
    }

    await query('UPDATE ordens SET marcadas = ?, status = ? WHERE id = ?', [novasMarcadas, novoStatus, ordem.id]);
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/site.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'site.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/login', async (req, res) => {
    const { cpf, senha } = req.body;

    if (!cpf || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'CPF e senha são obrigatórios' });
    }

    try {
        const resultados = await query('SELECT id, nome, cpf, senha FROM pessoas WHERE cpf = ?', [cpf]);

        if (resultados.length === 0) {
            return res.status(401).json({ sucesso: false, mensagem: 'CPF não encontrado' });
        }

        const usuario = resultados[0];
        if (usuario.senha !== senha) {
            return res.status(401).json({ sucesso: false, mensagem: 'Senha incorreta' });
        }

        const infoUsuario = JSON.stringify({ id: usuario.id, nome: usuario.nome });
        const tokenSimples = Buffer.from(infoUsuario).toString('base64');

        res.json({
            sucesso: true,
            mensagem: 'Login realizado com sucesso',
            token: tokenSimples,
            usuarioNome: usuario.nome,
            cpf: usuario.cpf
        });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro no servidor' });
    }
});

app.post('/cadastrar', async (req, res) => {
    const { nome, cpf, data_nascimento, rua, cidade, estado, senha } = req.body;

    if (!nome || !cpf || !data_nascimento || !rua || !cidade || !estado || !senha) {
        return res.status(400).json({ sucesso: false, mensagem: 'Todos os campos são obrigatórios' });
    }

    try {
        const resultados = await query('SELECT id FROM pessoas WHERE cpf = ?', [cpf]);
        if (resultados.length > 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'Este CPF já está cadastrado' });
        }

        const resultadoPessoa = await query(
            'INSERT INTO pessoas (nome, cpf, data_nascimento, senha) VALUES (?, ?, ?, ?)',
            [nome, cpf, data_nascimento, senha]
        );

        const pessoaId = resultadoPessoa.insertId;
        await query('INSERT INTO enderecos (pessoa_id, rua, cidade, estado) VALUES (?, ?, ?, ?)', [pessoaId, rua, cidade, estado]);

        res.json({ sucesso: true, mensagem: 'Cadastro realizado com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar: ' + error.message });
    }
});

app.get('/api/ordens', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const ordens = await query('SELECT * FROM ordens ORDER BY created_at DESC');
        res.json(ordens);
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar ordens: ' + error.message });
    }
});

app.post('/api/ordens', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { cliente, total_pecas, status = 'Em andamento', numero_op } = req.body;

    if (!cliente || !total_pecas) {
        return res.status(400).json({ sucesso: false, mensagem: 'Cliente e total de peças são obrigatórios' });
    }

    const op = numero_op || `OP-${Date.now().toString().slice(-6)}`;

    try {
        const resultado = await query(
            'INSERT INTO ordens (numero_op, cliente, total_pecas, marcadas, status) VALUES (?, ?, ?, 0, ?)',
            [op, cliente, Number(total_pecas), status]
        );

        res.json({
            id: resultado.insertId,
            numero_op: op,
            cliente,
            total_pecas: Number(total_pecas),
            marcadas: 0,
            status
        });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar ordem: ' + error.message });
    }
});

app.put('/api/ordens/:id', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.params;
    const { cliente, total_pecas, marcadas, status } = req.body;

    try {
        await query(
            'UPDATE ordens SET cliente = ?, total_pecas = ?, marcadas = ?, status = ? WHERE id = ?',
            [cliente, Number(total_pecas), Number(marcadas), status, id]
        );
        res.json({ sucesso: true, mensagem: 'Ordem atualizada com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar ordem: ' + error.message });
    }
});

app.delete('/api/ordens/:id', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.params;

    try {
        await query('DELETE FROM ordens WHERE id = ?', [id]);
        res.json({ sucesso: true, mensagem: 'Ordem removida com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover ordem: ' + error.message });
    }
});

app.get('/api/empresas', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const empresas = await query('SELECT * FROM empresas ORDER BY nome ASC');
        res.json(empresas);
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar empresas: ' + error.message });
    }
});

app.post('/api/empresas', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { nome } = req.body;

    if (!nome || !nome.trim()) {
        return res.status(400).json({ sucesso: false, mensagem: 'Nome da empresa é obrigatório' });
    }

    try {
        const existente = await query('SELECT id FROM empresas WHERE nome = ?', [nome.trim()]);
        if (existente.length > 0) {
            return res.status(400).json({ sucesso: false, mensagem: 'Esta empresa já está cadastrada' });
        }

        const resultado = await query('INSERT INTO empresas (nome) VALUES (?)', [nome.trim()]);
        res.json({ id: resultado.insertId, nome: nome.trim(), sucesso: true, mensagem: 'Empresa cadastrada com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao cadastrar empresa: ' + error.message });
    }
});

app.delete('/api/empresas/:id', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.params;

    try {
        await query('DELETE FROM empresas WHERE id = ?', [id]);
        res.json({ sucesso: true, mensagem: 'Empresa removida com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao remover empresa: ' + error.message });
    }
});

app.get('/api/datamatrix', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    try {
        const leituras = await query('SELECT * FROM datamatrix_leituras ORDER BY created_at DESC');
        res.json(leituras);
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao buscar leituras: ' + error.message });
    }
});

app.post('/api/datamatrix', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { peca, codigo, lote = '', data, status = 'Produção', setor = '', empresa = '', ordem = '' } = req.body;

    if (!peca || !codigo) {
        return res.status(400).json({ sucesso: false, mensagem: 'Peça e código são obrigatórios' });
    }

    try {
        const resultado = await query(
            'INSERT INTO datamatrix_leituras (peca, codigo, lote, data_leitura, status, setor, empresa, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [peca, codigo, lote, data || '', status, setor, empresa, ordem]
        );

        if (status === 'Concluído' && ordem) {
            await ajustarMarcadasDaOrdem(ordem, 1);
        }

        res.json({ id: resultado.insertId, sucesso: true, mensagem: 'Leitura salva com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao salvar leitura: ' + error.message });
    }
});

app.put('/api/datamatrix/:id', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.params;
    const { peca, codigo, lote = '', status, setor = '', empresa = '' } = req.body;

    if (!peca || !codigo) {
        return res.status(400).json({ sucesso: false, mensagem: 'Peça e código são obrigatórios' });
    }

    try {
        const existentes = await query('SELECT status, ordem FROM datamatrix_leituras WHERE id = ?', [id]);
        if (existentes.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Leitura não encontrada' });
        }
        const statusAnterior = existentes[0].status;
        const ordemVinculada = existentes[0].ordem;

        await query(
            'UPDATE datamatrix_leituras SET peca = ?, codigo = ?, lote = ?, status = ?, setor = ?, empresa = ? WHERE id = ?',
            [peca, codigo, lote, status, setor, empresa, id]
        );

        if (ordemVinculada) {
            if (statusAnterior !== 'Concluído' && status === 'Concluído') {
                await ajustarMarcadasDaOrdem(ordemVinculada, 1);
            } else if (statusAnterior === 'Concluído' && status !== 'Concluído') {
                await ajustarMarcadasDaOrdem(ordemVinculada, -1);
            }
        }

        res.json({ sucesso: true, mensagem: 'Leitura atualizada com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao atualizar leitura: ' + error.message });
    }
});

app.delete('/api/datamatrix/:id', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const { id } = req.params;

    try {
        const existentes = await query('SELECT status, ordem FROM datamatrix_leituras WHERE id = ?', [id]);
        if (existentes.length === 0) {
            return res.status(404).json({ sucesso: false, mensagem: 'Leitura não encontrada' });
        }

        const statusAnterior = existentes[0].status;
        const ordemVinculada = existentes[0].ordem;

        await query('DELETE FROM datamatrix_leituras WHERE id = ?', [id]);

        if (ordemVinculada && statusAnterior === 'Concluído') {
            await ajustarMarcadasDaOrdem(ordemVinculada, -1);
        }

        res.json({ sucesso: true, mensagem: 'Leitura excluída com sucesso' });
    } catch (error) {
        res.status(500).json({ sucesso: false, mensagem: 'Erro ao excluir leitura: ' + error.message });
    }
});

const startServer = () => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
};
