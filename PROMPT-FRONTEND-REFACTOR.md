# PROMPT: Refatorar Front-End Agent Config - Leitura Supabase + Edição + Gestão de Vector Stores

## Contexto Geral

Este front-end (Next.js 16, React 19, Shadcn/ui, Tailwind) gerencia agentes de IA armazenados no Supabase.
O arquivo principal é `components/agent-config.tsx` (~1598 linhas).

### Arquitetura de dados (Supabase)

**Tabela `agent_configs`** — configuração de cada agente:
```
id (uuid PK), name, description, model, instructions, active (bool),
temperature (numeric), top_p (numeric), reasoning_effort (text),
max_output_tokens (int), tools (jsonb), tool_choice (text),
parallel_tool_calls (bool), metadata (jsonb), openai_api_key (text),
created_at, updated_at
```

**Tabela `vector_stores`** — vector stores independentes:
```
id (uuid PK), openai_vector_store_id (text UNIQUE), name (text),
openai_api_key (text), files (jsonb), total_files (int),
total_size_bytes (bigint), created_at, updated_at
```

**Tabela `agent_vector_stores`** — junção N:N entre agentes e vector stores:
```
id (uuid PK), agent_id (uuid FK → agent_configs.id ON DELETE CASCADE),
vector_store_id (uuid FK → vector_stores.id ON DELETE CASCADE),
created_at
UNIQUE(agent_id, vector_store_id)
```

**Tabela `kommo_configs`** — config do Kommo (1:1 com agent):
```
id (uuid PK), agent_id (uuid FK UNIQUE → agent_configs.id),
kommo_account_id (text), kommo_token (text), kommo_subdomain (text),
funnel_id (text), stage_id (text), created_at, updated_at
```

### API Supabase (PostgREST)

Base URL: `https://rdxtoymdnoofyofbenlp.supabase.co/rest/v1`

Headers obrigatórios em TODAS as chamadas:
```
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeHRveW1kbm9vZnlvZmJlbmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk1NDQsImV4cCI6MjA4NTAzNTU0NH0.FTp5HyiGsg8Z_vymjKBuDEmTmxmtztOv2wS_seuXG-8
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeHRveW1kbm9vZnlvZmJlbmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk1NDQsImV4cCI6MjA4NTAzNTU0NH0.FTp5HyiGsg8Z_vymjKBuDEmTmxmtztOv2wS_seuXG-8
```

Exemplos de queries:
```
GET /agent_configs?select=id,name,model,active,created_at&order=created_at.desc
GET /agent_configs?id=eq.{uuid}&select=*,agent_vector_stores(vector_store_id,vector_stores(id,name,openai_vector_store_id,total_files,total_size_bytes))
GET /vector_stores?select=id,name,openai_vector_store_id,total_files,total_size_bytes,created_at&order=created_at.desc
PATCH /agent_configs?id=eq.{uuid}  (body: campos a atualizar, header extra: Prefer: return=representation)
PATCH /vector_stores?id=eq.{uuid}  (body: campos a atualizar, header extra: Prefer: return=representation)
DELETE /agent_configs?id=eq.{uuid}
DELETE /vector_stores?id=eq.{uuid}
```

### Webhooks (operações complexas que envolvem lógica no n8n)

URL do webhook de agentes: `https://automacao.7club.com.br/webhook/agente-config-webhook`
- `POST { action: "create_agent", agent: {...}, kommo_account_id, kommo_subdomain }` → cria agente
- `POST { action: "update_agent", agent_id: "uuid", agent: {...} }` → atualiza agente (já funciona)

URL do webhook de vector stores: `https://automacao.7club.com.br/webhook/vector-store-upload`
- `POST { action: "upload_files", openai_api_key, files: [...], agent_id?, name? }` → upload (já funciona)
- `POST { action: "assign_vector_store", agent_id, vector_store_id }` → vincular (já funciona)
- `POST { action: "unassign_vector_store", agent_id, vector_store_id }` → desvincular (já funciona)

