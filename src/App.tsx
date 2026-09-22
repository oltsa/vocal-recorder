import { useEffect, useMemo, useRef, useState } from "react";

import {
  createLiveInputAnalyzer,
  type AnalysisReport,
  type AnalysisSnapshot,
  type LiveInputAnalyzer,
} from "@/features/recorder/lib/analysis";
import {
  applyChainPatch,
  createAudioChain,
  createPlaybackAudioChain,
  defaultVocalChainSettings,
  globalControlSpecs,
  toolControlSpecs,
  vocalChainToolDescriptions,
  vocalChainToolLabels,
  type ActiveAudioChain,
  type NumericControlSpec,
  type VocalChainSettings,
  type VocalChainToolKey,
} from "@/features/recorder/lib/audio-chain";
import {
  fetchOllamaModels,
  requestChainUpdate,
  type ChatMessage,
  type OllamaChainResponse,
} from "@/features/recorder/lib/ollama";

type RecorderFormat = {
  mimeType: string;
  fileExt: string;
};

type ChainTemplate = {
  id: string;
  name: string;
  createdAt: string;
  settings: VocalChainSettings;
};

const CHAIN_TEMPLATES_STORAGE_KEY = "vocal-recorder-chain-templates";

const initialMessages: ChatMessage[] = [
  {
    role: "assistant",
    content:
      "Recorder is ready. Record a raw take, analyze it, then build and audition a vocal chain against that same take.",
  },
];

function getRecorderFormat(): RecorderFormat {
  if (MediaRecorder.isTypeSupported("video/mp4")) {
    return { mimeType: "video/mp4", fileExt: "mp4" };
  }

  if (MediaRecorder.isTypeSupported('video/webm; codecs="opus"')) {
    return { mimeType: 'video/webm; codecs="opus"', fileExt: "webm" };
  }

  if (MediaRecorder.isTypeSupported('video/webm; codecs="vp9,opus"')) {
    return { mimeType: 'video/webm; codecs="vp9,opus"', fileExt: "webm" };
  }

  return { mimeType: "video/webm", fileExt: "webm" };
}

function buildDownloadName(fileExt: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `vocal_take_${timestamp}.${fileExt}`;
}

function formatMetricValue(metricKey: string, value: number) {
  if (metricKey.endsWith("Dbfs") || metricKey === "dynamicRangeDb") {
    return `${value.toFixed(1)} dB`;
  }

  return `${Math.round(value * 100)}%`;
}

function formatMetricLabel(metricKey: string) {
  switch (metricKey) {
    case "peakDbfs":
      return "Peak";
    case "avgRmsDbfs":
      return "Average RMS";
    case "noiseFloorDbfs":
      return "Noise floor";
    case "dynamicRangeDb":
      return "Dynamic range";
    case "lowEndRatio":
      return "Low end";
    case "lowMidRatio":
      return "Low mids";
    case "presenceRatio":
      return "Presence";
    case "sibilanceRatio":
      return "Sibilance";
    case "airRatio":
      return "Air";
    default:
      return metricKey;
  }
}

function buildSuggestionPrompt(report: AnalysisReport) {
  const suggestionLines = report.suggestions
    .slice(0, 4)
    .map((suggestion) => `- ${suggestion.title}: ${suggestion.detail}`)
    .join("\n");

  return [
    "Use the latest analyzer report to apply a corrective vocal cleanup pass before style changes.",
    "Prioritize noise, low-end, low-mid, sibilance, and dynamics issues if they are present.",
    "Keep the changes musical and restrained.",
    "Suggested focus:",
    suggestionLines,
  ].join("\n");
}

function getCollapsedToolSummary(
  toolKey: VocalChainToolKey,
  settings: VocalChainSettings["tools"][VocalChainToolKey],
) {
  const specs = toolControlSpecs[toolKey] as Record<string, NumericControlSpec>;
  const summaryKeys = Object.keys(specs).slice(0, 3);

  return summaryKeys.map((settingKey) => {
    const rawValue = Number(settings[settingKey as keyof typeof settings]);
    const spec = specs[settingKey as keyof typeof specs];
    const suffix = spec.unit ? ` ${spec.unit}` : "";
    return `${formatLabel(settingKey)} ${rawValue}${suffix}`;
  });
}

function normalizeStoredSettings(value: unknown): VocalChainSettings {
  if (!value || typeof value !== "object") {
    return defaultVocalChainSettings;
  }

  return applyChainPatch(
    defaultVocalChainSettings,
    value as Parameters<typeof applyChainPatch>[1],
  );
}

