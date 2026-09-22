import type { VocalChainSettings } from "@/features/recorder/lib/audio-chain";

export type AnalysisSnapshot = {
  sampleFrames: number;
  peakDbfs: number;
  avgRmsDbfs: number;
  noiseFloorDbfs: number;
  dynamicRangeDb: number;
  lowEndRatio: number;
  lowMidRatio: number;
  presenceRatio: number;
  sibilanceRatio: number;
  airRatio: number;
};

export type AnalysisSuggestion = {
  title: string;
  detail: string;
};

export type AnalysisReport = {
  summary: string;
  metrics: AnalysisSnapshot;
  suggestions: AnalysisSuggestion[];
};

export type LiveInputAnalyzer = {
  getSnapshot: () => AnalysisSnapshot;
  getReport: (settings: VocalChainSettings) => AnalysisReport;
  cleanup: () => Promise<void>;
};

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

function dbToPower(db: number) {
  return Math.pow(10, db / 10);
}

function average(total: number, count: number) {
  return count > 0 ? total / count : 0;
}

function buildSummary(metrics: AnalysisSnapshot) {
  return [
    `Peak ${metrics.peakDbfs.toFixed(1)} dBFS`,
    `RMS ${metrics.avgRmsDbfs.toFixed(1)} dBFS`,
    `Noise floor ${metrics.noiseFloorDbfs.toFixed(1)} dBFS`,
  ].join(" / ");
}

function buildSuggestions(metrics: AnalysisSnapshot, settings: VocalChainSettings) {
  const suggestions: AnalysisSuggestion[] = [];

  if (metrics.noiseFloorDbfs > -45) {
    suggestions.push({
      title: "Room noise is fairly present",
      detail:
        "Raise the noise gate threshold a little or lower the gate floor more aggressively so idle room tone is pulled down between phrases.",
    });
  }

  if (metrics.lowEndRatio > 0.2) {
    suggestions.push({
      title: "Low-end rumble or plosive energy is elevated",
      detail:
        "Raise the high-pass filter slightly or tighten mic technique to keep low plosives from clouding the vocal.",
    });
  }

  if (metrics.lowMidRatio > 0.34) {
    suggestions.push({
      title: "Low-mid buildup is strong",
      detail:
        "Cut a little more with body EQ around 220-320 Hz or reduce warmth if the vocal feels boxy or boomy.",
    });
  }

  if (metrics.sibilanceRatio > 0.18) {
    suggestions.push({
      title: "Sibilance is prominent",
      detail:
        "Increase de-esser amount or lower its threshold so you can keep the vocal bright without harsh S sounds.",
    });
  }

  if (metrics.airRatio < 0.035 && settings.tools.airEq.gainDb <= 2) {
    suggestions.push({
      title: "Top-end openness is restrained",
      detail:
        "A gentle air EQ lift or a slightly brighter saturation tone could help the vocal feel more open and modern.",
    });
  }

  if (metrics.dynamicRangeDb > 18) {
    suggestions.push({
      title: "Dynamics are wide",
      detail:
        "Use a bit more compression or a higher compressor mix percent if you want the vocal more intimate and steady.",
    });
  }

  if (metrics.peakDbfs > -3) {
    suggestions.push({
      title: "Peaks are running hot",
      detail:
        "Back off input gain slightly or trim output gain to avoid brittle transient peaks and clipping risk.",
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: "The take looks balanced",
      detail:
        "The analyzer does not see an obvious corrective issue. Refine the chain by style and taste rather than repair.",
    });
  }

  return suggestions;
}

