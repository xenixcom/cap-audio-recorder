<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-title>Audio Recorder</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-header collapse="condense">
        <ion-toolbar>
          <ion-title size="large">Audio Recorder</ion-title>
        </ion-toolbar>
      </ion-header>

      <div id="container" class="ion-padding">
        <ion-card>
          <ion-card-content>
            <!-- <ion-item lines="none">
              <ion-label>
                <p>Permission</p>
                <h2 :class="permissionStateClass">{{ permissionState }}</h2>
              </ion-label>
              <ion-button slot="end" fill="outline" size="small" @click="askPermission">Request</ion-button>
              <ion-button slot="end" fill="clear" size="small" @click="logCurrentState">Get State</ion-button>
              <ion-button slot="end" fill="clear" size="small" @click="logCapabilities">Get Capabilities</ion-button>
            </ion-item> -->

            <ion-item lines="none">
              <ion-label>
                <p>Input Gain</p>
                <h2>{{ gainValue.toFixed(2) }}</h2>
              </ion-label>
              <ion-range aria-label="Input gain" :min="0" :max="3" :step="0.05" :value="gainValue"
                @ionInput="onGainInput" />
            </ion-item>

            <ion-item lines="none">
              <ion-label>
                <p>Status</p>
                <h2>{{ recorderState }}</h2>
              </ion-label>
              <ion-label>
                <p>Duration</p>
                <h2>{{ formattedDuration }}</h2>
              </ion-label>
            </ion-item>

            <div class="controls">
              <ion-button color="primary" :disabled="!canStart" @click="startRecording">Start</ion-button>
              <ion-button color="medium" :disabled="!canPause" @click="pauseRecording">Pause</ion-button>
              <ion-button color="primary" fill="outline" :disabled="!canResume"
                @click="resumeRecording">Resume</ion-button>
              <ion-button color="danger" :disabled="!canStop" @click="stopRecording">Stop</ion-button>
            </div>

            <div class="controls">
              <ion-button color="primary" @click="getOptions">Get Options</ion-button>
              <ion-button color="primary" @click="setOptions(0)">Set Options #0</ion-button>
              <ion-button color="primary" @click="setOptions(1)">Set Options #1</ion-button>
              <ion-button color="primary" @click="setOptions(2)">Set Options #2</ion-button>
            </div>

            <div v-if="audioUrl" class="playback">
              <p>Latest Recording</p>
              <audio :src="audioUrl" controls></audio>
            </div>

            <p v-if="message" class="message">{{ message }}</p>
          </ion-card-content>
        </ion-card>
      </div>

    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonContent,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonRange
} from '@ionic/vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { PluginListenerHandle } from '@capacitor/core';
import { AudioRecorder, RecorderOptions } from '@xenix/cap-audio-recorder';
import type { PermissionState, RecorderState } from '@xenix/cap-audio-recorder';

const recorderState = ref<RecorderState>('inactive');
const permissionState = ref<PermissionState>('prompt');
const durationMs = ref(0);
const audioUrl = ref<string | null>(null);
const message = ref('');
const gainValue = ref(1);

let stateHandle: PluginListenerHandle | null = null;
let durationHandle: PluginListenerHandle | null = null;
let audioUrlHandle: PluginListenerHandle | null = null;

const permissionStateClass = computed(() => {
  if (permissionState.value === 'granted') return 'ok';
  if (permissionState.value === 'denied') return 'warn';
  return '';
});

