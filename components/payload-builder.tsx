"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, Send, Copy, Check, AlertCircle, CheckCircle2, RotateCcw, Zap, Brain, Wrench } from "lucide-react"

interface InputMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface MetadataEntry {
  key: string
  value: string
}

interface PayloadState {
  model: string
  instructions: string
  input: InputMessage[]
  previous_response_id: string
  conversation_id: string
  reasoning: {
    effort: "low" | "medium" | "high"
    summary: "auto" | "none" | "verbose"
  }
  temperature: number
  top_p: number
  top_logprobs: number
  max_output_tokens: number
  truncation: "auto" | "disabled"
  text: {
    format: { type: "text" | "json_object" | "json_schema" }
    verbosity: "low" | "medium" | "high"
  }
  tools: string
  tool_choice: "auto" | "none" | "required"
  parallel_tool_calls: boolean
  store: boolean
  include: string[]
  metadata: MetadataEntry[]
  safety_identifier: string
}

const STORAGE_KEY = "e2e-payload-builder-state"
const WEBHOOK_STORAGE_KEY = "e2e-payload-builder-webhook"

const defaultPayload: PayloadState = {
  model: "gpt-4o",
  instructions: "",
  input: [{ role: "user", content: "" }],
  previous_response_id: "",
  conversation_id: "",
  reasoning: { effort: "medium", summary: "auto" },
  temperature: 0.7,
  top_p: 1.0,
  top_logprobs: 0,
  max_output_tokens: 1000,
  truncation: "auto",
  text: { format: { type: "text" }, verbosity: "medium" },
  tools: "[]",
  tool_choice: "auto",
  parallel_tool_calls: true,
  store: false,
  include: ["message.output_text", "tool_calls"],
  metadata: [],
  safety_identifier: "",
}

const includeOptions = [
  { id: "message.output_text", label: "message.output_text" },
  { id: "message.role", label: "message.role" },
  { id: "reasoning.summary", label: "reasoning.summary" },
  { id: "tool_calls", label: "tool_calls" },
  { id: "logprobs", label: "logprobs" },
]

const dummyWeatherTool = JSON.stringify([
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "The city name, e.g. Tokyo"
          }
        },
        required: ["city"]
      }
    }
  }
], null, 2)

const presets = {
  smoke: {
    name: "Smoke Test (Fast)",
    icon: Zap,
    description: "Quick test with gpt-4o-mini",
    state: {
      ...defaultPayload,
      model: "gpt-4o-mini",
      input: [{ role: "user" as const, content: "Say 'Hello World' and nothing else." }],
      temperature: 0.7,
      tools: "[]",
    }
  },
  reasoning: {
    name: "Reasoning Test",
    icon: Brain,
    description: "Test o3-mini with high reasoning",
    state: {
      ...defaultPayload,
      model: "o3-mini",
      reasoning: { effort: "high" as const, summary: "auto" as const },
      input: [{ role: "user" as const, content: "Explain quantum entanglement to a 5-year-old step by step." }],
    }
  },
  toolcall: {
    name: "Tool Call Test",
    icon: Wrench,
    description: "Test function calling with gpt-4o",
    state: {
      ...defaultPayload,
      model: "gpt-4o",
      tools: dummyWeatherTool,
      tool_choice: "required" as const,
      input: [{ role: "user" as const, content: "What is the weather in Tokyo?" }],
    }
  }
}

