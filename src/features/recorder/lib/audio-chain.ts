export const vocalChainToolOrder = [
  "noiseGate",
  "highPassFilter",
  "bodyEq",
  "deEsser",
  "compressor",
  "parallelCompressor",
  "saturation",
  "airEq",
  "shortReverb",
  "longReverb",
] as const;

export type VocalChainToolKey = (typeof vocalChainToolOrder)[number];

export const vocalChainToolLabels: Record<VocalChainToolKey, string> = {
  noiseGate: "Noise gate",
  highPassFilter: "High-pass filter",
  bodyEq: "Body EQ",
  deEsser: "De-esser",
  compressor: "Compressor",
  parallelCompressor: "Parallel compressor",
  saturation: "Saturation",
  airEq: "Air EQ",
  shortReverb: "Short reverb",
  longReverb: "Long reverb",
};

export const vocalChainToolDescriptions: Record<VocalChainToolKey, string> = {
  noiseGate:
    "Reduces room noise and breathy idle spill between phrases without muting the voice entirely.",
  highPassFilter:
    "Cuts rumble and low-end handling noise before the rest of the chain.",
  bodyEq:
    "Shapes the low-mid body of the vocal for warmth, intimacy, or mud cleanup.",
  deEsser:
    "Targets harsh sibilance so the vocal can stay bright without spitting.",
  compressor:
    "Controls dynamics and brings the vocal forward in a steady, intimate way.",
  parallelCompressor:
    "Adds a second heavier compressor blend for dense modern vocal presence.",
  saturation:
    "Adds harmonic density and modern edge while keeping the voice present.",
  airEq:
    "Adds or removes top-end sheen and openness.",
  shortReverb:
    "Adds a short early-space bloom that keeps the vocal feeling expensive without washing it out.",
  longReverb:
    "Adds a longer tail that can duck behind the vocal and bloom more after phrases end.",
};

export type NoiseGateSettings = {
  enabled: boolean;
  thresholdDb: number;
  floorDb: number;
  attackMs: number;
  releaseMs: number;
  holdMs: number;
};

export type HighPassFilterSettings = {
  enabled: boolean;
  frequencyHz: number;
};

export type BodyEqSettings = {
  enabled: boolean;
  frequencyHz: number;
  gainDb: number;
  q: number;
};

export type DeEsserSettings = {
  enabled: boolean;
  frequencyHz: number;
  thresholdDb: number;
  amountPercent: number;
};

export type CompressorSettings = {
  enabled: boolean;
  thresholdDb: number;
  ratio: number;
  attackMs: number;
  releaseMs: number;
  mixPercent: number;
};

export type ParallelCompressorSettings = CompressorSettings;

export type SaturationSettings = {
  enabled: boolean;
  drivePercent: number;
  tonePercent: number;
  mixPercent: number;
};

export type AirEqSettings = {
  enabled: boolean;
  frequencyHz: number;
  gainDb: number;
};

export type ShortReverbSettings = {
  enabled: boolean;
  delayMs: number;
  feedbackPercent: number;
  mixPercent: number;
  highCutHz: number;
  lowCutHz: number;
};

export type LongReverbSettings = {
  enabled: boolean;
  delayMs: number;
  feedbackPercent: number;
  mixPercent: number;
  duckingPercent: number;
  highCutHz: number;
  lowCutHz: number;
};

export type VocalChainTools = {
  noiseGate: NoiseGateSettings;
  highPassFilter: HighPassFilterSettings;
  bodyEq: BodyEqSettings;
  deEsser: DeEsserSettings;
  compressor: CompressorSettings;
  parallelCompressor: ParallelCompressorSettings;
  saturation: SaturationSettings;
  airEq: AirEqSettings;
  shortReverb: ShortReverbSettings;
  longReverb: LongReverbSettings;
};

export type VocalChainSettings = {
  enabled: boolean;
  monitoring: boolean;
  inputGain: number;
  outputGain: number;
  toolOrder: VocalChainToolKey[];
  tools: VocalChainTools;
};

export type NumericControlSpec = {
  min: number;
  max: number;
  step: number;
  unit?: string;
};

export type VocalChainPatch = Partial<
  Pick<VocalChainSettings, "enabled" | "inputGain" | "outputGain" | "toolOrder">
> & {
  tools?: Partial<{
    noiseGate: Partial<NoiseGateSettings>;
    highPassFilter: Partial<HighPassFilterSettings>;
    bodyEq: Partial<BodyEqSettings>;
    deEsser: Partial<DeEsserSettings>;
    compressor: Partial<CompressorSettings>;
    parallelCompressor: Partial<ParallelCompressorSettings>;
    saturation: Partial<SaturationSettings>;
    airEq: Partial<AirEqSettings>;
    shortReverb: Partial<ShortReverbSettings>;
    longReverb: Partial<LongReverbSettings>;
  }>;
};

