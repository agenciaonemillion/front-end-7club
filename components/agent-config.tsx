"use client";

import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

const STORAGE_KEY = "agent-config-state";

interface MetadataEntry {
  id: string;
  key: string;
  value: string;
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
  metadata: MetadataEntry[];
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
  metadata: [],
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
      },
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
                <TabsList className="grid w-full grid-cols-4 mb-6">
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
                        className={`min-h-[200px] resize-y font-mono text-sm ${
                          toolsError ? "border-destructive" : ""
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
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        response.status >= 200 && response.status < 300
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
