export type RecorderState = 'inactive' | 'recording' | 'paused' | 'initializing' | 'error' | 'stopping';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface PermissionStatus {
    state: PermissionState;
}
