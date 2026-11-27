# Política de Backup e Recuperação — Beju Caramelos (JuJu Delivery)

## 1. Objetivos Operacionais (RPO / RTO / Retenção)

- **RPO (Perda máxima aceitável):** 24 horas (execução diária automatizada às **03:00 BRT** / `06:00 UTC`).
- **RTO (Tempo alvo de restauração):** < 30 minutos via `pg_restore`.
- **Retenção automatizada:** 90 dias no GitHub Actions (`retention-days: 90`) com checksum `SHA-256` e criptografia simétrica **AES-256** (`gpg`).
- **Teste de restauração (Drill):** a cada 90 dias, validar um restore em banco temporário de testes.

---

## 2. Configuração Inicial dos Secrets no GitHub (Obrigatória, 1 única vez)

No repositório GitHub (`marcelopfbarros-pixel/beju-caramelos`), acesse **Settings → Secrets and variables → Actions → New repository secret** e crie:

1. **`SUPABASE_DB_URL`**
   - No Supabase Dashboard (`zfqpqhutklhvwoulflwc`), abra **Project Settings → Database → Connect** e copie a URI do **Session Pooler** (compatível com IPv4 dos runners do GitHub Actions):
     ```text
     postgresql://postgres.zfqpqhutklhvwoulflwc:<DB_PASSWORD>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require
     ```
2. **`BACKUP_ENCRYPTION_KEY`**
   - Uma senha/passphrase forte e aleatória armazenada no gerenciador de senhas da equipe (nunca versionada no código).

Após salvar os dois secrets, você pode testar imediatamente pela aba **Actions → Supabase Daily Encrypted Backup → Run workflow**.

---

## 3. Runbook de Descriptografia e Restauração (`pg_restore`)

1. Baixe o artifact `supabase-backup-<STAMP>.zip` da execução desejada no GitHub Actions e descompacte os arquivos `.dump.gpg` e `.dump.gpg.sha256`.
2. Valide a integridade antes de descriptografar:
   ```bash
   sha256sum -c beju_caramelos_<STAMP>.dump.gpg.sha256
   ```
3. Descriptografe o arquivo usando a passphrase `BACKUP_ENCRYPTION_KEY`:
   ```bash
   gpg --decrypt --output beju_caramelos_<STAMP>.dump beju_caramelos_<STAMP>.dump.gpg
   ```
4. Inspecione o conteúdo sem alterar nenhum banco:
   ```bash
   pg_restore --list beju_caramelos_<STAMP>.dump | head -n 40
   ```
5. **Teste de restore em banco scratch (recomendado trimestralmente):**
   ```bash
   pg_restore --dbname="<SCRATCH_DB_URI>" --no-owner --no-acl beju_caramelos_<STAMP>.dump
   ```
6. **Restauração de emergência em produção (somente após confirmar snapshot atual):**
   ```bash
   pg_restore --dbname="<SUPABASE_DB_URL>" --clean --if-exists --no-owner --no-acl beju_caramelos_<STAMP>.dump
   ```

> [!NOTE]
> O workflow realiza dump completo dos schemas `public` e `private` (incluindo `private.operador_credenciais` com hashes bcrypt). Usuários `auth.users` ficam gerenciados pelo Supabase Auth e podem ser reassociados em caso de migração de projeto.

---

## 4. Camada Complementar In-App (`Configurações → Dados`)

Além do `pg_dump` diário criptografado:
- **Snapshot JSON (`.json` — recomendado):** exportação/restauração **sem perdas** (imune ao limite de `32.767` caracteres por célula do Excel), cobrindo unidades, categorias, produtos, pedidos (incluindo `statusPagamento` e `valorPago`), estoque, movimentações de estoque, clientes, ordens de produção, usuários (sem senhas/PINs em texto claro), meios financeiros, conciliações/NF, configurações (`app_configuracoes`) e taxas por bairro (`taxas_entrega_bairros`).
- **Planilha Excel (`.xlsx`):** exportação e restauração em 13 abas tabulares para inspeção visual e carga em lote.
- **Lembrete na tela:** o último backup (`last_backup_meta` em `app_configuracoes`) é exibido em `Configurações → Dados` com aviso quando passar de 7 dias sem exportação registrada.