function formatLabel(settingKey: string) {
  switch (settingKey) {
    case "inputGain":
      return "Input gain";
    case "outputGain":
      return "Output gain";
    case "frequencyHz":
      return "Frequency";
    case "gainDb":
      return "Gain";
    case "thresholdDb":
      return "Threshold";
    case "attackMs":
      return "Attack";
    case "releaseMs":
      return "Release";
    case "delayMs":
      return "Delay";
    case "feedbackPercent":
      return "Feedback";
    case "mixPercent":
      return "Mix";
    case "highCutHz":
      return "High cut";
    case "lowCutHz":
      return "Low cut";
    default:
      return settingKey.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
  }
}

function getToolStatus(settings: VocalChainSettings, toolKey: VocalChainToolKey) {
  return settings.enabled && settings.tools[toolKey].enabled ? "active" : "bypassed";
}

function moveToolInOrder(
  currentOrder: VocalChainToolKey[],
  toolKey: VocalChainToolKey,
  direction: "up" | "down",
) {
  const currentIndex = currentOrder.indexOf(toolKey);

  if (currentIndex === -1) {
    return currentOrder;
  }

  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (nextIndex < 0 || nextIndex >= currentOrder.length) {
    return currentOrder;
  }

  const nextOrder = [...currentOrder];
  const [movedTool] = nextOrder.splice(currentIndex, 1);
  nextOrder.splice(nextIndex, 0, movedTool);
  return nextOrder;
}