---

## O que precisa ser feito

### 1. Criar helper para Supabase REST API

Criar uma função utilitária (pode ser no mesmo arquivo ou em `lib/supabase.ts`) para simplificar chamadas:

```typescript
const SUPABASE_URL = "https://rdxtoymdnoofyofbenlp.supabase.co/rest/v1";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkeHRveW1kbm9vZnlvZmJlbmxwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTk1NDQsImV4cCI6MjA4NTAzNTU0NH0.FTp5HyiGsg8Z_vymjKBuDEmTmxmtztOv2wS_seuXG-8";

async function supabaseGet<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

async function supabasePatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
  return res.json();
}

async function supabaseDelete(path: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
}
```

### 2. Adicionar seletor de agente existente (PRIORIDADE ALTA)

No topo da página (acima das tabs, abaixo do header), adicionar uma seção para carregar agentes existentes:

**UI proposta:**
- Um botão "Carregar Agente Existente" que abre um Dialog/Sheet
- Dentro do dialog: lista de agentes vindos do Supabase (`GET /agent_configs?select=id,name,model,active,created_at&order=created_at.desc`)
- Cada item mostra: nome, modelo, status (active/inactive), data de criação
- Ao clicar em um agente, carrega TODOS os dados dele no formulário (incluindo vector stores vinculadas e kommo_configs)
- Query de carregamento completo:
  ```
  GET /agent_configs?id=eq.{uuid}&select=*,agent_vector_stores(vector_store_id,vector_stores(id,name,openai_vector_store_id,total_files,total_size_bytes)),kommo_configs(kommo_account_id,kommo_subdomain)
  ```

**Ao carregar um agente existente:**
- Preencher TODOS os campos do `AgentConfigState` com os dados do banco
- Setar `agentId` com o UUID do agente
- O botão "Create Agent" deve mudar para "Update Agent" (isso já funciona quando `agentId` está preenchido)
- Armazenar as vector stores vinculadas no state local para exibir na aba Knowledge

**Mapeamento de campos (DB → State):**
```
name → name
description → description
model → model
instructions → instructions
active → active
temperature → temperature
top_p → topP
reasoning_effort → reasoningEffort
max_output_tokens → maxOutputTokens (converter para string)
tools → tools (JSON.stringify se for array/object)
tool_choice → toolChoice
parallel_tool_calls → parallelToolCalls
openai_api_key → openaiApiKey
metadata → metadata (converter de object para array de {id, key, value})
kommo_configs[0].kommo_account_id → kommoAccountId
kommo_configs[0].kommo_subdomain → kommoSubdomain
```

### 3. Exibir vector stores vinculadas ao agente (PRIORIDADE ALTA)

Na aba Knowledge, abaixo da seção de upload, mostrar as **vector stores realmente vinculadas a este agente** (vindas do Supabase, não só da sessão).

**Novo state necessário:**
```typescript
const [linkedVectorStores, setLinkedVectorStores] = useState<Array<{
  id: string; // id da tabela vector_stores
  name: string;
  openai_vector_store_id: string;
  total_files: number;
  total_size_bytes: number;
}>>([]);
```

**Quando carregar:**
- Quando um agente é carregado (via seletor ou após criação), buscar as vector stores via embed query
- Extrair de `agent_vector_stores` → `vector_stores` e popular `linkedVectorStores`

**UI:**
- Card "Vector Stores Vinculadas" mostrando cada VS com: nome, ID, total de arquivos, tamanho, botão "Desvincular"
- Botão "Desvincular" chama o webhook `unassign_vector_store` e depois remove do state local
- Botão "Atualizar Lista" para re-fetch do Supabase

### 4. Listar TODAS as vector stores disponíveis para vincular (PRIORIDADE MÉDIA)

Na seção "Vincular Vector Store Existente" (que já existe na aba Knowledge), melhorar a UX:

**Em vez de só um input de UUID**, adicionar um botão "Buscar Vector Stores" que:
- Faz `GET /vector_stores?select=id,name,openai_vector_store_id,total_files,total_size_bytes,created_at&order=created_at.desc`
- Mostra lista em um Dialog com as vector stores disponíveis
- Cada item tem botão "Vincular" que chama o webhook `assign_vector_store`
- Filtrar da lista as que já estão vinculadas ao agente atual

**Manter o input manual de UUID** como fallback (para colar IDs de outra fonte).

### 5. Edição de agente (PRIORIDADE ALTA)

A edição já funciona parcialmente: quando `agentId` está preenchido, o `buildPayload()` envia `action: "update_agent"`. Mas precisamos garantir:

- O botão "Update Agent" deve chamar o webhook existente (`agente-config-webhook`) com action `update_agent`
- Após atualização bem sucedida, exibir toast de sucesso
- O payload de update deve incluir APENAS os campos que mudaram (ou todos, o webhook aceita ambos)

**IMPORTANTE:** A edição de agente via webhook já está implementada no n8n. O que falta é:
1. A capacidade de CARREGAR um agente existente (item 2 acima)
2. Modificar os campos no form
3. Clicar "Update Agent" para salvar

### 6. Edição de Vector Store (PRIORIDADE BAIXA)

Permitir renomear uma vector store diretamente via Supabase:

- Na lista de vector stores vinculadas (item 3), adicionar ícone de edição ao lado do nome
- Ao clicar, transforma o nome em input editável (inline edit)
- Ao confirmar, faz `PATCH /vector_stores?id=eq.{uuid}` com `{ "name": "novo nome" }`
- Atualizar o state local

### 7. Botão de deletar agente (PRIORIDADE BAIXA)

Adicionar na sidebar direita (abaixo do botão Update Agent):
- Botão "Deletar Agente" (vermelho, com confirmação via Dialog)
- Chama `DELETE /agent_configs?id=eq.{uuid}` via Supabase REST
- CASCADE já cuida de deletar os registros em `agent_vector_stores`
- Após deletar: limpar o form (resetar para defaultState)

### 8. Refresh automático após operações

Sempre que uma operação modifica dados (assign, unassign, upload, update), fazer refresh dos dados relevantes:
- Após assign/unassign: re-fetch das vector stores vinculadas ao agente
- Após upload com agent_id: re-fetch das vector stores vinculadas
- Após update: confirmar visualmente que salvou

### 9. Melhorar o estado `isReasoningModel`

Atualmente na linha 668:
```typescript
const isReasoningModel = state.model.startsWith("o1") || state.model.startsWith("o3") || state.model.includes("thinking") || state.model === "gpt-5.2-pro";
```

Atualizar para cobrir toda a família gpt-5:
```typescript
const isReasoningModel = state.model.startsWith("o1") || state.model.startsWith("o3") || state.model.startsWith("o4") || state.model.includes("thinking") || state.model.startsWith("gpt-5");
```

Isso garante que qualquer modelo gpt-5.x (gpt-5.2-pro, gpt-5.1-thinking, gpt-5.2-instant, etc.) não mostre o slider de Temperature e mostrará Reasoning Effort no lugar.

---

## Resumo de prioridades

1. **ALTA** — Helper Supabase REST (item 1)
2. **ALTA** — Seletor de agente existente + carregamento completo (item 2)
3. **ALTA** — Exibir vector stores vinculadas do DB real (item 3)
4. **ALTA** — Edição de agente funcional (item 5 — já quase pronto, depende do item 2)
5. **MÉDIA** — Lista de vector stores disponíveis para vincular (item 4)
6. **MÉDIA** — Refresh automático (item 8)
7. **MÉDIA** — Atualizar isReasoningModel (item 9)
8. **BAIXA** — Edição de vector store (item 6)
9. **BAIXA** — Deletar agente (item 7)

---

## Regras importantes