export type ActiveAudioChain = {
  context: AudioContext;
  analyser: AnalyserNode;
  processedStream: MediaStream;
  cleanup: () => Promise<void>;
};

type BuiltChain = {
  analyser: AnalyserNode;
  outputGain: GainNode;
  processedStream: MediaStream;
  cleanupCallbacks: Array<() => void>;
};

export const defaultVocalChainSettings: VocalChainSettings = {
  enabled: false,
  monitoring: false,
  inputGain: 1,
  outputGain: 0,
  toolOrder: [...vocalChainToolOrder],
  tools: {
    noiseGate: {
      enabled: false,
      thresholdDb: -47,
      floorDb: -18,
      attackMs: 12,
      releaseMs: 150,
      holdMs: 90,
    },
    highPassFilter: {
      enabled: false,
      frequencyHz: 85,
    },
    bodyEq: {
      enabled: false,
      frequencyHz: 280,
      gainDb: 1,
      q: 0.9,
    },
    deEsser: {
      enabled: false,
      frequencyHz: 6400,
      thresholdDb: -30,
      amountPercent: 42,
    },
    compressor: {
      enabled: false,
      thresholdDb: -21,
      ratio: 2.8,
      attackMs: 10,
      releaseMs: 140,
      mixPercent: 84,
    },
    parallelCompressor: {
      enabled: false,
      thresholdDb: -30,
      ratio: 7,
      attackMs: 2,
      releaseMs: 120,
      mixPercent: 28,
    },
    saturation: {
      enabled: false,
      drivePercent: 18,
      tonePercent: 58,
      mixPercent: 24,
    },
    airEq: {
      enabled: false,
      frequencyHz: 9000,
      gainDb: 2,
    },
    shortReverb: {
      enabled: false,
      delayMs: 42,
      feedbackPercent: 24,
      mixPercent: 10,
      highCutHz: 6200,
      lowCutHz: 280,
    },
    longReverb: {
      enabled: false,
      delayMs: 95,
      feedbackPercent: 42,
      mixPercent: 14,
      duckingPercent: 58,
      highCutHz: 5200,
      lowCutHz: 260,
    },
  },
};

export const globalControlSpecs = {
  inputGain: { min: 0.25, max: 2, step: 0.01, unit: "x" },
  outputGain: { min: -12, max: 12, step: 0.1, unit: "dB" },
} as const satisfies Record<"inputGain" | "outputGain", NumericControlSpec>;

export const toolControlSpecs = {
  noiseGate: {
    thresholdDb: { min: -70, max: -10, step: 1, unit: "dB" },
    floorDb: { min: -80, max: 0, step: 1, unit: "dB" },
    attackMs: { min: 1, max: 80, step: 1, unit: "ms" },
    releaseMs: { min: 20, max: 500, step: 1, unit: "ms" },
    holdMs: { min: 0, max: 400, step: 1, unit: "ms" },
  },
  highPassFilter: {
    frequencyHz: { min: 20, max: 220, step: 1, unit: "Hz" },
  },
  bodyEq: {
    frequencyHz: { min: 120, max: 600, step: 1, unit: "Hz" },
    gainDb: { min: -12, max: 12, step: 0.1, unit: "dB" },
    q: { min: 0.3, max: 4, step: 0.01 },
  },
  deEsser: {
    frequencyHz: { min: 3500, max: 10000, step: 10, unit: "Hz" },
    thresholdDb: { min: -45, max: -10, step: 0.5, unit: "dB" },
    amountPercent: { min: 0, max: 100, step: 1, unit: "%" },
  },
  compressor: {
    thresholdDb: { min: -40, max: -5, step: 0.5, unit: "dB" },
    ratio: { min: 1, max: 8, step: 0.1 },
    attackMs: { min: 1, max: 60, step: 1, unit: "ms" },
    releaseMs: { min: 20, max: 400, step: 1, unit: "ms" },
    mixPercent: { min: 0, max: 100, step: 1, unit: "%" },
  },
  parallelCompressor: {
    thresholdDb: { min: -40, max: -5, step: 0.5, unit: "dB" },
    ratio: { min: 1, max: 12, step: 0.1 },
    attackMs: { min: 1, max: 60, step: 1, unit: "ms" },
    releaseMs: { min: 20, max: 400, step: 1, unit: "ms" },
    mixPercent: { min: 0, max: 100, step: 1, unit: "%" },
  },
  saturation: {
    drivePercent: { min: 0, max: 100, step: 1, unit: "%" },
    tonePercent: { min: 0, max: 100, step: 1, unit: "%" },
    mixPercent: { min: 0, max: 100, step: 1, unit: "%" },
  },
  airEq: {
    frequencyHz: { min: 3500, max: 14000, step: 10, unit: "Hz" },
    gainDb: { min: -12, max: 12, step: 0.1, unit: "dB" },
  },
  shortReverb: {
    delayMs: { min: 10, max: 120, step: 1, unit: "ms" },
    feedbackPercent: { min: 0, max: 70, step: 1, unit: "%" },
    mixPercent: { min: 0, max: 50, step: 1, unit: "%" },
    highCutHz: { min: 1500, max: 12000, step: 10, unit: "Hz" },
    lowCutHz: { min: 80, max: 1200, step: 1, unit: "Hz" },
  },
  longReverb: {
    delayMs: { min: 40, max: 240, step: 1, unit: "ms" },
    feedbackPercent: { min: 0, max: 85, step: 1, unit: "%" },
    mixPercent: { min: 0, max: 60, step: 1, unit: "%" },
    duckingPercent: { min: 0, max: 100, step: 1, unit: "%" },
    highCutHz: { min: 1500, max: 12000, step: 10, unit: "Hz" },
    lowCutHz: { min: 80, max: 1200, step: 1, unit: "Hz" },
  },
} as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeToolOrder(order: VocalChainToolKey[] | undefined) {
  if (!order || order.length === 0) {
    return [...vocalChainToolOrder];
  }

  const uniqueValidOrder = order.filter(
    (toolKey, index) => vocalChainToolOrder.includes(toolKey) && order.indexOf(toolKey) === index,
  );

  return [
    ...uniqueValidOrder,
    ...vocalChainToolOrder.filter((toolKey) => !uniqueValidOrder.includes(toolKey)),
  ];
}

