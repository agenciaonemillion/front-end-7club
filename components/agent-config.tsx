"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { useDropzone, FileRejection } from "react-dropzone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabaseGet, supabasePatch, supabaseDelete } from "@/lib/supabase";
import {
  RotateCcw,
  Plus,
  Copy,
  Check,
  Upload,
  Save,
  Loader2,
  Bot,
  Wrench,
  SlidersHorizontal,
  Database,
  ChevronDown,
  Book,
  FileText,
  File,
  AlertCircle,
  X,
  Link2,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Pencil,
} from "lucide-react";

const STORAGE_KEY = "agent-config-state";

interface MetadataEntry {
  id: string;
  key: string;
  value: string;
}

interface UploadedFile {
  id: string;
  filename: string;
  size: number;
  status: "pending" | "uploading" | "completed" | "error";
  progress?: number;
  error?: string;
  content?: string;
  mime_type: string;
}



interface AgentListItem {
  id: string;
  name: string;
  model: string;
  active: boolean;
  created_at: string;
}

interface AgentFullRecord {
  id: string;
  name: string;
  description: string | null;
  model: string;
  instructions: string;
  active: boolean;
  temperature: string | null;
  top_p: string | null;
  max_output_tokens: number | null;
  tool_choice: string | null;
  parallel_tool_calls: boolean;
  metadata: Record<string, string> | null;
  reasoning_config: Record<string, string> | null;
  openai_api_key: string | null;
  kommo_account_id: string | null;
  kommo_subdomain: string | null;
  created_at: string;
  updated_at: string;
  agent_vector_stores: Array<{
    vector_store_id: string;
    vector_stores: {
      id: string;
      name: string | null;
      openai_vector_store_id: string;
      total_files: number;
      total_size_bytes: number;
    };
  }>;
}

interface VectorStoreListItem {
  id: string;
  name: string | null;
  openai_vector_store_id: string;
  total_files: number;
  total_size_bytes: number;
  created_at: string;
}

interface AgentConfigState {
  // Identity
  name: string;
  description: string;
  model: string;
  instructions: string;
  active: boolean;
  // Capabilities
  tools: string;
  toolChoice: string;
  parallelToolCalls: boolean;
  // Behavior
  temperature: number;
  topP: number;
  reasoningEffort: string;
  maxOutputTokens: string;
  // Business Logic
  webhookUrl: string;
  vectorStoreWebhookUrl: string;
  openaiApiKey: string;
  kommoAccountId: string;
  kommoSubdomain: string;
  metadata: MetadataEntry[];
  // Knowledge Base
  vectorStoreName: string;
  // Agent UUID (set after creation)
  agentId: string;
}

const defaultState: AgentConfigState = {
  name: "",
  description: "",
  model: "gpt-4o",
  instructions: "",
  active: true,
  tools: "",
  toolChoice: "auto",
  parallelToolCalls: true,
  temperature: 0.7,
  topP: 1.0,
  reasoningEffort: "medium",
  maxOutputTokens: "8000",
  webhookUrl: "https://automacao.7club.com.br/webhook/agente-config-webhook",
  vectorStoreWebhookUrl: "https://automacao.7club.com.br/webhook/vector-store-upload",
  openaiApiKey: "",
  kommoAccountId: "",
  kommoSubdomain: "",
  metadata: [],
  vectorStoreName: "",
  agentId: "",
};

const templates: Record<string, Partial<AgentConfigState>> = {
  "simple-greeter": {
    name: "Simple Greeter Bot",
    description: "A basic assistant to test connectivity. Polite and uses emojis.",
    model: "gpt-4o-mini",
    instructions: "You are a helpful assistant. Be polite, concise, and use emojis in your responses. Your main goal is to greet the user and ask how you can help.",
    temperature: 0.7,
    tools: "[]",
    toolChoice: "auto",
    active: true,
  },
  "ecommerce-support": {
    name: "E-commerce Support Agent",
    description: "A customer service agent for an online store with access to order lookup tools.",
    model: "gpt-4o",
    instructions: "You are a customer support agent for 'Acme Online Store'. Your goal is to help users with their orders. Use the available tools to look up order status. Be professional and empathetic. If you cannot resolve an issue, offer to escalate to a human agent.",
    temperature: 0.5,
    tools: JSON.stringify([
      {
        type: "function",
        function: {
          name: "get_order_status",
          description: "Retrieves the current status and details of a customer order.",
          parameters: {
            type: "object",
            properties: {
              order_id: {
                type: "string",
                description: "The unique identifier for the order (e.g., ORD-12345)",
              },
            },
            required: ["order_id"],
          },
        },
      },
    ], null, 2),
    toolChoice: "auto",
    parallelToolCalls: true,
    active: true,
  },
  "tech-reasoning": {
    name: "Tech Reasoning Agent",
    description: "An advanced reasoning agent using o3-mini for complex technical analysis.",
    model: "o3-mini",
    instructions: "You are an expert technical analyst. When presented with a problem, think step-by-step. Break down complex issues into smaller parts. Provide detailed explanations and consider edge cases. Your goal is to provide thorough, well-reasoned technical guidance.",
    temperature: 1,
    reasoningEffort: "high",
    tools: "[]",
    toolChoice: "auto",
    active: true,
  },
};

function cleanPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Keep false booleans and 0 numbers
    if (value === false || value === 0) {
      cleaned[key] = value;
      continue;
    }

    // Remove null, undefined, empty strings
    if (value === null || value === undefined || value === "") {
      continue;
    }

    // Remove empty arrays
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    // Remove empty objects
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as object).length === 0
    ) {
      continue;
    }

    // Recursively clean nested objects
    if (typeof value === "object" && !Array.isArray(value)) {
      const cleanedNested = cleanPayload(value as Record<string, unknown>);
      if (Object.keys(cleanedNested).length > 0) {
        cleaned[key] = cleanedNested;
      }
      continue;
    }

    cleaned[key] = value;
  }

  return cleaned;
}