export default function App() {
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState("");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentVideo, setCurrentVideo] = useState<string | null>(null);
  const [currentFileExt, setCurrentFileExt] = useState("webm");
  const [isCameraMirrored, setIsCameraMirrored] = useState(true);
  const [chainSettings, setChainSettings] = useState(defaultVocalChainSettings);
  const [messages, setMessages] = useState(initialMessages);
  const [liveAnalysis, setLiveAnalysis] = useState<AnalysisSnapshot | null>(null);
  const [lastAnalysis, setLastAnalysis] = useState<AnalysisReport | null>(null);
  const [chainTemplates, setChainTemplates] = useState<ChainTemplate[]>(() => {
    try {
      const rawTemplates = localStorage.getItem(CHAIN_TEMPLATES_STORAGE_KEY);

      if (!rawTemplates) {
        return [];
      }

      return (JSON.parse(rawTemplates) as ChainTemplate[]).map((template) => ({
        ...template,
        settings: normalizeStoredSettings(template.settings),
      }));
    } catch {
      return [];
    }
  });
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [chainHistory, setChainHistory] = useState<VocalChainSettings[]>([]);
  const [pendingToolToAdd, setPendingToolToAdd] = useState<VocalChainToolKey>("noiseGate");
  const [prompt, setPrompt] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState("Checking Ollama...");
  const [ollamaModel, setOllamaModel] = useState("");
  const [lastAiDecision, setLastAiDecision] = useState<OllamaChainResponse | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeChainRef = useRef<ActiveAudioChain | null>(null);
  const playbackChainRef = useRef<ActiveAudioChain | null>(null);
  const inputAnalyzerRef = useRef<LiveInputAnalyzer | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const playbackVideoRef = useRef<HTMLVideoElement | null>(null);
  const processedPlaybackVideoRef = useRef<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentVideoRef = useRef<string | null>(null);

  const activeTools = useMemo(
    () => chainSettings.toolOrder.filter((toolKey) => getToolStatus(chainSettings, toolKey) === "active"),
    [chainSettings],
  );
  const availableTools = useMemo(
    () => chainSettings.toolOrder.filter((toolKey) => !chainSettings.tools[toolKey].enabled),
    [chainSettings],
  );
  const showRecordedPreview = Boolean(currentVideo && !isCameraInitialized && !isRecording);
  const selectedAddTool = availableTools.includes(pendingToolToAdd)
    ? pendingToolToAdd
    : (availableTools[0] ?? "noiseGate");

  useEffect(() => {
    const videoElement = videoRef.current;
    const stream = cameraStreamRef.current;

    if (!videoElement || !stream || !isCameraInitialized) {
      return;
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }

    void videoElement.play().catch(() => {
      return undefined;
    });
  }, [isCameraInitialized]);

  useEffect(() => {
    const videoElement = playbackVideoRef.current;
    const processedVideoElement = processedPlaybackVideoRef.current;

    async function cleanupPlaybackChain() {
      if (playbackChainRef.current) {
        await playbackChainRef.current.cleanup();
        playbackChainRef.current = null;
      }
    }

    async function setupPlaybackChain() {
      if (!videoElement || !processedVideoElement) {
        return;
      }

      await cleanupPlaybackChain();

      if (!currentVideo || !chainSettings.enabled) {
        videoElement.muted = false;
        processedVideoElement.pause();
        return;
      }

      videoElement.muted = true;
      processedVideoElement.currentTime = videoElement.currentTime;
      processedVideoElement.playbackRate = videoElement.playbackRate;
      processedVideoElement.muted = true;
      processedVideoElement.defaultMuted = true;
      processedVideoElement.volume = 1;
      playbackChainRef.current = await createPlaybackAudioChain(processedVideoElement, {
        ...chainSettings,
        monitoring: true,
      });
      await processedVideoElement.play();
    }

    function handlePlay() {
      if (chainSettings.enabled) {
        void setupPlaybackChain();
      }
    }

    function handlePauseOrEnd() {
      if (processedVideoElement) {
        processedVideoElement.pause();
      }

      if (chainSettings.enabled) {
        void cleanupPlaybackChain();
      }
    }

    function handleSeeked() {
      if (processedVideoElement && videoElement) {
        processedVideoElement.currentTime = videoElement.currentTime;
      }
    }

    function handleRateChange() {
      if (processedVideoElement && videoElement) {
        processedVideoElement.playbackRate = videoElement.playbackRate;
      }
    }

    if (videoElement) {
      videoElement.addEventListener("play", handlePlay);
      videoElement.addEventListener("pause", handlePauseOrEnd);
      videoElement.addEventListener("ended", handlePauseOrEnd);
      videoElement.addEventListener("seeked", handleSeeked);
      videoElement.addEventListener("ratechange", handleRateChange);

      if (chainSettings.enabled && !videoElement.paused) {
        void setupPlaybackChain();
      } else if (!chainSettings.enabled) {
        videoElement.muted = false;
      }
    }

    return () => {
      if (videoElement) {
        videoElement.removeEventListener("play", handlePlay);
        videoElement.removeEventListener("pause", handlePauseOrEnd);
        videoElement.removeEventListener("ended", handlePauseOrEnd);
        videoElement.removeEventListener("seeked", handleSeeked);
        videoElement.removeEventListener("ratechange", handleRateChange);
        videoElement.muted = false;
      }

      if (processedVideoElement) {
        processedVideoElement.pause();
      }

      void cleanupPlaybackChain();
    };
  }, [chainSettings, currentVideo]);

  useEffect(() => {
    localStorage.setItem(CHAIN_TEMPLATES_STORAGE_KEY, JSON.stringify(chainTemplates));
  }, [chainTemplates]);

  useEffect(() => {
    async function loadAudioDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      const savedId = localStorage.getItem("selected-audio-device-id") ?? "";

      setAudioDevices(inputs);

      if (savedId && inputs.some((device) => device.deviceId === savedId)) {
        setSelectedAudioDeviceId(savedId);
        return;
      }

      if (inputs[0]) {
        setSelectedAudioDeviceId(inputs[0].deviceId);
      }
    }

    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => {
      void loadAudioDevices();
    };

    void loadAudioDevices();
    mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, []);

  useEffect(() => {
    async function loadOllamaModels() {
      try {
        const models = await fetchOllamaModels();

        if (!models[0]) {
          setOllamaStatus("Ollama reachable, but no local models were found.");
          return;
        }

        setOllamaModel(models[0]);
        setOllamaStatus(`Connected to Ollama using ${models[0]}.`);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to reach local Ollama.";
        setOllamaStatus(message);
      }
    }

    void loadOllamaModels();
  }, []);

  useEffect(() => {
    return () => {
      if (analysisIntervalRef.current !== null) {
        window.clearInterval(analysisIntervalRef.current);
      }

      mediaRecorderRef.current?.stop();
      void activeChainRef.current?.cleanup();
      void playbackChainRef.current?.cleanup();
      void inputAnalyzerRef.current?.cleanup();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());

      if (currentVideoRef.current) {
        URL.revokeObjectURL(currentVideoRef.current);
      }
    };
  }, []);

  async function teardownInputAnalyzer(storeReport: boolean) {
    if (analysisIntervalRef.current !== null) {
      window.clearInterval(analysisIntervalRef.current);
      analysisIntervalRef.current = null;
    }

    const analyzer = inputAnalyzerRef.current;

    if (!analyzer) {
      return;
    }

    if (storeReport) {
      const report = analyzer.getReport(chainSettings);
      setLiveAnalysis(report.metrics);
      setLastAnalysis(report);
    }

    inputAnalyzerRef.current = null;
    await analyzer.cleanup();
  }

  async function startCamera() {
    try {
      await teardownInputAnalyzer(false);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: selectedAudioDeviceId
          ? {
              deviceId: { exact: selectedAudioDeviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
        video: true,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      cameraStreamRef.current = stream;
      const analyzer = await createLiveInputAnalyzer(stream);
      inputAnalyzerRef.current = analyzer;
      setLiveAnalysis(analyzer.getSnapshot());
      analysisIntervalRef.current = window.setInterval(() => {
        const currentAnalyzer = inputAnalyzerRef.current;

        if (currentAnalyzer) {
          setLiveAnalysis(currentAnalyzer.getSnapshot());
        }
      }, 250);
      setIsCameraInitialized(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to access camera and microphone.";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: `Recorder error: ${message}`,
        },
      ]);
    }
  }

  async function stopCamera(storeReport = true) {
    const stream = cameraStreamRef.current;

    if (stream instanceof MediaStream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    cameraStreamRef.current = null;
    setIsCameraInitialized(false);
    await teardownInputAnalyzer(storeReport);
  }

  function handleAudioDeviceChange(deviceId: string) {
    setSelectedAudioDeviceId(deviceId);
    localStorage.setItem("selected-audio-device-id", deviceId);
  }

  async function startRecording() {
    const stream = cameraStreamRef.current;

    if (!(stream instanceof MediaStream)) {
      return;
    }

    const rawCaptureChain = await createAudioChain(stream, {
      ...chainSettings,
      enabled: false,
      monitoring: false,
    });
    activeChainRef.current = rawCaptureChain;

    const { mimeType, fileExt } = getRecorderFormat();
    const recordingStream = new MediaStream([
      ...stream.getVideoTracks(),
      ...rawCaptureChain.processedStream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(recordingStream, {
      mimeType,
      audioBitsPerSecond: 192000,
    });

    const recordedChunks: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const videoBlob = new Blob(recordedChunks, { type: mimeType });
      const videoUrl = URL.createObjectURL(videoBlob);
      const report = inputAnalyzerRef.current?.getReport(chainSettings) ?? null;

      if (currentVideoRef.current) {
        URL.revokeObjectURL(currentVideoRef.current);
      }

      currentVideoRef.current = videoUrl;
      setCurrentFileExt(fileExt);
      setCurrentVideo(videoUrl);
      setIsRecording(false);

      if (report) {
        setLiveAnalysis(report.metrics);
        setLastAnalysis(report);
      }

      await stopCamera(false);

      if (activeChainRef.current) {
        await activeChainRef.current.cleanup();
        activeChainRef.current = null;
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function saveVideo(videoUrl: string) {
    const anchor = document.createElement("a");
    anchor.href = videoUrl;
    anchor.download = buildDownloadName(currentFileExt);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }

  async function saveProcessedVideo() {
    if (!currentVideo) {
      return;
    }

    const renderVideo = document.createElement("video") as HTMLVideoElement & {
      captureStream?: () => MediaStream;
    };

    renderVideo.src = currentVideo;
    renderVideo.muted = true;
    renderVideo.defaultMuted = true;
    renderVideo.playsInline = true;
    renderVideo.crossOrigin = "anonymous";

    const loadedPromise = new Promise<void>((resolve, reject) => {
      renderVideo.onloadedmetadata = () => resolve();
      renderVideo.onerror = () => reject(new Error("Unable to load recorded take for processed export."));
    });

    await loadedPromise;

    if (typeof renderVideo.captureStream !== "function") {
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: "Processed video export is not supported in this browser.",
        },
      ]);
      return;
    }

    const visualStream = renderVideo.captureStream();
    const processedPlaybackChain = await createPlaybackAudioChain(renderVideo, {
      ...chainSettings,
      monitoring: false,
    });

    const outputStream = new MediaStream([
      ...visualStream.getVideoTracks(),
      ...processedPlaybackChain.processedStream.getAudioTracks(),
    ]);

    const { mimeType, fileExt } = getRecorderFormat();
    const recorder = new MediaRecorder(outputStream, {
      mimeType,
      audioBitsPerSecond: 192000,
    });
    const chunks: Blob[] = [];

    const finishedPromise = new Promise<void>((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = () => {
        const processedBlob = new Blob(chunks, { type: mimeType });
        const processedUrl = URL.createObjectURL(processedBlob);
        const anchor = document.createElement("a");
        anchor.href = processedUrl;
        anchor.download = `processed_${buildDownloadName(fileExt)}`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(processedUrl);
        resolve();
      };
    });

    recorder.start();
    await renderVideo.play();

    await new Promise<void>((resolve) => {
      renderVideo.onended = () => resolve();
    });

    recorder.stop();
    await finishedPromise;
    await processedPlaybackChain.cleanup();
    outputStream.getTracks().forEach((track) => track.stop());
    visualStream.getTracks().forEach((track) => track.stop());
  }

  function deleteVideo() {
    if (currentVideoRef.current) {
      URL.revokeObjectURL(currentVideoRef.current);
      currentVideoRef.current = null;
    }

    setCurrentVideo(null);
  }

  function clearChain() {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      enabled: false,
      tools: Object.fromEntries(
        currentSettings.toolOrder.map((toolKey) => [
          toolKey,
          {
            ...currentSettings.tools[toolKey],
            enabled: false,
          },
        ]),
      ) as VocalChainSettings["tools"],
    }));
  }

  function undoLastAiChange() {
    setChainHistory((currentHistory) => {
      const previousSettings = currentHistory[currentHistory.length - 1];

      if (!previousSettings) {
        return currentHistory;
      }

      setChainSettings(previousSettings);
      return currentHistory.slice(0, -1);
    });
  }

  function exportChain() {
    const chainBlob = new Blob([JSON.stringify(chainSettings, null, 2)], {
      type: "application/json",
    });
    const chainUrl = URL.createObjectURL(chainBlob);
    const anchor = document.createElement("a");
    anchor.href = chainUrl;
    anchor.download = `vocal_chain_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(chainUrl);
  }

  function saveTemplate() {
    const templateName = window.prompt("Template name", `Chain ${chainTemplates.length + 1}`)?.trim();

    if (!templateName) {
      return;
    }

    const nextTemplate: ChainTemplate = {
      id: crypto.randomUUID(),
      name: templateName,
      createdAt: new Date().toISOString(),
      settings: chainSettings,
    };

    setChainTemplates((currentTemplates) => [nextTemplate, ...currentTemplates]);
    setSelectedTemplateId(nextTemplate.id);
  }

  function loadTemplate(templateId: string) {
    setSelectedTemplateId(templateId);

    const nextTemplate = chainTemplates.find((template) => template.id === templateId);

    if (!nextTemplate) {
      return;
    }

    setChainSettings(normalizeStoredSettings(nextTemplate.settings));
  }

  function updateGlobalSetting(settingKey: "inputGain" | "outputGain", value: number) {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      [settingKey]: value,
    }));
  }

  function updateToolEnabled(toolKey: VocalChainToolKey, enabled: boolean) {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      tools: {
        ...currentSettings.tools,
        [toolKey]: {
          ...currentSettings.tools[toolKey],
          enabled,
        },
      },
    }));
  }

  function addToolToChain(toolKey: VocalChainToolKey) {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      enabled: true,
      toolOrder: currentSettings.toolOrder.includes(toolKey)
        ? currentSettings.toolOrder
        : [...currentSettings.toolOrder, toolKey],
      tools: {
        ...currentSettings.tools,
        [toolKey]: {
          ...currentSettings.tools[toolKey],
          enabled: true,
        },
      },
    }));
  }

  function removeToolFromChain(toolKey: VocalChainToolKey) {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      tools: {
        ...currentSettings.tools,
        [toolKey]: {
          ...currentSettings.tools[toolKey],
          enabled: false,
        },
      },
    }));
  }

  function moveTool(toolKey: VocalChainToolKey, direction: "up" | "down") {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      toolOrder: moveToolInOrder(currentSettings.toolOrder, toolKey, direction),
    }));
  }

  function updateToolNumber(
    toolKey: VocalChainToolKey,
    settingKey: string,
    value: number,
  ) {
    setChainSettings((currentSettings) => ({
      ...currentSettings,
      tools: {
        ...currentSettings.tools,
        [toolKey]: {
          ...currentSettings.tools[toolKey],
          [settingKey]: value,
        },
      },
    }));
  }

  async function sendAiPrompt(promptText: string) {
    const nextConversation = [
      ...messages,
      {
        role: "user" as const,
        content: promptText,
      },
    ];

    setMessages(nextConversation);
    setPrompt("");
    setIsSending(true);

    try {
      const analysisReport =
        lastAnalysis ?? inputAnalyzerRef.current?.getReport(chainSettings) ?? null;

      const response = await requestChainUpdate({
        model: ollamaModel,
        currentSettings: chainSettings,
        analysisReport,
        conversation: messages,
        userPrompt: promptText,
      });
      const nextSettings = applyChainPatch(chainSettings, response.chainPatch);

      setChainHistory((currentHistory) => [...currentHistory, chainSettings]);
      setChainSettings(nextSettings);
      setLastAiDecision(response);
      setMessages([
        ...nextConversation,
        {
          role: "assistant",
          content: response.assistantMessage,
        },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update vocal chain.";

      setMessages([
        ...nextConversation,
        {
          role: "assistant",
          content: `Ollama error: ${message}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function applyAnalysisSuggestions() {
    if (!lastAnalysis || !ollamaModel || isSending) {
      return;
    }

    void sendAiPrompt(buildSuggestionPrompt(lastAnalysis));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt || !ollamaModel) {
      return;
    }

    await sendAiPrompt(trimmedPrompt);
  }

  return (
    <div className="app-shell">
      <div className="workspace workspace-wide">
        <section className="studio-panel">
          <div className="top-bar">
            <select
              className="dropdown"
              onChange={(event) => handleAudioDeviceChange(event.target.value)}
              value={selectedAudioDeviceId}
            >
              {audioDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
            <label className="inline-toggle compact-top-toggle">
              <input
                checked={isCameraMirrored}
                onChange={(event) => setIsCameraMirrored(event.target.checked)}
                type="checkbox"
              />
              <span>Mirror camera</span>
            </label>
            <div className="status-chip">{ollamaStatus}</div>
            <div className="status-chip">{ollamaModel || "No model"}</div>
          </div>

          <div className="camera-container">
            <div
              className={`camera${isRecording ? " recording" : ""}`}
              onClick={!isCameraInitialized ? startCamera : undefined}
              onKeyDown={(event) => {
                if (!isCameraInitialized && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  void startCamera();
                }
              }}
              role={!isCameraInitialized ? "button" : undefined}
              tabIndex={!isCameraInitialized ? 0 : -1}
            >
              <video
                ref={videoRef}
                autoPlay
                className={`${!isCameraInitialized ? "camera-video hidden" : "camera-video"} ${isCameraMirrored ? "mirrored" : ""}`}
                muted
                playsInline
              />
              {!isCameraInitialized ? <div className="camera-info">activate camera</div> : null}

              <div className="video-preview" style={{ display: showRecordedPreview ? "flex" : "none" }}>
                {currentVideo ? <video controls ref={playbackVideoRef} src={currentVideo} /> : null}
                {currentVideo ? (
                  <video
                    className="hidden-media-element"
                    playsInline
                    preload="auto"
                    ref={processedPlaybackVideoRef}
                    src={currentVideo}
                  />
                ) : null}
                <div className="video-controls">
                  <button className="button save-button" onClick={() => saveVideo(currentVideo!)}>
                    Save raw
                  </button>
                  <button className="button save-button" onClick={() => void saveProcessedVideo()} type="button">
                    Save with chain
                  </button>
                  <button className="button delete-button" onClick={deleteVideo}>
                    Discard
                  </button>
                </div>
              </div>
            </div>

            <div className="player-controls">
              <button
                className="secondary-button"
                onClick={() => {
                  void (isCameraInitialized ? stopCamera() : startCamera());
                }}
              >
                {isCameraInitialized ? "Stop camera" : "Start camera"}
              </button>
              {isCameraInitialized ? (
                <button
                  className={`record-button ${isRecording ? "recording" : ""}`}
                  onClick={isRecording ? stopRecording : startRecording}
                />
              ) : null}
            </div>
          </div>

          <div className="chain-summary-panel">
            <div className="panel-heading-row">
              <div>
                <h2>Current vocal chain</h2>
                <p className="panel-subtitle">Playback follows `Chain enabled`. Build the chain on the same raw take, then export it when it sounds right.</p>
              </div>
              <span className="panel-note">{chainSettings.enabled ? "Chain enabled" : "Chain bypassed"}</span>
            </div>

            <div className="global-settings-grid">
              <div className="global-setting-card">
                <label className="inline-toggle">
                  <input
                    checked={chainSettings.enabled}
                    onChange={(event) =>
                      setChainSettings((currentSettings) => ({
                        ...currentSettings,
                        enabled: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Chain enabled</span>
                </label>
              </div>
              <div className="global-setting-card">
                <label className="inline-toggle">
                  <input
                    checked={chainSettings.monitoring}
                    onChange={(event) =>
                      setChainSettings((currentSettings) => ({
                        ...currentSettings,
                        monitoring: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Direct monitor processed chain</span>
                </label>
              </div>
              <div className="global-setting-card">
                <span>Active tools</span>
                <strong>{activeTools.length}</strong>
              </div>
            </div>

            <div className="action-row compact-actions">
              <button className="secondary-button compact-button" onClick={clearChain} type="button">
                Remove chain
              </button>
              <button
                className="secondary-button compact-button"
                disabled={chainHistory.length === 0}
                onClick={undoLastAiChange}
                type="button"
              >
                Undo AI change
              </button>
              <button className="secondary-button compact-button" onClick={saveTemplate} type="button">
                Save template
              </button>
              <button className="secondary-button compact-button" onClick={exportChain} type="button">
                Export chain JSON
              </button>
              <select
                className="dropdown compact-dropdown"
                onChange={(event) => loadTemplate(event.target.value)}
                value={selectedTemplateId}
              >
                <option value="">Load template</option>
                {chainTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="manual-global-controls">
              {(Object.entries(globalControlSpecs) as Array<[
                keyof typeof globalControlSpecs,
                NumericControlSpec,
              ]>).map(([settingKey, spec]) => (
                <div className="control-row" key={settingKey}>
                  <label>{formatLabel(settingKey)}</label>
                  <input
                    max={spec.max}
                    min={spec.min}
                    onChange={(event) =>
                      updateGlobalSetting(settingKey, Number(event.target.value))
                    }
                    step={spec.step}
                    type="range"
                    value={chainSettings[settingKey]}
                  />
                  <input
                    className="control-number"
                    max={spec.max}
                    min={spec.min}
                    onChange={(event) =>
                      updateGlobalSetting(settingKey, Number(event.target.value))
                    }
                    step={spec.step}
                    type="number"
                    value={chainSettings[settingKey]}
                  />
                </div>
              ))}
            </div>

            <div className="stack-toolbar">
              <div>
                <h3>Effect stack</h3>
                <p className="panel-subtitle small-subtitle">
                  Active effects run top to bottom. Add, remove, and reorder them.
                </p>
              </div>
              <div className="stack-toolbar-actions">
                <select
                  className="dropdown compact-dropdown"
                  onChange={(event) => setPendingToolToAdd(event.target.value as VocalChainToolKey)}
                  value={selectedAddTool}
                >
                  {availableTools.map((toolKey) => (
                    <option key={toolKey} value={toolKey}>
                      {vocalChainToolLabels[toolKey]}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button compact-button"
                  disabled={availableTools.length === 0}
                  onClick={() => addToolToChain(selectedAddTool)}
                  type="button"
                >
                  Add effect
                </button>
              </div>
            </div>

            {lastAiDecision ? (
              <div className="ai-move-panel">
                <div className="panel-heading-row compact-row">
                  <h3>Last AI move</h3>
                  <span className="panel-note">Tools chosen in latest reply</span>
                </div>
                <div className="chain-chip-row">
                  {lastAiDecision.toolsUsed.length > 0 ? (
                    lastAiDecision.toolsUsed.map((toolKey) => (
                      <span className="chain-chip" key={toolKey}>
                        {vocalChainToolLabels[toolKey]}
                      </span>
                    ))
                  ) : (
                    <span className="chain-chip muted-chip">No tool changes returned</span>
                  )}
                </div>
              </div>
            ) : null}

            <div className="tool-chain-list">
              {activeTools.length === 0 ? (
                <div className="empty-stack-card">
                  <strong>No active effects</strong>
                  <p>
                    Start with analysis, ask AI for a corrective pass, or add one effect to begin building your chain.
                  </p>
                </div>
              ) : null}

              {activeTools.map((toolKey, index) => {
                const toolSettings = chainSettings.tools[toolKey];
                const toolStatus = getToolStatus(chainSettings, toolKey);
                const controlSpecs = Object.entries(toolControlSpecs[toolKey]) as Array<[
                  string,
                  NumericControlSpec,
                ]>;

                return (
                  <details className={`tool-card ${toolStatus}`} key={toolKey}>
                    <summary className="tool-card-header tool-summary">
                      <div className="tool-summary-main">
                        <span className="tool-index">{index + 1}</span>
                        <div>
                          <h3>{vocalChainToolLabels[toolKey]}</h3>
                          <div className="tool-summary-chips">
                            {getCollapsedToolSummary(toolKey, toolSettings).map((item) => (
                              <span className="tool-summary-chip" key={item}>
                                {item}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="tool-header-actions">
                        <button
                          className="tool-icon-button"
                          disabled={index === 0}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveTool(toolKey, "up");
                          }}
                          type="button"
                        >
                          Up
                        </button>
                        <button
                          className="tool-icon-button"
                          disabled={index === activeTools.length - 1}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveTool(toolKey, "down");
                          }}
                          type="button"
                        >
                          Down
                        </button>
                        <button
                          className={`tool-status ${toolSettings.enabled ? "active" : "bypassed"}`}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            updateToolEnabled(toolKey, !toolSettings.enabled);
                          }}
                          type="button"
                        >
                          {toolSettings.enabled ? "On" : "Off"}
                        </button>
                        <button
                          className="tool-remove-button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeToolFromChain(toolKey);
                          }}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </summary>
                    <div className="tool-card-body">
                      <p className="tool-summary-copy expanded-copy">{vocalChainToolDescriptions[toolKey]}</p>

                      <div className="tool-controls-grid">
                        {controlSpecs.map(([settingKey, spec]) => {
                          const numericValue = Number(
                            toolSettings[settingKey as keyof typeof toolSettings],
                          );

                          return (
                            <div className="control-row" key={settingKey}>
                              <label>{formatLabel(settingKey)}</label>
                              <input
                                max={spec.max}
                                min={spec.min}
                                onChange={(event) =>
                                  updateToolNumber(toolKey, settingKey, Number(event.target.value))
                                }
                                step={spec.step}
                                type="range"
                                value={numericValue}
                              />
                              <input
                                className="control-number"
                                max={spec.max}
                                min={spec.min}
                                onChange={(event) =>
                                  updateToolNumber(toolKey, settingKey, Number(event.target.value))
                                }
                                step={spec.step}
                                type="number"
                                value={numericValue}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>

            <div className="analysis-panel">
              <div className="panel-heading-row">
                <div>
                  <h2>Input analysis</h2>
                  <p className="panel-subtitle">
                    Real-time dry-input metrics from Web Audio, plus post-take suggestions.
                  </p>
                </div>
                <span className="panel-note">
                  {isCameraInitialized ? "Live analyzer running" : lastAnalysis ? "Last take analyzed" : "Analyzer idle"}
                </span>
              </div>

              {liveAnalysis ? (
                <div className="metrics-grid">
                  {Object.entries(liveAnalysis)
                    .filter(([metricKey]) => metricKey !== "sampleFrames")
                    .map(([metricKey, metricValue]) => (
                      <div className="metric-card" key={metricKey}>
                        <span>{formatMetricLabel(metricKey)}</span>
                        <strong>{formatMetricValue(metricKey, metricValue)}</strong>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="empty-state-copy">
                  Start the camera to begin measuring the raw microphone signal.
                </p>
              )}

              {lastAnalysis ? (
                <div className="suggestions-panel">
                  <div className="panel-heading-row compact-row">
                    <div>
                      <h3>Suggested adjustments</h3>
                      <p className="panel-subtitle small-subtitle">{lastAnalysis.summary}</p>
                    </div>
                    <button
                      className="secondary-button compact-button"
                      disabled={!ollamaModel || isSending}
                      onClick={applyAnalysisSuggestions}
                      type="button"
                    >
                      {isSending ? "Applying..." : "Apply suggested fix with AI"}
                    </button>
                  </div>
                  <div className="suggestion-list">
                    {lastAnalysis.suggestions.map((suggestion) => (
                      <article className="suggestion-card" key={suggestion.title}>
                        <h4>{suggestion.title}</h4>
                        <p>{suggestion.detail}</p>
                      </article>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside className="assistant-panel">
          <div className="assistant-header">
            <div>
              <p className="panel-label">AI control</p>
              <h2>Tell the recorder what the vocal should sound like.</h2>
            </div>
            <p className="assistant-hint">
              Describe the result you want. The AI can add, adjust, or remove tools based on the recording and analyzer report.
            </p>
          </div>

          <div className="message-list">
            {messages.map((message, index) => (
              <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
                <span className="message-role">{message.role}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>

          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the vocal change you want..."
              rows={5}
              value={prompt}
            />
            <button disabled={!ollamaModel || isSending} type="submit">
              {isSending ? "Updating chain..." : "Apply with AI"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