export async function createLiveInputAnalyzer(
  inputStream: MediaStream,
): Promise<LiveInputAnalyzer> {
  const AudioContextConstructor = getAudioContextConstructor();

  if (!AudioContextConstructor) {
    throw new Error("Web Audio analysis is not supported in this browser.");
  }

  const context = new AudioContextConstructor();
  const source = context.createMediaStreamSource(inputStream);
  const monoInput = createMonoInputNode(context, source);
  const timeAnalyser = context.createAnalyser();
  const freqAnalyser = context.createAnalyser();
  const timeData = new Uint8Array(new ArrayBuffer(timeAnalyser.fftSize));
  const freqData = new Float32Array(freqAnalyser.frequencyBinCount);

  timeAnalyser.fftSize = 2048;
  timeAnalyser.smoothingTimeConstant = 0.75;
  freqAnalyser.fftSize = 4096;
  freqAnalyser.smoothingTimeConstant = 0.55;

  monoInput.output.connect(timeAnalyser);
  monoInput.output.connect(freqAnalyser);

  if (context.state === "suspended") {
    await context.resume();
  }

  let sampleFrames = 0;
  let peakDbfs = -100;
  let minRmsDbfs = 0;
  let maxRmsDbfs = -100;
  let totalRmsDbfs = 0;
  let totalLowEndRatio = 0;
  let totalLowMidRatio = 0;
  let totalPresenceRatio = 0;
  let totalSibilanceRatio = 0;
  let totalAirRatio = 0;

  const sample = () => {
    timeAnalyser.getByteTimeDomainData(timeData);
    freqAnalyser.getFloatFrequencyData(freqData);

    let sumSquares = 0;
    let peak = 0;

    for (const sampleValue of timeData) {
      const centered = (sampleValue - 128) / 128;
      const absolute = Math.abs(centered);
      sumSquares += centered * centered;
      peak = Math.max(peak, absolute);
    }

    const rms = Math.sqrt(sumSquares / timeData.length);
    const rmsDbfs = 20 * Math.log10(Math.max(rms, 0.00001));
    const peakFrameDbfs = 20 * Math.log10(Math.max(peak, 0.00001));
    const nyquist = context.sampleRate / 2;

    let totalPower = 0;
    let lowEndPower = 0;
    let lowMidPower = 0;
    let presencePower = 0;
    let sibilancePower = 0;
    let airPower = 0;

    for (let index = 0; index < freqData.length; index += 1) {
      const db = Number.isFinite(freqData[index]) ? freqData[index] : -120;
      const power = dbToPower(Math.max(db, -120));
      const frequency = (index / freqData.length) * nyquist;

      totalPower += power;

      if (frequency >= 20 && frequency < 120) {
        lowEndPower += power;
      } else if (frequency >= 180 && frequency < 450) {
        lowMidPower += power;
      } else if (frequency >= 2000 && frequency < 5000) {
        presencePower += power;
      } else if (frequency >= 5000 && frequency < 10000) {
        sibilancePower += power;
      } else if (frequency >= 10000 && frequency < 16000) {
        airPower += power;
      }
    }

    const safeTotalPower = Math.max(totalPower, 0.000001);

    sampleFrames += 1;
    peakDbfs = Math.max(peakDbfs, peakFrameDbfs);
    minRmsDbfs = sampleFrames === 1 ? rmsDbfs : Math.min(minRmsDbfs, rmsDbfs);
    maxRmsDbfs = Math.max(maxRmsDbfs, rmsDbfs);
    totalRmsDbfs += rmsDbfs;
    totalLowEndRatio += lowEndPower / safeTotalPower;
    totalLowMidRatio += lowMidPower / safeTotalPower;
    totalPresenceRatio += presencePower / safeTotalPower;
    totalSibilanceRatio += sibilancePower / safeTotalPower;
    totalAirRatio += airPower / safeTotalPower;
  };

  const getSnapshot = (): AnalysisSnapshot => {
    sample();

    return {
      sampleFrames,
      peakDbfs,
      avgRmsDbfs: average(totalRmsDbfs, sampleFrames),
      noiseFloorDbfs: minRmsDbfs,
      dynamicRangeDb: Math.max(0, maxRmsDbfs - minRmsDbfs),
      lowEndRatio: average(totalLowEndRatio, sampleFrames),
      lowMidRatio: average(totalLowMidRatio, sampleFrames),
      presenceRatio: average(totalPresenceRatio, sampleFrames),
      sibilanceRatio: average(totalSibilanceRatio, sampleFrames),
      airRatio: average(totalAirRatio, sampleFrames),
    };
  };

  return {
    getSnapshot,
    getReport: (settings) => {
      const metrics = getSnapshot();

      return {
        summary: buildSummary(metrics),
        metrics,
        suggestions: buildSuggestions(metrics, settings),
      };
    },
    cleanup: async () => {
      source.disconnect();
      monoInput.cleanup();
      timeAnalyser.disconnect();
      freqAnalyser.disconnect();

      if (context.state !== "closed") {
        await context.close();
      }
    },
  };
}