export function PayloadBuilder() {
  const [webhookUrl, setWebhookUrl] = useState("")
  const [payload, setPayload] = useState<PayloadState>(defaultPayload)
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<{ status: number; statusText: string; body: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [toolsError, setToolsError] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const savedPayload = localStorage.getItem(STORAGE_KEY)
      const savedWebhook = localStorage.getItem(WEBHOOK_STORAGE_KEY)
      
      if (savedPayload) {
        const parsed = JSON.parse(savedPayload)
        setPayload(parsed)
      }
      if (savedWebhook) {
        setWebhookUrl(savedWebhook)
      }
    } catch {
      // Ignore parse errors
    }
    setIsHydrated(true)
  }, [])

  // Auto-save to localStorage on changes
  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  }, [payload, isHydrated])

  useEffect(() => {
    if (!isHydrated) return
    localStorage.setItem(WEBHOOK_STORAGE_KEY, webhookUrl)
  }, [webhookUrl, isHydrated])

  const resetForm = useCallback(() => {
    setPayload(defaultPayload)
    setWebhookUrl("")
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(WEBHOOK_STORAGE_KEY)
    setResponse(null)
  }, [])

  const loadPreset = useCallback((presetKey: keyof typeof presets) => {
    setPayload(presets[presetKey].state)
  }, [])

  const updatePayload = useCallback(<K extends keyof PayloadState>(key: K, value: PayloadState[K]) => {
    setPayload(prev => ({ ...prev, [key]: value }))
  }, [])

  const addInputMessage = useCallback(() => {
    setPayload(prev => ({
      ...prev,
      input: [...prev.input, { role: "user", content: "" }]
    }))
  }, [])

  const removeInputMessage = useCallback((index: number) => {
    setPayload(prev => ({
      ...prev,
      input: prev.input.filter((_, i) => i !== index)
    }))
  }, [])

  const updateInputMessage = useCallback((index: number, field: keyof InputMessage, value: string) => {
    setPayload(prev => ({
      ...prev,
      input: prev.input.map((msg, i) =>
        i === index ? { ...msg, [field]: value } : msg
      )
    }))
  }, [])

  const addMetadataEntry = useCallback(() => {
    setPayload(prev => ({
      ...prev,
      metadata: [...prev.metadata, { key: "", value: "" }]
    }))
  }, [])

  const removeMetadataEntry = useCallback((index: number) => {
    setPayload(prev => ({
      ...prev,
      metadata: prev.metadata.filter((_, i) => i !== index)
    }))
  }, [])

  const updateMetadataEntry = useCallback((index: number, field: keyof MetadataEntry, value: string) => {
    setPayload(prev => ({
      ...prev,
      metadata: prev.metadata.map((entry, i) =>
        i === index ? { ...entry, [field]: value } : entry
      )
    }))
  }, [])

  const validateTools = useCallback((value: string) => {
    try {
      JSON.parse(value)
      setToolsError(null)
      return true
    } catch {
      setToolsError("Invalid JSON format")
      return false
    }
  }, [])

  const toggleInclude = useCallback((optionId: string) => {
    setPayload(prev => ({
      ...prev,
      include: prev.include.includes(optionId)
        ? prev.include.filter(i => i !== optionId)
        : [...prev.include, optionId]
    }))
  }, [])

  const generatedPayload = useMemo(() => {
    let parsedTools: unknown[] = []
    try {
      parsedTools = JSON.parse(payload.tools)
    } catch {
      parsedTools = []
    }

    const metadataObj: Record<string, string> = {}
    payload.metadata.forEach(entry => {
      if (entry.key) {
        metadataObj[entry.key] = entry.value
      }
    })

    const result: Record<string, unknown> = {
      model: payload.model,
    }

    if (payload.instructions) result.instructions = payload.instructions
    if (payload.input.some(m => m.content)) {
      result.input = payload.input.filter(m => m.content)
    }
    
    if (payload.previous_response_id) result.previous_response_id = payload.previous_response_id
    if (payload.conversation_id) result.conversation_id = payload.conversation_id
    
    result.reasoning = payload.reasoning
    result.temperature = payload.temperature
    result.top_p = payload.top_p
    
    if (payload.top_logprobs > 0) result.top_logprobs = payload.top_logprobs
    
    result.max_output_tokens = payload.max_output_tokens
    result.truncation = payload.truncation
    result.text = payload.text
    
    if (parsedTools.length > 0) {
      result.tools = parsedTools
      result.tool_choice = payload.tool_choice
      result.parallel_tool_calls = payload.parallel_tool_calls
    }
    
    result.store = payload.store
    
    if (payload.include.length > 0) result.include = payload.include
    if (Object.keys(metadataObj).length > 0) result.metadata = metadataObj
    if (payload.safety_identifier) result.safety_identifier = payload.safety_identifier

    return JSON.stringify(result, null, 2)
  }, [payload])

  const sendPayload = async () => {
    if (!webhookUrl) {
      setResponse({ status: 0, statusText: "Error", body: "Please enter a webhook URL" })
      return
    }

    setIsLoading(true)
    setResponse(null)

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: generatedPayload,
      })

      const text = await res.text()
      let formattedBody = text
      try {
        formattedBody = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        // Not JSON, keep as text
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        body: formattedBody,
      })
    } catch (error) {
      setResponse({
        status: 0,
        statusText: "Network Error",
        body: error instanceof Error ? error.message : "Failed to send request",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(generatedPayload)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">E2E Payload Builder</h1>
            <p className="text-muted-foreground">Build and test OpenAI Responses API payloads</p>
          </div>
          <Button variant="outline" onClick={resetForm} className="w-fit bg-transparent">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Form
          </Button>
        </div>

        {/* Presets */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Load Preset</Label>
              <div className="flex flex-wrap gap-3">
                {Object.entries(presets).map(([key, preset]) => {
                  const Icon = preset.icon
                  return (
                    <Button
                      key={key}
                      variant="outline"
                      onClick={() => loadPreset(key as keyof typeof presets)}
                      className="flex items-center gap-2"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{preset.name}</span>
                    </Button>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Configuration */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor="webhook-url">Webhook URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://your-webhook.example.com/endpoint"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={sendPayload}
                  disabled={isLoading || !webhookUrl}
                  className="w-full md:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Spinner className="mr-2 h-4 w-4" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Payload
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Section */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-4">
              <CardTitle>Configuration</CardTitle>
              <CardDescription>Configure your API request parameters</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue="core" className="w-full">
                <div className="px-6">
                  <TabsList className="w-full grid grid-cols-5">
                    <TabsTrigger value="core">Core</TabsTrigger>
                    <TabsTrigger value="context">Context</TabsTrigger>
                    <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
                    <TabsTrigger value="tools">Tools</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>
                </div>

                <ScrollArea className="h-[500px]">
                  {/* Core Tab */}
                  <TabsContent value="core" className="p-6 space-y-6 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="model">Model</Label>
                      <Input
                        id="model"
                        value={payload.model}
                        onChange={(e) => updatePayload("model", e.target.value)}
                        placeholder="gpt-4o"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="instructions">Instructions</Label>
                      <Textarea
                        id="instructions"
                        value={payload.instructions}
                        onChange={(e) => updatePayload("instructions", e.target.value)}
                        placeholder="System instructions for the model..."
                        rows={3}
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Input Messages</Label>
                        <Button variant="outline" size="sm" onClick={addInputMessage}>
                          <Plus className="h-4 w-4 mr-1" /> Add Message
                        </Button>
                      </div>
                      
                      <div className="space-y-3">
                        {payload.input.map((msg, index) => (
                          <div key={index} className="flex gap-2 items-start p-3 rounded-lg border bg-muted/30">
                            <Select
                              value={msg.role}
                              onValueChange={(value) => updateInputMessage(index, "role", value)}
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="system">system</SelectItem>
                                <SelectItem value="user">user</SelectItem>
                                <SelectItem value="assistant">assistant</SelectItem>
                              </SelectContent>
                            </Select>
                            <Textarea
                              value={msg.content}
                              onChange={(e) => updateInputMessage(index, "content", e.target.value)}
                              placeholder="Message content..."
                              rows={2}
                              className="flex-1"
                            />
                            {payload.input.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeInputMessage(index)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Temperature: {payload.temperature.toFixed(2)}</Label>
                      </div>
                      <Slider
                        value={[payload.temperature]}
                        onValueChange={([value]) => updatePayload("temperature", value)}
                        min={0}
                        max={2}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                  </TabsContent>

                  {/* Context Tab */}
                  <TabsContent value="context" className="p-6 space-y-6 mt-0">
                    <div className="space-y-2">
                      <Label htmlFor="previous-response-id">Previous Response ID</Label>
                      <Input
                        id="previous-response-id"
                        value={payload.previous_response_id}
                        onChange={(e) => updatePayload("previous_response_id", e.target.value)}
                        placeholder="resp_123abc..."
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Essential for conversation continuity. Links this request to a previous response.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="conversation-id">Conversation ID</Label>
                      <Input
                        id="conversation-id"
                        value={payload.conversation_id}
                        onChange={(e) => updatePayload("conversation_id", e.target.value)}
                        placeholder="conv_456def..."
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Optional identifier to group related responses together.
                      </p>
                    </div>
                  </TabsContent>

                  {/* Reasoning Tab */}
                  <TabsContent value="reasoning" className="p-6 space-y-6 mt-0">
                    <div className="space-y-2">
                      <Label>Reasoning Effort</Label>
                      <Select
                        value={payload.reasoning.effort}
                        onValueChange={(value: "low" | "medium" | "high") =>
                          updatePayload("reasoning", { ...payload.reasoning, effort: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Reasoning Summary</Label>
                      <Select
                        value={payload.reasoning.summary}
                        onValueChange={(value: "auto" | "none" | "verbose") =>
                          updatePayload("reasoning", { ...payload.reasoning, summary: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="verbose">Verbose</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Text Format Type</Label>
                      <Select
                        value={payload.text.format.type}
                        onValueChange={(value: "text" | "json_object" | "json_schema") =>
                          updatePayload("text", { ...payload.text, format: { type: value } })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="json_object">JSON Object</SelectItem>
                          <SelectItem value="json_schema">JSON Schema</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Text Verbosity</Label>
                      <Select
                        value={payload.text.verbosity}
                        onValueChange={(value: "low" | "medium" | "high") =>
                          updatePayload("text", { ...payload.text, verbosity: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TabsContent>

                  {/* Tools Tab */}
                  <TabsContent value="tools" className="p-6 space-y-6 mt-0">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="tools">Tools (JSON Array)</Label>
                        {toolsError && (
                          <span className="text-xs text-destructive flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {toolsError}
                          </span>
                        )}
                      </div>
                      <Textarea
                        id="tools"
                        value={payload.tools}
                        onChange={(e) => {
                          updatePayload("tools", e.target.value)
                          validateTools(e.target.value)
                        }}
                        placeholder='[{"type": "function", "function": {"name": "...", "parameters": {...}}}]'
                        rows={10}
                        className="font-mono text-sm"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label>Tool Choice</Label>
                      <Select
                        value={payload.tool_choice}
                        onValueChange={(value: "auto" | "none" | "required") =>
                          updatePayload("tool_choice", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="required">Required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="parallel-tools">Parallel Tool Calls</Label>
                      <Switch
                        id="parallel-tools"
                        checked={payload.parallel_tool_calls}
                        onCheckedChange={(checked) => updatePayload("parallel_tool_calls", checked)}
                      />
                    </div>
                  </TabsContent>

                  {/* Advanced Tab */}
                  <TabsContent value="advanced" className="p-6 space-y-6 mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Top P: {payload.top_p.toFixed(2)}</Label>
                      </div>
                      <Slider
                        value={[payload.top_p]}
                        onValueChange={([value]) => updatePayload("top_p", value)}
                        min={0}
                        max={1}
                        step={0.01}
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-tokens">Max Output Tokens</Label>
                      <Input
                        id="max-tokens"
                        type="number"
                        value={payload.max_output_tokens}
                        onChange={(e) => updatePayload("max_output_tokens", parseInt(e.target.value) || 0)}
                        min={1}
                        max={128000}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Truncation</Label>
                      <Select
                        value={payload.truncation}
                        onValueChange={(value: "auto" | "disabled") =>
                          updatePayload("truncation", value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="disabled">Disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between">
                      <Label htmlFor="store">Store</Label>
                      <Switch
                        id="store"
                        checked={payload.store}
                        onCheckedChange={(checked) => updatePayload("store", checked)}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <Label>Include Fields</Label>
                      <div className="space-y-2">
                        {includeOptions.map((option) => (
                          <div key={option.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`include-${option.id}`}
                              checked={payload.include.includes(option.id)}
                              onCheckedChange={() => toggleInclude(option.id)}
                            />
                            <label
                              htmlFor={`include-${option.id}`}
                              className="text-sm font-mono cursor-pointer"
                            >
                              {option.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label htmlFor="top-logprobs">Top Logprobs (0-20)</Label>
                      <Input
                        id="top-logprobs"
                        type="number"
                        value={payload.top_logprobs}
                        onChange={(e) => updatePayload("top_logprobs", Math.min(20, Math.max(0, parseInt(e.target.value) || 0)))}
                        min={0}
                        max={20}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="safety-identifier">Safety Identifier</Label>
                      <Input
                        id="safety-identifier"
                        value={payload.safety_identifier}
                        onChange={(e) => updatePayload("safety_identifier", e.target.value)}
                        placeholder="user_123"
                        className="font-mono text-sm"
                      />
                    </div>

                    <Separator />

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Metadata</Label>
                        <Button variant="outline" size="sm" onClick={addMetadataEntry}>
                          <Plus className="h-4 w-4 mr-1" /> Add Row
                        </Button>
                      </div>
                      
                      {payload.metadata.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No metadata entries. Click "Add Row" to add key-value pairs.</p>
                      ) : (
                        <div className="space-y-2">
                          {payload.metadata.map((entry, index) => (
                            <div key={index} className="flex gap-2 items-center">
                              <Input
                                value={entry.key}
                                onChange={(e) => updateMetadataEntry(index, "key", e.target.value)}
                                placeholder="Key"
                                className="flex-1"
                              />
                              <Input
                                value={entry.value}
                                onChange={(e) => updateMetadataEntry(index, "value", e.target.value)}
                                placeholder="Value"
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeMetadataEntry(index)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </CardContent>
          </Card>

          {/* Preview & Response Section */}
          <div className="space-y-6">
            {/* JSON Preview */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">JSON Preview</CardTitle>
                    <CardDescription>Live preview of the payload</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={copyToClipboard}>
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-1" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <pre className="text-sm font-mono bg-muted p-4 rounded-lg overflow-x-auto">
                    {generatedPayload}
                  </pre>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Response Viewer */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Response</CardTitle>
                    <CardDescription>API response details</CardDescription>
                  </div>
                  {response && (
                    <Badge
                      variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}
                      className="flex items-center gap-1"
                    >
                      {response.status >= 200 && response.status < 300 ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertCircle className="h-3 w-3" />
                      )}
                      {response.status} {response.statusText}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[200px]">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      <Spinner className="mr-2 h-4 w-4" />
                      Sending request...
                    </div>
                  ) : response ? (
                    <pre className="text-sm font-mono bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                      {response.body}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                      Response will appear here after sending
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