function dbToGain(value: number) {
  return Math.pow(10, value / 20);
}

function getAudioContextConstructor() {
  const audioWindow = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return globalThis.AudioContext ?? audioWindow.webkitAudioContext;
}

function createMonoInputNode(context: AudioContext, source: MediaStreamAudioSourceNode) {
  const splitter = context.createChannelSplitter(2);
  const monoBus = context.createGain();
  const leftGain = context.createGain();
  const rightGain = context.createGain();
  const merger = context.createChannelMerger(2);

  leftGain.gain.value = 0.5;
  rightGain.gain.value = 0.5;

  source.connect(splitter);
  splitter.connect(leftGain, 0);
  splitter.connect(rightGain, 1);
  leftGain.connect(monoBus);
  rightGain.connect(monoBus);
  monoBus.connect(merger, 0, 0);
  monoBus.connect(merger, 0, 1);

  return {
    output: merger,
    cleanup: () => {
      splitter.disconnect();
      leftGain.disconnect();
      rightGain.disconnect();
      monoBus.disconnect();
      merger.disconnect();
    },
  };
}

function createMonoMediaElementNode(
  context: AudioContext,
  mediaElement: HTMLMediaElement,
) {
  const source = context.createMediaElementSource(mediaElement);
  const splitter = context.createChannelSplitter(2);
  const monoBus = context.createGain();
  const leftGain = context.createGain();
  const rightGain = context.createGain();
  const merger = context.createChannelMerger(2);

  leftGain.gain.value = 0.5;
  rightGain.gain.value = 0.5;

  source.connect(splitter);
  splitter.connect(leftGain, 0);
  splitter.connect(rightGain, 1);
  leftGain.connect(monoBus);
  rightGain.connect(monoBus);
  monoBus.connect(merger, 0, 0);
  monoBus.connect(merger, 0, 1);

  return {
    source,
    output: merger,
    cleanup: () => {
      splitter.disconnect();
      leftGain.disconnect();
      rightGain.disconnect();
      monoBus.disconnect();
      merger.disconnect();
      source.disconnect();
    },
  };
}

function createTimeDomainAnalyser(context: AudioContext, source: AudioNode) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.75;
  source.connect(analyser);
  return analyser;
}

function getRmsDb(analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) {
  analyser.getByteTimeDomainData(buffer);

  let sumSquares = 0;
  for (const sample of buffer) {
    const centered = (sample - 128) / 128;
    sumSquares += centered * centered;
  }

  const rms = Math.sqrt(sumSquares / buffer.length);
  return 20 * Math.log10(Math.max(rms, 0.00001));
}

function createSaturationCurve(drivePercent: number) {
  const amount = 1 + drivePercent / 8;
  const samples = 2048;
  const curve = new Float32Array(samples);

  for (let index = 0; index < samples; index += 1) {
    const x = (index * 2) / samples - 1;
    curve[index] = Math.tanh(x * amount);
  }

  return curve;
}

function connectParallelMix(
  context: AudioContext,
  input: AudioNode,
  wetSource: AudioNode,
  mixPercent: number,
) {
  const mix = clamp(mixPercent, 0, 100) / 100;
  const dryGain = context.createGain();
  const wetGain = context.createGain();
  const mixBus = context.createGain();

  dryGain.gain.value = 1 - mix;
  wetGain.gain.value = mix;

  input.connect(dryGain);
  dryGain.connect(mixBus);
  wetSource.connect(wetGain);
  wetGain.connect(mixBus);

  return mixBus;
}

