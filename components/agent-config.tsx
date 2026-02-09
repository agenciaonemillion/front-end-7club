"use client";

import { useState, useEffect, useCallback } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  RotateCcw,
  Plus,
  Trash2,
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
  Eye,
  X,
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

interface KnowledgeBaseFile {
  file_id: string;
  filename: string;
  uploaded_at: string;
  size_bytes: number;
  vector_store_id: string;
}

interface KnowledgeBaseConfig {
  files: KnowledgeBaseFile[];
  total_files: number;
  total_size_bytes: number;
  last_updated: string;
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
  openaiApiKey: string;
  kommoAccountId: string;
  kommoSubdomain: string;
  metadata: MetadataEntry[];
  // Knowledge Base
  vectorStoreIds: string[] | null;
  knowledgeBaseConfig: KnowledgeBaseConfig | null;
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
  maxOutputTokens: "",
  webhookUrl: "",
  openaiApiKey: "",
  kommoAccountId: "",
  kommoSubdomain: "",
  metadata: [],
  vectorStoreIds: null,
  knowledgeBaseConfig: null,
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
  const { toast } = useToast(); // Use the toast function from useToast hook

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

  // Handle file drop
  const handleFileDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const existingCount = uploadQueue.length + (state.knowledgeBaseConfig?.total_files || 0);
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
    [uploadQueue.length, state.knowledgeBaseConfig?.total_files, fileToBase64, toast]
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