const formattedDuration = computed(() => {
  const totalSeconds = Math.floor(durationMs.value / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
});

const canStart = computed(() => recorderState.value === 'inactive');
const canPause = computed(() => recorderState.value === 'recording');
const canResume = computed(() => recorderState.value === 'paused');
const canStop = computed(() => recorderState.value === 'recording' || recorderState.value === 'paused');

const askPermission = async (): Promise<PermissionState | null> => {
  try {
    const res = await AudioRecorder.requestPermissions();
    permissionState.value = res.state;
    return permissionState.value;
  } catch (err) {
    message.value = `Permission error: ${String(err)}`;
    return null;
  }
};

const logCurrentState = async () => {
  try {
    const state = await AudioRecorder.getCurrentState();
    console.log('[AudioRecorder] getCurrentState', state);
  } catch (err) {
    message.value = `Get state failed: ${String(err)}`;
  }
};

const logCapabilities = async () => {
  try {
    const caps = await AudioRecorder.getCapabilities();
    console.log('[AudioRecorder] getCapabilities', caps);
  } catch (err) {
    message.value = `Get capabilities failed: ${String(err)}`;
  }
};

const onGainInput = async (ev: CustomEvent) => {
  const value = Number((ev.detail as any)?.value ?? 1);
  gainValue.value = Number.isFinite(value) ? value : 1;
  try {
    await AudioRecorder.setInputGain({ gain: gainValue.value });
  } catch (err) {
    message.value = `Set gain failed: ${String(err)}`;
  }
};

const ensurePermission = async () => {
  if (permissionState.value === 'granted') return true;
  const state = await askPermission();
  return state === 'granted';
};

const startRecording = async () => {
  message.value = '';
  audioUrl.value = null;
  const ok = await ensurePermission();
  if (!ok) {
    message.value = 'Microphone permission is required.';
    return;
  }
  try {
    await AudioRecorder.start({ auto: false, options: {sampleRate: 48000, sampleSize: 16 } });
    // await AudioRecorder.start({ auto: false, options: {} });
  } catch (err) {
    message.value = `Start failed: ${String(err)}`;
  }
};

const stopRecording = async () => {
  message.value = '';
  try {
    const result = await AudioRecorder.stop();
    console.log(result)
    audioUrl.value = result.uri || null;
  } catch (err) {
    message.value = `Stop failed: ${String(err)}`;
  }
};

const pauseRecording = async () => {
  try {
    await AudioRecorder.pause();
  } catch (err) {
    message.value = `Pause failed: ${String(err)}`;
  }
};

const resumeRecording = async () => {
  try {
    await AudioRecorder.resume();
  } catch (err) {
    message.value = `Resume failed: ${String(err)}`;
  }
};

const getOptions = async () => {
  try {
    const res = await AudioRecorder.getOptions();
    console.log(JSON.stringify(res.options, null, 2));
  } catch (err) {
    message.value = `get options failed: ${String(err)}`;
  }
};

const setOptions = async (idx: number) => {
  console.log(`set options #${idx}`)
  try {
    let value: RecorderOptions = {}
    switch (idx) {
      case 1:
        value = {
          sampleRate: 48000,
          sampleSize: 32,
        }
        break;
      case 2:
        value = {
          calibration: {
            enabled: false,
          },
          detection: {
            startThreshold: 1,
            startDuration: 2,
            stopThreshold: 3,
            stopDuration: 4,
            maxSilenceDuration: 5,
          }
        }
        break;
    }
    if (idx == 0) {
      await AudioRecorder.resetOptions();
    } else {
      await AudioRecorder.setOptions({ options: value });
    }
    getOptions();
  } catch (err) {
    message.value = `set options failed: ${String(err)}`;
  }
};

onMounted(async () => {
  // sync current permission and state
  try {
    const [perm, currentState] = await Promise.all([
      AudioRecorder.checkPermissions(),
      AudioRecorder.getCurrentState(),
    ]);
    console.log('[AudioRecorder] getCurrentState', currentState);
    const capabilities = await AudioRecorder.getCapabilities();
    console.log('[AudioRecorder] getCapabilities', capabilities);
    permissionState.value = perm.state;
    recorderState.value = currentState.state;
  } catch (err) {
    message.value = `Init error: ${String(err)}`;
  }

  stateHandle = await AudioRecorder.addListener('stateChanged', event => {
    recorderState.value = event.state;
    if (event.state === 'inactive') {
      durationMs.value = 0;
    }
  });

  durationHandle = await AudioRecorder.addListener('durationChanged', event => {
    durationMs.value = event.duration;
  });

  audioUrlHandle = await AudioRecorder.addListener('audioUrlReady', event => {
    audioUrl.value = event.uri || null;
    console.log('audioUrlReady url=', event.uri)
  });
});

onUnmounted(async () => {
  await Promise.all([
    stateHandle?.remove(),
    durationHandle?.remove(),
    audioUrlHandle?.remove(),
  ]);
  await AudioRecorder.removeAllListeners();
});
</script>

<style scoped>
.controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
  margin: 16px 0;
}

.playback {
  margin-top: 12px;
}

.message {
  color: var(--ion-color-danger);
  margin-top: 8px;
}

.ok {
  color: var(--ion-color-success);
}

.warn {
  color: var(--ion-color-warning);
}
</style>