export function isVocalChainToolKey(value: string): value is VocalChainToolKey {
  return vocalChainToolOrder.includes(value as VocalChainToolKey);
}

export function applyChainPatch(
  current: VocalChainSettings,
  patch: VocalChainPatch,
): VocalChainSettings {
  const nextTools = patch.tools ?? {};

  return {
    ...current,
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    inputGain:
      typeof patch.inputGain === "number"
        ? clamp(patch.inputGain, 0.25, 2)
        : current.inputGain,
    outputGain:
      typeof patch.outputGain === "number"
        ? clamp(patch.outputGain, -12, 12)
        : current.outputGain,
    toolOrder: normalizeToolOrder(patch.toolOrder ?? current.toolOrder),
    tools: {
      noiseGate: {
        ...current.tools.noiseGate,
        ...nextTools.noiseGate,
        enabled:
          typeof nextTools.noiseGate?.enabled === "boolean"
            ? nextTools.noiseGate.enabled
            : current.tools.noiseGate.enabled,
        thresholdDb:
          typeof nextTools.noiseGate?.thresholdDb === "number"
            ? clamp(nextTools.noiseGate.thresholdDb, -70, -10)
            : current.tools.noiseGate.thresholdDb,
        floorDb:
          typeof nextTools.noiseGate?.floorDb === "number"
            ? clamp(nextTools.noiseGate.floorDb, -80, 0)
            : current.tools.noiseGate.floorDb,
        attackMs:
          typeof nextTools.noiseGate?.attackMs === "number"
            ? clamp(nextTools.noiseGate.attackMs, 1, 80)
            : current.tools.noiseGate.attackMs,
        releaseMs:
          typeof nextTools.noiseGate?.releaseMs === "number"
            ? clamp(nextTools.noiseGate.releaseMs, 20, 500)
            : current.tools.noiseGate.releaseMs,
        holdMs:
          typeof nextTools.noiseGate?.holdMs === "number"
            ? clamp(nextTools.noiseGate.holdMs, 0, 400)
            : current.tools.noiseGate.holdMs,
      },
      highPassFilter: {
        ...current.tools.highPassFilter,
        ...nextTools.highPassFilter,
        enabled:
          typeof nextTools.highPassFilter?.enabled === "boolean"
            ? nextTools.highPassFilter.enabled
            : current.tools.highPassFilter.enabled,
        frequencyHz:
          typeof nextTools.highPassFilter?.frequencyHz === "number"
            ? clamp(nextTools.highPassFilter.frequencyHz, 20, 220)
            : current.tools.highPassFilter.frequencyHz,
      },
      bodyEq: {
        ...current.tools.bodyEq,
        ...nextTools.bodyEq,
        enabled:
          typeof nextTools.bodyEq?.enabled === "boolean"
            ? nextTools.bodyEq.enabled
            : current.tools.bodyEq.enabled,
        frequencyHz:
          typeof nextTools.bodyEq?.frequencyHz === "number"
            ? clamp(nextTools.bodyEq.frequencyHz, 120, 600)
            : current.tools.bodyEq.frequencyHz,
        gainDb:
          typeof nextTools.bodyEq?.gainDb === "number"
            ? clamp(nextTools.bodyEq.gainDb, -12, 12)
            : current.tools.bodyEq.gainDb,
        q:
          typeof nextTools.bodyEq?.q === "number"
            ? clamp(nextTools.bodyEq.q, 0.3, 4)
            : current.tools.bodyEq.q,
      },
      deEsser: {
        ...current.tools.deEsser,
        ...nextTools.deEsser,
        enabled:
          typeof nextTools.deEsser?.enabled === "boolean"
            ? nextTools.deEsser.enabled
            : current.tools.deEsser.enabled,
        frequencyHz:
          typeof nextTools.deEsser?.frequencyHz === "number"
            ? clamp(nextTools.deEsser.frequencyHz, 3500, 10000)
            : current.tools.deEsser.frequencyHz,
        thresholdDb:
          typeof nextTools.deEsser?.thresholdDb === "number"
            ? clamp(nextTools.deEsser.thresholdDb, -45, -10)
            : current.tools.deEsser.thresholdDb,
        amountPercent:
          typeof nextTools.deEsser?.amountPercent === "number"
            ? clamp(nextTools.deEsser.amountPercent, 0, 100)
            : current.tools.deEsser.amountPercent,
      },
      compressor: {
        ...current.tools.compressor,
        ...nextTools.compressor,
        enabled:
          typeof nextTools.compressor?.enabled === "boolean"
            ? nextTools.compressor.enabled
            : current.tools.compressor.enabled,
        thresholdDb:
          typeof nextTools.compressor?.thresholdDb === "number"
            ? clamp(nextTools.compressor.thresholdDb, -40, -5)
            : current.tools.compressor.thresholdDb,
        ratio:
          typeof nextTools.compressor?.ratio === "number"
            ? clamp(nextTools.compressor.ratio, 1, 8)
            : current.tools.compressor.ratio,
        attackMs:
          typeof nextTools.compressor?.attackMs === "number"
            ? clamp(nextTools.compressor.attackMs, 1, 60)
            : current.tools.compressor.attackMs,
        releaseMs:
          typeof nextTools.compressor?.releaseMs === "number"
            ? clamp(nextTools.compressor.releaseMs, 20, 400)
            : current.tools.compressor.releaseMs,
        mixPercent:
          typeof nextTools.compressor?.mixPercent === "number"
            ? clamp(nextTools.compressor.mixPercent, 0, 100)
            : current.tools.compressor.mixPercent,
      },
      parallelCompressor: {
        ...current.tools.parallelCompressor,
        ...nextTools.parallelCompressor,
        enabled:
          typeof nextTools.parallelCompressor?.enabled === "boolean"
            ? nextTools.parallelCompressor.enabled
            : current.tools.parallelCompressor.enabled,
        thresholdDb:
          typeof nextTools.parallelCompressor?.thresholdDb === "number"
            ? clamp(nextTools.parallelCompressor.thresholdDb, -40, -5)
            : current.tools.parallelCompressor.thresholdDb,
        ratio:
          typeof nextTools.parallelCompressor?.ratio === "number"
            ? clamp(nextTools.parallelCompressor.ratio, 1, 12)
            : current.tools.parallelCompressor.ratio,
        attackMs:
          typeof nextTools.parallelCompressor?.attackMs === "number"
            ? clamp(nextTools.parallelCompressor.attackMs, 1, 60)
            : current.tools.parallelCompressor.attackMs,
        releaseMs:
          typeof nextTools.parallelCompressor?.releaseMs === "number"
            ? clamp(nextTools.parallelCompressor.releaseMs, 20, 400)
            : current.tools.parallelCompressor.releaseMs,
        mixPercent:
          typeof nextTools.parallelCompressor?.mixPercent === "number"
            ? clamp(nextTools.parallelCompressor.mixPercent, 0, 100)
            : current.tools.parallelCompressor.mixPercent,
      },
      saturation: {
        ...current.tools.saturation,
        ...nextTools.saturation,
        enabled:
          typeof nextTools.saturation?.enabled === "boolean"
            ? nextTools.saturation.enabled
            : current.tools.saturation.enabled,
        drivePercent:
          typeof nextTools.saturation?.drivePercent === "number"
            ? clamp(nextTools.saturation.drivePercent, 0, 100)
            : current.tools.saturation.drivePercent,
        tonePercent:
          typeof nextTools.saturation?.tonePercent === "number"
            ? clamp(nextTools.saturation.tonePercent, 0, 100)
            : current.tools.saturation.tonePercent,
        mixPercent:
          typeof nextTools.saturation?.mixPercent === "number"
            ? clamp(nextTools.saturation.mixPercent, 0, 100)
            : current.tools.saturation.mixPercent,
      },
      airEq: {
        ...current.tools.airEq,
        ...nextTools.airEq,
        enabled:
          typeof nextTools.airEq?.enabled === "boolean"
            ? nextTools.airEq.enabled
            : current.tools.airEq.enabled,
        frequencyHz:
          typeof nextTools.airEq?.frequencyHz === "number"
            ? clamp(nextTools.airEq.frequencyHz, 3500, 14000)
            : current.tools.airEq.frequencyHz,
        gainDb:
          typeof nextTools.airEq?.gainDb === "number"
            ? clamp(nextTools.airEq.gainDb, -12, 12)
            : current.tools.airEq.gainDb,
      },
      shortReverb: {
        ...current.tools.shortReverb,
        ...nextTools.shortReverb,
        enabled:
          typeof nextTools.shortReverb?.enabled === "boolean"
            ? nextTools.shortReverb.enabled
            : current.tools.shortReverb.enabled,
        delayMs:
          typeof nextTools.shortReverb?.delayMs === "number"
            ? clamp(nextTools.shortReverb.delayMs, 10, 120)
            : current.tools.shortReverb.delayMs,
        feedbackPercent:
          typeof nextTools.shortReverb?.feedbackPercent === "number"
            ? clamp(nextTools.shortReverb.feedbackPercent, 0, 70)
            : current.tools.shortReverb.feedbackPercent,
        mixPercent:
          typeof nextTools.shortReverb?.mixPercent === "number"
            ? clamp(nextTools.shortReverb.mixPercent, 0, 50)
            : current.tools.shortReverb.mixPercent,
        highCutHz:
          typeof nextTools.shortReverb?.highCutHz === "number"
            ? clamp(nextTools.shortReverb.highCutHz, 1500, 12000)
            : current.tools.shortReverb.highCutHz,
        lowCutHz:
          typeof nextTools.shortReverb?.lowCutHz === "number"
            ? clamp(nextTools.shortReverb.lowCutHz, 80, 1200)
            : current.tools.shortReverb.lowCutHz,
      },
      longReverb: {
        ...current.tools.longReverb,
        ...nextTools.longReverb,
        enabled:
          typeof nextTools.longReverb?.enabled === "boolean"
            ? nextTools.longReverb.enabled
            : current.tools.longReverb.enabled,
        delayMs:
          typeof nextTools.longReverb?.delayMs === "number"
            ? clamp(nextTools.longReverb.delayMs, 40, 240)
            : current.tools.longReverb.delayMs,
        feedbackPercent:
          typeof nextTools.longReverb?.feedbackPercent === "number"
            ? clamp(nextTools.longReverb.feedbackPercent, 0, 85)
            : current.tools.longReverb.feedbackPercent,
        mixPercent:
          typeof nextTools.longReverb?.mixPercent === "number"
            ? clamp(nextTools.longReverb.mixPercent, 0, 60)
            : current.tools.longReverb.mixPercent,
        duckingPercent:
          typeof nextTools.longReverb?.duckingPercent === "number"
            ? clamp(nextTools.longReverb.duckingPercent, 0, 100)
            : current.tools.longReverb.duckingPercent,
        highCutHz:
          typeof nextTools.longReverb?.highCutHz === "number"
            ? clamp(nextTools.longReverb.highCutHz, 1500, 12000)
            : current.tools.longReverb.highCutHz,
        lowCutHz:
          typeof nextTools.longReverb?.lowCutHz === "number"
            ? clamp(nextTools.longReverb.lowCutHz, 80, 1200)
            : current.tools.longReverb.lowCutHz,
      },
    },
  };
}