    if (!state.agentId) {
      toast({
        title: "Agente não criado",
        description: "Salve a configuração do agente antes de fazer upload de arquivos",
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
      const payload = {
        agent_id: state.agentId,
        action: "upload_files",
        openai_api_key: state.openaiApiKey,
        files: filesToUpload.map((f) => ({
          filename: f.filename,
          content: f.content,
          mime_type: f.mime_type,
        })),
      };

      const response = await fetch(
        "https://automacao.7club.com.br/webhook/vector-store-upload",
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

      // Update state with vector store info
      if (result.vector_store_id) {
        updateState({
          vectorStoreIds: [result.vector_store_id],
          knowledgeBaseConfig: {
            files: filesToUpload.map((f) => ({
              file_id: crypto.randomUUID(),
              filename: f.filename,
              uploaded_at: new Date().toISOString(),
              size_bytes: f.size,
              vector_store_id: result.vector_store_id,
            })),
            total_files: result.files_processed || filesToUpload.length,
            total_size_bytes: result.total_size_bytes || filesToUpload.reduce((acc, f) => acc + f.size, 0),
            last_updated: new Date().toISOString(),
          },
        });
      }

      setUploadQueue([]);
      toast({
        title: "Upload concluído!",
        description: `${filesToUpload.length} arquivo(s) adicionado(s) à knowledge base`,
      });
    } catch (error) {
      toast({
        title: "Erro no upload",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsUploadingToVectorStore(false);
    }
  }, [uploadQueue, state.agentId, state.openaiApiKey, updateState, toast]);

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

  const isReasoningModel = state.model.startsWith("o1") || state.model.startsWith("o3");

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

    const rawPayload = {
      action: "create_agent",
      agent: {
        name: state.name,
        description: state.description,
        model: state.model,
        instructions: state.instructions,
        active: state.active,
        temperature: state.temperature,
        top_p: state.topP,
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
        try {
          const parsed = JSON.parse(responseBody);
          if (parsed.agent_id) {
            updateState({ agentId: parsed.agent_id });
          }
        } catch {
          // Response wasn't JSON, skip UUID extraction
        }
        toast({ title: `Agent saved successfully (${res.status})` });
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
                            <SelectItem value="gpt-4o">gpt-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini">gpt-4o-mini</SelectItem>
                            <SelectItem value="gpt-4-turbo">gpt-4-turbo</SelectItem>
                            <SelectItem value="o3-mini">o3-mini</SelectItem>
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

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="reasoningEffort">Reasoning Effort</Label>
                        <Select
                          value={state.reasoningEffort}
                          onValueChange={(value) =>
                            updateState({ reasoningEffort: value })
                          }
                          disabled={!isReasoningModel}
                        >
                          <SelectTrigger
                            id="reasoningEffort"
                            className={!isReasoningModel ? "opacity-50" : ""}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">low</SelectItem>
                            <SelectItem value="medium">medium</SelectItem>
                            <SelectItem value="high">high</SelectItem>
                          </SelectContent>
                        </Select>
                        {!isReasoningModel && (
                          <p className="text-xs text-muted-foreground">
                            Only available for o1/o3 models
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxOutputTokens">Max Output Tokens</Label>
                        <Input
                          id="maxOutputTokens"
                          type="number"
                          placeholder="e.g., 4096"
                          value={state.maxOutputTokens}
                          onChange={(e) =>
                            updateState({ maxOutputTokens: e.target.value })
                          }
                        />
                      </div>
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
                        placeholder="https://your-webhook.example.com/agents"
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

                    {state.agentId && (
                      <div className="rounded-lg border p-4 bg-muted/50">
                        <Label className="text-sm text-muted-foreground">Agent UUID</Label>
                        <p className="font-mono text-sm mt-1">{state.agentId}</p>
                      </div>
                    )}

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Metadata</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addMetadata}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Metadata
                        </Button>
                      </div>

                      {state.metadata.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-6 text-center">
                          <p className="text-sm text-muted-foreground">
                            No metadata entries. Click "Add Metadata" to add
                            key-value pairs.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {state.metadata.map((entry) => (
                            <div
                              key={entry.id}
                              className="flex items-center gap-2"
                            >
                              <Input
                                placeholder="Key"
                                value={entry.key}
                                onChange={(e) =>
                                  updateMetadata(entry.id, "key", e.target.value)
                                }
                                className="flex-1"
                              />
                              <Input
                                placeholder="Value"
                                value={entry.value}
                                onChange={(e) =>
                                  updateMetadata(
                                    entry.id,
                                    "value",
                                    e.target.value
                                  )
                                }
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeMetadata(entry.id)}
                                className="text-muted-foreground hover:text-destructive shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
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

                    <Button
                      className="mt-4 w-full"
                      onClick={uploadFilesToVectorStore}
                      disabled={isUploadingToVectorStore || uploadQueue.length === 0}
                    >
                      {isUploadingToVectorStore ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-2 h-4 w-4" />
                          Upload para Vector Store
                        </>
                      )}
                    </Button>
                  </Card>

                  {/* Current Knowledge Base Section */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Book className="h-5 w-5" />
                      Knowledge Base Atual
                    </h3>

                    {!state.knowledgeBaseConfig || state.knowledgeBaseConfig.total_files === 0 ? (
                      <div className="text-center py-12 bg-muted/50 rounded-lg">
                        <Database className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                        <h4 className="text-lg font-medium mb-2">
                          Nenhum arquivo na knowledge base
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Faça upload de arquivos para que o agente possa acessá-los
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Statistics */}
                        <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg mb-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Vector Store ID</p>
                            <p className="font-mono text-sm truncate">
                              {state.vectorStoreIds?.[0] || "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Total de arquivos</p>
                            <p className="text-2xl font-bold">
                              {state.knowledgeBaseConfig.total_files}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Storage usado</p>
                            <p className="text-2xl font-bold">
                              {formatFileSize(state.knowledgeBaseConfig.total_size_bytes)}
                            </p>
                          </div>
                        </div>

                        {/* File List */}
                        <div className="space-y-2">
                          {state.knowledgeBaseConfig.files.map((file) => (
                            <div
                              key={file.file_id}
                              className="flex items-center justify-between p-4 rounded-lg border"
                            >
                              <div className="flex items-center gap-3">
                                <FileText className="w-8 h-8 text-blue-500" />
                                <div>
                                  <p className="font-medium">{file.filename}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatFileSize(file.size_bytes)} •{" "}
                                    {formatDate(file.uploaded_at)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4 mr-2" />
                                  Ver
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    // Remove file from KB
                                    const newFiles = state.knowledgeBaseConfig!.files.filter(
                                      (f) => f.file_id !== file.file_id
                                    );
                                    updateState({
                                      knowledgeBaseConfig: {
                                        ...state.knowledgeBaseConfig!,
                                        files: newFiles,
                                        total_files: newFiles.length,
                                        total_size_bytes: newFiles.reduce(
                                          (acc, f) => acc + f.size_bytes,
                                          0
                                        ),
                                      },
                                    });
                                    toast({
                                      title: "Arquivo removido",
                                      description: `${file.filename} foi removido da knowledge base`,
                                    });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Remover
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
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
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Agent Configuration
                    </>
                  )}
                </Button>
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
    </div>
  );
}