1. **NÃO instalar Supabase SDK** — usar fetch direto com a REST API (PostgREST). Não adicionar @supabase/supabase-js.
2. **Manter a estrutura existente** — NÃO quebrar o componente em múltiplos arquivos a menos que fique acima de 2500 linhas. Se ultrapassar, separar em 2-3 componentes max.
3. **Manter todos os imports de Shadcn/ui existentes** — não remover componentes que já estão em uso.
4. **Manter a UX das tabs** — Identity, Capabilities, Behavior, Business, Knowledge. Não alterar a estrutura de tabs.
5. **Manter o webhook para create/update agent** — NÃO fazer create/update diretamente no Supabase. Apenas LEITURA via Supabase.
6. **Manter o webhook para upload/assign/unassign** — essas operações continuam via webhook n8n.
7. **Manter localStorage** para persistência de form state entre reloads.
8. **Manter templates e import JSON** — não remover funcionalidades existentes.
9. **Usar componentes Shadcn/ui existentes** (Dialog, Sheet, Badge, Button, etc.) — não instalar libs extras.
10. **Toast para feedback** — usar o hook `useToast` já existente para todas as notificações.
11. **A anon key pode ficar hardcoded** por enquanto (o front é temporário). Não precisa criar .env.

---

## 10. Adicionar Arquivos a Vector Store Existente (PRIORIDADE ALTA)

Permitir que o usuário adicione novos arquivos a uma vector store que já existe, sem criar uma nova VS.

### Novos states necessários (~linha 354, após editingVsName):
```typescript
const [addFilesVsId, setAddFilesVsId] = useState<string | null>(null); // ID interno (uuid) — quando não null, abre Dialog
const [addFilesOpenaiVsId, setAddFilesOpenaiVsId] = useState<string>(""); // OpenAI VS ID (vs_xxx)
const [addFilesQueue, setAddFilesQueue] = useState<UploadedFile[]>([]); // Fila de arquivos separada
const [isUploadingAddFiles, setIsUploadingAddFiles] = useState(false); // Loading state
```

### Novos callbacks (após deleteAgent):

**handleAddFilesDrop(acceptedFiles: File[]):**
- Mesma lógica de `handleFileDrop` mas popula `addFilesQueue` em vez de `uploadQueue`
- Limite: 20 arquivos
- Converte para base64

**removeAddFile(fileId: string):**
- Remove arquivo de `addFilesQueue`

**addFilesToExistingVectorStore():**
- Valida: addFilesQueue tem arquivos com status "completed", state.openaiApiKey preenchida
- POST para o webhook com:
```json
{
  "action": "add_files_to_vector_store",
  "openai_api_key": "sk-...",
  "openai_vector_store_id": "vs_xxx...",
  "vector_store_id": "uuid-interno",
  "files": [
    { "filename": "novo.pdf", "content": "base64...", "mime_type": "application/pdf" }
  ]
}
```
- Endpoint: `state.vectorStoreWebhookUrl` (mesmo webhook das outras actions)
- Após sucesso: limpar addFilesQueue, fechar Dialog (`setAddFilesVsId(null)`), toast, `fetchLinkedVectorStores()`

### Segundo useDropzone (após o primeiro, ~linha 1021):
```typescript
const {
  getRootProps: getAddFilesRootProps,
  getInputProps: getAddFilesInputProps,
  isDragActive: isAddFilesDragActive,
} = useDropzone({
  accept: { /* mesmos tipos aceitos */ },
  maxSize: 50 * 1024 * 1024,
  maxFiles: 20,
  onDrop: handleAddFilesDrop,
  onDropRejected: handleDropRejected, // reutiliza o existente
});
```

### Botão "Adicionar Arquivos" no card de Vector Stores Vinculadas:
Na lista de `linkedVectorStores`, ao lado do botão "Desvincular", adicionar:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    setAddFilesVsId(vs.id);
    setAddFilesOpenaiVsId(vs.openai_vector_store_id);
    setAddFilesQueue([]);
  }}