function buildAudioChain(
  context: AudioContext,
  inputNode: AudioNode,
  settings: VocalChainSettings,
): BuiltChain {
  const cleanupCallbacks: Array<() => void> = [];
  const destination = context.createMediaStreamDestination();
  const analyser = context.createAnalyser();
  const inputGain = context.createGain();
  const outputGain = context.createGain();

  inputNode.connect(inputGain);
  inputGain.gain.value = settings.inputGain;
  outputGain.gain.value = dbToGain(settings.outputGain);
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  if (!settings.enabled) {
    inputGain.connect(outputGain);
  } else {
    let chainTail: AudioNode = inputGain;

    for (const toolKey of settings.toolOrder) {
      switch (toolKey) {
        case "noiseGate": {
          if (!settings.tools.noiseGate.enabled) break;
          const gateAnalyser = createTimeDomainAnalyser(context, chainTail);
          const gateGain = context.createGain();
          const gateBuffer = new Uint8Array(new ArrayBuffer(gateAnalyser.fftSize));
          let gateHoldUntil = 0;

          chainTail.connect(gateGain);
          chainTail = gateGain;

          const intervalId = window.setInterval(() => {
            const levelDb = getRmsDb(gateAnalyser, gateBuffer);
            const now = performance.now();
            const open = levelDb >= settings.tools.noiseGate.thresholdDb;

            if (open) {
              gateHoldUntil = now + settings.tools.noiseGate.holdMs;
            }

            const targetGain = open || now <= gateHoldUntil ? 1 : dbToGain(settings.tools.noiseGate.floorDb);
            const timeConstant =
              targetGain >= gateGain.gain.value
                ? settings.tools.noiseGate.attackMs / 1000
                : settings.tools.noiseGate.releaseMs / 1000;

            gateGain.gain.setTargetAtTime(targetGain, context.currentTime, Math.max(timeConstant, 0.001));
          }, 30);

          cleanupCallbacks.push(() => {
            window.clearInterval(intervalId);
            gateAnalyser.disconnect();
            gateGain.disconnect();
          });
          break;
        }

        case "highPassFilter": {
          if (!settings.tools.highPassFilter.enabled) break;
          const highPass = context.createBiquadFilter();
          highPass.type = "highpass";
          highPass.frequency.value = settings.tools.highPassFilter.frequencyHz;
          chainTail.connect(highPass);
          chainTail = highPass;
          break;
        }

        case "bodyEq": {
          if (!settings.tools.bodyEq.enabled) break;
          const bodyEq = context.createBiquadFilter();
          bodyEq.type = "peaking";
          bodyEq.frequency.value = settings.tools.bodyEq.frequencyHz;
          bodyEq.gain.value = settings.tools.bodyEq.gainDb;
          bodyEq.Q.value = settings.tools.bodyEq.q;
          chainTail.connect(bodyEq);
          chainTail = bodyEq;
          break;
        }

        case "deEsser": {
          if (!settings.tools.deEsser.enabled) break;
          const deEssFocus = context.createBiquadFilter();
          const deEssCompressor = context.createDynamicsCompressor();
          const deEssRestore = context.createBiquadFilter();
          const boostAmount = 3 + (settings.tools.deEsser.amountPercent / 100) * 9;

          deEssFocus.type = "peaking";
          deEssFocus.frequency.value = settings.tools.deEsser.frequencyHz;
          deEssFocus.Q.value = 3.4;
          deEssFocus.gain.value = boostAmount;

          deEssCompressor.threshold.value = settings.tools.deEsser.thresholdDb;
          deEssCompressor.knee.value = 8;
          deEssCompressor.ratio.value = 1.5 + (settings.tools.deEsser.amountPercent / 100) * 4.5;
          deEssCompressor.attack.value = 0.002;
          deEssCompressor.release.value = 0.08;

          deEssRestore.type = "peaking";
          deEssRestore.frequency.value = settings.tools.deEsser.frequencyHz;
          deEssRestore.Q.value = 3.4;
          deEssRestore.gain.value = -boostAmount;

          chainTail.connect(deEssFocus);
          deEssFocus.connect(deEssCompressor);
          deEssCompressor.connect(deEssRestore);
          chainTail = deEssRestore;
          break;
        }

        case "compressor": {
          if (!settings.tools.compressor.enabled) break;
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.value = settings.tools.compressor.thresholdDb;
          compressor.knee.value = 24;
          compressor.ratio.value = settings.tools.compressor.ratio;
          compressor.attack.value = settings.tools.compressor.attackMs / 1000;
          compressor.release.value = settings.tools.compressor.releaseMs / 1000;

          chainTail.connect(compressor);
          chainTail = connectParallelMix(
            context,
            chainTail,
            compressor,
            settings.tools.compressor.mixPercent,
          );
          break;
        }

        case "parallelCompressor": {
          if (!settings.tools.parallelCompressor.enabled) break;
          const compressor = context.createDynamicsCompressor();
          compressor.threshold.value = settings.tools.parallelCompressor.thresholdDb;
          compressor.knee.value = 16;
          compressor.ratio.value = settings.tools.parallelCompressor.ratio;
          compressor.attack.value = settings.tools.parallelCompressor.attackMs / 1000;
          compressor.release.value = settings.tools.parallelCompressor.releaseMs / 1000;

          chainTail.connect(compressor);
          chainTail = connectParallelMix(
            context,
            chainTail,
            compressor,
            settings.tools.parallelCompressor.mixPercent,
          );
          break;
        }

        case "saturation": {
          if (!settings.tools.saturation.enabled) break;
          const saturator = context.createWaveShaper();
          const toneFilter = context.createBiquadFilter();
          saturator.curve = createSaturationCurve(settings.tools.saturation.drivePercent);
          saturator.oversample = "4x";

          toneFilter.type = "lowpass";
          toneFilter.frequency.value = 2500 + (settings.tools.saturation.tonePercent / 100) * 11500;

          chainTail.connect(saturator);
          saturator.connect(toneFilter);
          chainTail = connectParallelMix(
            context,
            chainTail,
            toneFilter,
            settings.tools.saturation.mixPercent,
          );
          break;
        }

        case "airEq": {
          if (!settings.tools.airEq.enabled) break;
          const airEq = context.createBiquadFilter();
          airEq.type = "highshelf";
          airEq.frequency.value = settings.tools.airEq.frequencyHz;
          airEq.gain.value = settings.tools.airEq.gainDb;
          chainTail.connect(airEq);
          chainTail = airEq;
          break;
        }

        case "shortReverb": {
          if (!settings.tools.shortReverb.enabled) break;
          const delayNode = context.createDelay(1.5);
          const feedbackGain = context.createGain();
          const wetHighCut = context.createBiquadFilter();
          const wetLowCut = context.createBiquadFilter();
          const wetGain = context.createGain();

          delayNode.delayTime.value = settings.tools.shortReverb.delayMs / 1000;
          feedbackGain.gain.value = settings.tools.shortReverb.feedbackPercent / 100 * 0.7;
          wetGain.gain.value = settings.tools.shortReverb.mixPercent / 100 * 0.3;
          wetHighCut.type = "lowpass";
          wetHighCut.frequency.value = settings.tools.shortReverb.highCutHz;
          wetLowCut.type = "highpass";
          wetLowCut.frequency.value = settings.tools.shortReverb.lowCutHz;

          chainTail.connect(delayNode);
          delayNode.connect(feedbackGain);
          feedbackGain.connect(delayNode);
          delayNode.connect(wetHighCut);
          wetHighCut.connect(wetLowCut);
          wetLowCut.connect(wetGain);
          wetGain.connect(outputGain);

          cleanupCallbacks.push(() => {
            delayNode.disconnect();
            feedbackGain.disconnect();
            wetHighCut.disconnect();
            wetLowCut.disconnect();
            wetGain.disconnect();
          });
          break;
        }

        case "longReverb": {
          if (!settings.tools.longReverb.enabled) break;
          const ambienceAnalyser = createTimeDomainAnalyser(context, chainTail);
          const ambienceBuffer = new Uint8Array(new ArrayBuffer(ambienceAnalyser.fftSize));
          const delayNode = context.createDelay(1.5);
          const feedbackGain = context.createGain();
          const wetHighCut = context.createBiquadFilter();
          const wetLowCut = context.createBiquadFilter();
          const wetGain = context.createGain();
          const duckGain = context.createGain();

          delayNode.delayTime.value = settings.tools.longReverb.delayMs / 1000;
          feedbackGain.gain.value = settings.tools.longReverb.feedbackPercent / 100 * 0.85;
          wetGain.gain.value = settings.tools.longReverb.mixPercent / 100 * 0.35;
          duckGain.gain.value = 1;
          wetHighCut.type = "lowpass";
          wetHighCut.frequency.value = settings.tools.longReverb.highCutHz;
          wetLowCut.type = "highpass";
          wetLowCut.frequency.value = settings.tools.longReverb.lowCutHz;

          chainTail.connect(delayNode);
          delayNode.connect(feedbackGain);
          feedbackGain.connect(delayNode);
          delayNode.connect(wetHighCut);
          wetHighCut.connect(wetLowCut);
          wetLowCut.connect(wetGain);
          wetGain.connect(duckGain);
          duckGain.connect(outputGain);

          const intervalId = window.setInterval(() => {
            const levelDb = getRmsDb(ambienceAnalyser, ambienceBuffer);
            const normalizedLevel = clamp((levelDb + 52) / 36, 0, 1);
            const ducking = settings.tools.longReverb.duckingPercent / 100;
            const targetGain = 1 - normalizedLevel * ducking;
            duckGain.gain.setTargetAtTime(clamp(targetGain, 0.12, 1), context.currentTime, 0.03);
          }, 30);

          cleanupCallbacks.push(() => {
            window.clearInterval(intervalId);
            ambienceAnalyser.disconnect();
            delayNode.disconnect();
            feedbackGain.disconnect();
            wetHighCut.disconnect();
            wetLowCut.disconnect();
            wetGain.disconnect();
            duckGain.disconnect();
          });
          break;
        }
      }
    }

    chainTail.connect(outputGain);
  }

  outputGain.connect(destination);
  outputGain.connect(analyser);

  cleanupCallbacks.push(() => {
    inputGain.disconnect();
    outputGain.disconnect();
    analyser.disconnect();
  });

  return {
    analyser,
    outputGain,
    processedStream: destination.stream,
    cleanupCallbacks,
  };
}

