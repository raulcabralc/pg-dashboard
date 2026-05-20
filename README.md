# PG Interactive Dashboard

Uma ferramenta plug-and-play de gerenciamento de banco de dados e geração de relatórios dinâmicos para PostgreSQL. Assim como o Swagger UI mapeia rotas de uma API, este pacote mapeia a estrutura de um banco de dados Postgres em tempo de execução e injeta uma interface web completa e minimalista em uma rota isolada da sua aplicação Express.

---

## 🚀 Funcionalidades

- **Mapeamento Agnóstico:** Lê o `information_schema` do PostgreSQL para descobrir tabelas, colunas e tipos de dados dinamicamente. Zero configuração de modelos ou schemas.
- **Gerador de Relatórios Interativos:** Interface visual para seleção dinâmica de entidades (tabelas) e campos (colunas), permitindo a extração customizada de dados.
- **Exportação de Dados:** Botão integrado para conversão imediata do relatório gerado em arquivos `.csv` estruturados.
- **CRUD Genérico:** Interface limpa para operações de inserção, leitura, atualização e exclusão em qualquer tabela detectada.
- **Isolamento Completo:** Roda em um roteador Express próprio, com um pool de conexões dedicado, sem interferir nas regras de negócio ou rotas existentes da aplicação hospedeira.

---

## 🛠️ Arquitetura e Fluxo de Dados

O pacote encapsula o frontend (construído em React e compilado como assets estáticos) e o backend (endpoints Express) sob o mesmo path relativo.

```text
[Qualquer Banco Postgres]
          │
          ▼ (Via Pool Isolado de Conexões)
┌────────────────────────────────────────┐
│         Middleware Express             │
│  ├── /api/metadata  -> Tabelas/Colunas │
│  ├── /api/query     -> Query Dinâmica  │
│  └── /*             -> Assets (React)  │
└────────────────────────────────────────┘
```

1. **Descoberta**: O cliente acessa a rota definida e o servidor entrega o SPA (Single Page Application) do React. O frontend solicita os metadados do banco.
2. **Processamento**: O backend consulta as tabelas do sistema do Postgres, converte a estrutura física em um JSON descritivo e devolve ao frontend.
3. **Execução**: O usuário monta o relatório na UI. O frontend envia a especificação do relatório (campos, tabela, filtros). O backend valida os nomes contra SQL Injection, monta a query parametrizada, executa no banco e retorna os dados brutos.

## 📦 Estrutura de Pastas do Pacote

pg-interactive-dashboard/
├── frontend/
│   ├── dist/                  # Build de produção do React (index.html, JS, CSS)
│   ├── vite.config.js         # Configurado com base: './' para caminhos relativos
│   └── src/                   # Código-fonte da interface de relatórios
└── backend/
    ├── src/
    │   ├── queryBuilder.js    # Utilitário de montagem e validação de SQL dinâmico
    │   └── router.js          # Roteador Express (EndPoints + Static Assets)
    └── index.js               # Ponto de entrada principal do pacote

## 💻 Instalação e Uso

**Prerequisitos**

* Node.js (versão v18 ou superior)
* Banco de dados PostgreSQL funcional

### Integração no Express

Instale o pacote no seu projeto principal e monte o middleware passando a string de conexão do banco e o path desejado utilizando a convenção camelCase para as propriedades de configuração:

```js
const express = require('express');
const { pgDashboard } = require('pg-interactive-dashboard');

const app = express();
app.use(express.json());

// Injeção do dashboard em uma rota isolada
app.use('/admin/db', pgDashboard({
  connectionString: process.env.DATABASE_URL,
  enableCrud: true // Opcional: habilita/desabilita inserção e exclusão pela UI
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Aplicação rodando na porta ${PORT}`);
  console.log(`Dashboard do banco de dados disponível em http://localhost:${PORT}/admin/db`);
});
```

## 🔒 Segurança e Validação (Anti-SQL Injection)

Como o sistema aceita strings vindas da interface identificando tabelas e colunas, a aplicação implementa uma camada rigorosa de segurança antes de tocar no banco de dados:

* **Branca (Whitelist)**: Nenhuma string vinda do frontend é interpolada diretamente no SQL. O backend valida se a tabela solicitada pertence ao array retornado pelo `information_schema.tables`. Se não existir, a requisição é rejeitada imediatamente com `400 Bad Request`.
* **Validação de Colunas**: O mesmo processo se aplica às colunas selecionadas. Elas passam por uma checagem contra os metadados reais daquela tabela específica armazenados no banco.
* **Filtros Parametrizados**: Valores de filtros informados pelo usuário utilizam placeholders nativos do driver `pg` (`$1`, `$2`), impedindo injeção de comandos maliciosos através de inputs de texto.

## 📋 Especificação da API Interna

Todas as rotas da API interna do pacote operam de forma relativa ao caminho base definido pelo usuário (ex: `/admin/db/...`).

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/tables` | Retorna uma lista com os nomes de todas as tabelas públicas do banco de dados. |
| `GET` | `/api/tables/:tableName/columns` | Retorna o nome e o tipo de dados (`data_type`) de todas as colunas de uma tabela específica. |
| `POST` | `/api/reports/generate` | Recebe a tabela, array de colunas e filtros no body. Executa a query dinâmica e retorna o JSON para popular a tabela e o CSV. |