export function AgentConfig() {
  const [state, setState] = useState<AgentConfigState>(defaultState);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [importJson, setImportJson] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [response, setResponse] = useState<{
    status: number;
    statusText: string;
    body: string;
  } | null>(null);
  // Knowledge Base state
  const [uploadQueue, setUploadQueue] = useState<UploadedFile[]>([]);
  const [isUploadingToVectorStore, setIsUploadingToVectorStore] = useState(false);
  // Histórico local de vector stores criadas/ações (só desta sessão)
  const [vectorStoreHistory, setVectorStoreHistory] = useState<Array<{
    vector_store_id: string;
    openai_vector_store_id?: string;
    name?: string;
    files_processed?: number;
    total_size_bytes?: number;
    agent_linked?: boolean;
    created_at: string;
  }>>([])
  // Inputs manuais para assign/unassign
  const [assignVectorStoreId, setAssignVectorStoreId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  // Seletor de agentes existentes
  const [agentListOpen, setAgentListOpen] = useState(false);
  const [agentList, setAgentList] = useState<AgentListItem[]>([]);
  const [isLoadingAgentList, setIsLoadingAgentList] = useState(false);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  // Vector stores vinculadas (do DB real)
  const [linkedVectorStores, setLinkedVectorStores] = useState<Array<{
    id: string;
    name: string;
    openai_vector_store_id: string;
    total_files: number;
    total_size_bytes: number;
  }>>([]);

  // Dialog de vector stores disponíveis para vincular
  const [vsListOpen, setVsListOpen] = useState(false);
  const [availableVectorStores, setAvailableVectorStores] = useState<VectorStoreListItem[]>([]);
  const [isLoadingVsList, setIsLoadingVsList] = useState(false);

  // Deletar agente
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edição inline de nome de VS
  const [editingVsId, setEditingVsId] = useState<string | null>(null);
  const [editingVsName, setEditingVsName] = useState("");

  // Adicionar arquivos a VS existente
  const [addFilesVsId, setAddFilesVsId] = useState<string | null>(null);
  const [addFilesOpenaiVsId, setAddFilesOpenaiVsId] = useState<string>("");
  const [addFilesQueue, setAddFilesQueue] = useState<UploadedFile[]>([]);
  const [isUploadingAddFiles, setIsUploadingAddFiles] = useState(false);

  const { toast } = useToast();

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setState({ ...defaultState, ...parsed });
      } catch {
        // Invalid JSON, use defaults
      }
    }
    setIsHydrated(true);
  }, []);

  // Save to localStorage on state change
  useEffect(() => {
    if (isHydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state, isHydrated]);

  // Validate tools JSON
  useEffect(() => {
    if (!state.tools.trim()) {
      setToolsError(null);
      return;
    }
    try {
      const parsed = JSON.parse(state.tools);
      if (!Array.isArray(parsed)) {
        setToolsError("Tools must be an array");
      } else {
        setToolsError(null);
      }
    } catch {
      setToolsError("Invalid JSON syntax");
    }
  }, [state.tools]);

  const updateState = useCallback(
    (updates: Partial<AgentConfigState>) => {
      setState((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const resetForm = useCallback(() => {
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
    toast({ title: "Form reset to defaults" });
  }, []);

  const loadTemplate = useCallback((templateKey: string) => {
    const template = templates[templateKey];
    if (template) {
      setState((prev) => ({
        ...prev,
        ...template,
        // Preserve webhookUrl and metadata
        webhookUrl: prev.webhookUrl,
        metadata: prev.metadata,
      }));
      toast({ title: `Template "${template.name}" loaded` });
    }
  }, []);

  const addMetadata = useCallback(() => {
    setState((prev) => ({
      ...prev,
      metadata: [
        ...prev.metadata,
        { id: crypto.randomUUID(), key: "", value: "" },
      ],
    }));
  }, []);

  const removeMetadata = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      metadata: prev.metadata.filter((m) => m.id !== id),
    }));
  }, []);

  const updateMetadata = useCallback(
    (id: string, field: "key" | "value", value: string) => {
      setState((prev) => ({
        ...prev,
        metadata: prev.metadata.map((m) =>
          m.id === id ? { ...m, [field]: value } : m
        ),
      }));
    },
    []
  );


  // ============ Supabase Functions ============

  const fetchLinkedVectorStores = useCallback(async (agentId?: string) => {
    const id = agentId || state.agentId;
    if (!id) return;
    try {
      const results = await supabaseGet<Array<{
        agent_vector_stores: Array<{
          vector_store_id: string;
          vector_stores: {
            id: string;
            name: string | null;
            openai_vector_store_id: string;
            total_files: number;
            total_size_bytes: number;
          };
        }>;
      }>>(`/agent_configs?id=eq.${id}&select=agent_vector_stores(vector_store_id,vector_stores(id,name,openai_vector_store_id,total_files,total_size_bytes))`);
      if (results.length > 0) {
        const linked = results[0].agent_vector_stores
          .map((avs) => avs.vector_stores)
          .filter(Boolean)
          .map((vs) => ({
            id: vs.id,
            name: vs.name || "Sem nome",
            openai_vector_store_id: vs.openai_vector_store_id,
            total_files: vs.total_files || 0,
            total_size_bytes: vs.total_size_bytes || 0,
          }));
        setLinkedVectorStores(linked);
      }
    } catch (error) {
      toast({
        title: "Erro ao buscar vector stores vinculadas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }, [state.agentId, toast]);

  const fetchAgentList = useCallback(async () => {
    setIsLoadingAgentList(true);
    try {
      const agents = await supabaseGet<AgentListItem[]>(
        "/agent_configs?select=id,name,model,active,created_at&order=created_at.desc"
      );
      setAgentList(agents);
      setAgentListOpen(true);
    } catch (error) {
      toast({
        title: "Erro ao buscar agentes",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAgentList(false);
    }
  }, [toast]);

  const loadAgent = useCallback(async (agentId: string) => {
    setIsLoadingAgent(true);
    try {
      const results = await supabaseGet<AgentFullRecord[]>(
        `/agent_configs?id=eq.${agentId}&select=*,agent_vector_stores(vector_store_id,vector_stores(id,name,openai_vector_store_id,total_files,total_size_bytes))`
      );
      if (results.length === 0) throw new Error("Agente não encontrado");
      const agent = results[0];

      // Convert metadata object → MetadataEntry array
      const metadataObj = typeof agent.metadata === "string"
        ? JSON.parse(agent.metadata)
        : agent.metadata;
      const metadataEntries: MetadataEntry[] = metadataObj && typeof metadataObj === "object"
        ? Object.entries(metadataObj).map(([key, value]) => ({
          id: crypto.randomUUID(),
          key,
          value: String(value),
        }))
        : [];

      // Extract reasoning_effort from reasoning_config jsonb
      const reasoningConfig = typeof agent.reasoning_config === "string"
        ? JSON.parse(agent.reasoning_config)
        : agent.reasoning_config;
      const reasoningEffort = reasoningConfig?.effort || "medium";

      const newState: AgentConfigState = {
        name: agent.name || "",
        description: agent.description || "",
        model: agent.model || "gpt-4o",
        instructions: agent.instructions || "",
        active: agent.active ?? true,
        tools: "", // tools não estão no agent_configs, gerenciados via webhook
        toolChoice: agent.tool_choice || "auto",
        parallelToolCalls: agent.parallel_tool_calls ?? true,
        temperature: agent.temperature ? parseFloat(String(agent.temperature)) : 0.7,
        topP: agent.top_p ? parseFloat(String(agent.top_p)) : 1.0,
        reasoningEffort,
        maxOutputTokens: agent.max_output_tokens ? String(agent.max_output_tokens) : "8000",
        webhookUrl: state.webhookUrl,
        vectorStoreWebhookUrl: state.vectorStoreWebhookUrl,
        openaiApiKey: agent.openai_api_key || "",
        kommoAccountId: agent.kommo_account_id || "",
        kommoSubdomain: agent.kommo_subdomain || "",
        metadata: metadataEntries,
        vectorStoreName: "",
        agentId: agent.id,
      };

      setState(newState);

      // Populate linked vector stores
      const linked = agent.agent_vector_stores
        .map((avs) => avs.vector_stores)
        .filter(Boolean)
        .map((vs) => ({
          id: vs.id,
          name: vs.name || "Sem nome",
          openai_vector_store_id: vs.openai_vector_store_id,
          total_files: vs.total_files || 0,
          total_size_bytes: vs.total_size_bytes || 0,
        }));
      setLinkedVectorStores(linked);

      setAgentListOpen(false);
      toast({ title: `Agente "${agent.name}" carregado com sucesso!` });
    } catch (error) {
      toast({
        title: "Erro ao carregar agente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAgent(false);
    }
  }, [state.webhookUrl, state.vectorStoreWebhookUrl, toast]);

  const fetchAvailableVectorStores = useCallback(async () => {
    setIsLoadingVsList(true);
    try {
      const stores = await supabaseGet<VectorStoreListItem[]>(
        "/vector_stores?select=id,name,openai_vector_store_id,total_files,total_size_bytes,created_at&order=created_at.desc"
      );
      setAvailableVectorStores(stores);
      setVsListOpen(true);
    } catch (error) {
      toast({
        title: "Erro ao buscar vector stores",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsLoadingVsList(false);
    }
  }, [toast]);

  const linkVectorStore = useCallback(async (vectorStoreId: string) => {
    if (!state.agentId) return;
    setIsAssigning(true);
    try {
      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_vector_store",
          agent_id: state.agentId,
          vector_store_id: vectorStoreId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Vector store vinculada com sucesso!" });
        await fetchLinkedVectorStores();
        setVsListOpen(false);
      } else {
        throw new Error(result.error || `Erro ${res.status}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao vincular",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  }, [state.agentId, state.vectorStoreWebhookUrl, fetchLinkedVectorStores, toast]);

  const handleUnlinkVectorStore = useCallback(async (vsId: string) => {
    if (!state.agentId) return;
    try {
      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unassign_vector_store",
          agent_id: state.agentId,
          vector_store_id: vsId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Vector store desvinculada!" });
        setLinkedVectorStores((prev) => prev.filter((vs) => vs.id !== vsId));
      } else {
        throw new Error(result.error || `Erro ${res.status}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao desvincular",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }, [state.agentId, state.vectorStoreWebhookUrl, toast]);

  const saveVsName = useCallback(async (vsId: string) => {
    try {
      await supabasePatch(`/vector_stores?id=eq.${vsId}`, { name: editingVsName });
      setLinkedVectorStores((prev) =>
        prev.map((vs) => (vs.id === vsId ? { ...vs, name: editingVsName } : vs))
      );
      setEditingVsId(null);
      toast({ title: "Nome atualizado!" });
    } catch (error) {
      toast({
        title: "Erro ao atualizar nome",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }, [editingVsName, toast]);

  const deleteAgent = useCallback(async () => {
    if (!state.agentId) return;
    setIsDeleting(true);
    try {
      await supabaseDelete(`/agent_configs?id=eq.${state.agentId}`);
      toast({ title: "Agente deletado com sucesso!" });
      setState(defaultState);
      localStorage.removeItem(STORAGE_KEY);
      setLinkedVectorStores([]);
      setDeleteDialogOpen(false);
    } catch (error) {
      toast({
        title: "Erro ao deletar agente",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }, [state.agentId, toast]);

  // ============ Knowledge Base Functions ============

  // Format file size for display
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }, []);

  // Format date for display
  const formatDate = useCallback((isoString: string): string => {
    return new Date(isoString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, []);

  // Get icon based on file type
  const getFileIcon = useCallback((mimeType: string) => {
    if (mimeType === "application/pdf") {
      return <FileText className="w-5 h-5 text-red-500" />;
    }
    if (mimeType === "text/plain") {
      return <FileText className="w-5 h-5 text-blue-500" />;
    }
    if (mimeType.includes("wordprocessing")) {
      return <FileText className="w-5 h-5 text-blue-600" />;
    }
    if (mimeType === "text/markdown") {
      return <FileText className="w-5 h-5 text-gray-600" />;
    }
    return <File className="w-5 h-5" />;
  }, []);

  // Convert file to base64
  const fileToBase64 = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result as string;
        const base64Content = base64.split(",")[1];
        resolve(base64Content);
      };
      reader.onerror = reject;
    });
  }, []);

  // ============ Add Files to Existing VS ============

  const handleAddFilesDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const existingCount = addFilesQueue.length;
      if (existingCount + acceptedFiles.length > 20) {
        toast({
          title: "Limite excedido",
          description: "Máximo de 20 arquivos por vez",
          variant: "destructive",
        });
        return;
      }

      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        filename: file.name,
        size: file.size,
        mime_type: file.type || "application/octet-stream",
        status: "pending" as const,
        progress: 0,
      }));

      setAddFilesQueue((prev) => [...prev, ...newFiles]);

      for (let i = 0; i < newFiles.length; i++) {
        const fileInfo = newFiles[i];
        const originalFile = acceptedFiles[i];
        try {
          const base64Content = await fileToBase64(originalFile);
          setAddFilesQueue((prev) =>
            prev.map((f) =>
              f.id === fileInfo.id
                ? { ...f, content: base64Content, status: "completed" as const, progress: 100 }
                : f
            )
          );
        } catch {
          setAddFilesQueue((prev) =>
            prev.map((f) =>
              f.id === fileInfo.id
                ? { ...f, status: "error" as const, error: "Erro ao processar arquivo" }
                : f
            )
          );
        }
      }
    },
    [addFilesQueue.length, fileToBase64, toast]
  );

  const removeAddFile = useCallback((fileId: string) => {
    setAddFilesQueue((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const addFilesToExistingVectorStore = useCallback(async () => {
    const filesToUpload = addFilesQueue.filter((f) => f.status === "completed" && f.content);
    if (filesToUpload.length === 0) {
      toast({
        title: "Nenhum arquivo para enviar",
        description: "Adicione arquivos antes de fazer upload",
        variant: "destructive",
      });
      return;
    }
    if (!state.openaiApiKey) {
      toast({
        title: "API Key não informada",
        description: "Informe a OpenAI API Key na aba Business antes de fazer upload",
        variant: "destructive",
      });
      return;
    }
    if (!addFilesVsId || !addFilesOpenaiVsId) {
      toast({ title: "Vector store não selecionada", variant: "destructive" });
      return;
    }

    setIsUploadingAddFiles(true);
    try {
      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add_files_to_vector_store",
          openai_api_key: state.openaiApiKey,
          openai_vector_store_id: addFilesOpenaiVsId,
          vector_store_id: addFilesVsId,
          files: filesToUpload.map((f) => ({
            filename: f.filename,
            content: f.content,
            mime_type: f.mime_type,
          })),
        }),
      });

      const result = await res.json();
      if (result.success) {
        toast({
          title: "Arquivos adicionados!",
          description: `${result.files_added} arquivo(s) adicionado(s) à vector store`,
        });
        setAddFilesQueue([]);
        setAddFilesVsId(null);
        setAddFilesOpenaiVsId("");
        // Refresh linked VS
        if (state.agentId) {
          fetchLinkedVectorStores(state.agentId);
        }
      } else {
        throw new Error(result.error || `Erro ${res.status}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao adicionar arquivos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAddFiles(false);
    }
  }, [addFilesQueue, state.openaiApiKey, state.vectorStoreWebhookUrl, addFilesVsId, addFilesOpenaiVsId, state.agentId, fetchLinkedVectorStores, toast]);

  // Handle file drop
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const existingCount = uploadQueue.length;
      if (existingCount + acceptedFiles.length > 20) {
        toast({
          title: "Limite excedido",
          description: "Máximo de 20 arquivos por agente",
          variant: "destructive",
        });
        return;
      }

      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: crypto.randomUUID(),
        filename: file.name,
        size: file.size,
        mime_type: file.type || "application/octet-stream",
        status: "pending" as const,
        progress: 0,
      }));

      setUploadQueue((prev) => [...prev, ...newFiles]);

      // Convert to base64
      for (let i = 0; i < newFiles.length; i++) {
        const fileInfo = newFiles[i];
        const originalFile = acceptedFiles[i];
        try {
          const base64Content = await fileToBase64(originalFile);
          setUploadQueue((prev) =>
            prev.map((f) =>
              f.id === fileInfo.id
                ? { ...f, content: base64Content, status: "completed" as const, progress: 100 }
                : f
            )
          );
        } catch {
          setUploadQueue((prev) =>
            prev.map((f) =>
              f.id === fileInfo.id
                ? { ...f, status: "error" as const, error: "Erro ao processar arquivo" }
                : f
            )
          );
        }
      }
    },
    [uploadQueue.length, fileToBase64, toast]
  );

  // Handle rejected files
  const handleDropRejected = useCallback(
    (rejectedFiles: FileRejection[]) => {
      rejectedFiles.forEach((rejection) => {
        const errors = rejection.errors.map((e) => {
          if (e.code === "file-too-large") {
            return `${rejection.file.name}: Arquivo muito grande (máx 50MB)`;
          }
          if (e.code === "file-invalid-type") {
            return `${rejection.file.name}: Formato não suportado. Use PDF, TXT, DOCX ou MD`;
          }
          return e.message;
        });

        toast({
          title: "Erro ao adicionar arquivo",
          description: errors.join(", "),
          variant: "destructive",
        });
      });
    },
    [toast]
  );

  // Remove file from queue
  const removeFileFromQueue = useCallback((fileId: string) => {
    setUploadQueue((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  // Upload files to vector store
  const uploadFilesToVectorStore = useCallback(async () => {
    const filesToUpload = uploadQueue.filter((f) => f.status === "completed" && f.content);
    if (filesToUpload.length === 0) {
      toast({
        title: "Nenhum arquivo para enviar",
        description: "Adicione arquivos antes de fazer upload",
        variant: "destructive",
      });
      return;
    }



    if (!state.openaiApiKey) {
      toast({
        title: "API Key não informada",
        description: "Informe a OpenAI API Key na aba Business antes de fazer upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingToVectorStore(true);
    try {
      const payload: Record<string, unknown> = {
        action: "upload_files",
        openai_api_key: state.openaiApiKey,
        files: filesToUpload.map((f) => ({
          filename: f.filename,
          content: f.content,
          mime_type: f.mime_type,
        })),
      };
      // Campos opcionais
      if (state.agentId) {
        payload.agent_id = state.agentId;
      }
      if (state.vectorStoreName.trim()) {
        payload.name = state.vectorStoreName.trim();
      }

      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const response = await fetch(
        webhookUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // Adicionar ao histórico local
        setVectorStoreHistory(prev => [{
          vector_store_id: result.vector_store_id,
          openai_vector_store_id: result.openai_vector_store_id,
          name: state.vectorStoreName || undefined,
          files_processed: result.files_processed,
          total_size_bytes: result.total_size_bytes,
          agent_linked: result.agent_linked,
          created_at: new Date().toISOString(),
        }, ...prev]);
        updateState({ vectorStoreName: "" });
      }

      setUploadQueue([]);
      toast({
        title: "Upload concluído!",
        description: `${filesToUpload.length} arquivo(s) adicionado(s) à knowledge base`,
      });
      // Refresh linked vector stores if agent is loaded
      if (state.agentId) {
        await fetchLinkedVectorStores();
      }
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsUploadingToVectorStore(false);
    }
  }, [uploadQueue, state.agentId, state.openaiApiKey, state.vectorStoreWebhookUrl, state.vectorStoreName, updateState, fetchLinkedVectorStores, toast]);

  // Vincular vector store existente ao agente via webhook
  const assignVectorStore = useCallback(async () => {
    if (!state.agentId) {
      toast({ title: "Preencha o Agent UUID primeiro", variant: "destructive" });
      return;
    }
    if (!assignVectorStoreId.trim()) {
      toast({ title: "Preencha o Vector Store ID", variant: "destructive" });
      return;
    }
    setIsAssigning(true);
    try {
      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign_vector_store",
          agent_id: state.agentId,
          vector_store_id: assignVectorStoreId.trim(),
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Vector store vinculada com sucesso!" });
        setAssignVectorStoreId("");
        await fetchLinkedVectorStores();
      } else {
        throw new Error(result.error || `Erro ${res.status}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao vincular",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  }, [state.agentId, state.vectorStoreWebhookUrl, assignVectorStoreId, fetchLinkedVectorStores, toast]);

  // Desvincular vector store do agente via webhook
  const unassignVectorStore = useCallback(async (vectorStoreId: string) => {
    if (!state.agentId) return;
    try {
      const webhookUrl = state.vectorStoreWebhookUrl || "https://automacao.7club.com.br/webhook/vector-store-upload";
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unassign_vector_store",
          agent_id: state.agentId,
          vector_store_id: vectorStoreId,
        }),
      });
      const result = await res.json();
      if (result.success) {
        toast({ title: "Vector store desvinculada" });
        // Remover do histórico local se estava lá
        setVectorStoreHistory(prev => prev.map(vs =>
          vs.vector_store_id === vectorStoreId ? { ...vs, agent_linked: false } : vs
        ));
        // Remover das VS vinculadas (DB)
        setLinkedVectorStores(prev => prev.filter(vs => vs.id !== vectorStoreId));
      } else {
        throw new Error(result.error || `Erro ${res.status}`);
      }
    } catch (error) {
      toast({
        title: "Erro ao desvincular",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  }, [state.agentId, state.vectorStoreWebhookUrl, toast]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/markdown": [".md"],
    },
    maxSize: 50 * 1024 * 1024,
    maxFiles: 20,
    onDrop: handleFileDrop,
    onDropRejected: handleDropRejected,
  });

  const {
    getRootProps: getAddFilesRootProps,
    getInputProps: getAddFilesInputProps,
    isDragActive: isAddFilesDragActive,
  } = useDropzone({
    accept: {
      "application/pdf": [".pdf"],
      "text/plain": [".txt"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/markdown": [".md"],
    },
    maxSize: 50 * 1024 * 1024,
    maxFiles: 20,
    onDrop: handleAddFilesDrop,
    onDropRejected: handleDropRejected,
  });

  const isReasoningModel = state.model.startsWith("o1") || state.model.startsWith("o3") || state.model.startsWith("o4") || state.model.includes("thinking") || state.model.startsWith("gpt-5");

  const buildPayload = useCallback(() => {
    let toolsArray: unknown[] = [];
    if (state.tools.trim()) {
      try {
        toolsArray = JSON.parse(state.tools);
      } catch {
        toolsArray = [];
      }
    }

    const metadataObj: Record<string, string> = {};
    for (const entry of state.metadata) {
      if (entry.key.trim()) {
        metadataObj[entry.key] = entry.value;
      }
    }

    const isUpdate = !!state.agentId;

    const rawPayload = {
      action: isUpdate ? "update_agent" : "create_agent",
      ...(isUpdate ? { agent_id: state.agentId } : {}),
      agent: {
        name: state.name,
        description: state.description,
        model: state.model,
        instructions: state.instructions,
        active: state.active,
        is_reasoning: isReasoningModel,
        temperature: !isReasoningModel ? state.temperature : undefined,
        top_p: !isReasoningModel ? state.topP : undefined,
        tools: toolsArray,
        tool_choice: state.toolChoice,
        parallel_tool_calls: state.parallelToolCalls,
        reasoning_effort: isReasoningModel ? state.reasoningEffort : undefined,
        max_output_tokens: state.maxOutputTokens
          ? parseInt(state.maxOutputTokens, 10)
          : undefined,
        metadata: metadataObj,
        openai_api_key: state.openaiApiKey,
      },
      kommo_account_id: state.kommoAccountId,
      kommo_subdomain: state.kommoSubdomain,
    };

    return cleanPayload(rawPayload) as typeof rawPayload;
  }, [state, isReasoningModel]);

  const copyPayload = useCallback(async () => {
    const payload = buildPayload();
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied to clipboard" });
  }, [buildPayload]);

  const handleImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importJson);
      const agent = parsed.agent || parsed;

      const newState: Partial<AgentConfigState> = {};

      if (agent.name) newState.name = agent.name;
      if (agent.description) newState.description = agent.description;
      if (agent.model) newState.model = agent.model;
      if (agent.instructions) newState.instructions = agent.instructions;
      if (typeof agent.active === "boolean") newState.active = agent.active;
      if (typeof agent.temperature === "number")
        newState.temperature = agent.temperature;
      if (typeof agent.top_p === "number") newState.topP = agent.top_p;
      if (agent.tools)
        newState.tools = JSON.stringify(agent.tools, null, 2);
      if (agent.tool_choice) newState.toolChoice = agent.tool_choice;
      if (typeof agent.parallel_tool_calls === "boolean")
        newState.parallelToolCalls = agent.parallel_tool_calls;
      if (agent.reasoning_effort)
        newState.reasoningEffort = agent.reasoning_effort;
      if (agent.max_output_tokens)
        newState.maxOutputTokens = String(agent.max_output_tokens);

      if (agent.metadata && typeof agent.metadata === "object") {
        newState.metadata = Object.entries(agent.metadata).map(
          ([key, value]) => ({
            id: crypto.randomUUID(),
            key,
            value: String(value),
          })
        );
      }

      setState((prev) => ({ ...prev, ...newState }));
      setImportDialogOpen(false);
      setImportJson("");
      toast({ title: "Configuration imported successfully" });
    } catch {
      toast({ title: "Invalid JSON format", variant: "destructive" });
    }
  }, [importJson]);

  const saveConfiguration = useCallback(async () => {
    if (!state.webhookUrl.trim()) {
      toast({ title: "Please enter a webhook URL", variant: "destructive" });
      return;
    }

    if (!state.name.trim()) {
      toast({ title: "Please enter an agent name", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setResponse(null);
    try {
      const payload = buildPayload();
      const res = await fetch(state.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let responseBody = "";
      try {
        responseBody = await res.text();
        // Try to format as JSON if possible
        const parsed = JSON.parse(responseBody);
        responseBody = JSON.stringify(parsed, null, 2);
      } catch {
        // Keep as plain text if not JSON
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        body: responseBody,
      });

      if (res.ok) {
        // Extract agent_id UUID from response if available
        let newAgentId: string | null = null;
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.agent_id) {
            newAgentId = parsed.agent_id;
            updateState({ agentId: parsed.agent_id });
          }
        } catch {
          // Response wasn't JSON, skip UUID extraction
        }
        const actionLabel = state.agentId ? "updated" : "created";
        toast({ title: `Agent ${actionLabel} successfully (${res.status})` });
        // Refresh linked VS after creation/update
        if (newAgentId || state.agentId) {
          fetchLinkedVectorStores(newAgentId || state.agentId);
        }
      } else {
        toast({ title: `Failed to save: ${res.status} ${res.statusText}`, variant: "destructive" });
      }
    } catch (error) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        body: error instanceof Error ? error.message : "Unknown error",
      });
      toast({
        title: `Network error: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [state.webhookUrl, state.name, buildPayload]);

  const payload = buildPayload();

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Agent Configuration
            </h1>
            <p className="text-muted-foreground mt-1">
              Define and manage your AI agent settings
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="bg-transparent">
                  Load Template
                  <ChevronDown className="h-4 w-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => loadTemplate("simple-greeter")}>
                  <span className="mr-2 text-green-500">●</span>
                  Simple Greeter (No Tools)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => loadTemplate("ecommerce-support")}>
                  <span className="mr-2 text-blue-500">●</span>
                  E-commerce Support (With Tools)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => loadTemplate("tech-reasoning")}>
                  <span className="mr-2 text-purple-500">●</span>
                  Tech Reasoning (o3-mini)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" onClick={resetForm} className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground bg-transparent">
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Form
            </Button>
          </div>
        </div>

        {/* Agent Selector */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            onClick={fetchAgentList}
            disabled={isLoadingAgentList}
            className="bg-transparent"
          >
            {isLoadingAgentList ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Carregar Agente Existente
          </Button>
          {state.agentId && (
            <p className="text-sm text-muted-foreground">
              Editando: <span className="font-medium text-foreground">{state.name}</span>
              <span className="font-mono ml-1 text-xs">({state.agentId.slice(0, 8)}...)</span>
            </p>
          )}
        </div>

        <Sheet open={agentListOpen} onOpenChange={setAgentListOpen}>
          <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
            <SheetHeader>
              <SheetTitle>Agentes Existentes</SheetTitle>
              <SheetDescription>Selecione um agente para carregar no formulário</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-120px)] mt-4 pr-3">
              {isLoadingAgentList ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-4 rounded-lg border space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : agentList.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum agente encontrado
                </p>
              ) : (
                <div className="space-y-2">
                  {agentList.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => loadAgent(agent.id)}
                      disabled={isLoadingAgent}
                      className="w-full text-left p-4 rounded-lg border hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-sm">{agent.name}</p>
                        <Badge variant={agent.active ? "default" : "secondary"} className="text-xs">
                          {agent.active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {agent.model} &bull; {formatDate(agent.created_at)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </SheetContent>
        </Sheet>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6">
          {/* Left Column - Form */}
          <Card>
            <CardContent className="pt-6">
              <Tabs defaultValue="identity" className="w-full">
                <TabsList className="grid w-full grid-cols-5 mb-6">
                  <TabsTrigger value="identity" className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span className="hidden sm:inline">Identity</span>
                  </TabsTrigger>
                  <TabsTrigger value="capabilities" className="flex items-center gap-2">
                    <Wrench className="h-4 w-4" />
                    <span className="hidden sm:inline">Capabilities</span>
                  </TabsTrigger>
                  <TabsTrigger value="behavior" className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" />
                    <span className="hidden sm:inline">Behavior</span>
                  </TabsTrigger>
                  <TabsTrigger value="business" className="flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    <span className="hidden sm:inline">Business</span>
                  </TabsTrigger>
                  <TabsTrigger value="knowledge-base" className="flex items-center gap-2">
                    <Book className="h-4 w-4" />
                    <span className="hidden sm:inline">Knowledge</span>
                  </TabsTrigger>
                </TabsList>

                {/* Identity Tab */}
                <TabsContent value="identity" className="space-y-6">
                  <div className="grid gap-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Internal Name</Label>
                        <Input
                          id="name"
                          placeholder="e.g., Bella - Sales Representative"
                          value={state.name}
                          onChange={(e) => updateState({ name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        <Select
                          value={state.model}
                          onValueChange={(value) => updateState({ model: value })}
                        >
                          <SelectTrigger id="model">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="gpt-5.2-pro">gpt-5.2-pro (Reasoning)</SelectItem>
                            <SelectItem value="gpt-5.2-thinking">gpt-5.2-thinking (Reasoning)</SelectItem>
                            <SelectItem value="gpt-5.2-instant">gpt-5.2-instant</SelectItem>
                            <SelectItem value="gpt-5.1-thinking">gpt-5.1-thinking (Reasoning)</SelectItem>
                            <SelectItem value="gpt-5.1-instant">gpt-5.1-instant</SelectItem>
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                            <SelectItem value="o1">o1 (Reasoning)</SelectItem>
                            <SelectItem value="o3-mini">o3-mini (Reasoning)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Input
                        id="description"
                        placeholder="Handles inbound leads for..."
                        value={state.description}
                        onChange={(e) =>
                          updateState({ description: e.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="instructions">System Prompt / Persona</Label>
                      <Textarea
                        id="instructions"
                        placeholder="You are a helpful assistant that..."
                        value={state.instructions}
                        onChange={(e) =>
                          updateState({ instructions: e.target.value })
                        }
                        className="min-h-[200px] resize-y"
                      />
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <Label htmlFor="active">Agent Active?</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable or disable this agent
                        </p>
                      </div>
                      <Switch
                        id="active"
                        checked={state.active}
                        onCheckedChange={(checked) =>
                          updateState({ active: checked })
                        }
                      />
                    </div>
                  </div>
                </TabsContent>

                {/* Capabilities Tab */}
                <TabsContent value="capabilities" className="space-y-6">
                  <div className="grid gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="tools">Tools JSON Schema</Label>
                      <Textarea
                        id="tools"
                        placeholder={'[\n  {\n    "type": "function",\n    "function": { ... }\n  }\n]'}
                        value={state.tools}
                        onChange={(e) => updateState({ tools: e.target.value })}
                        className={`min-h-[200px] resize-y font-mono text-sm ${toolsError ? "border-destructive" : ""
                          }`}
                      />
                      {toolsError && (
                        <p className="text-sm text-destructive">{toolsError}</p>
                      )}
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="toolChoice">Tool Choice</Label>
                        <Select
                          value={state.toolChoice}
                          onValueChange={(value) =>
                            updateState({ toolChoice: value })
                          }
                        >
                          <SelectTrigger id="toolChoice">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">auto</SelectItem>
                            <SelectItem value="required">required</SelectItem>
                            <SelectItem value="none">none</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <Label htmlFor="parallelToolCalls">
                            Allow Parallel Calls
                          </Label>
                        </div>
                        <Switch
                          id="parallelToolCalls"
                          checked={state.parallelToolCalls}
                          onCheckedChange={(checked) =>
                            updateState({ parallelToolCalls: checked })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Behavior Tab */}
                <TabsContent value="behavior" className="space-y-6">
                  <div className="grid gap-6">
                    {/* Model type indicator */}
                    <div className={`rounded-lg border p-4 ${isReasoningModel ? "border-purple-500/30 bg-purple-500/5" : "border-blue-500/30 bg-blue-500/5"}`}>
                      <p className="text-sm font-medium">
                        {isReasoningModel ? (
                          <>
                            <span className="mr-2">🧠</span>
                            Modelo de Reasoning — utiliza <strong>Reasoning Effort</strong> ao invés de Temperature.
                          </>
                        ) : (
                          <>
                            <span className="mr-2">🎨</span>
                            Modelo Padrão — suporta <strong>Temperature</strong> e <strong>Top P</strong> para controle de criatividade.
                          </>
                        )}
                      </p>
                    </div>

                    {/* Temperature & Top P — only for non-reasoning models */}
                    {!isReasoningModel && (
                      <>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Temperature</Label>
                            <span className="text-sm font-medium tabular-nums">
                              {state.temperature.toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[state.temperature]}
                            onValueChange={([value]) =>
                              updateState({ temperature: value })
                            }
                            min={0}
                            max={2}
                            step={0.1}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Lower values make output more deterministic
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <Label>Top P</Label>
                            <span className="text-sm font-medium tabular-nums">
                              {state.topP.toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[state.topP]}
                            onValueChange={([value]) => updateState({ topP: value })}
                            min={0}
                            max={1}
                            step={0.1}
                            className="w-full"
                          />
                          <p className="text-xs text-muted-foreground">
                            Nucleus sampling threshold
                          </p>
                        </div>
                      </>
                    )}

                    {/* Reasoning Effort — only for reasoning models */}
                    {isReasoningModel && (
                      <div className="space-y-2">
                        <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                        <Select
                          value={state.reasoningEffort}
                          onValueChange={(value) =>
                            updateState({ reasoningEffort: value })
                          }
                        >
                          <SelectTrigger id="reasoningEffort">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Controla o esforço de raciocínio do modelo (low, medium, high)
                        </p>
                      </div>
                    )}

                    {/* Max Output Tokens — always visible */}
                    <div className="space-y-2">
                      <Label htmlFor="maxOutputTokens">Max Output Tokens</Label>
                      <Input
                        id="maxOutputTokens"
                        type="number"
                        placeholder="8000"
                        value={state.maxOutputTokens}
                        onChange={(e) =>
                          updateState({ maxOutputTokens: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Número máximo de tokens na resposta (padrão: 8000)
                      </p>
                    </div>
                  </div>
                </TabsContent>

                {/* Business Logic Tab */}
                <TabsContent value="business" className="space-y-6">
                  <div className="grid gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="webhookUrl">Save Configuration URL</Label>
                      <Input
                        id="webhookUrl"
                        placeholder="https://automacao.7club.com.br/webhook/agente-config-webhook"
                        value={state.webhookUrl}
                        onChange={(e) =>
                          updateState({ webhookUrl: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Webhook endpoint to save agent configuration
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="vectorStoreWebhookUrl">Vector Store Webhook URL</Label>
                      <Input
                        id="vectorStoreWebhookUrl"
                        placeholder="https://automacao.7club.com.br/webhook/vector-store-upload"
                        value={state.vectorStoreWebhookUrl}
                        onChange={(e) =>
                          updateState({ vectorStoreWebhookUrl: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Webhook endpoint para upload de arquivos na vector store
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="openaiApiKey">OpenAI API Key</Label>
                      <Input
                        id="openaiApiKey"
                        type="password"
                        placeholder="sk-..."
                        value={state.openaiApiKey}
                        onChange={(e) =>
                          updateState({ openaiApiKey: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Chave da API OpenAI para criação de vector stores
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="agentId">Agent UUID</Label>
                      <Input
                        id="agentId"
                        placeholder="d2a65a3b-4785-42f7-b935-8ccbdc292d95"
                        value={state.agentId}
                        onChange={(e) =>
                          updateState({ agentId: e.target.value })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        UUID do agente no Supabase (preenchido automaticamente ao salvar, ou cole manualmente)
                      </p>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="kommoAccountId">Kommo Account ID</Label>
                        <Input
                          id="kommoAccountId"
                          placeholder="12345678"
                          value={state.kommoAccountId}
                          onChange={(e) =>
                            updateState({ kommoAccountId: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kommoSubdomain">Kommo Subdomain</Label>
                        <Input
                          id="kommoSubdomain"
                          placeholder="your-company"
                          value={state.kommoSubdomain}
                          onChange={(e) =>
                            updateState({ kommoSubdomain: e.target.value })
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          Subdomínio do Kommo (ex: your-company.kommo.com)
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                {/* Knowledge Base Tab */}
                <TabsContent value="knowledge-base" className="space-y-6">
                  {/* Upload Section */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Upload className="h-5 w-5" />
                      Upload de Arquivos
                    </h3>

                    <div
                      {...getRootProps()}
                      className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${isDragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                        }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-lg mb-2">
                        {isDragActive
                          ? "Solte os arquivos aqui..."
                          : "Arraste arquivos aqui ou clique para selecionar"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Formatos aceitos: PDF, TXT, DOCX, MD • Tamanho máx: 50MB
                      </p>
                    </div>

                    {/* Upload Queue */}
                    {uploadQueue.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {uploadQueue.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center justify-between p-3 rounded-lg border bg-card"
                          >
                            <div className="flex items-center gap-3">
                              {getFileIcon(file.mime_type)}
                              <div>
                                <p className="font-medium text-sm">{file.filename}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {file.status === "pending" && (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              )}
                              {file.status === "completed" && (
                                <Check className="w-5 h-5 text-green-500" />
                              )}
                              {file.status === "error" && (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeFileFromQueue(file.id)}
                                className="h-8 w-8"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Nome da Vector Store (opcional) */}
                    {uploadQueue.length > 0 && (
                      <div className="mt-4">
                        <Label htmlFor="vs-name">Nome da Vector Store (opcional)</Label>
                        <Input
                          id="vs-name"
                          placeholder="Ex: Catálogo de Produtos, FAQ, Manual..."
                          value={state.vectorStoreName}
                          onChange={(e) => updateState({ vectorStoreName: e.target.value })}
                          className="mt-1"
                        />
                      </div>
                    )}

                    <Button
                      className="mt-4 w-full"
                      onClick={uploadFilesToVectorStore}
                      disabled={isUploadingToVectorStore || uploadQueue.filter(f => f.status === "completed").length === 0}
                    >
                      {isUploadingToVectorStore ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando para Vector Store...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Enviar para Vector Store ({uploadQueue.filter(f => f.status === "completed").length} arquivo{uploadQueue.filter(f => f.status === "completed").length !== 1 ? "s" : ""})
                        </>
                      )}
                    </Button>

                    {!state.openaiApiKey && uploadQueue.length > 0 && (
                      <p className="text-sm text-amber-600 mt-2">
                        Preencha a OpenAI API Key na aba Business antes de enviar.
                      </p>
                    )}
                    {!state.agentId && uploadQueue.length > 0 && state.openaiApiKey && (
                      <p className="text-sm text-blue-600 mt-2">
                        Agent UUID não preenchido. A vector store será criada sem vínculo com agente. Você pode vincular depois.
                      </p>
                    )}
                  </Card>

                  {/* Vincular Vector Store Existente */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Link2 className="h-5 w-5" />
                      Vincular Vector Store Existente
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Busque uma vector store existente ou cole o ID manualmente.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full mb-4"
                      onClick={fetchAvailableVectorStores}
                      disabled={isLoadingVsList || !state.agentId}
                    >
                      {isLoadingVsList ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Buscar Vector Stores
                    </Button>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Cole o vector_store_id aqui (UUID)"
                        value={assignVectorStoreId}
                        onChange={(e) => setAssignVectorStoreId(e.target.value)}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        onClick={assignVectorStore}
                        disabled={isAssigning || !assignVectorStoreId.trim() || !state.agentId}
                      >
                        {isAssigning ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Vincular"
                        )}
                      </Button>
                    </div>
                    {!state.agentId && (
                      <p className="text-sm text-amber-600 mt-2">
                        Crie ou carregue um agente primeiro para vincular vector stores.
                      </p>
                    )}
                  </Card>

                  {/* Dialog: Vector Stores Disponíveis */}
                  <Dialog open={vsListOpen} onOpenChange={setVsListOpen}>
                    <DialogContent className="max-w-lg max-h-[80vh]">
                      <DialogHeader>
                        <DialogTitle>Vector Stores Disponíveis</DialogTitle>
                        <DialogDescription>
                          Selecione uma vector store para vincular a este agente
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[60vh] pr-3">
                        <div className="space-y-2">
                          {availableVectorStores
                            .filter((vs) => !linkedVectorStores.some((l) => l.id === vs.id))
                            .map((vs) => (
                              <div
                                key={vs.id}
                                className="flex items-center justify-between p-3 rounded-lg border"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm">{vs.name || "Sem nome"}</p>
                                  <p className="text-xs text-muted-foreground font-mono truncate">
                                    {vs.openai_vector_store_id}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {vs.total_files} arquivo(s) &bull;{" "}
                                    {formatFileSize(vs.total_size_bytes)} &bull;{" "}
                                    {formatDate(vs.created_at)}
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => linkVectorStore(vs.id)}
                                  disabled={isAssigning}
                                  className="ml-2"
                                >
                                  {isAssigning ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Vincular"
                                  )}
                                </Button>
                              </div>
                            ))}
                          {availableVectorStores.filter(
                            (vs) => !linkedVectorStores.some((l) => l.id === vs.id)
                          ).length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">
                              Nenhuma vector store disponível para vincular.
                            </p>
                          )}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>

                  {/* Vector Stores Vinculadas (do banco) */}
                  {state.agentId && (
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Database className="h-5 w-5" />
                          Vector Stores Vinculadas ({linkedVectorStores.length})
                        </h3>
                        <Button variant="outline" size="sm" onClick={() => fetchLinkedVectorStores()}>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Atualizar
                        </Button>
                      </div>
                      {linkedVectorStores.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhuma vector store vinculada a este agente.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {linkedVectorStores.map((vs) => (
                            <div
                              key={vs.id}
                              className="flex items-center justify-between p-3 rounded-lg border"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {editingVsId === vs.id ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editingVsName}
                                        onChange={(e) => setEditingVsName(e.target.value)}
                                        className="h-7 text-sm w-48"
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") saveVsName(vs.id);
                                          if (e.key === "Escape") setEditingVsId(null);
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2"
                                        onClick={() => saveVsName(vs.id)}
                                      >
                                        <Check className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2"
                                        onClick={() => setEditingVsId(null)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="font-medium text-sm">{vs.name}</p>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-1"
                                        onClick={() => {
                                          setEditingVsId(vs.id);
                                          setEditingVsName(vs.name);
                                        }}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  {vs.openai_vector_store_id}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {vs.total_files} arquivo(s) &bull;{" "}
                                  {formatFileSize(vs.total_size_bytes)}
                                </p>
                              </div>
                              <div className="flex gap-2 ml-2">
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
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleUnlinkVectorStore(vs.id)}
                                >
                                  Desvincular
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  )}

                  {/* Dialog: Adicionar Arquivos a VS Existente */}
                  <Dialog open={addFilesVsId !== null} onOpenChange={(open) => { if (!open) { setAddFilesVsId(null); setAddFilesQueue([]); } }}>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Adicionar Arquivos</DialogTitle>
                        <DialogDescription>
                          Adicionando à vector store <span className="font-mono">{addFilesOpenaiVsId}</span>
                        </DialogDescription>
                      </DialogHeader>

                      <div
                        {...getAddFilesRootProps()}
                        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                          isAddFilesDragActive
                            ? "border-primary bg-primary/5"
                            : "border-muted-foreground/25 hover:border-primary/50"
                        }`}
                      >
                        <input {...getAddFilesInputProps()} />
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm">
                          {isAddFilesDragActive
                            ? "Solte os arquivos aqui..."
                            : "Arraste arquivos ou clique para selecionar"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PDF, TXT, DOCX, MD — até 50MB cada
                        </p>
                      </div>

                      {addFilesQueue.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {addFilesQueue.map((f) => (
                            <div key={f.id} className="flex items-center justify-between p-2 rounded-lg border text-sm">
                              <div className="flex items-center gap-2 min-w-0">
                                {getFileIcon(f.mime_type)}
                                <span className="truncate">{f.filename}</span>
                                <span className="text-xs text-muted-foreground">{formatFileSize(f.size)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {f.status === "completed" && <Check className="w-4 h-4 text-green-500" />}
                                {f.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAddFile(f.id)}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {!state.openaiApiKey && addFilesQueue.length > 0 && (
                        <p className="text-sm text-amber-600">
                          Preencha a OpenAI API Key na aba Business antes de enviar.
                        </p>
                      )}

                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setAddFilesVsId(null); setAddFilesQueue([]); }}>
                          Cancelar
                        </Button>
                        <Button
                          onClick={addFilesToExistingVectorStore}
                          disabled={addFilesQueue.filter((f) => f.status === "completed").length === 0 || isUploadingAddFiles || !state.openaiApiKey}
                        >
                          {isUploadingAddFiles ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Upload className="h-4 w-4 mr-2" />
                              Enviar {addFilesQueue.filter((f) => f.status === "completed").length} Arquivo(s)
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Histórico de Vector Stores */}
                  {vectorStoreHistory.length > 0 && (
                    <Card className="p-6">
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Book className="h-5 w-5" />
                        Vector Stores Criadas (sessão atual)
                      </h3>
                      <div className="space-y-2">
                        {vectorStoreHistory.map((vs, idx) => (
                          <div key={vs.vector_store_id + idx} className="flex items-center justify-between p-3 rounded-lg border">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-sm">{vs.name || "Sem nome"}</p>
                                {vs.agent_linked && (
                                  <Badge variant="default" className="text-xs">Vinculada</Badge>
                                )}
                                {vs.agent_linked === false && (
                                  <Badge variant="secondary" className="text-xs">Não vinculada</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                ID: {vs.vector_store_id}
                              </p>
                              {vs.openai_vector_store_id && (
                                <p className="text-xs text-muted-foreground font-mono truncate">
                                  OpenAI: {vs.openai_vector_store_id}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {vs.files_processed} arquivo(s) • {vs.total_size_bytes ? formatFileSize(vs.total_size_bytes) : "N/A"}
                              </p>
                            </div>
                            <div className="flex gap-2 ml-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  navigator.clipboard.writeText(vs.vector_store_id);
                                  toast({ title: "ID copiado!" });
                                }}
                              >
                                Copiar ID
                              </Button>
                              {vs.agent_linked && state.agentId && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => unassignVectorStore(vs.vector_store_id)}
                                >
                                  Desvincular
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Right Column - Preview & Actions */}
          <div className="lg:sticky lg:top-8 space-y-4 h-fit">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Live Preview</CardTitle>
                <CardDescription>
                  JSON payload that will be sent
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted rounded-lg p-4 text-xs overflow-auto max-h-[400px] font-mono">
                    {JSON.stringify(payload, null, 2)}
                  </pre>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={copyPayload}
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6 space-y-3">
                <Dialog
                  open={importDialogOpen}
                  onOpenChange={setImportDialogOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full bg-transparent">
                      <Upload className="h-4 w-4 mr-2" />
                      Load from JSON
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Import Configuration</DialogTitle>
                      <DialogDescription>
                        Paste a JSON configuration to populate the form
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="Paste JSON here..."
                      value={importJson}
                      onChange={(e) => setImportJson(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setImportDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleImport}>Import</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={saveConfiguration}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {state.agentId ? "Updating..." : "Creating..."}
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {state.agentId ? "Update Agent" : "Create Agent"}
                    </>
                  )}
                </Button>
                {state.agentId && (
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    Modo atualização — Agent ID: <span className="font-mono">{state.agentId.slice(0, 8)}...</span>
                  </p>
                )}
                {state.agentId && (
                  <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="destructive" className="w-full mt-2" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Deletar Agente
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Confirmar exclusão</DialogTitle>
                        <DialogDescription>
                          Tem certeza que deseja deletar o agente &quot;{state.name}&quot;?
                          Esta ação não pode ser desfeita. As vector stores vinculadas serão
                          desvinculadas mas NÃO deletadas.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={deleteAgent}
                          disabled={isDeleting}
                        >
                          {isDeleting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Deletar Permanentemente
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>

            {/* Response Viewer */}
            {response && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Response</CardTitle>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${response.status >= 200 && response.status < 300
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : response.status === 0
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }`}
                    >
                      {response.status === 0
                        ? "Network Error"
                        : `${response.status} ${response.statusText}`}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted rounded-lg p-4 text-xs overflow-auto max-h-[300px] font-mono whitespace-pre-wrap">
                    {response.body || "(empty response)"}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div >
  );
}