export async function createAudioChain(
  inputStream: MediaStream,
  settings: VocalChainSettings,
): Promise<ActiveAudioChain> {
  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    throw new Error("Web Audio is not supported in this browser.");
  }

  const context = new AudioContextConstructor();
  const source = context.createMediaStreamSource(inputStream);
  const monoInput = createMonoInputNode(context, source);
  const builtChain = buildAudioChain(context, monoInput.output, settings);

  if (settings.monitoring) {
    builtChain.outputGain.connect(context.destination);
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  return {
    context,
    analyser: builtChain.analyser,
    processedStream: builtChain.processedStream,
    cleanup: async () => {
      builtChain.cleanupCallbacks.forEach((callback) => callback());
      monoInput.cleanup();
      source.disconnect();

      if (context.state !== "closed") {
        await context.close();
      }
    },
  };
}

export async function createPlaybackAudioChain(
  mediaElement: HTMLMediaElement,
  settings: VocalChainSettings,
): Promise<ActiveAudioChain> {
  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    throw new Error("Web Audio is not supported in this browser.");
  }

  const context = new AudioContextConstructor();
  const monoSource = createMonoMediaElementNode(context, mediaElement);
  const builtChain = buildAudioChain(context, monoSource.output, settings);
  builtChain.outputGain.connect(context.destination);

  if (context.state === "suspended") {
    await context.resume();
  }

  return {
    context,
    analyser: builtChain.analyser,
    processedStream: builtChain.processedStream,
    cleanup: async () => {
      builtChain.cleanupCallbacks.forEach((callback) => callback());
      monoSource.cleanup();

      if (context.state !== "closed") {
        await context.close();
      }
    },
  };
}