>
  <Upload className="h-3 w-3 mr-1" />
  Adicionar Arquivos
</Button>
```

### Dialog de upload de arquivos:
```tsx
<Dialog open={addFilesVsId !== null} onOpenChange={(open) => { if (!open) setAddFilesVsId(null); }}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Adicionar Arquivos</DialogTitle>
      <DialogDescription>Adicionando à vector store {addFilesOpenaiVsId}</DialogDescription>
    </DialogHeader>

    {/* Dropzone */}
    <div {...getAddFilesRootProps()} className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50">
      <input {...getAddFilesInputProps()} />
      <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
      <p className="text-sm">{isAddFilesDragActive ? "Solte os arquivos..." : "Arraste arquivos ou clique para selecionar"}</p>
      <p className="text-xs text-muted-foreground mt-1">PDF, TXT, DOCX, MD — até 50MB cada</p>
    </div>

    {/* Lista de arquivos na fila */}
    {addFilesQueue.length > 0 && (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {addFilesQueue.map((f) => (
          <div key={f.id} className="flex items-center justify-between p-2 rounded border text-sm">
            <div className="flex items-center gap-2 min-w-0">
              {getFileIcon(f.mime_type)}
              <span className="truncate">{f.filename}</span>
              <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => removeAddFile(f.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    )}

    {!state.openaiApiKey && addFilesQueue.length > 0 && (
      <p className="text-sm text-amber-600">Preencha a OpenAI API Key na aba Business antes de enviar.</p>
    )}

    <DialogFooter>
      <Button variant="outline" onClick={() => setAddFilesVsId(null)}>Cancelar</Button>
      <Button
        onClick={addFilesToExistingVectorStore}
        disabled={addFilesQueue.filter(f => f.status === "completed").length === 0 || isUploadingAddFiles || !state.openaiApiKey}
      >
        {isUploadingAddFiles ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : <><Upload className="h-4 w-4 mr-2" />Enviar Arquivos</>}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Resumo de prioridades (atualizado)

1. **ALTA** — Helper Supabase REST (item 1)
2. **ALTA** — Seletor de agente existente + carregamento completo (item 2)
3. **ALTA** — Exibir vector stores vinculadas do DB real (item 3)
4. **ALTA** — Edição de agente funcional (item 5)
5. **ALTA** — Adicionar arquivos a VS existente (item 10)
6. **MÉDIA** — Lista de vector stores disponíveis para vincular (item 4)
7. **MÉDIA** — Refresh automático (item 8)
8. **MÉDIA** — Atualizar isReasoningModel (item 9)
9. **BAIXA** — Edição de vector store (item 6)
10. **BAIXA** — Deletar agente (item 7)

---

## Exemplo de fluxo completo esperado após implementação

1. Usuário abre a página
2. Clica "Carregar Agente Existente"
3. Vê lista de agentes do Supabase, clica em "Bella - Sales Representative"
4. Form é preenchido com todos os dados da Bella (nome, modelo, instructions, tools, etc.)
5. Na aba Knowledge, vê as 2 vector stores vinculadas à Bella (Catálogo de Produtos, FAQ)
6. Altera o modelo de gpt-4o para gpt-5.2-pro
7. Clica "Update Agent" → salva via webhook
8. Na aba Knowledge, clica "Buscar Vector Stores" → vê todas as VS disponíveis
9. Vincula uma nova VS (Manual de Operações) → webhook assign_vector_store
10. A lista de VS vinculadas atualiza automaticamente mostrando as 3
11. Desvincula a VS "FAQ" → webhook unassign_vector_store
12. Lista atualiza mostrando 2 VS vinculadas
13. Clica "Adicionar Arquivos" na VS "Catálogo de Produtos" → abre Dialog
14. Arrasta 2 PDFs novos → aparecem na lista do Dialog
15. Clica "Enviar Arquivos" → webhook add_files_to_vector_store
16. Toast sucesso, Dialog fecha, total_files da VS atualizado na lista
